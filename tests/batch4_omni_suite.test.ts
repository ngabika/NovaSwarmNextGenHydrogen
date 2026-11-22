import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectPiHardwareDeepStatus } from '../server/infra/batch4PiHardwareAndNet';
import {
  addDocumentSafeItem,
  addPriceWatchItem,
  awardUserXp,
  buildCalendarIcsFeed,
  categorizeBankCsv,
  checkExpiringDocuments,
  checkPriceWatchItem,
  compressToolOutput,
  consumeEphemeralNote,
  createEphemeralNote,
  createHostedMiniApp,
  createLifeGoalOkrAndKanban,
  estimateMissionCostAndRoute,
  evaluateDecisionMatrix,
  evaluateMathExpression,
  extractPriceFromHtml,
  generateVectorLogoSvg,
  plotMathFunctionSvg,
  repairJsonPayload,
  resolveApiMockRequest,
  runGlobalOmnisearch,
  saveMissionCheckpoint,
  scheduleDagSteps,
  selectAdaptiveTemperature,
  suggestCommandRecovery,
  suggestRecipesFromPantry,
  upsertApiMockEndpoint,
} from '../server/power/batch4OmniStudio';
import {
  closeWalDatabaseForTests,
  runSqliteMaintenance,
  searchWalFullText,
  syncMemoryToWal,
} from '../server/state/sqliteWal';
import {
  createInitialState,
  resetInMemoryStateForTests,
} from '../server/state/store';
import {
  processTelegramInput,
  splitTelegramMessageSafe,
} from '../server/telegram/bot';

test('M161–M178: DAG scheduler, output compressor, recovery, JSON repair, adaptive temperature, cost route & checkpoints', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  // M161 DAG topological waves
  const waves = scheduleDagSteps([
    { id: 's1', title: 'Fetch repo' },
    { id: 's2', title: 'Fetch issues' },
    { id: 's3', title: 'Analyze combined', dependsOn: ['s1', 's2'] },
    { id: 's4', title: 'Summarize', dependsOn: ['s3'] },
  ]);
  assert.equal(waves.length, 3);
  assert.deepEqual(
    waves[0].map((s) => s.id),
    ['s1', 's2']
  );
  assert.deepEqual(
    waves[1].map((s) => s.id),
    ['s3']
  );
  assert.deepEqual(
    waves[2].map((s) => s.id),
    ['s4']
  );

  // M164 compressToolOutput
  const bigLines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: payload ok`).join('\n');
  const compressed = compressToolOutput(bigLines, 600);
  assert.ok(compressed.length <= 600);
  assert.match(compressed, /tömörítve/);

  // M166 suggestCommandRecovery
  const recMissing = suggestCommandRecovery('bash: jq: command not found', 'jq . package.json');
  assert.equal(recMissing.recoverable, true);
  assert.equal(recMissing.suggestedAlternative, 'python3 -m json.tool');

  const recPort = suggestCommandRecovery('Error: listen EADDRINUSE: address already in use :::3000', 'npm start');
  assert.equal(recPort.recoverable, true);

  // M171 repairJsonPayload
  const repaired = repairJsonPayload<{ a: number; b: string }>(
    'Íme a JSON:\n```json\n{"a": 42, "b": "ok",}\n```\nKész!'
  );
  assert.deepEqual(repaired, { a: 42, b: 'ok' });

  // M178 selectAdaptiveTemperature
  assert.ok(selectAdaptiveTemperature('code') < selectAdaptiveTemperature('creative'));
  assert.equal(selectAdaptiveTemperature('json', -0.2), 0);

  // M175 estimateMissionCostAndRoute
  const est = estimateMissionCostAndRoute('Rendszer átvizsgálása', 5);
  assert.ok(est.estimatedInputTokens > 0);
  assert.ok(est.estimatedOutputTokens > 0);

  // M163 saveMissionCheckpoint
  const cp = saveMissionCheckpoint({
    missionId: 'mis-test-1',
    goal: 'Backup teszt',
    completedStepIndices: [0, 1],
    partialOutputs: ['Step 0 done', 'Step 1 done'],
  });
  assert.equal(cp.missionId, 'mis-test-1');
  assert.equal(state.missionCheckpoints.length, 1);
});

test('M183 & Batch 4 Telegram Commands: code-fence safe split and /top /xp /recept /okmany /autopilot /behatolo', async () => {
  const state = createInitialState();
  state.homeInventory = [
    {
      id: 'inv-1',
      name: 'csirkemell',
      quantity: 2,
      unit: 'db',
      category: 'hús',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'inv-2',
      name: 'rizs',
      quantity: 1,
      unit: 'kg',
      category: 'kamra',
      updatedAt: new Date().toISOString(),
    },
  ];
  resetInMemoryStateForTests(state);

  // M183 fence preservation
  const longCode = [
    'Bevezető',
    '```ts',
    ...Array.from({ length: 40 }, (_, i) => `const val_${i} = ${i};`),
    '```',
  ].join('\n');
  const chunks = splitTelegramMessageSafe(longCode, 220);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    const count = (chunk.match(/```/g) || []).length;
    assert.equal(count % 2, 0, `Balanced triple backticks expected in chunk:\n${chunk}`);
  }

  // Telegram commands
  const topOut = await processTelegramInput('/top');
  assert.match(topOut, /Rendszer Telemetria/);

  const xpOut = await processTelegramInput('/xp');
  assert.match(xpOut, /RPG Profil/);

  const recOut = await processTelegramInput('/recept');
  assert.match(recOut, /Csirkés Zöldséges Wok/);

  const docOut = await processTelegramInput('/okmany');
  assert.match(docOut, /garancia|lejárat/i);

  const autoOut = await processTelegramInput('/autopilot');
  assert.match(autoOut, /Autopilot 24\/7/);

  const netOut = await processTelegramInput('/behatolo');
  assert.match(netOut, /LAN|MAC/);
});

test('M204 & M205: SQLite WAL FTS5 full-text search & checkpoint/VACUUM maintenance', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-fts-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  try {
    syncMemoryToWal(
      {
        id: 'mem-fts-1',
        entity: 'Raspberry Pi Router',
        content: 'WireGuard alagút konfigurálva az 51820 UDP porton.',
        tags: ['wireguard', 'pi'],
        links: [],
        embedding: [],
        importanceScore: 0.9,
        tier: 'hot',
        lastAccessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      dbPath
    );
    const hits = searchWalFullText('WireGuard', 10, dbPath);
    assert.ok(hits.length >= 1);
    assert.match(hits[0].body, /WireGuard/);

    const maint = runSqliteMaintenance(dbPath);
    assert.equal(maint.ok, true);
    assert.ok(maint.afterBytes >= 0);
  } finally {
    closeWalDatabaseForTests();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Ú206, Ú218, Ú207, Ú208, Ú209, Ú210, Ú212: Mini-App Builder, API Mock, Decision Matrix, Bank CSV, Doc Safe, Price Watch & Pantry Recipes', async () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  // Ú206 Mini-App
  const app = await createHostedMiniApp({
    title: 'Okos Időzítő',
    description: 'Egyszerű Pomodoro számláló',
    useAi: false,
  });
  assert.equal(app.slug, 'okos-idozito');
  assert.match(app.htmlContent, /<!doctype html>/i);

  // Ú218 Live API Mock
  const ep = upsertApiMockEndpoint({
    slug: 'pi/health',
    method: 'GET',
    statusCode: 201,
    responseJson: '{"status":"healthy","temp":44}',
  });
  assert.equal(ep.slug, 'pi/health');
  const resolved = resolveApiMockRequest('pi/health', 'GET');
  assert.equal(resolved.found, true);
  assert.equal(resolved.statusCode, 201);
  assert.deepEqual(resolved.body, { status: 'healthy', temp: 44 });

  // Ú207 Decision Matrix
  const dm = evaluateDecisionMatrix({
    title: 'SBC választás',
    criteria: [
      { name: 'Ár', weight: 3 },
      { name: 'Teljesítmény', weight: 5 },
    ],
    options: [
      { name: 'Pi 5', scores: { Ár: 7, Teljesítmény: 9 } },
      { name: 'Mini PC', scores: { Ár: 5, Teljesítmény: 10 } },
    ],
  });
  assert.equal(dm.winner, 'Pi 5');

  // Ú208 Bank CSV
  const bank = categorizeBankCsv(
    'Dátum;Leírás;Összeg\n2026-11-20;Lidl Bevásárlás;-14500\n2026-11-21;MVM Áram;-18200\n2026-11-22;Fizetés;500000\n2026-11-23;Új Laptop;-290000'
  );
  assert.equal(bank.rowsParsed, 4);
  assert.equal(bank.totalIncome, 500000);
  assert.equal(bank.byCategory['Élelmiszer & Bolt'], 14500);
  assert.equal(bank.byCategory['Rezsi & Közmű'], 18200);
  assert.ok(bank.anomalies.length >= 1);

  // Ú209 Document & Warranty Safe
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  addDocumentSafeItem({ title: 'Személyi igazolvány', category: 'identity', expiresAt: soon });
  const exp = checkExpiringDocuments(30);
  assert.equal(exp.length, 1);
  assert.equal(exp[0].title, 'Személyi igazolvány');

  // Ú210 Price Watch HTML extraction + mocked check
  assert.equal(extractPriceFromHtml('<meta property="product:price:amount" content="19990" />'), 19990);
  assert.equal(extractPriceFromHtml('<div>Akciós ár: 24 900 Ft</div>'), 24900);
  const pw = addPriceWatchItem({
    name: 'NVMe SSD',
    url: 'https://example.com/ssd',
    targetPrice: 25000,
    currency: 'HUF',
  });
  const checked = await checkPriceWatchItem(pw.id, async () => {
    return new Response('<html><body>Most csak 21 990 Ft!</body></html>', { status: 200 });
  });
  assert.equal(checked.item.lastPrice, 21990);
  assert.equal(checked.alertTriggered, true);

  // Ú212 Pantry recipes
  state.homeInventory.push({
    id: 'inv-tojas',
    name: 'tojás',
    quantity: 6,
    unit: 'db',
    category: 'hűtő',
    updatedAt: new Date().toISOString(),
  });
  const recs = suggestRecipesFromPantry();
  assert.ok(recs.some((r) => r.matchPercent > 0));
});

test('Ú232, Ú234, Ú237, Ú244/Ú257, Ú254, Ú259, M245 & Ú161/M207: SVG, Math, XP, Burn Note, OKR, Omnisearch, ICS & Pi Telemetry', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  // Ú232 Vector Logo SVG
  const logo = generateVectorLogoSvg({ title: 'NovaSwarm', shape: 'shield' });
  assert.match(logo, /^<svg /);
  assert.match(logo, /NovaSwarm/);

  // Ú234 Safe Math Parser & Plotter
  assert.equal(evaluateMathExpression('2 * x + 3', 5), 13);
  assert.throws(() => evaluateMathExpression('process.exit(1)', 1));
  const plot = plotMathFunctionSvg('x^2', -4, 4);
  assert.match(plot.svg, /<polyline /);
  assert.ok(plot.samples.length > 50);

  // Ú237 RPG XP
  const xp1 = awardUserXp('Teszt küldetés', 120);
  assert.ok(xp1.xp >= 120);
  assert.ok(xp1.level >= 2);
  assert.ok(xp1.streakDays >= 1);

  // Ú244 / Ú257 Burn-on-first-read Ephemeral Note
  const note = createEphemeralNote({ title: 'API token', content: 'titok-123', oneTimeRead: true, ttlMinutes: 15 });
  const read1 = consumeEphemeralNote(note.token);
  assert.equal(read1.ok, true);
  assert.equal(read1.content, 'titok-123');
  assert.equal(read1.burnedNow, true);
  const read2 = consumeEphemeralNote(note.token);
  assert.equal(read2.ok, false);

  // Ú254 Life Compass OKR -> Kanban
  const okr = createLifeGoalOkrAndKanban({
    title: 'Otthoni Szerver Korszerűsítés',
    quarter: '2026-Q4',
    milestones: ['NVMe klónozás', 'UPS teszt'],
  });
  assert.equal(okr.milestones.length, 2);
  assert.ok(state.kanban.some((c) => c.title.includes('NVMe klónozás')));

  // Ú259 Global Omnisearch
  const omni = runGlobalOmnisearch('NVMe');
  assert.ok(omni.totalHits >= 1);
  assert.ok(omni.hits.some((h) => h.source === 'kanban'));

  // M245 iCalendar .ics export
  state.calendarEvents.push({
    id: 'cal-1',
    title: 'Rendszerkarbantartás',
    startAt: '2026-11-25T10:00:00.000Z',
    reminderMinutes: 15,
    triggered: false,
    createdAt: '2026-11-22T08:00:00.000Z',
  });
  const ics = buildCalendarIcsFeed();
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Rendszerkarbantartás/);

  // Ú161 / M207 Deep Pi Hardware Telemetry
  const hw = collectPiHardwareDeepStatus();
  assert.ok(hw.hostname.length > 0);
  assert.ok(hw.memAvailableMb >= 0);
  assert.equal(typeof hw.zramPresent, 'boolean');
});
