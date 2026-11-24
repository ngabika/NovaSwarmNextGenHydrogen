import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { triggerCustomWebhook, createCustomWebhook } from '../server/automation/workflowsAndProductivity';
import { authenticateVirtualKey, createVirtualKey, isIpAllowedByList } from '../server/gateway/openaiProxy';
import {
  computeSecurityHardeningScore,
  decryptFileAes256,
  encryptFileAes256,
  exploreDatabase,
} from '../server/infra/superAdmin';
import {
  addPersistentMemory,
  ensureDailyObsidianNote,
  getVaultBacklinks,
  restoreSupersededMemory,
  searchObsidianVault,
} from '../server/memory/vectorStore';
import {
  addFlashcard,
  addSharedListItem,
  addSubscription,
  checkPasswordStrengthAndBreach,
  computeSideBySideDiff,
  executeDynamicTool,
  exportFlashcardsCsv,
  getSubscriptionSummary,
  registerDynamicTool,
  removeSharedListItem,
  reviewFlashcardSM2,
  runSwarmAutoDoctor,
  scanCodeSafetyBeforeImport,
  toggleSharedListItem,
} from '../server/power/universalSuite';
import {
  clearResponseCache,
  getResponseCacheSize,
  invokeWithFailover,
  resetKeyCursorsForTests,
} from '../server/providers/router';
import { chunkSourceCode } from '../server/rag/documents';
import { detectStrongJsSandboxBackend } from '../server/sandbox/supervisorSandbox';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

test('M38 & M39: Normalized prompt cache key & providerHealth latency/error tracking', async () => {
  resetKeyCursorsForTests();
  const state = createInitialState();
  state.settings.primaryProvider = 'openai';
  state.settings.responseCacheEnabled = true;
  state.settings.responseCacheTtlSec = 300;
  state.settings.providerKeys.openai = [
    { id: 'oa-1', label: 'OA1', maskedKey: 'sk-...1', enabled: true, failureCount: 0 },
  ];
  resetInMemoryStateForTests(state);

  let calls = 0;
  const deps = {
    resolveSecret: () => 'fake-secret',
    callProvider: async () => {
      calls++;
      return { text: 'Cached normalized reply', inputTokens: 15, outputTokens: 8 };
    },
  };

  const r1 = await invokeWithFailover({ prompt: '  Analyze   Node.js  Logs  ', complexity: 'simple' }, deps);
  assert.equal(Boolean(r1.cached), false);
  assert.equal(getResponseCacheSize(), 1);

  const r2 = await invokeWithFailover({ prompt: 'analyze node.js logs', complexity: 'simple' }, deps);
  assert.equal(Boolean(r2.cached), true);
  assert.equal(calls, 1);

  const health = state.gatewayAnalytics.providerHealth?.openai;
  assert.ok(health);
  assert.ok(health.totalCalls >= 1);
  assert.equal(health.failedCalls, 0);
  clearResponseCache();
});

test('M42: Virtual key expiry & CIDR IP allowlist enforcement', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  assert.equal(isIpAllowedByList('192.168.1.44', ['192.168.1.0/24']), true);
  assert.equal(isIpAllowedByList('10.0.0.5', ['192.168.1.0/24']), false);

  const expired = createVirtualKey({
    name: 'Expired Key',
    expiresAt: '2020-01-01T00:00:00Z',
    allowedIps: ['192.168.1.0/24'],
  });
  const authExpired = authenticateVirtualKey(`Bearer ${expired.rawKey}`, undefined, '192.168.1.20');
  assert.equal(authExpired.ok, false);
  if (!authExpired.ok) assert.equal(authExpired.status, 401);

  const active = createVirtualKey({
    name: 'LAN Restricted Key',
    expiresAt: '2099-01-01T00:00:00Z',
    allowedIps: ['192.168.1.0/24'],
  });
  assert.equal(authenticateVirtualKey(`Bearer ${active.rawKey}`, undefined, '192.168.1.20').ok, true);
  assert.equal(authenticateVirtualKey(`Bearer ${active.rawKey}`, undefined, '8.8.8.8').ok, false);
});

test('M43 & M47: Memory Time Machine restoreSupersededMemory & Obsidian vault search/backlinks/daily', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-vault-'));

  try {
    const oldMem = addPersistentMemory({
      content: 'Server uses nginx on port 8080 for proxy routing.',
      entity: 'Proxy',
      tags: ['nginx'],
      links: ['Infra'],
      vaultBaseDir: tmpVault,
    });
    const newMem = addPersistentMemory({
      content: 'Server instead replaced nginx on port 8080 for proxy routing with caddy.',
      entity: 'Proxy',
      tags: ['caddy'],
      links: ['Infra'],
      vaultBaseDir: tmpVault,
    });

    const staleOld = state.memories.find((m) => m.id === oldMem.id);
    assert.equal(staleOld?.supersededBy, newMem.id);

    const restored = restoreSupersededMemory(oldMem.id);
    assert.equal(restored.supersededBy, undefined);
    assert.equal(restored.tier, 'hot');

    const daily = ensureDailyObsidianNote('2026-11-20', 'Check [[Infra]] architecture.', tmpVault);
    assert.match(daily.path, /daily\/2026-11-20\.md$/);

    const searchHits = searchObsidianVault('caddy nginx', tmpVault);
    assert.ok(searchHits.length >= 1);

    const backlinks = getVaultBacklinks('Infra', tmpVault);
    assert.ok(backlinks.length >= 1);
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

test('M45: Syntax-aware chunkSourceCode splits along function/class boundaries', () => {
  const sample = [
    'export function alphaHelper(x: number) {',
    '  ' + 'const a = x + 1;\n'.repeat(20),
    '  return a;',
    '}',
    '',
    'export class BetaService {',
    '  ' + 'runStep() { return 42; }\n'.repeat(20),
    '}',
  ].join('\n');
  const chunks = chunkSourceCode(sample, 240);
  assert.ok(chunks.length >= 2);
  assert.match(chunks[0], /export function alphaHelper/);
  assert.ok(chunks.some((c) => c.includes('export class BetaService')));
});

test('M48: HMAC-SHA256 webhook signature verification', async () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);
  const secret = 'whsec_test_12345';
  createCustomWebhook({ slug: 'ci-hook', name: 'CI Hook', secret });

  const body = { event: 'deploy', status: 'ok' };
  const sig = `sha256=${crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')}`;

  const badRes = await triggerCustomWebhook('ci-hook', undefined, body, 'sha256=deadbeef');
  assert.equal(badRes.ok, false);
  assert.match(badRes.error || '', /HMAC-SHA256/i);

  // Verify valid HMAC proceeds past auth (will fail only because no provider key is configured in isolated test state)
  const goodAttempt = await triggerCustomWebhook('ci-hook', undefined, body, sig);
  assert.notEqual(goodAttempt.error, 'Érvénytelen HMAC-SHA256 webhook aláírás.');
});

test('M54: computeSecurityHardeningScore evaluates security posture 0-100%', () => {
  const state = createInitialState();
  state.settings.webAuthEnabled = false;
  state.settings.guardrailsEnabled = false;
  resetInMemoryStateForTests(state);
  const weak = computeSecurityHardeningScore();
  assert.ok(weak.score < 100);

  state.settings.webAuthEnabled = true;
  state.settings.webAuthHasPassword = true;
  state.settings.guardrailsEnabled = true;
  state.settings.guardrailBlockSecrets = true;
  state.settings.guardrailBlockPromptInjection = true;
  state.settings.lastBackupAt = new Date().toISOString();
  const stronger = computeSecurityHardeningScore();
  assert.ok(stronger.score > weak.score);
  assert.ok(['A', 'B', 'C', 'D'].includes(stronger.grade));
});

test('Ú33: Native node:sqlite read-only exploreDatabase & write rejection', async () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);
  const relDb = `.tmp-test-${Date.now()}.sqlite`;
  const absDb = path.resolve(process.cwd(), relDb);

  try {
    const sqliteMod = (await import('node:sqlite')) as {
      DatabaseSync: new (p: string) => { exec: (q: string) => void; close: () => void };
    };
    const db = new sqliteMod.DatabaseSync(absDb);
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO items (name) VALUES (\'alpha\'), (\'beta\');');
    db.close();

    const readRes = await exploreDatabase({ engine: 'sqlite', target: relDb, sql: 'SELECT id, name FROM items ORDER BY id' });
    assert.equal(readRes.ok, true);
    assert.equal(readRes.rowCount, 2);
    assert.deepEqual(readRes.columns, ['id', 'name']);

    const writeRes = await exploreDatabase({ engine: 'sqlite', target: relDb, sql: 'DELETE FROM items' });
    assert.equal(writeRes.ok, false);
    assert.match(writeRes.error || '', /írásvédett/i);
  } finally {
    fs.rmSync(absDb, { force: true });
  }
});

test('Ú34: computeSideBySideDiff detects added, removed, and unchanged lines', () => {
  const diff = computeSideBySideDiff('line1\nline2\nline3', 'line1\nline2-mod\nline3\nline4');
  assert.equal(diff.unchangedCount, 2);
  assert.equal(diff.removedCount, 1);
  assert.equal(diff.addedCount, 2);
});

test('Ú41: AES-256-GCM encryptFileAes256 & decryptFileAes256 roundtrip', () => {
  const state = createInitialState();
  state.settings.hostPermissionsGranted = true;
  resetInMemoryStateForTests(state);

  const rel = `.tmp-vault-${Date.now()}.txt`;
  const abs = path.resolve(process.cwd(), rel);
  const encAbs = `${abs}.nsenc`;
  const payload = 'Bizalmas NovaSwarm teszt tartalom 12345!';

  try {
    fs.writeFileSync(abs, payload, 'utf8');
    const enc = encryptFileAes256(rel, 'strong-pass');
    assert.ok(enc.outputPath.endsWith('.nsenc'));
    assert.ok(fs.existsSync(encAbs));

    fs.rmSync(abs, { force: true });
    const dec = decryptFileAes256(`${rel}.nsenc`, 'strong-pass');
    assert.equal(dec.outputPath, rel);
    assert.equal(fs.readFileSync(abs, 'utf8'), payload);
  } finally {
    fs.rmSync(abs, { force: true });
    fs.rmSync(encAbs, { force: true });
  }
});

test('Ú48, Ú51, Ú52: SM-2 flashcards, Shared Lists, and Subscription summary', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  const card = addFlashcard({ front: 'Mi a CORS?', back: 'Cross-Origin Resource Sharing', tags: ['web'] });
  const r1 = reviewFlashcardSM2(card.id, 5);
  assert.equal(r1?.repetitions, 1);
  assert.equal(r1?.intervalDays, 1);
  const r2 = reviewFlashcardSM2(card.id, 5);
  assert.equal(r2?.repetitions, 2);
  assert.equal(r2?.intervalDays, 6);
  const csv = exportFlashcardsCsv();
  assert.match(csv, /Mi a CORS\?/);

  const list = addSharedListItem('Bevásárlólista', 'Kenyér', 'Telegram');
  assert.equal(list.items.length, 1);
  const itemId = list.items[0].id;
  toggleSharedListItem(list.id, itemId);
  assert.equal(state.sharedLists[0].items[0].done, true);
  removeSharedListItem(list.id, itemId);
  assert.equal(state.sharedLists[0].items.length, 0);

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  addSubscription({
    name: 'Hetzner Cloud',
    category: 'Szerver',
    amount: 12,
    currency: 'EUR',
    billingCycle: 'monthly',
    nextDueDate: tomorrow,
    reminderDaysBefore: 5,
  });
  addSubscription({
    name: 'Domain Renewal',
    category: 'Domain',
    amount: 24,
    currency: 'EUR',
    billingCycle: 'yearly',
    nextDueDate: '2099-01-01',
    reminderDaysBefore: 5,
  });
  const sum = getSubscriptionSummary();
  assert.equal(sum.monthlyByCurrency.EUR, 14);
  assert.equal(sum.upcomingRenewals.length, 1);
});

test('Ú53: checkPasswordStrengthAndBreach checks entropy and HIBP k-Anonymity prefix cleanly', async () => {
  const sha1 = crypto.createHash('sha1').update('P@ssword123!Strong').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  let requestedUrl = '';
  const mockFetch: typeof fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(`AAAAAA:1\n${suffix}:42\n`, { status: 200 });
  };

  const res = await checkPasswordStrengthAndBreach('P@ssword123!Strong', mockFetch);
  assert.equal(requestedUrl, `https://api.pwnedpasswords.com/range/${prefix}`);
  assert.equal(res.hibpChecked, true);
  assert.equal(res.breached, true);
  assert.equal(res.breachCount, 42);
  assert.ok(res.entropyBits > 60);
});

test('Ú60 & B2 & B3: GitHub Skill security scanner, Dynamic Sandbox Tool, and Swarm Auto-Doctor', async () => {
  const unsafe = scanCodeSafetyBeforeImport('const x = eval("1+1");');
  assert.equal(unsafe.safe, false);
  assert.ok(unsafe.findings.length >= 1);

  const unsafeRm = scanCodeSafetyBeforeImport('rm -rf /tmp/something; rm -rf /');
  assert.equal(unsafeRm.safe, false);

  const safe = scanCodeSafetyBeforeImport('export function add(a, b) { return a + b; }');
  assert.equal(safe.safe, true);

  const state = createInitialState();
  state.settings.providerKeys.openai = [
    {
      id: 'k1',
      label: 'Cooled Key',
      maskedKey: 'sk-...9',
      enabled: true,
      failureCount: 2,
      cooldownUntil: new Date(Date.now() + 60_000).toISOString(),
    },
  ];
  resetInMemoryStateForTests(state);

  const doc = await runSwarmAutoDoctor();
  assert.ok(doc.healedActions.some((a) => a.includes('cooldown')));
  assert.equal(state.settings.providerKeys.openai[0].cooldownUntil, undefined);
});

test('B2: Dynamic sandbox_js tool executes in Docker/bwrap or refuses cleanly when absent', async (t) => {
  resetInMemoryStateForTests(createInitialState());
  const dyn = registerDynamicTool({
    name: 'sum_args',
    description: 'Összeadja az a és b paramétert',
    kind: 'sandbox_js',
    targetOrCode: 'console.log(Number(ARGS.a) + Number(ARGS.b));',
  });
  if (!detectStrongJsSandboxBackend()) {
    const refused = await executeDynamicTool(dyn, { a: 17, b: 25 });
    assert.equal(refused.ok, false);
    assert.match(refused.output, /Docker vagy Bubblewrap/);
    t.skip('SKIPPED: Docker vagy bwrap nincs telepítve — a valós sandbox_js konténerfuttatás átugorva.');
    return;
  }
  const dynOut = await executeDynamicTool(dyn, { a: 17, b: 25 });
  assert.equal(dynOut.ok, true);
  assert.match(dynOut.output, /42/);
});
