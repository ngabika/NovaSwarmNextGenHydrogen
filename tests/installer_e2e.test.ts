import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInstallConfigure } from '../scripts/install-configure';
import { createApiRouter } from '../server/routes/api';
import { resetAuthSecurityStateForTests } from '../server/security/auth';
import { resetRateLimitersForTests } from '../server/security/rateLimit';
import {
  clearWebAuthPassword,
  getState,
  resetInMemoryStateForTests,
  updateState,
} from '../server/state/store';

function createTempEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-inst-e2e-'));
  const prev = {
    NOVASWARM_DATA_DIR: process.env.NOVASWARM_DATA_DIR,
    NOVASWARM_AUDIT_JSONL_PATH: process.env.NOVASWARM_AUDIT_JSONL_PATH,
    NOVASWARM_LOGIN_LOCKS_PATH: process.env.NOVASWARM_LOGIN_LOCKS_PATH,
    NOVASWARM_SETUP_LOG_PATH: process.env.NOVASWARM_SETUP_LOG_PATH,
  };
  process.env.NOVASWARM_DATA_DIR = tmpDir;
  process.env.NOVASWARM_AUDIT_JSONL_PATH = path.join(tmpDir, 'audit-chain.jsonl');
  process.env.NOVASWARM_LOGIN_LOCKS_PATH = path.join(tmpDir, '.login-locks.json');
  process.env.NOVASWARM_SETUP_LOG_PATH = path.join(tmpDir, '.novaswarm-setup.log');
  resetInMemoryStateForTests();
  resetAuthSecurityStateForTests();
  resetRateLimitersForTests();
  return {
    tmpDir,
    restore() {
      resetInMemoryStateForTests();
      resetAuthSecurityStateForTests();
      resetRateLimitersForTests();
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function startTestServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
  app.use('/api', createApiRouter(() => {}));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('0 & 6: passwordless LAN installer mode allows access without login and marks audit logs cleanly', async () => {
  const env = createTempEnv();
  const srv = await startTestServer();
  try {
    const res = await runInstallConfigure({
      noPassword: true,
      skipOllamaPull: true,
      skipOllamaBenchmark: true,
      skipPhoenixBackup: true,
    });
    assert.equal(res.mode, 'passwordless');
    assert.equal(res.webAuthEnabled, false);
    assert.equal(res.webAuthHasPassword, false);
    assert.equal(res.onboardingCompleted, true);

    const statusRes = await fetch(`${srv.baseUrl}/api/auth/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as Record<string, unknown>;
    assert.equal(statusJson.webAuthEnabled, false);
    assert.equal(statusJson.setupCodeRequired, false);
    assert.equal(statusJson.missingPasswordState, false);

    // No cookie needed in passwordless LAN mode
    const stateRes = await fetch(`${srv.baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);

    const installerAudit = getState().auditLogs.find((a) => a.sourceAgentId === 'installer');
    assert.ok(installerAudit, 'Installer audit log expected');
    assert.equal(installerAudit.passwordlessMode, true);
    assert.match(installerAudit.message, /\[JELSZÓ NÉLKÜLI LAN MÓD\]/);

    // Upgrading later from passwordless mode via POST /api/auth/password works WITHOUT setupCode
    const setPwRes = await fetch(`${srv.baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'UjLanJelszo!2026#Safe' }),
    });
    assert.equal(setPwRes.status, 200);
    const setPwJson = (await setPwRes.json()) as { webAuthEnabled: boolean; webAuthHasPassword: boolean };
    assert.equal(setPwJson.webAuthEnabled, true);
    assert.equal(setPwJson.webAuthHasPassword, true);

    // Immediately enforces auth on /api/state
    const blockedRes = await fetch(`${srv.baseUrl}/api/state`);
    assert.equal(blockedRes.status, 401);
  } finally {
    await srv.close();
    env.restore();
  }
});

test('1 & 6: special-character operator password survives install -> login -> cookie /api/state E2E', async () => {
  const env = createTempEnv();
  const srv = await startTestServer();
  const trickyPassword = '  P@ss$w0rd`"\'\\ űáéőú-2026!  ';
  try {
    const res = await runInstallConfigure({
      password: trickyPassword,
      skipOllamaPull: true,
      skipOllamaBenchmark: true,
      skipPhoenixBackup: true,
    });
    assert.equal(res.mode, 'password');
    assert.equal(res.webAuthEnabled, true);
    assert.equal(res.webAuthHasPassword, true);

    const healthRes = await fetch(`${srv.baseUrl}/healthz`);
    assert.equal(healthRes.status, 200);

    // Wrong password returns 401
    const badRes = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password-12345' }),
    });
    assert.equal(badRes.status, 401);

    // Unauthenticated /api/state returns 401
    const unauthState = await fetch(`${srv.baseUrl}/api/state`);
    assert.equal(unauthState.status, 401);

    // Correct trimmed special-character password returns 200 and session cookie
    const loginRes = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: trickyPassword.trim() }),
    });
    assert.equal(loginRes.status, 200);
    const rawCookie = loginRes.headers.get('set-cookie') || '';
    const sessionPair = rawCookie.split(';')[0];
    assert.match(sessionPair, /^novaswarm_session=/);

    const authState = await fetch(`${srv.baseUrl}/api/state`, {
      headers: { Cookie: sessionPair },
    });
    assert.equal(authState.status, 200);
  } finally {
    await srv.close();
    env.restore();
  }
});

test('2: half-installed state (webAuthEnabled=true without password hash) surfaces explicit NO_PASSWORD_CONFIGURED error', async () => {
  const env = createTempEnv();
  const srv = await startTestServer();
  try {
    clearWebAuthPassword();
    updateState((s) => {
      s.settings.webAuthEnabled = true;
      s.settings.webAuthHasPassword = false;
      s.settings.onboardingCompleted = true;
    });

    const statusRes = await fetch(`${srv.baseUrl}/api/auth/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as { missingPasswordState: boolean; setupCodeRequired: boolean };
    assert.equal(statusJson.missingPasswordState, true);
    assert.equal(statusJson.setupCodeRequired, true);

    const loginRes = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'anything-here-1234' }),
    });
    assert.equal(loginRes.status, 401);
    const loginJson = (await loginRes.json()) as { code?: string; error?: string };
    assert.equal(loginJson.code, 'NO_PASSWORD_CONFIGURED');
    assert.match(String(loginJson.error || ''), /novaswarm set-password/);
  } finally {
    await srv.close();
    env.restore();
  }
});
