import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  generateWeeklyTimeCapsule,
  rewindThreadToMessage,
  runNightShiftCycle,
} from '../server/agents/engine';
import {
  createPhoenixSnapshot,
  generateWireGuardClientBundle,
} from '../server/infra/networkAndCluster';
import {
  auditDockerfileContent,
  buildOpenApiSpec,
  evaluateRegexAndCron,
  generateSqlErMermaid,
} from '../server/power/devOpsStudio';
import {
  addMealAndSyncShoppingList,
  checkWcagContrast,
  computeVatAndCompound,
  generateChartSvg,
  generateQrSvg,
  transformTextUtility,
  wrangleStructuredData,
} from '../server/power/lifeAndFinanceStudio';
import {
  computeTotpCode,
  generateTotpSecret,
  notarizeDocumentHash,
  validateSafeOutboundUrl,
  verifyNotarizedHash,
  verifyTotpCode,
} from '../server/security/egressAndCrypto';
import { shouldRequireApproval } from '../server/security/permissionGate';
import {
  closeSqliteWal,
  getSqliteWalStatus,
  queryWalAuditLogs,
  syncAuditEntryToWal,
} from '../server/state/sqliteWal';
import {
  appendAuditLog,
  appendUnifiedMessage,
  createDefaultSettings,
  createInitialState,
  resetInMemoryStateForTests,
  verifyAuditLogChain,
} from '../server/state/store';

test('Batch 3 Security & Autonomy Defaults: Zero security enabled + 100% autonomous mode by default', () => {
  const defaults = createDefaultSettings();
  assert.equal(defaults.webAuthEnabled, false);
  assert.equal(defaults.hostPermissionsGranted, true);
  assert.equal(defaults.guardrailsEnabled, false);
  assert.equal(defaults.guardrailBlockSecrets, false);
  assert.equal(defaults.guardrailBlockPromptInjection, false);
  assert.equal(defaults.guardrailBlockPii, false);
  assert.equal(defaults.channelPairingRequired, false);
  assert.equal(defaults.supervisorStrictness, 'permissive');
  assert.equal(defaults.fullAutonomousMode, true);
  assert.equal(defaults.totpEnabled, false);

  const state = createInitialState();
  resetInMemoryStateForTests(state);
  assert.equal(shouldRequireApproval(state), false);

  // When user explicitly disables fullAutonomousMode, approval gate engages
  state.settings.fullAutonomousMode = false;
  assert.equal(shouldRequireApproval(state), true);
});

test('M61: SQLite WAL audit synchronization, querying & status reporting', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-wal-test-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  try {
    syncAuditEntryToWal(
      {
        id: 'audit-wal-1',
        timestamp: new Date().toISOString(),
        type: 'system',
        sourceAgentId: 'tester',
        sourceAgentName: 'Tester',
        message: 'SQLite WAL teszt bejegyzés',
        hash: 'abc123',
        prevHash: 'GENESIS',
      },
      dbPath
    );
    const status = getSqliteWalStatus(dbPath);
    assert.equal(status.available, true);
    assert.equal(status.journalMode.toLowerCase(), 'wal');
    assert.ok(status.auditRows >= 1);

    const rows = queryWalAuditLogs(10, 'system', dbPath);
    assert.ok(rows.some((r) => r.id === 'audit-wal-1'));
  } finally {
    closeSqliteWal();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('M117: Audit log SHA-256 hash chain detects tampering', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  const first = appendAuditLog({
    type: 'system',
    sourceAgentId: 'a1',
    sourceAgentName: 'A1',
    message: 'Első hitelesített bejegyzés',
    verifiedExecution: true,
  });
  appendAuditLog({
    type: 'action',
    sourceAgentId: 'a1',
    sourceAgentName: 'A1',
    message: 'Második hitelesített bejegyzés',
    verifiedExecution: true,
  });

  const validBefore = verifyAuditLogChain();
  assert.equal(validBefore.valid, true);
  assert.ok(validBefore.checkedEntries >= 2);

  // Tamper with message on first entry
  const ref = state.auditLogs.find((l) => l.id === first.id);
  assert.ok(ref);
  ref.message = 'HAMISÍTOTT ÜZENET';

  const afterTamper = verifyAuditLogChain();
  assert.equal(afterTamper.valid, false);
  assert.ok(afterTamper.brokenIds.includes(first.id));
});

test('M114 & M111: SSRF metadata blocker permits LAN, TOTP RFC 6238 verify succeeds', () => {
  const blockedMetadata = validateSafeOutboundUrl('http://169.254.169.254/latest/meta-data/');
  assert.equal(blockedMetadata.ok, false);
  assert.equal(blockedMetadata.safe, false);

  const blockedGoogleMeta = validateSafeOutboundUrl('http://metadata.google.internal/computeMetadata/v1/');
  assert.equal(blockedGoogleMeta.safe, false);

  const allowedLan = validateSafeOutboundUrl('http://192.168.1.50:11434/api/tags');
  assert.equal(allowedLan.ok, true);
  assert.equal(allowedLan.safe, true);

  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16);
  const now = Date.now();
  const code = computeTotpCode(secret, now);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code, now), true);
  assert.equal(verifyTotpCode(secret, '000000', now) && code !== '000000', false);
});

test('Ú64, Ú61 & Ú157: Thread Time-Travel Rewind, Night Shift Autonomous Cycle & Weekly Time Capsule', async () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);
  const threadId = state.threads[0].id;

  const m1 = appendUnifiedMessage({
    threadId,
    senderType: 'user',
    senderId: 'user',
    senderName: 'Felhasználó',
    channel: 'web',
    content: 'Első üzenet',
  });
  appendUnifiedMessage({
    threadId,
    senderType: 'agent',
    senderId: 'ag-1',
    senderName: 'Ágens',
    channel: 'web',
    content: 'Második üzenet',
  });
  appendUnifiedMessage({
    threadId,
    senderType: 'user',
    senderId: 'user',
    senderName: 'Felhasználó',
    channel: 'web',
    content: 'Harmadik üzenet',
  });

  const rew = rewindThreadToMessage(threadId, m1.id);
  assert.equal(rew.ok, true);
  assert.equal(rew.removedCount, 2);
  assert.equal(rew.remainingCount, 1);

  const nightRun = await runNightShiftCycle();
  assert.ok(nightRun.id.startsWith('night-'));
  assert.ok(nightRun.reportSummary.includes('Éjszakai Műszak'));
  assert.equal(state.nightShiftRuns.length >= 1, true);

  const capsule = generateWeeklyTimeCapsule();
  assert.ok(capsule.id.startsWith('cap-'));
  assert.match(capsule.summaryMarkdown, /Heti Időkapszula/);
});

test('Ú76, Ú77, Ú80 & M144: DevOps Studio Regex/Cron, SQL ER Mermaid, Dockerfile Audit & OpenAPI 3.1', () => {
  const rxOut = evaluateRegexAndCron({
    pattern: '\\b(\\d{2,4})ms\\b',
    flags: 'g',
    sampleText: 'Latencia: 42ms és 120ms',
    naturalCronText: 'minden 15 percben',
  });
  assert.equal(rxOut.regex?.valid, true);
  assert.equal(rxOut.regex?.matchCount, 2);
  assert.equal(rxOut.cron?.expression, '*/15 * * * *');
  assert.equal(rxOut.cron?.valid, true);

  const er = generateSqlErMermaid(
    'CREATE TABLE users (id INT PRIMARY KEY, name TEXT); CREATE TABLE tasks (id INT PRIMARY KEY, user_id INT REFERENCES users(id));'
  );
  assert.equal(er.tables, 2);
  assert.match(er.mermaid, /erDiagram/);
  assert.match(er.mermaid, /users \|\|--o\{ tasks/);

  const dfBad = auditDockerfileContent('FROM node:latest\nENV API_KEY=secret123\nRUN apt-get install -y curl');
  assert.ok(dfBad.score < 80);
  assert.ok(dfBad.findings.length >= 3);

  const spec = buildOpenApiSpec();
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths['/v3/nightshift/run']);
});

test('Ú83, Ú88, Ú90, Ú114, Ú121, Ú131, Ú136, Ú141, Ú150 & Ú160: Data Wrangler, QR/Chart SVG, Text Transform, WCAG, Finance, Notary, Meal Sync, WireGuard & Phoenix', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  // Ú83
  const csv = wrangleStructuredData({
    raw: 'name,role,score\nAnna,dev,90\nBela,ops,80\nCili,dev,100',
    format: 'csv',
    groupBy: 'role',
  });
  assert.equal(csv.ok, true);
  assert.equal(csv.rowCount, 3);
  assert.equal(csv.groupedCounts?.dev, 2);
  assert.equal(csv.numericStats?.score?.avg, 90);

  // Ú131 & Ú88
  const chartSvg = generateChartSvg({
    type: 'bar',
    title: 'Terhelés',
    labels: ['CPU', 'RAM'],
    values: [35, 62],
  });
  assert.match(chartSvg, /^<svg /);
  const qr = generateQrSvg('https://novaswarm.local', 180);
  assert.match(qr, /<svg /);
  assert.match(qr, /<rect /);

  // Ú90
  const pretty = transformTextUtility({
    mode: 'json_pretty',
    input: '{"a":1,"b":2}',
    saveToClipboard: true,
  });
  assert.equal(pretty.ok, true);
  assert.match(pretty.output, /\n {2}"a": 1/);
  assert.equal(state.clipboardHistory.length, 1);

  // Ú136
  const wcag = checkWcagContrast('#0f172a', '#ffffff');
  assert.equal(wcag.aaNormal, true);
  assert.equal(wcag.aaaNormal, true);
  assert.ok(wcag.ratio > 15);

  // Ú141
  const fin = computeVatAndCompound({
    netAmount: 100000,
    vatRatePercent: 27,
    principal: 100000,
    annualYieldPercent: 12,
    months: 12,
    monthlyContribution: 0,
  });
  assert.equal(fin.vat.gross, 127000);
  assert.ok(fin.compound.futureValue > 112000);

  // Ú150
  const notarized = notarizeDocumentHash({
    fileName: 'szerzodes.txt',
    textContent: 'Hiteles NovaSwarm dokumentum',
    note: 'Teszt közjegyző',
  });
  const verified = verifyNotarizedHash('Hiteles NovaSwarm dokumentum', false);
  assert.equal(verified.sha256, notarized.sha256);
  assert.equal(verified.matchedRecord?.id, notarized.id);

  // Ú114 Meal -> Bevásárlólista sync
  const mealRes = addMealAndSyncShoppingList({
    day: 'Hétfő',
    mealName: 'Paprikás krumpli',
    ingredients: ['burgonya', 'kolbász', 'fűszerpaprika'],
  });
  assert.equal(mealRes.addedItems, 3);
  const shoppingList = state.sharedLists.find((l) => l.name === 'Bevásárlólista');
  assert.ok(shoppingList && shoppingList.items.length >= 3);

  // Ú121 WireGuard X25519
  const wg = generateWireGuardClientBundle({ clientName: 'TesztMobil', endpointHost: '192.168.1.10:51820' });
  assert.ok(wg.publicKeyBase64.length >= 40);
  assert.match(wg.configText, /\[Interface\]/);
  assert.match(wg.qrSvg, /<svg /);

  // Ú160 Phoenix snapshot (and clean up generated backup file)
  const snap = createPhoenixSnapshot();
  assert.ok(snap.fileName.startsWith('novaswarm-phoenix-'));
  assert.ok(snap.sizeBytes > 100);
  fs.rmSync(path.join(process.cwd(), 'backups', snap.fileName), { force: true });
});
