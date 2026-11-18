import dotenv from 'dotenv';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { runDreamingCycle } from './server/dreaming/engine';
import { discoverModels } from './server/providers/router';
import { createApiRouter } from './server/routes/api';
import { getState } from './server/state/store';
import { collectHardwareMetrics } from './server/system/ops';
import { startTelegramPolling } from './server/telegram/bot';
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
  app.use(express.json({ limit: '2mb' }));

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

  // Mount API routes
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

  // Initialize state, background schedulers, and Telegram polling
  getState();
  startTelegramPolling();

  // Idle Dreaming scheduler (checks every 60s if idle >= configured dreamingIdleMinutes)
  setInterval(() => {
    const s = getState();
    if (!s.settings.onboardingCompleted || s.settings.killSwitchActive) return;
    const idleMs = Date.now() - Date.parse(s.lastActivityAt);
    const thresholdMs = Math.max(1, s.settings.dreamingIdleMinutes) * 60_000;
    if (idleMs >= thresholdMs && s.shortTermSignals.length > 0) {
      const hw = collectHardwareMetrics();
      void runDreamingCycle({ hardware: hw }).then(() => broadcastEvent('state:updated'));
    }
  }, 60_000);

  // Weekly automatic model discovery refresh (Section 11.3)
  setInterval(() => {
    const s = getState();
    const last = s.settings.lastModelDiscoveryAt ? Date.parse(s.settings.lastModelDiscoveryAt) : 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - last >= sevenDaysMs) {
      void discoverModels().then(() => broadcastEvent('state:updated'));
    }
  }, 6 * 60 * 60 * 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NovaSwarm server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal NovaSwarm startup error:', err);
  process.exit(1);
});
