import dotenv from 'dotenv';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { runAutonomousKanbanWorkerTick } from './server/agents/engine';
import { runDreamingCycle } from './server/dreaming/engine';
import { createOpenAiProxyRouter } from './server/gateway/openaiProxy';
import { discoverModels } from './server/providers/router';
import { createApiRouter } from './server/routes/api';
import { isWsUpgradeAuthorized } from './server/security/auth';
import { getState } from './server/state/store';
import {
  applyOtaUpdate,
  checkOtaUpdates,
  collectHardwareMetrics,
  runHeartbeatTick,
} from './server/system/ops';
import { sendTelegramMessage, startTelegramPolling } from './server/telegram/bot';
import {
  attachWebSocketToSession,
  createTerminalSession,
  resizeTerminalSession,
  writeToTerminalSession,
} from './server/terminal/ptyManager';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  const server = http.createServer(app);

  // WebSocket hub for /ws/events (live state push) and /ws/terminal (real PTY streaming)
  const wssEvents = new WebSocketServer({ noServer: true });
  const wssTerminal = new WebSocketServer({ noServer: true });
  const eventClients = new Set<WebSocket>();

  const broadcastEvent = (type: string, payload?: unknown) => {
    const packet = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of eventClients) {
      if (client.readyState === 1) {
        client.send(packet);
      }
    }
  };

  wssEvents.on('connection', (ws) => {
    eventClients.add(ws);
    ws.on('close', () => eventClients.delete(ws));
  });

  wssTerminal.on('connection', (ws) => {
    let boundSessionId: string | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: 'attach' | 'create' | 'input' | 'resize';
          sessionId?: string;
          data?: string;
          cols?: number;
          rows?: number;
          initiator?: string;
        };

        if (msg.type === 'create') {
          const session = createTerminalSession({
            initiator: msg.initiator || 'Felhasználó',
            cols: msg.cols,
            rows: msg.rows,
          });
          boundSessionId = session.id;
          attachWebSocketToSession(session.id, ws);
          ws.send(JSON.stringify({ type: 'created', session }));
          broadcastEvent('state:updated');
        } else if (msg.type === 'attach' && msg.sessionId) {
          boundSessionId = msg.sessionId;
          attachWebSocketToSession(msg.sessionId, ws);
          ws.send(JSON.stringify({ type: 'attached', sessionId: msg.sessionId }));
        } else if (msg.type === 'input' && (msg.sessionId || boundSessionId) && typeof msg.data === 'string') {
          writeToTerminalSession(msg.sessionId || boundSessionId!, msg.data);
        } else if (msg.type === 'resize' && (msg.sessionId || boundSessionId) && msg.cols && msg.rows) {
          resizeTerminalSession(msg.sessionId || boundSessionId!, msg.cols, msg.rows);
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    if (!isWsUpgradeAuthorized(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/ws/events') {
      wssEvents.handleUpgrade(request, socket, head, (ws) => {
        wssEvents.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/terminal') {
      wssTerminal.handleUpgrade(request, socket, head, (ws) => {
        wssTerminal.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Mount LiteLLM OpenAI-compatible Gateway Proxy (/v1/models, /v1/chat/completions, /v1/embeddings)
  app.use('/v1', createOpenAiProxyRouter(broadcastEvent));

  // Mount NovaSwarm Control Plane API routes
  app.use('/api', createApiRouter(broadcastEvent));

  // Mount Vite middleware in development, static dist/ in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  getState();
  startTelegramPolling();

  // Idle Dreaming + Autonomous Kanban Backlog Worker scheduler
  setInterval(() => {
    const s = getState();
    if (!s.settings.onboardingCompleted || s.settings.killSwitchActive) return;
    if (s.activeExplicitTaskAgentId) return;
    const idleMs = Date.now() - Date.parse(s.lastActivityAt);
    const thresholdMs = Math.max(1, s.settings.dreamingIdleMinutes) * 60_000;
    if (idleMs >= thresholdMs && s.shortTermSignals.length > 0) {
      const hw = collectHardwareMetrics();
      void runDreamingCycle({ hardware: hw }).then(() => broadcastEvent('state:updated'));
      return;
    }
    if (s.settings.autonomousKanbanWorkerEnabled && idleMs >= 90_000) {
      const hw = collectHardwareMetrics();
      if (!hw.throttledReason) {
        void runAutonomousKanbanWorkerTick().then((r) => {
          if (r.worked) broadcastEvent('state:updated');
        });
      }
    }
  }, 60_000);

  // Autonomous Heartbeat & Uptime scheduler
  setInterval(() => {
    const s = getState();
    if (!s.settings.onboardingCompleted || s.settings.killSwitchActive || !s.settings.heartbeatEnabled) return;
    if (s.activeExplicitTaskAgentId) return; // Explicit user instruction takes priority
    const hw = collectHardwareMetrics();
    if (hw.throttledReason) return;

    const lastHb = s.settings.lastHeartbeatAt ? Date.parse(s.settings.lastHeartbeatAt) : 0;
    const intervalMs = Math.max(1, s.settings.heartbeatIntervalMinutes || 5) * 60_000;
    if (Date.now() - lastHb >= intervalMs) {
      void runHeartbeatTick(async (msg) => {
        await sendTelegramMessage(msg);
      }).then(() => broadcastEvent('state:updated'));
    }
  }, 60_000);

  // Weekly automatic model discovery refresh
  setInterval(() => {
    const s = getState();
    const last = s.settings.lastModelDiscoveryAt ? Date.parse(s.settings.lastModelDiscoveryAt) : 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - last >= sevenDaysMs) {
      void discoverModels().then(() => broadcastEvent('state:updated'));
    }
  }, 6 * 60 * 60 * 1000);

  // GitHub Automatic OTA Update scheduler
  let lastAutoOtaCheckMs = 0;
  setInterval(() => {
    const s = getState();
    if (!s.settings.autoUpdateEnabled || s.settings.killSwitchActive) return;
    const intervalMs = Math.max(1, s.settings.autoUpdateCheckHours || 6) * 3_600_000;
    if (Date.now() - lastAutoOtaCheckMs < intervalMs) return;
    lastAutoOtaCheckMs = Date.now();
    void checkOtaUpdates().then((status) => {
      if (status.updateAvailable && status.hasGitRepo) {
        applyOtaUpdate();
        broadcastEvent('state:updated');
      }
    });
  }, 15 * 60 * 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NovaSwarm server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal NovaSwarm startup error:', err);
  process.exit(1);
});
