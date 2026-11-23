import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addPersistentMemory, mmrFilterMemories, searchMemories, stripAccents } from '../server/memory/vectorStore';
import { estimateMigrationDryRun } from '../server/infra/sshHostMigrator';
import {
  addFixedExpense,
  addFuelLog,
  analyzeShadowPatterns,
  buildProjectScaffold,
  compareTextDocuments,
  computeMonthlyFixedSummary,
  createCountdownTimer,
  explainRegexAndCron,
  generateQrSvg,
  parseHungarianNaturalAutomation,
  processDueCountdownTimers,
  setOperatingMode,
  toggleFixedExpensePaid,
} from '../server/power/batch7UniverseEngine';
import { buildCompactLocalSystemPrompt, parseSelfHealingJson, withOllamaMutex } from '../server/providers/router';
import { closeWalDatabaseForTests, runSqliteMaintenance } from '../server/state/sqliteWal';
import {
  appendAuditLog,
  appendUnifiedMessage,
  clearOrResetAppData,
  createInitialState,
  getState,
  resetInMemoryStateForTests,
  rotateStateBackupGenerations,
} from '../server/state/store';
import { collectExtendedMemoryDiagnostics } from '../server/system/hardwareOptimizer';
import { escapeTelegramHtml } from '../server/telegram/bot';

test('stripAccents and Hungarian diacritic-insensitive searchMemories with mmrFilterMemories diversity', () => {
  assert.equal(stripAccents('Árvíztűrő tükörfúrógép'), 'Arvizturo tukorfurogep');

  resetInMemoryStateForTests(createInitialState());
  const vaultTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-b7-vault-'));
  try {
    addPersistentMemory({
      entity: 'Kávégép',
      content: 'Az őrlő beállítása 3-as fokozaton optimális eszpresszóhoz.',
      tags: ['otthon'],
      vaultBaseDir: vaultTmp,
    });
    addPersistentMemory({
      entity: 'Hálózat',
      content: 'Router admin felület helyi címe 192.168.1.1',
      tags: ['lan'],
      vaultBaseDir: vaultTmp,
    });

    const hits = searchMemories('orlo eszpresszo', 5);
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].entity, 'Kávégép');

    const mmr = mmrFilterMemories(hits, 2);
    assert.ok(mmr.length >= 1);
  } finally {
    fs.rmSync(vaultTmp, { recursive: true, force: true });
  }
});

test('parseSelfHealingJson, buildCompactLocalSystemPrompt, and withOllamaMutex serialize work cleanly', async () => {
  const dirty = 'Íme az eredmény:\n```json\n{"status": "ok", "items": [1, 2,],}\n```\nKöszönöm!';
  const parsed = parseSelfHealingJson<{ status: string; items: number[] }>(dirty);
  assert.equal(parsed.status, 'ok');
  assert.deepEqual(parsed.items, [1, 2]);

  const longPrompt = 'Utasítás   részlet   '.repeat(60);
  const compacted = buildCompactLocalSystemPrompt(longPrompt, true);
  assert.ok(compacted && compacted.length <= 645);
  assert.ok(compacted?.includes('[kompakt mód]'));

  const order: number[] = [];
  await Promise.all([
    withOllamaMutex(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    }),
    withOllamaMutex(async () => {
      order.push(2);
    }),
  ]);
  assert.deepEqual(order, [1, 2]);
});

test('rotateStateBackupGenerations creates .bak1-.bak3 and clearOrResetAppData keeps settings cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-b7-bak-'));
  try {
    const fakeStatePath = path.join(tmpDir, 'state.json');
    fs.writeFileSync(fakeStatePath, '{"gen":1}', 'utf8');
    rotateStateBackupGenerations(fakeStatePath);
    assert.equal(fs.readFileSync(`${fakeStatePath}.bak1`, 'utf8'), '{"gen":1}');

    fs.writeFileSync(fakeStatePath, '{"gen":2}', 'utf8');
    rotateStateBackupGenerations(fakeStatePath);
    assert.equal(fs.readFileSync(`${fakeStatePath}.bak2`, 'utf8'), '{"gen":1}');
    assert.equal(fs.readFileSync(`${fakeStatePath}.bak1`, 'utf8'), '{"gen":2}');

    fs.writeFileSync(fakeStatePath, '{"gen":3}', 'utf8');
    rotateStateBackupGenerations(fakeStatePath);
    assert.equal(fs.readFileSync(`${fakeStatePath}.bak3`, 'utf8'), '{"gen":1}');

    const st = createInitialState();
    st.settings.instanceName = 'custom-pi-node';
    st.kanban.push({
      id: 'k-tmp',
      title: 'Törlendő teszt kártya',
      description: '',
      status: 'todo',
      priority: 'low',
      assignedAgentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subtasks: [],
      blockedBy: [],
    });
    resetInMemoryStateForTests(st);

    const reset = clearOrResetAppData({ keepSecretsAndSettings: true });
    assert.equal(reset.settings.instanceName, 'custom-pi-node');
    assert.equal(reset.kanban.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseHungarianNaturalAutomation parses rules and reminders, and countdown timers fire deterministically', () => {
  resetInMemoryStateForTests(createInitialState());

  const ruleRes = parseHungarianNaturalAutomation('ha a ram 85% felett akkor tisztítás');
  assert.equal(ruleRes.kind, 'rule');
  assert.equal(ruleRes.rule?.triggerKind, 'ram_above');
  assert.equal(ruleRes.rule?.thresholdValue, 85);
  assert.equal(ruleRes.rule?.actionKind, 'ram_cleanup');

  const remRes = parseHungarianNaturalAutomation('15 perc múlva öntözés');
  assert.equal(remRes.kind, 'reminder');
  assert.ok(remRes.reminder?.message.includes('öntözés'));

  const timer = createCountdownTimer('2mp teszt stopper');
  assert.equal(timer.durationSec, 2);
  assert.equal(timer.completed, false);

  const due = processDueCountdownTimers(Date.now() + 5000);
  assert.equal(due.completedCount, 1);
  assert.equal(due.completedTimers[0].id, timer.id);
});

test('generateQrSvg produces valid Wi-Fi QR SVG and setOperatingMode updates heartbeat profile', () => {
  resetInMemoryStateForTests(createInitialState());
  const qr = generateQrSvg('', { wifiSsid: 'OtthonLAN', wifiPassword: 'secret' });
  assert.ok(qr.svg.startsWith('<svg '));
  assert.ok(qr.payload.startsWith('WIFI:T:WPA;S:OtthonLAN;P:secret;;'));
  assert.ok(qr.modules >= 21);

  const modeRes = setOperatingMode('focus');
  assert.equal(modeRes.mode, 'focus');
  assert.equal(getState().settings.heartbeatIntervalMinutes, 45);
  assert.equal(getState().settings.operatingMode, 'focus');
});

test('Fuel log, Fixed expenses summary, Diff, Regex/Cron, and Scaffold helpers calculate accurately', () => {
  resetInMemoryStateForTests(createInitialState());

  const fuel = addFuelLog({ distanceKm: 500, liters: 32.5, totalCost: 20000 });
  assert.equal(fuel.consumptionPer100Km, 6.5);
  assert.equal(fuel.costPerKm, 40);

  const exp1 = addFixedExpense({ name: 'Internet', amount: 8000 });
  addFixedExpense({ name: 'Áram', amount: 12000 });
  toggleFixedExpensePaid(exp1.id);
  const sum = computeMonthlyFixedSummary();
  assert.equal(sum.totalAmount, 20000);
  assert.equal(sum.paidAmount, 8000);
  assert.equal(sum.remainingAmount, 12000);

  const diff = compareTextDocuments('a=1\nb=2', 'a=1\nb=3');
  assert.equal(diff.unchanged, 1);
  assert.ok(diff.added >= 1 && diff.removed >= 1);

  const cron = explainRegexAndCron('cron', '*/15 8 * * 1-5');
  assert.equal(cron.valid, true);
  assert.ok(cron.explanation.includes('15'));

  const scaf = buildProjectScaffold('node-ts', 'My Sensor App');
  assert.equal(scaf.files.length, 2);
  assert.ok(scaf.files.some((f) => f.path === 'package.json'));
});

test('Shadow Pattern Miner, SQLite quick_check, Extended Memory Diagnostics, Migration Dry-Run & Telegram HTML escape', () => {
  resetInMemoryStateForTests(createInitialState());
  appendAuditLog({ type: 'system', sourceAgentId: 'a', sourceAgentName: 'A', message: 'ram tisztítás futott' });
  appendAuditLog({ type: 'system', sourceAgentId: 'a', sourceAgentName: 'A', message: 'ram tisztítás futott' });
  appendUnifiedMessage({
    threadId: 'thread-main',
    senderType: 'user',
    senderId: 'user-owner',
    senderName: 'Operátor',
    channel: 'web',
    content: 'futtasd a rendszer kórkép jelentést most',
  });

  const patterns = analyzeShadowPatterns();
  assert.ok(patterns.suggestions.some((s) => s.pattern.includes('ram tisztítás') && s.count >= 2));

  const tmpDb = path.join(os.tmpdir(), `ns-b7-sqlite-${Date.now()}.sqlite`);
  try {
    const maint = runSqliteMaintenance(tmpDb);
    assert.equal(maint.ok, true);
    assert.equal(maint.quickCheck, 'ok');
  } finally {
    closeWalDatabaseForTests();
    fs.rmSync(tmpDb, { force: true });
    fs.rmSync(`${tmpDb}-wal`, { force: true });
    fs.rmSync(`${tmpDb}-shm`, { force: true });
  }

  const memDiag = collectExtendedMemoryDiagnostics();
  assert.ok(memDiag.nodeRssMb > 0);
  assert.ok(memDiag.hostRamTotalMb > 0);

  const dry = estimateMigrationDryRun();
  assert.ok(dry.fileCount > 0);
  assert.ok(dry.totalMb >= 0);

  assert.equal(escapeTelegramHtml('<script>&"test"</script>'), '&lt;script&gt;&amp;"test"&lt;/script&gt;');
});

test('Zero banned brand terms exist anywhere in Batch 7 files', () => {
  const files = [
    'server/power/batch7UniverseEngine.ts',
    'server/routes/universalV7Router.ts',
    'src/components/Batch7UniverseLabPanel.tsx',
  ];
  const banned = new RegExp(['marv' + 'een', 'open' + 'claw', 'lite' + 'llm', 'bin' + 'ance'].join('|'), 'i');
  for (const rel of files) {
    const content = fs.readFileSync(rel, 'utf8');
    assert.equal(banned.test(content), false, `Banned term found in ${rel}`);
  }
});
