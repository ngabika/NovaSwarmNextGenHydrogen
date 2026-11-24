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
import {
  ensureOneTimeSetupCode,
  getWsUpgradeDecision,
  requireAllowedHostMiddleware,
} from './server/security/auth';
import {
  createDefaultApiRateLimitMiddleware,
  createPublicRouteRateLimitMiddleware,
  createSelectiveJsonBodyMiddleware,
} from './server/security/rateLimit';
import { expireStaleApprovals } from './server/security/permissionGate';
import { closeSqliteWal, runSqliteMaintenance } from './server/state/sqliteWal';
import { getState, pruneRetentionData, updateState } from './server/state/store';
import {
  applyOtaUpdate,
  checkOtaUpdates,
  collectHardwareMetrics,
  maybeSendDailyAuditAnchorToTelegram,
  runHeartbeatTick,
} from './server/system/ops';
import { sendTelegramMessage, startTelegramPolling } from './server/telegram/bot';
import {
  attachWebSocketToSession,
  createTerminalSession,
  resizeTerminalSession,
  writeToTerminalSession,
} from './server/terminal/ptyManager';
import {
  applyHardwareAdaptiveOptimization,
  runRamOomWatchdogTick,
} from './server/system/hardwareOptimizer';
import {
  buildProactiveBrief,
  runEmailInboxTriage,
  runSelfHealingDaemonTick,
  runVisualWatchCheck,
} from './server/power/batch5AutonomyEngine';
import {
  evaluateAutonomyRules,
  processDueSmartReminders,
  runDockerWatchtowerHeal,
  runLanSentinelAndSpeedtest,
} from './server/power/batch6ApexEngine';
import {
  consumeDropShareToken,
  processDueCountdownTimers,
} from './server/power/batch7UniverseEngine';
import { speakOnHostSpeaker } from './server/system/ops';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(requireAllowedHostMiddleware);
  app.use(createSelectiveJsonBodyMiddleware());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const apiRateLimiter = createDefaultApiRateLimitMiddleware();
  const publicRateLimiter = createPublicRouteRateLimitMiddleware();

  const server = http.createServer(app);

  // WebSocket hub for /ws/events (live state push) and /ws/terminal (real PTY streaming)
  const wssEvents = new WebSocketServer({ noServer: true });
  const wssTerminal = new WebSocketServer({ noServer: true });
  const eventClients = new Set<WebSocket>();

  let stateUpdatedTimer: ReturnType<typeof setTimeout> | null = null;
  const emitWsPacket = (type: string, payload?: unknown) => {
    const packet = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of eventClients) {
      if (client.readyState === 1) {
        client.send(packet);
      }
    }
  };
  const broadcastEvent = (type: string, payload?: unknown) => {
    // M265: Coalesce rapid state:updated events into a single frame (150ms debounce)
    if (type === 'state:updated' && payload === undefined) {
      if (stateUpdatedTimer) return;
      stateUpdatedTimer = setTimeout(() => {
        stateUpdatedTimer = null;
        emitWsPacket('state:updated');
      }, 150);
      return;
    }
    emitWsPacket(type, payload);
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
    const decision = getWsUpgradeDecision(request);
    if (!decision.authorized) {
      const statusText = decision.statusCode === 403 ? 'Forbidden' : 'Unauthorized';
      socket.write(`HTTP/1.1 ${decision.statusCode} ${statusText}\r\n\r\n`);
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
  app.use('/v1', apiRateLimiter, createOpenAiProxyRouter(broadcastEvent));

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

  const escapeHtmlStrict = (val: string) =>
    String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Stricter rate limit on unauthenticated public share / portal / burn / drop / mock / app routes
  app.use(['/share', '/apps', '/mock', '/burn', '/drop'], publicRateLimiter);

  // Ú100: Public read-only shared portal view
  app.get('/share/:token', (req, res) => {
    const resolved = resolveSharedPortalResource(req.params.token);
    if (!resolved) {
      return res.status(404).send('<h1>A megosztott hivatkozás lejárt vagy nem található.</h1>');
    }
    const safeTitle = escapeHtmlStrict(resolved.link.title);
    const safeType = escapeHtmlStrict(String(resolved.link.resourceType || ''));
    const safeBody = escapeHtmlStrict(JSON.stringify(resolved.payload, null, 2));
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${safeTitle} — NovaSwarm Megosztás</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#0f172a;background:#f8fafc}pre{background:#fff;border:1px solid #e2e8f0;padding:16px;border-radius:8px;overflow:auto;font-size:13px}</style></head><body><h1>${safeTitle}</h1><p>Típus: ${safeType} · Megtekintések: ${Number(resolved.link.views) || 0}</p><pre>${safeBody}</pre></body></html>`);
  });

  // Ú206: Self-Hosted App Builder route (/apps/:slug) — isolated via CSP sandbox so user HTML cannot steal cookies/WS
  app.get('/apps/:slug', (req, res) => {
    const found = getState().hostedMiniApps.find((a) => a.slug === req.params.slug);
    if (!found) {
      return res.status(404).send('<h1>A keresett Mini-App nem található.</h1>');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "sandbox allow-scripts allow-forms; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
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
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'no-store');
    if (!out.ok) {
      return res.status(404).send(`<!doctype html><html lang="hu"><body style="font-family:system-ui;max-width:600px;margin:48px auto;padding:16px"><h2>Égő Cetli</h2><p>${escapeHtmlStrict(out.reason || 'A cetli lejárt vagy megsemmisült.')}</p></body></html>`);
    }
    return res.send(`<!doctype html><html lang="hu"><body style="font-family:system-ui;max-width:640px;margin:48px auto;padding:24px;background:#f8fafc"><h2>${escapeHtmlStrict(out.title || 'Titkos Üzenet')}</h2><p style="color:#b45309;font-size:13px">${out.burnedNow ? 'Ez az üzenet a megnyitással megsemmisült.' : 'Ideiglenes széf tartalom.'}</p><pre style="background:#fff;border:1px solid #cbd5e1;padding:16px;border-radius:8px;white-space:pre-wrap">${escapeHtmlStrict(out.content || '')}</pre></body></html>`);
  });

  // Ú314: Expiring LAN Drop File Share Token endpoint (/drop/:token)
  app.get('/drop/:token', (req, res) => {
    const out = consumeDropShareToken(req.params.token);
    if (!out.ok || !out.filePath || !out.fileName) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      return res.status(404).send(`<!doctype html><html lang="hu"><body style="font-family:system-ui;max-width:560px;margin:48px auto;padding:16px"><h2>LAN Drop Megosztás</h2><p>${escapeHtmlStrict(out.reason || 'A link érvénytelen.')}</p></body></html>`);
    }
    return res.download(out.filePath, out.fileName);
  });

  // Mount NovaSwarm Control Plane API routes
  app.use('/api', apiRateLimiter, createApiRouter(broadcastEvent));

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
  ensureOneTimeSetupCode();
  try {
    applyHardwareAdaptiveOptimization(false);
  } catch {
    // non-fatal on constrained containers
  }
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
      if (watchdogCounter % 15 === 0 && (s.visualWatchItems?.length ?? 0) > 0) {
        void runVisualWatchCheck().then((vw) => {
          for (const ch of vw.changedItems) {
            void sendTelegramMessage(`Vizuális oldalváltozás észlelve: ${ch.name} (${ch.url})`);
          }
          if (vw.changedItems.length > 0) broadcastEvent('state:updated');
        });
      }
      if (watchdogCounter % 5 === 0 && s.settings.selfHealingDaemonEnabled !== false) {
        void runSelfHealingDaemonTick().then((h) => {
          if (h.healedActions.length > 0 || h.failedServices.length > 0) broadcastEvent('state:updated');
        });
      }
      if (watchdogCounter % 5 === 0 && s.settings.dockerAutoHealEnabled !== false) {
        void runDockerWatchtowerHeal({ autoRestartExited: true }).then((d) => {
          if (d.restarted.length > 0) broadcastEvent('state:updated');
        });
      }
      if (watchdogCounter % Math.max(10, s.settings.speedtestIntervalMinutes || 60) === 0) {
        void runLanSentinelAndSpeedtest({ runSpeedtest: true }).then(() => broadcastEvent('state:updated'));
      }
      void evaluateAutonomyRules().then((ev) => {
        if (ev.triggered.length > 0) broadcastEvent('state:updated');
      });
    }

    // RAM/OOM Watchdog runs regardless of kill switch to protect host stability
    void runRamOomWatchdogTick().then((wd) => {
      if (wd.triggered) {
        broadcastEvent('state:updated');
        if (wd.ramPercent >= 93) {
          void sendTelegramMessage(`RAM Őrszem riasztás (${wd.ramPercent}%): ${wd.actionsTaken.join(', ')}`);
        }
      }
    });

    // Proactive Morning/Evening Brief + Email Triage minute check
    if (s.settings.onboardingCompleted && !s.settings.killSwitchActive) {
      const nowD = new Date();
      const hhmm = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
      const todayPrefix = nowD.toISOString().slice(0, 10);
      const events = s.proactiveEvents || [];
      if (
        s.settings.morningBriefTime &&
        hhmm === s.settings.morningBriefTime &&
        !events.some((e) => e.kind === 'morning_brief' && e.createdAt.startsWith(todayPrefix))
      ) {
        void buildProactiveBrief('morning').then((b) => {
          void sendTelegramMessage(b.text);
          if (s.settings.inboxTriageEnabled !== false) runEmailInboxTriage();
          broadcastEvent('state:updated');
        });
      }
      if (
        s.settings.eveningBriefTime &&
        hhmm === s.settings.eveningBriefTime &&
        !events.some((e) => e.kind === 'evening_brief' && e.createdAt.startsWith(todayPrefix))
      ) {
        void buildProactiveBrief('evening').then((b) => {
          void sendTelegramMessage(b.text);
          broadcastEvent('state:updated');
        });
      }
    }

    if (changed) broadcastEvent('state:updated');
  }, 60_000);

  // M18 Bidirectional Discord/Slack Polling, Batch 6 Smart Reminders & Batch 7 Countdown Timers (every 25s)
  setInterval(() => {
    const s = getState();
    if (!s.settings.killSwitchActive) {
      void processDueSmartReminders().then((rem) => {
        if (rem.firedCount > 0) broadcastEvent('state:updated');
      });
      const doneTimers = processDueCountdownTimers();
      if (doneTimers.completedCount > 0) {
        for (const tm of doneTimers.completedTimers) {
          broadcastEvent('timer:done', tm);
          void sendTelegramMessage(`⏱️ Időzítő lejárt: ${tm.label}`).catch(() => {});
          if (s.settings.ttsHostSpeakerEnabled) {
            speakOnHostSpeaker(`Lejárt az időzítő: ${tm.label}`);
          }
        }
        broadcastEvent('state:updated');
      }
    }
    if (s.settings.killSwitchActive || !s.settings.onboardingCompleted) return;
    if (!s.channelConnectors.some((c) => c.enabled && c.pollingEnabled)) return;
    void pollExternalChannels().then((r) => {
      if (r.processed > 0) broadcastEvent('state:updated');
    });
  }, 25_000);

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
    void maybeSendDailyAuditAnchorToTelegram().catch(() => {});
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
