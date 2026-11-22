import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  createAutonomyRule,
  createQuickMacro,
  createSmartReminder,
  dispatchSwarmMeshTask,
  doesRuleTriggerMatch,
  evaluateAutonomyRules,
  executeQuickMacro,
  parseReminderDelayMs,
  processDueSmartReminders,
  runForensicSystemSnapshot,
  runLanSentinelAndSpeedtest,
  selectBestMeshNode,
  trustLanMacAddress,
} from '../server/power/batch6ApexEngine';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

test('parseReminderDelayMs parses relative Hungarian/English expressions and HH:MM clock times', () => {
  const fixedNow = Date.parse('2026-11-22T10:00:00.000Z');
  const fifteenMin = parseReminderDelayMs('15m', fixedNow);
  assert.equal(fifteenMin.delayMs, 15 * 60_000);

  const twoHours = parseReminderDelayMs('2óra', fixedNow);
  assert.equal(twoHours.delayMs, 2 * 3_600_000);

  const thirtySec = parseReminderDelayMs('30mp', fixedNow);
  assert.equal(thirtySec.delayMs, 30_000);

  assert.throws(() => parseReminderDelayMs('invalid-time', fixedNow), /Érvénytelen/);
});

test('SmartReminder creates and fires due reminders cleanly without duplicates', async () => {
  resetInMemoryStateForTests(createInitialState());
  const base = Date.now();
  const rem = createSmartReminder({
    timeExpr: '5s',
    message: 'Ellenőrizd a szervert',
    channel: 'web',
    nowMs: base,
  });
  assert.equal(rem.fired, false);

  const beforeDue = await processDueSmartReminders(base + 1000);
  assert.equal(beforeDue.firedCount, 0);

  const afterDue = await processDueSmartReminders(base + 6000);
  assert.equal(afterDue.firedCount, 1);
  assert.deepEqual(afterDue.firedIds, [rem.id]);

  // Idempotent on second run
  const secondRun = await processDueSmartReminders(base + 9000);
  assert.equal(secondRun.firedCount, 0);
});

test('AutonomyRule engine matches thresholds and strictly enforces cooldown windows', async () => {
  resetInMemoryStateForTests(createInitialState());
  const rule = createAutonomyRule({
    name: 'Magas CPU riasztás',
    triggerKind: 'cpu_above',
    thresholdValue: 80,
    actionKind: 'ram_cleanup',
    actionTarget: 'auto',
    cooldownMinutes: 15,
  });

  assert.equal(
    doesRuleTriggerMatch(rule, {
      ramPercent: 40,
      cpuPercent: 92,
      tempCelsius: 55,
      diskPercent: 30,
      downUptimeCount: 0,
      unknownLanMacCount: 0,
    }),
    true
  );

  const eval1 = await evaluateAutonomyRules({ cpuPercent: 95, ramPercent: 20 });
  assert.ok(eval1.triggered.some((t) => t.ruleId === rule.id));

  // Immediate re-evaluation must respect 15-minute cooldown
  const eval2 = await evaluateAutonomyRules({ cpuPercent: 95, ramPercent: 20 });
  assert.equal(eval2.triggered.some((t) => t.ruleId === rule.id), false);
});

test('Swarm Mesh selector prioritizes online GPU node with lowest latency and falls back cleanly', async () => {
  const best = selectBestMeshNode([
    {
      id: 'n1',
      name: 'Pi Worker',
      role: 'pi',
      url: 'http://192.168.1.50:3000',
      ollamaUrl: 'http://192.168.1.50:11434',
      status: 'online',
      latencyMs: 8,
      gpuVramMb: 0,
    },
    {
      id: 'n2',
      name: 'RTX Workstation',
      role: 'gpu_ollama',
      url: 'http://192.168.1.60:3000',
      ollamaUrl: 'http://192.168.1.60:11434',
      status: 'online',
      latencyMs: 14,
      gpuVramMb: 12288,
    },
  ]);
  assert.equal(best?.id, 'n2');

  resetInMemoryStateForTests(createInitialState());
  const st = await import('../server/state/store');
  st.updateState((s) => {
    s.clusterNodes.push(best!);
  });

  const mockFetch = (async () =>
    new Response(JSON.stringify({ response: 'Mesh GPU Válasz OK' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

  const rec = await dispatchSwarmMeshTask({ prompt: 'Teszteld a GPU-t', preferredRole: 'gpu_ollama' }, mockFetch);
  assert.equal(rec.status, 'ok');
  assert.equal(rec.nodeName, 'RTX Workstation');
  assert.ok(rec.responsePreview.includes('Mesh GPU Válasz OK'));
});

test('LAN Sentinel, Trust MAC, Forensic Snapshot, and 1-Tap QuickMacro run cleanly end-to-end', async () => {
  resetInMemoryStateForTests(createInitialState());

  const trust = trustLanMacAddress('AA:BB:CC:11:22:33', 'Saját Laptop');
  assert.equal(trust.ok, true);
  assert.equal(trust.mac, 'aa:bb:cc:11:22:33');

  const mockSpeedFetch = (async () =>
    new Response(new Uint8Array(64_000), { status: 200 })) as unknown as typeof fetch;
  const net = await runLanSentinelAndSpeedtest({ runSpeedtest: true, notifyUnknown: false }, mockSpeedFetch);
  assert.ok(net.record.checkedAt.length > 10);
  assert.ok(net.record.downloadMbps !== null && net.record.downloadMbps > 0);

  const forensic = runForensicSystemSnapshot();
  assert.ok(forensic.diagnosisSummary.includes('RAM'));
  assert.ok(forensic.recommendations.length >= 1);

  const macro = createQuickMacro({
    slug: 'teszt_korkep',
    name: 'Teszt Kórkép Makró',
    description: 'Unit teszt makró',
    steps: ['ram_watchdog', 'sd_flush', 'forensic_snapshot'],
  });
  const ran = await executeQuickMacro(macro.slug);
  assert.equal(ran.stepOutputs.length, 3);
  assert.equal(ran.macro.runCount, 1);
});

test('Zero banned brand terms exist in Batch 6 modules', () => {
  const files = [
    'server/power/batch6ApexEngine.ts',
    'server/routes/universalV6Router.ts',
    'src/components/Batch6ApexLabPanel.tsx',
  ];
  const banned = /\b(marveen|openclaw|litellm|binance)\b/i;
  for (const rel of files) {
    const content = fs.readFileSync(rel, 'utf8');
    assert.equal(banned.test(content), false, `Banned term found in ${rel}`);
  }
});
