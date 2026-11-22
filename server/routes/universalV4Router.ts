import express from 'express';
import {
  addCustomDashboardWidget,
  checkSystemPackageUpdates,
  collectPiHardwareDeepStatus,
  detectLanIntruders,
  evaluateCustomWidgets,
  generatePostMortemReport,
  getLanDropFilePath,
  listHostDirectory,
  listLanDropFiles,
  querySmartMeterEnergy,
  readHostTextFile,
  runBashCopilot,
  saveLanDropFile,
  writeHostTextFile,
} from '../infra/batch4PiHardwareAndNet';
import {
  addDocumentSafeItem,
  addPriceWatchItem,
  auditBatch4Action,
  awardUserXp,
  buildCalendarIcsFeed,
  buildPortableMigrationBundle,
  categorizeBankCsv,
  checkExpiringDocuments,
  checkPriceWatchItem,
  consumeEphemeralNote,
  createEphemeralNote,
  createHostedMiniApp,
  createLifeGoalOkrAndKanban,
  estimateMissionCostAndRoute,
  evaluateDecisionMatrix,
  exportChatAsJsonl,
  generateInteractiveQuizHtml,
  generateInteractiveSlideDeck,
  generateVectorLogoSvg,
  getAutopilotSummary,
  plotMathFunctionSvg,
  runGlobalOmnisearch,
  runMultiAgentDebate,
  scheduleDagSteps,
  suggestRecipesFromPantry,
  upsertApiMockEndpoint,
} from '../power/batch4OmniStudio';
import { runSqliteMaintenance, searchWalFullText } from '../state/sqliteWal';
import { getState, updateState } from '../state/store';

export function createUniversalV4Router(
  broadcastEvent: (type: string, payload?: unknown) => void
): express.Router {
  const router = express.Router();

  const handleErr = (res: express.Response, err: unknown) => {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  };

  // M204 & M205: SQLite VACUUM/Checkpoint + FTS5 full-text search
  router.post('/sqlite/maintenance', (_req, res) => {
    try {
      res.json(runSqliteMaintenance());
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/sqlite/search', (req, res) => {
    const q = String(req.query.q || '');
    res.json({ query: q, hits: searchWalFullText(q, 30) });
  });

  // Ú259: Global Omnisearch
  router.get('/omnisearch', (req, res) => {
    const q = String(req.query.q || '');
    res.json(runGlobalOmnisearch(q, 40));
  });

  // Ú260: Autopilot 24/7 Summary
  router.get('/autopilot', (_req, res) => {
    res.json(getAutopilotSummary());
  });

  // M161 & M175: DAG Mission Scheduler & Cost Pre-Estimator
  router.post('/swarm/plan-dag', (req, res) => {
    const { goal, steps } = req.body as {
      goal?: string;
      steps?: Array<{ id: string; title: string; dependsOn?: string[] }>;
    };
    const waves = scheduleDagSteps(steps || []);
    const estimate = estimateMissionCostAndRoute(goal || 'Küldetés', (steps || []).length || 3);
    res.json({ waves, estimate });
  });

  // Ú206: App Builder (self-hosted at /apps/:slug)
  router.post('/apps', async (req, res) => {
    try {
      const { title, description, htmlOverride, useAi } = req.body as {
        title: string;
        description?: string;
        htmlOverride?: string;
        useAi?: boolean;
      };
      const app = await createHostedMiniApp({
        title: title || '',
        description: description || '',
        htmlOverride,
        useAi,
      });
      auditBatch4Action(`Új Mini-App készítve: ${app.title} (/apps/${app.slug})`);
      broadcastEvent('state:updated');
      res.json({ app, url: `/apps/${app.slug}` });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/apps/:id', (req, res) => {
    updateState((s) => {
      s.hostedMiniApps = s.hostedMiniApps.filter((a) => a.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú218: Live API Mock Server (/mock/:slug)
  router.post('/mocks', (req, res) => {
    try {
      const ep = upsertApiMockEndpoint(req.body || {});
      broadcastEvent('state:updated');
      res.json({ endpoint: ep, url: `/mock/${ep.slug}` });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/mocks/:id', (req, res) => {
    updateState((s) => {
      s.apiMocks = s.apiMocks.filter((m) => m.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú226: Multi-Agent Debate Theater
  router.post('/debate', async (req, res) => {
    try {
      const { topic } = req.body as { topic: string };
      const run = await runMultiAgentDebate(topic || '');
      broadcastEvent('state:updated');
      res.json({ run });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Ú207, Ú208, Ú232, Ú234, Ú238, Ú239: Omni Calculators & Generators
  router.post('/decision-matrix', (req, res) => {
    try {
      res.json(evaluateDecisionMatrix(req.body));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/bank-csv', (req, res) => {
    try {
      const { csv } = req.body as { csv: string };
      res.json(categorizeBankCsv(csv || ''));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/creative/logo-svg', (req, res) => {
    try {
      res.json({ svg: generateVectorLogoSvg(req.body || {}) });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/math/plot', (req, res) => {
    try {
      const { expr, xMin, xMax } = req.body as { expr: string; xMin?: number; xMax?: number };
      res.json(plotMathFunctionSvg(expr || 'x^2', Number(xMin ?? -10), Number(xMax ?? 10)));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/creative/slides', (req, res) => {
    const { title, bullets } = req.body as { title?: string; bullets?: string };
    res.json({ html: generateInteractiveSlideDeck(title || 'Prezentáció', bullets || '') });
  });

  router.post('/creative/quiz', (req, res) => {
    const { topic, questions } = req.body as {
      topic?: string;
      questions?: Array<{ question: string; options: string[]; answerIndex: number }>;
    };
    res.json({ html: generateInteractiveQuizHtml(topic || 'Kvíz', questions || []) });
  });

  // Ú209: Document & Warranty Safe
  router.post('/documents', (req, res) => {
    try {
      const item = addDocumentSafeItem(req.body || {});
      awardUserXp(`Okmány rögzítve: ${item.title}`, 10);
      broadcastEvent('state:updated');
      res.json({ item, expiringSoon: checkExpiringDocuments(30) });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/documents/:id', (req, res) => {
    updateState((s) => {
      s.documentSafe = s.documentSafe.filter((d) => d.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú210: Webshop Price Watch
  router.post('/price-watches', (req, res) => {
    try {
      const item = addPriceWatchItem(req.body || {});
      broadcastEvent('state:updated');
      res.json({ item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/price-watches/:id/check', async (req, res) => {
    try {
      const out = await checkPriceWatchItem(req.params.id);
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/price-watches/:id', (req, res) => {
    updateState((s) => {
      s.priceWatches = s.priceWatches.filter((p) => p.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú212: Pantry Recipes
  router.get('/recipes/pantry', (_req, res) => {
    res.json({ recipes: suggestRecipesFromPantry() });
  });

  // Ú244 & Ú257: Once-Time Secret ("Égő Cetli") & Temp Vault
  router.post('/ephemeral-notes', (req, res) => {
    try {
      const note = createEphemeralNote(req.body || {});
      broadcastEvent('state:updated');
      res.json({ note, sharePath: `/burn/${note.token}` });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/ephemeral-notes/:token/read', (req, res) => {
    const out = consumeEphemeralNote(req.params.token);
    broadcastEvent('state:updated');
    res.json(out);
  });

  // Ú254: Life Compass OKR -> Kanban
  router.post('/okrs', (req, res) => {
    try {
      const goal = createLifeGoalOkrAndKanban(req.body || {});
      broadcastEvent('state:updated');
      res.json({ goal });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Ú237 & M219 & Ú248 & M245: XP, JSONL Export, Migration Bundle, iCal Feed
  router.post('/xp/award', (req, res) => {
    const { reason, points } = req.body as { reason?: string; points?: number };
    const profile = awardUserXp(reason || 'Feladat teljesítve', Number(points || 10));
    broadcastEvent('state:updated');
    res.json({ userXp: profile });
  });

  router.get('/export/jsonl', (_req, res) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="novaswarm-lora.jsonl"');
    res.send(exportChatAsJsonl());
  });

  router.get('/export/migration-bundle', (_req, res) => {
    res.json(buildPortableMigrationBundle());
  });

  router.get('/calendar.ics', (_req, res) => {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(buildCalendarIcsFeed());
  });

  // Ú161–Ú167, M207–M208, Ú194, Ú199, Ú188, Ú251–Ú258: Pi Hardware, Files, LAN Drop, Bash Copilot, Post-Mortem, Widgets
  router.get('/pi/deep-status', (_req, res) => {
    res.json(collectPiHardwareDeepStatus());
  });

  router.post('/energy/smart-meter', async (req, res) => {
    try {
      const { url, pricePerKwh } = req.body as { url: string; pricePerKwh?: number };
      res.json(await querySmartMeterEnergy(url || '', Number(pricePerKwh || 38)));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/network/intruders', (req, res) => {
    const { markKnown } = req.body as { markKnown?: boolean };
    const out = detectLanIntruders(Boolean(markKnown));
    if (markKnown) broadcastEvent('state:updated');
    res.json(out);
  });

  router.get('/files/list', (req, res) => {
    try {
      res.json(listHostDirectory(req.query.path ? String(req.query.path) : undefined));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/files/read', (req, res) => {
    try {
      res.json(readHostTextFile(String(req.query.path || '')));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/files/write', (req, res) => {
    try {
      const { path: filePath, content } = req.body as { path: string; content: string };
      res.json(writeHostTextFile(filePath || '', content ?? ''));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/landrop', (_req, res) => {
    res.json({ files: listLanDropFiles() });
  });

  router.post('/landrop', (req, res) => {
    try {
      const { fileName, contentBase64 } = req.body as { fileName: string; contentBase64: string };
      const saved = saveLanDropFile(fileName || 'fajl.bin', contentBase64 || '');
      res.json(saved);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/landrop/:name', (req, res) => {
    const p = getLanDropFilePath(req.params.name);
    if (!p) return res.status(404).send('Fájl nem található.');
    return res.download(p);
  });

  router.post('/bash-copilot', async (req, res) => {
    try {
      const { intent, execute } = req.body as { intent: string; execute?: boolean };
      const out = await runBashCopilot(intent || '', Boolean(execute));
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/system/package-updates', (_req, res) => {
    res.json(checkSystemPackageUpdates());
  });

  router.post('/system/post-mortem', (_req, res) => {
    const report = generatePostMortemReport();
    broadcastEvent('state:updated');
    res.json({ report });
  });

  router.post('/widgets/custom', async (req, res) => {
    try {
      const w = addCustomDashboardWidget(req.body || {});
      const widgets = await evaluateCustomWidgets();
      broadcastEvent('state:updated');
      res.json({ widget: w, widgets });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/widgets/custom/refresh', async (_req, res) => {
    try {
      const widgets = await evaluateCustomWidgets();
      broadcastEvent('state:updated');
      res.json({ widgets });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/widgets/custom/:id', (req, res) => {
    updateState((s) => {
      s.customWidgets = s.customWidgets.filter((w) => w.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Expose quick state check helper
  router.get('/summary', (_req, res) => {
    const s = getState();
    res.json({
      xp: s.userXp,
      hostedApps: s.hostedMiniApps.length,
      apiMocks: s.apiMocks.length,
      documentSafe: s.documentSafe.length,
      priceWatches: s.priceWatches.length,
    });
  });

  return router;
}
