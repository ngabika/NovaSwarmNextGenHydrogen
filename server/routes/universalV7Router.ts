import express from 'express';
import type {
  DecisionLogEntry,
  MediaBacklogItem,
  OperatingModeId,
} from '../../shared/types';
import { triggerCustomWebhook } from '../automation/workflowsAndProductivity';
import { estimateMigrationDryRun } from '../infra/sshHostMigrator';
import {
  addDecisionLog,
  addFixedExpense,
  addFuelLog,
  addLentItem,
  addMediaBacklogItem,
  addMedication,
  addQuoteItem,
  addSavingsGoal,
  analyzeShadowPatterns,
  analyzeTabularData,
  broadcastLanDiscoveryPing,
  buildMermaidMindmap,
  buildProjectScaffold,
  buildSlideDeckHtml,
  buildYearInReviewSummary,
  compareTextDocuments,
  computeMonthlyFixedSummary,
  contributeSavingsGoal,
  createCountdownTimer,
  createDropShareToken,
  createTripPlan,
  detectJournalAnomalies,
  explainRegexAndCron,
  fetchExchangeRates,
  generateGitChangelog,
  generateHungarianOfficialLetter,
  generateQrSvg,
  generateWeeklyRetrospective,
  markLentItemReturned,
  OPERATING_MODE_META,
  parseHungarianNaturalAutomation,
  renderPromptVariables,
  replayRecordedWebhook,
  runNpmAuditCheck,
  scanLanOpenPorts,
  setDailyTop3,
  setOperatingMode,
  toggleDailyTop3Item,
  toggleFixedExpensePaid,
  toggleMedicationToday,
  toggleTripPackingItem,
  updateDecisionStatus,
  updateMediaBacklogStatus,
  updateSharedScratchpad,
} from '../power/batch7UniverseEngine';
import { runSqliteMaintenance } from '../state/sqliteWal';
import { clearOrResetAppData, getState, updateState } from '../state/store';
import { collectExtendedMemoryDiagnostics } from '../system/hardwareOptimizer';

export function createUniversalV7Router(
  broadcastEvent: (type: string, payload?: unknown) => void
): express.Router {
  const router = express.Router();

  const handleErr = (res: express.Response, err: unknown) => {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  };

  // 1. Operating Modes & Shared Scratchpad
  router.get('/mode', (_req, res) => {
    const mode = getState().settings.operatingMode || 'normal';
    res.json({ mode, meta: OPERATING_MODE_META[mode], allModes: OPERATING_MODE_META });
  });

  router.post('/mode', (req, res) => {
    try {
      const { mode } = req.body as { mode: OperatingModeId };
      if (!OPERATING_MODE_META[mode]) return res.status(400).json({ ok: false, error: 'Ismeretlen üzemmód.' });
      const out = setOperatingMode(mode);
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/scratchpad', (_req, res) => {
    res.json({ text: getState().sharedScratchpad || '' });
  });

  router.put('/scratchpad', (req, res) => {
    const { text } = req.body as { text: string };
    const out = updateSharedScratchpad(text || '');
    broadcastEvent('scratchpad:sync', out);
    res.json({ ok: true, ...out });
  });

  // 2. Natural Hungarian Automation (/ha) & Countdown Timers
  router.post('/natural-parse', (req, res) => {
    try {
      const { text } = req.body as { text: string };
      const out = parseHungarianNaturalAutomation(text || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/timers', (req, res) => {
    try {
      const { expr, durationSec } = req.body as { expr: string; durationSec?: number };
      const timer = createCountdownTimer(expr || '', durationSec);
      broadcastEvent('state:updated');
      res.json({ ok: true, timer });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/timers/:id', (req, res) => {
    updateState((s) => {
      s.countdownTimers = (s.countdownTimers || []).filter((t) => t.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // 3. QR Code SVG Generator (URL & Wi-Fi)
  router.post('/qr', (req, res) => {
    try {
      const { payload, wifiSsid, wifiPassword, wifiAuth, sizePx } = req.body as {
        payload?: string;
        wifiSsid?: string;
        wifiPassword?: string;
        wifiAuth?: 'WPA' | 'WEP' | 'nopass';
        sizePx?: number;
      };
      const out = generateQrSvg(payload || '', { wifiSsid, wifiPassword, wifiAuth, sizePx });
      res.json({ ok: true, ...out });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // 4. Knowledge & AI Studio (Diff, Mindmap, Slides, Regex/Cron, CSV, Prompt Vars, Decision Log, Quote Deck)
  router.post('/studio/diff', (req, res) => {
    const { textA, textB } = req.body as { textA?: string; textB?: string };
    res.json({ ok: true, ...compareTextDocuments(textA || '', textB || '') });
  });

  router.post('/studio/mindmap', (req, res) => {
    const { topic, bullets } = req.body as { topic?: string; bullets?: string };
    res.json({ ok: true, mermaid: buildMermaidMindmap(topic || 'Témakör', bullets || '') });
  });

  router.post('/studio/slides', (req, res) => {
    const { title, source, publishMiniApp } = req.body as {
      title?: string;
      source?: string;
      publishMiniApp?: boolean;
    };
    const out = buildSlideDeckHtml(title || 'NovaSwarm Bemutató', source || '', Boolean(publishMiniApp));
    if (publishMiniApp) broadcastEvent('state:updated');
    res.json({ ok: true, ...out });
  });

  router.post('/studio/regex-cron', (req, res) => {
    try {
      const { kind, pattern, testText } = req.body as {
        kind: 'regex' | 'cron';
        pattern: string;
        testText?: string;
      };
      res.json({ ok: true, ...explainRegexAndCron(kind === 'cron' ? 'cron' : 'regex', pattern || '', testText || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/tabular', (req, res) => {
    try {
      const { raw } = req.body as { raw: string };
      res.json({ ok: true, ...analyzeTabularData(raw || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/prompt-vars', (req, res) => {
    const { template, variables } = req.body as { template?: string; variables?: Record<string, string> };
    res.json({ ok: true, ...renderPromptVariables(template || '', variables || {}) });
  });

  router.post('/decisions', (req, res) => {
    try {
      const entry = addDecisionLog(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, entry });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.patch('/decisions/:id', (req, res) => {
    const { status } = req.body as { status: DecisionLogEntry['status'] };
    updateDecisionStatus(req.params.id, status || 'active');
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.delete('/decisions/:id', (req, res) => {
    updateState((s) => {
      s.decisionLogs = (s.decisionLogs || []).filter((d) => d.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/quotes', (req, res) => {
    try {
      const item = addQuoteItem(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/quotes/:id', (req, res) => {
    updateState((s) => {
      s.quoteDeck = (s.quoteDeck || []).filter((q) => q.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // 5. Homelab, Network, Journal, Replay, NPM Audit, Drop Tokens, RAM/ZRAM & Migration Dry-Run
  router.post('/net/port-scan', async (req, res) => {
    try {
      const { host, ports } = req.body as { host?: string; ports?: number[] };
      const result = await scanLanOpenPorts(host || '127.0.0.1', ports);
      broadcastEvent('state:updated');
      res.json({ ok: true, result });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/net/udp-ping', async (_req, res) => {
    const out = await broadcastLanDiscoveryPing();
    res.json({ ok: true, ...out });
  });

  router.get('/system/journal-anomalies', (req, res) => {
    const lines = Number(req.query.lines || 120);
    res.json({ ok: true, ...detectJournalAnomalies(lines) });
  });

  router.get('/system/memory-diag', (_req, res) => {
    res.json({ ok: true, ...collectExtendedMemoryDiagnostics() });
  });

  router.post('/system/sqlite-check', (_req, res) => {
    const out = runSqliteMaintenance();
    res.json(out);
  });

  router.get('/system/npm-audit', async (_req, res) => {
    res.json(await runNpmAuditCheck());
  });

  router.post('/migrate/dry-run', (_req, res) => {
    res.json({ ok: true, ...estimateMigrationDryRun() });
  });

  router.post('/system/reset-data', (req, res) => {
    const { keepSecretsAndSettings = true } = (req.body || {}) as { keepSecretsAndSettings?: boolean };
    clearOrResetAppData({ keepSecretsAndSettings });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/webhooks/:id/replay', async (req, res) => {
    try {
      const out = await replayRecordedWebhook(req.params.id, (slug, payload) =>
        triggerCustomWebhook(slug, undefined, payload)
      );
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/drop-tokens', (req, res) => {
    try {
      const { fileName, ttlMinutes, maxDownloads } = req.body as {
        fileName: string;
        ttlMinutes?: number;
        maxDownloads?: number;
      };
      const token = createDropShareToken(fileName || '', ttlMinutes, maxDownloads);
      broadcastEvent('state:updated');
      res.json({ ok: true, token, downloadPath: `/drop/${token.token}` });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // 6. Currency, Fixed Expenses, Meds, Trips, Lent Items, Fuel, Media, Savings, Top3, Official Letters
  router.post('/finance/rates/refresh', async (_req, res) => {
    const out = await fetchExchangeRates();
    broadcastEvent('state:updated');
    res.json({ ok: true, ...out });
  });

  router.post('/finance/fixed', (req, res) => {
    try {
      const item = addFixedExpense(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item, summary: computeMonthlyFixedSummary() });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/finance/fixed/:id/toggle', (req, res) => {
    const summary = toggleFixedExpensePaid(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true, summary });
  });

  router.delete('/finance/fixed/:id', (req, res) => {
    updateState((s) => {
      s.fixedExpenses = (s.fixedExpenses || []).filter((f) => f.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/finance/savings', (req, res) => {
    try {
      const item = addSavingsGoal(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/finance/savings/:id/contribute', (req, res) => {
    const { amount } = req.body as { amount: number };
    contributeSavingsGoal(req.params.id, Number(amount || 0));
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/meds', (req, res) => {
    try {
      const item = addMedication(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/meds/:id/toggle', (req, res) => {
    const updated = toggleMedicationToday(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true, item: updated });
  });

  router.delete('/meds/:id', (req, res) => {
    updateState((s) => {
      s.medicationReminders = (s.medicationReminders || []).filter((m) => m.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/trips', (req, res) => {
    try {
      const item = createTripPlan(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/trips/:tripId/pack/:itemId/toggle', (req, res) => {
    toggleTripPackingItem(req.params.tripId, req.params.itemId);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.delete('/trips/:id', (req, res) => {
    updateState((s) => {
      s.tripPlans = (s.tripPlans || []).filter((t) => t.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/lent', (req, res) => {
    try {
      const item = addLentItem(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/lent/:id/toggle', (req, res) => {
    markLentItemReturned(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/fuel', (req, res) => {
    try {
      const item = addFuelLog(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/media-backlog', (req, res) => {
    try {
      const item = addMediaBacklogItem(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.patch('/media-backlog/:id', (req, res) => {
    const { status, rating } = req.body as { status: MediaBacklogItem['status']; rating?: number };
    updateMediaBacklogStatus(req.params.id, status || 'queued', rating);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/top3', (req, res) => {
    const { items } = req.body as { items: string[] };
    const top3 = setDailyTop3(Array.isArray(items) ? items : []);
    broadcastEvent('state:updated');
    res.json({ ok: true, top3 });
  });

  router.post('/top3/:itemId/toggle', (req, res) => {
    const top3 = toggleDailyTop3Item(req.params.itemId);
    broadcastEvent('state:updated');
    res.json({ ok: true, top3 });
  });

  router.post('/life/official-letter', (req, res) => {
    const letter = generateHungarianOfficialLetter(req.body || {});
    res.json({ ok: true, letter });
  });

  router.get('/life/year-in-review', (_req, res) => {
    res.json({ ok: true, ...buildYearInReviewSummary() });
  });

  // 7. Hyper-Autonomy: Shadow Pattern Miner, Weekly Retro, Project Scaffold, Git Changelog
  router.get('/autonomy/shadow-patterns', (_req, res) => {
    res.json({ ok: true, ...analyzeShadowPatterns() });
  });

  router.get('/autonomy/retrospective', (_req, res) => {
    res.json({ ok: true, ...generateWeeklyRetrospective() });
  });

  router.post('/dev/scaffold', (req, res) => {
    const { kind, projectName } = req.body as {
      kind?: 'node-ts' | 'react-vite' | 'python-fastapi' | 'esp32';
      projectName?: string;
    };
    const out = buildProjectScaffold(kind || 'node-ts', projectName || 'nova-app');
    res.json({ ok: true, ...out });
  });

  router.get('/dev/changelog', (req, res) => {
    const limit = Number(req.query.limit || 25);
    res.json({ ok: true, ...generateGitChangelog(limit) });
  });

  return router;
}
