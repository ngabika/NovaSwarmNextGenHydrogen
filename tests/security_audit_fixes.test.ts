import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import test from 'node:test';
import { createOpenAiProxyRouter } from '../server/gateway/openaiProxy';
import {
  readHostTextFile,
  resolveSafeCommanderPath,
  writeHostTextFile,
} from '../server/infra/batch4PiHardwareAndNet';
import { sendWakeOnLanPacket } from '../server/infra/networkAndCluster';
import {
  consumeEphemeralNote,
  createEphemeralNote,
  evaluateMathExpression,
  generateInteractiveQuizHtml,
} from '../server/power/batch4OmniStudio';
import { scanLanOpenPorts } from '../server/power/batch7UniverseEngine';
import { createApiRouter } from '../server/routes/api';
import { isLoopbackIp, verifySameOriginRequest } from '../server/security/auth';
import {
  validateSafeOutboundUrl,
  validateSafeOutboundUrlAsync,
} from '../server/security/egressAndCrypto';
import {
  appendAuditLog,
  createInitialState,
  decryptSecret,
  encryptSecret,
  getState,
  resetInMemoryStateForTests,
  updateState,
  verifyAuditLogChain,
} from '../server/state/store';
import { isTelegramChatAllowed } from '../server/telegram/bot';

function startTestServer(
  setup: (app: express.Express) => void
): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    setup(app);
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('Audit Fix 1: Secure-by-default settings posture', () => {
  const s = createInitialState().settings;
  assert.equal(s.webAuthEnabled, true);
  assert.equal(s.hostPermissionsGranted, false);
  assert.equal(s.fullAutonomousMode, false);
  assert.equal(s.nightShiftEnabled, false);
  assert.equal(s.autonomousKanbanWorkerEnabled, false);
  assert.equal(s.guardrailsEnabled, true);
  assert.equal(s.guardrailBlockPii, false);
  assert.equal(s.guardrailBlockSecrets, true);
  assert.equal(s.guardrailBlockPromptInjection, true);
  assert.equal(s.channelPairingRequired, true);
  assert.equal(s.supervisorStrictness, 'balanced');
});

test('Audit Fix 2: Vault encryption uses v2 random-salt scrypt AES-256-GCM', () => {
  const secret = 'sk-test-vault-secret-123456';
  const encA = encryptSecret(secret);
  const encB = encryptSecret(secret);
  assert.ok(encA.startsWith('v2:'), 'Encrypted payload must use v2 format');
  assert.equal(encA.split(':').length, 5);
  assert.notEqual(encA, encB, 'Each encryption must use a unique salt & IV');
  assert.equal(decryptSecret(encA), secret);
  assert.equal(decryptSecret(encB), secret);
});

test('Audit Fix 3: CSRF & DNS-rebinding Origin/Host verification + loopback normalization', () => {
  assert.equal(isLoopbackIp('127.0.0.1'), true);
  assert.equal(isLoopbackIp('::1'), true);
  assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackIp('192.168.1.55'), false);

  assert.equal(
    verifySameOriginRequest({ origin: 'http://localhost:3000', host: 'localhost:3000' }),
    true
  );
  assert.equal(
    verifySameOriginRequest({ origin: 'http://127.0.0.1:3000', host: 'localhost:3000' }),
    true
  );
  assert.equal(
    verifySameOriginRequest({ origin: 'http://evil-site.example:8080', host: 'localhost:3000' }),
    false
  );
  assert.equal(
    verifySameOriginRequest({ referer: 'http://attacker.local/csrf.html', host: '192.168.1.10:3000' }),
    false
  );
  assert.equal(
    verifySameOriginRequest({ origin: 'http://127.0.0.1:9999', host: '127.0.0.1:3000' }),
    false
  );
});

test('Audit Fix 4: API CSRF protection, weak password rejection, onboarding lock & fail-closed /v1 and federation', async () => {
  const initial = createInitialState();
  initial.settings.onboardingCompleted = true;
  initial.settings.webAuthEnabled = false;
  resetInMemoryStateForTests(initial);

  const { server, baseUrl } = await startTestServer((app) => {
    app.use('/api', createApiRouter(() => {}));
    app.use('/v1', createOpenAiProxyRouter(() => {}));
  });

  try {
    // 1. Mutating request with forged cross-site Origin must be rejected (403 CSRF)
    const csrfRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ dailyCostLimitUsd: 99 }),
    });
    assert.equal(csrfRes.status, 403);

    // 2. Onboarding completion endpoint must return 403 after onboarding is finished
    const onbRes = await fetch(`${baseUrl}/api/onboarding/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostPermissionsGranted: true }),
    });
    assert.equal(onbRes.status, 403);

    // 3. Password endpoint rejects weak password (<8 chars)
    const weakPwRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '123', enable: true }),
    });
    assert.equal(weakPwRes.status, 400);

    // 4. OpenAI-compatible /v1 proxy is fail-closed when webAuthEnabled=true & zero virtual keys exist
    updateState((s) => {
      s.settings.webAuthEnabled = true;
      s.virtualKeys = [];
    });
    const v1Res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(v1Res.status, 401);

    // 5. Federation inbound is fail-closed without a matching shared secret
    updateState((s) => {
      s.settings.federationEnabled = true;
    });
    const fedRes = await fetch(`${baseUrl}/api/federation/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromNode: 'peer-1',
        fromAgent: 'a',
        targetAgent: 'b',
        content: 'ping',
      }),
    });
    assert.equal(fedRes.status, 403);
    const fedBadTokenRes = await fetch(`${baseUrl}/api/federation/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-secret-token',
      },
      body: JSON.stringify({
        fromNode: 'peer-1',
        fromAgent: 'a',
        targetAgent: 'b',
        content: 'ping',
      }),
    });
    assert.equal(fedBadTokenRes.status, 403);
  } finally {
    server.close();
  }
});

test('Audit Fix 5: Telegram chat allowlist is fail-closed when unset and honors explicit IDs', () => {
  const s = createInitialState();
  s.settings.telegramChatId = '';
  s.settings.telegramAllowedChatIds = [];
  resetInMemoryStateForTests(s);

  assert.equal(isTelegramChatAllowed('123456789'), false);
  assert.equal(isTelegramChatAllowed(undefined), false);

  updateState((st) => {
    st.settings.telegramAllowedChatIds = ['111222', '333444'];
  });
  assert.equal(isTelegramChatAllowed('111222'), true);
  assert.equal(isTelegramChatAllowed(333444), true);
  assert.equal(isTelegramChatAllowed('999999'), false);
});

test('Audit Fix 6: Web File Commander blocks path traversal and protected credential/state files', () => {
  const s = createInitialState();
  s.settings.hostPermissionsGranted = true;
  resetInMemoryStateForTests(s);

  assert.throws(() => resolveSafeCommanderPath('../../etc/passwd'));
  assert.throws(() => readHostTextFile('.secrets.key'));
  assert.throws(() => readHostTextFile('.secrets.vault.json'));
  assert.throws(() => readHostTextFile('.env'));
  assert.throws(() => readHostTextFile('.state.json'));
  assert.throws(() => writeHostTextFile('.secrets.key', 'pwned'));
});

test('Audit Fix 7: Safe recursive-descent math evaluator blocks JS code injection', () => {
  assert.ok(Math.abs(evaluateMathExpression('sin(0) + 2 * (3 + 4)', 1) - 14) < 1e-9);
  assert.ok(Math.abs(evaluateMathExpression('x ** 2 + 1', 3) - 10) < 1e-9);
  assert.throws(() => evaluateMathExpression('process.exit(1)', 1));
  assert.throws(() => evaluateMathExpression('require("fs").readFileSync("/etc/passwd")', 1));
});

test('Audit Fix 8: Ephemeral burn note single-use consumption & HTML XSS escaping', () => {
  resetInMemoryStateForTests(createInitialState());
  const note = createEphemeralNote({
    title: 'Titok',
    content: 'SzupertitkosJelszo',
    oneTimeRead: true,
    ttlMinutes: 10,
  });
  assert.ok(note.token.length >= 24, 'Token must have high entropy');

  const first = consumeEphemeralNote(note.token);
  assert.equal(first.ok, true);
  assert.equal(first.content, 'SzupertitkosJelszo');
  assert.equal(first.burnedNow, true);

  const second = consumeEphemeralNote(note.token);
  assert.equal(second.ok, false);

  const quizHtml = generateInteractiveQuizHtml('<script>alert(1)</script>', [
    { question: '<b>Q</b>', options: ['</script><script>alert(2)</script>'], answerIndex: 0 },
  ]);
  assert.equal(quizHtml.includes('<script>alert(1)</script>'), false);
  assert.equal(quizHtml.includes('</script><script>alert(2)'), false);
});

test('Audit Fix 9: Keyed HMAC audit chain stays valid across retention/head pruning', () => {
  const s = createInitialState();
  s.settings.auditLogMaxEntries = 100;
  resetInMemoryStateForTests(s);

  for (let i = 0; i < 110; i++) {
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'test',
      sourceAgentName: 'Test',
      message: `Bejegyzés ${i}`,
    });
  }
  const state = getState();
  assert.equal(state.auditLogs.length, 100);
  assert.ok(state.auditChainAnchor?.prevHash, 'Anchor must track last pruned hash');

  const check = verifyAuditLogChain();
  assert.equal(check.valid, true);
  assert.equal(check.checkedEntries, 100);
});

test('Audit Fix 10: SSRF DNS/IPv6 guard + LAN-only port scan and WoL validation', async () => {
  assert.equal(validateSafeOutboundUrl('http://169.254.169.254/latest/meta-data').safe, false);
  assert.equal(validateSafeOutboundUrl('http://[::ffff:169.254.169.254]/').safe, false);
  assert.equal(validateSafeOutboundUrl('file:///etc/passwd').safe, false);

  const dnsRebind = await validateSafeOutboundUrlAsync('http://rebind.test/secret', async () => [
    { address: '169.254.169.254' },
  ]);
  assert.equal(dnsRebind.safe, false);

  await assert.rejects(() => scanLanOpenPorts('8.8.8.8', [80]));
  const wolBad = await sendWakeOnLanPacket('AA:BB:CC:DD:EE:FF', '8.8.8.8');
  assert.equal(wolBad.ok, false);
});
