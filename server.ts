import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { runAutonomousKanbanWorkerTick, runNightShiftCycle } from './server/agents/engine';
import {
  evaluateHomeAssistantWorkflowTriggers,
  executeWorkflow,
  triggerCustomWebhook,
} from './server/automation/workflowsAndProductivity';
import { pollExternalChannels } from './server/channels/connectors';
import { runDreamingCycle } from './server/dreaming/engine';
import { createOpenAiProxyRouter } from './server/gateway/openaiProxy';
import { resolveSharedPortalResource } from './server/power/lifeAndFinanceStudio';
import {
  consumeEphemeralNote,
  pruneExpiredEphemeralNotes,
  resolveApiMockRequest,
} from './server/power/batch4OmniStudio';
import { checkWatchedPages } from './server/power/universalSuite';
import { checkOllamaIdleUnload, discoverModels } from './server/providers/router';
import { createApiRouter } from './server/routes/api';
import { isWsUpgradeAuthorized } from './server/security/auth';
import { expireStaleApprovals } from './server/security/permissionGate';
import { closeSqliteWal, runSqliteMaintenance } from './server/state/sqliteWal';
import { getState, pruneRetentionData, updateState } from './server/state/store';
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
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

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

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'novaswarm', port: PORT });
  });

  // Mount OpenAI-compatible AI Gateway Proxy (/v1/models, /v1/chat/completions, /v1/embeddings)
  app.use('/v1', createOpenAiProxyRouter(broadcastEvent));

  // Mount Custom Incoming Webhooks (/hooks/:slug)
  app.post('/hooks/:slug', async (req, res) => {
    try {
      const secret = req.header('x-webhook-secret') || req.query.secret?.toString();
      const sig256 = req.header('x-hub-signature-256');
      const out = await triggerCustomWebhook(req.params.slug, secret, req.body, sig256);
      broadcastEvent('state:updated');
      res.status(out.ok ? 200 : 403).json(out);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Ú100: Public read-only shared portal view
  app.get('/share/:token', (req, res) => {
    const resolved = resolveSharedPortalResource(req.params.token);
    if (!resolved) {
      return res.status(404).send('<h1>A megosztott hivatkozás lejárt vagy nem található.</h1>');
    }
    const safeTitle = resolved.link.title.replace(/[<>&"]/g, '');
    const safeBody = JSON.stringify(resolved.payload, null, 2).replace(/[<>&]/g, (c) =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'
    );
    res.send(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${safeTitle} — NovaSwarm Megosztás</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#0f172a;background:#f8fafc}pre{background:#fff;border:1px solid #e2e8f0;padding:16px;border-radius:8px;overflow:auto;font-size:13px}</style></head><body><h1>${safeTitle}</h1><p>Típus: ${resolved.link.resourceType} · Megtekintések: ${resolved.link.views}</p><pre>${safeBody}</pre></body></html>`);
  });

  // Ú206: Self-Hosted App Builder route (/apps/:slug)
  app.get('/apps/:slug', (req, res) => {
    const found = getState().hostedMiniApps.find((a) => a.slug === req.params.slug);
    if (!found) {
      return res.status(404).send('<h1>A keresett Mini-App nem található.</h1>');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(found.htmlContent);
  });

  // Ú218: Live API Mock Server (/mock/:slug)
  app.all('/mock/:slug', (req, res) => {
    const out = resolveApiMockRequest(req.params.slug, req.method);
    res.status(out.statusCode).json(out.body);
  });

  // Ú244 & Ú257: Once-Time Secret ("Égő Cetli") public LAN viewer
  app.get('/burn/:token', (req, res) => {
    const out = consumeEphemeralNote(req.params.token);
    if (!out.ok) {
      return res.status(404).send(`<!doctype html><html lang="hu"><body style="font-family:system-ui;max-width:600px;margin:48px auto;padding:16px"><h2>Égő Cetli</h2><p>${out.reason}</p></body></html>`);
    }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return res.send(`<!doctype html><html lang="hu"><body style="font-family:system-ui;max-width:640px;margin:48px auto;padding:24px;background:#f8fafc"><h2>${esc(out.title || 'Titkos Üzenet')}</h2><p style="color:#b45309;font-size:13px">${out.burnedNow ? 'Ez az üzenet a megnyitással megsemmisült.' : 'Ideiglenes széf tartalom.'}</p><pre style="background:#fff;border:1px solid #cbd5e1;padding:16px;border-radius:8px;white-space:pre-wrap">${esc(out.content || '')}</pre></body></html>`);
  });

  // Mount NovaSwarm Control Plane API routes
  app.use('/api', createApiRouter(broadcastEvent));

  // Mount Vite middleware in development, static dist/ in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      console.warn(
        `[NovaSwarm] Figyelem: ${indexPath} nem található! Futtasd az 'npm run build' parancsot a Web UI kiszolgálásához.`
      );
    }
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexPath)) {
        return res
          .status(503)
          .send('NovaSwarm Web UI nincs még lefordítva. Futtasd: npm run build');
      }
      return res.sendFile(indexPath);
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

  // M21 Approval Expiry + Ú8 Calendar Reminders + Ú17 Periodic Workflows + M41 Ollama Idle Unload + M57 HA Triggers (every 60s)
  let watchdogCounter = 0;
  setInterval(() => {
    let changed = false;
    const expired = expireStaleApprovals();
    if (expired > 0) changed = true;

    void checkOllamaIdleUnload().then((unloaded) => {
      if (unloaded) broadcastEvent('state:updated');
    });

    const s = getState();
    const nowMs = Date.now();
    for (const ev of s.calendarEvents) {
      if (ev.triggered) continue;
      const startMs = Date.parse(ev.startAt);
      if (!Number.isFinite(startMs)) continue;
      const leadMs = Math.max(0, ev.reminderMinutes || 0) * 60_000;
      if (nowMs >= startMs - leadMs && nowMs <= startMs + 3_600_000) {
        updateState((draft) => {
          const ref = draft.calendarEvents.find((x) => x.id === ev.id);
          if (ref) ref.triggered = true;
        });
        broadcastEvent('reminder:alert', ev);
        void sendTelegramMessage(`Emlékeztető: ${ev.title} (${new Date(ev.startAt).toLocaleString()})`);
        changed = true;
      }
    }

    if (!s.settings.killSwitchActive && s.settings.onboardingCompleted) {
      for (const wf of s.workflows) {
        if (!wf.enabled || wf.triggerType !== 'cron') continue;
        const everyMins = Number(wf.triggerConfig);
        if (Number.isFinite(everyMins) && everyMins > 0) {
          const lastMs = wf.lastRunAt ? Date.parse(wf.lastRunAt) : 0;
          if (nowMs - lastMs >= everyMins * 60_000) {
            void executeWorkflow(wf.id).then(() => broadcastEvent('state:updated'));
          }
        }
      }
      if (s.workflows.some((w) => w.enabled && w.triggerType === 'ha_state')) {
        void evaluateHomeAssistantWorkflowTriggers().then((t) => {
          if (t > 0) broadcastEvent('state:updated');
        });
      }
      watchdogCounter += 1;
      if (watchdogCounter % 10 === 0 && s.watchedPages.length > 0) {
        void checkWatchedPages().then(() => broadcastEvent('state:updated'));
      }
    }

    if (changed) broadcastEvent('state:updated');
  }, 60_000);

  // M18 Bidirectional Discord/Slack Polling (every 30s)
  setInterval(() => {
    const s = getState();
    if (s.settings.killSwitchActive || !s.settings.onboardingCompleted) return;
    if (!s.channelConnectors.some((c) => c.enabled && c.pollingEnabled)) return;
    void pollExternalChannels().then((r) => {
      if (r.processed > 0) broadcastEvent('state:updated');
    });
  }, 30_000);

  // Ú61 Night Shift Scheduler & M156 Retention Pruner
  setInterval(() => {
    const s = getState();
    if (s.settings.killSwitchActive || !s.settings.onboardingCompleted) return;
    if (s.settings.nightShiftEnabled && !s.activeExplicitTaskAgentId) {
      const lastNs = s.settings.lastNightShiftAt ? Date.parse(s.settings.lastNightShiftAt) : 0;
      const intervalMs = Math.max(15, s.settings.nightShiftIntervalMinutes || 180) * 60_000;
      if (Date.now() - lastNs >= intervalMs) {
        const hw = collectHardwareMetrics();
        if (!hw.throttledReason) {
          void runNightShiftCycle().then(() => broadcastEvent('state:updated'));
        }
      }
    }
    pruneRetentionData();
    pruneExpiredEphemeralNotes();
    try {
      runSqliteMaintenance();
    } catch {
      // non-fatal
    }
  }, 15 * 60_000);

  const shutdownGracefully = () => {
    try {
      closeSqliteWal();
    } catch {
      // best effort
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2500);
  };
  process.on('SIGTERM', shutdownGracefully);
  process.on('SIGINT', shutdownGracefully);

  server.on('error', (err) => {
    console.error(`NovaSwarm HTTP szerver hiba (port ${PORT}):`, err);
    process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NovaSwarm server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal NovaSwarm startup error:', err);
  process.exit(1);
});
