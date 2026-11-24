import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import test from 'node:test';
import type { DynamicToolDef } from '../shared/types';
import { executeHostCommandForAgent, executeHostCommandForAgentAsync } from '../server/agents/engine';
import { executeAgentTool } from '../server/agents/tools';
import { executeDynamicTool } from '../server/power/universalSuite';
import { createApiRouter } from '../server/routes/api';
import { resetAuthSecurityStateForTests } from '../server/security/auth';
import {
  checkSudoNopasswd,
  clampExecTimeoutSeconds,
  clampLongExecTimeoutSeconds,
  getExecTimeoutForCommand,
  getPhoenixAutonomyStatus,
  isForbiddenAgentControlPlaneUrl,
  isLongRunningCommand,
  maybeRunDailyAutoPhoenixSnapshot,
  rewriteSudoNonInteractive,
  runTrackedHostCommand,
  toggleFullAutonomyProfile,
} from '../server/security/autonomyProfile';
import {
  deactivateKillSwitch,
  getActiveHostChildCount,
} from '../server/security/permissionGate';
import {
  createInitialState,
  getState,
  resetInMemoryStateForTests,
  setWebAuthPassword,
  updateState,
} from '../server/state/store';
import { processTelegramInput } from '../server/telegram/bot';

function startTestApiServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(() => {}));
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server: srv, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test('Full Autonomy Profile: 1-click enable flips all 3 flags, disable restores prior values, keeps Telegram allowlist & web auth', async () => {
  resetInMemoryStateForTests(createInitialState());
  resetAuthSecurityStateForTests();
  setWebAuthPassword('OperatorPass123!');

  updateState((s) => {
    s.settings.webAuthEnabled = true;
    s.settings.webAuthHasPassword = true;
    s.settings.telegramAllowedChatIds = ['111222333'];
    s.settings.hostPermissionsGranted = true;
    s.settings.fullAutonomousMode = false;
    s.settings.dangerousExecAutoApprove = false;
  });

  const sentTelegramAlerts: string[] = [];
  const enableRes = await toggleFullAutonomyProfile({
    enabled: true,
    password: 'OperatorPass123!',
    telegramSender: async (msg) => {
      sentTelegramAlerts.push(msg);
    },
  });

  assert.equal(enableRes.ok, true);
  assert.equal(enableRes.statusCode, 200);
  const afterEnable = getState();
  assert.equal(afterEnable.settings.fullAutonomyProfileEnabled, true);
  assert.equal(afterEnable.settings.hostPermissionsGranted, true);
  assert.equal(afterEnable.settings.fullAutonomousMode, true);
  assert.equal(afterEnable.settings.dangerousExecAutoApprove, true);
  assert.deepEqual(afterEnable.settings.fullAutonomyPreviousFlags, {
    hostPermissionsGranted: true,
    fullAutonomousMode: false,
    dangerousExecAutoApprove: false,
  });
  assert.equal(afterEnable.settings.webAuthEnabled, true);
  assert.deepEqual(afterEnable.settings.telegramAllowedChatIds, ['111222333']);
  assert.equal(sentTelegramAlerts.length, 1);
  assert.match(sentTelegramAlerts[0], /BEKAPCSOLVA/);
  assert.ok(
    afterEnable.auditLogs.some((l) => l.type === 'security' && l.message.includes('TELJES AUTONÓMIA PROFIL BEKAPCSOLVA'))
  );

  const disableRes = await toggleFullAutonomyProfile({
    enabled: false,
    telegramSender: async (msg) => {
      sentTelegramAlerts.push(msg);
    },
  });

  assert.equal(disableRes.ok, true);
  const afterDisable = getState();
  assert.equal(afterDisable.settings.fullAutonomyProfileEnabled, false);
  assert.equal(afterDisable.settings.hostPermissionsGranted, true);
  assert.equal(afterDisable.settings.fullAutonomousMode, false);
  assert.equal(afterDisable.settings.dangerousExecAutoApprove, false);
  assert.equal(afterDisable.settings.fullAutonomyPreviousFlags, null);
  assert.equal(sentTelegramAlerts.length, 2);
  assert.match(sentTelegramAlerts[1], /KIKAPCSOLVA/);
  assert.ok(
    afterDisable.auditLogs.some((l) => l.type === 'security' && l.message.includes('TELJES AUTONÓMIA PROFIL KIKAPCSOLVA'))
  );
});

test('Full Autonomy Profile: cannot activate without valid operator password', async () => {
  resetInMemoryStateForTests(createInitialState());
  resetAuthSecurityStateForTests();
  setWebAuthPassword('');

  const noPwRes = await toggleFullAutonomyProfile({
    enabled: true,
    password: 'anything',
    telegramSender: async () => {},
  });
  assert.equal(noPwRes.ok, false);
  assert.equal(noPwRes.statusCode, 403);
  assert.equal(getState().settings.fullAutonomyProfileEnabled, false);

  setWebAuthPassword('ValosOperatorJelszo99!');
  const wrongPwRes = await toggleFullAutonomyProfile({
    enabled: true,
    password: 'hibas-jelszo',
    telegramSender: async () => {},
  });
  assert.equal(wrongPwRes.ok, false);
  assert.equal(wrongPwRes.statusCode, 401);
  assert.equal(getState().settings.fullAutonomyProfileEnabled, false);
});

test('Configurable exec timeouts: clamping, long-command detection, and clear Hungarian timeout message', async () => {
  resetInMemoryStateForTests(createInitialState());
  assert.equal(clampExecTimeoutSeconds(1), 5);
  assert.equal(clampExecTimeoutSeconds(9999), 3600);
  assert.equal(clampLongExecTimeoutSeconds(5), 30);
  assert.equal(clampLongExecTimeoutSeconds(99999), 7200);

  assert.equal(isLongRunningCommand('apt-get install -y bubblewrap'), true);
  assert.equal(isLongRunningCommand('npm run build'), true);
  assert.equal(isLongRunningCommand('echo hello'), false);

  updateState((s) => {
    s.settings.execTimeoutSeconds = 18;
    s.settings.longExecTimeoutSeconds = 900;
  });
  assert.equal(getExecTimeoutForCommand('echo hi', getState().settings).timeoutSec, 18);
  assert.equal(getExecTimeoutForCommand('sudo apt upgrade -y', getState().settings).timeoutSec, 900);

  const timeoutRun = await runTrackedHostCommand({
    bin: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 10000)'],
    timeoutSec: 1,
  });
  assert.equal(timeoutRun.ok, false);
  assert.equal(timeoutRun.timedOut, true);
  assert.match(timeoutRun.stderr, /Időtúllépés:.*1 másodperces időkorlátot/);

  updateState((s) => {
    s.settings.hostPermissionsGranted = true;
    s.settings.fullAutonomousMode = true;
    s.settings.dangerousExecAutoApprove = true;
    s.settings.execTimeoutSeconds = 5;
  });
  const agent = getState().agents[0];
  assert.ok(agent);
  const fastOut = executeHostCommandForAgent(agent, 'uname -a');
  assert.equal(fastOut.executed, true);
});

test('Privilege boundary: agent tools blocked from control-plane URLs & security endpoints require human session cookie', async () => {
  resetInMemoryStateForTests(createInitialState());
  resetAuthSecurityStateForTests();
  setWebAuthPassword('HumanSecret2026!');

  // Even when webAuthEnabled is false, a set operator password enforces human session cookie boundary on security endpoints
  updateState((s) => {
    s.settings.webAuthEnabled = false;
    s.settings.webAuthHasPassword = true;
    s.settings.hostPermissionsGranted = true;
  });

  const localCheck = isForbiddenAgentControlPlaneUrl('http://127.0.0.1:3000/api/settings');
  assert.equal(localCheck.forbidden, true);
  const externalCheck = isForbiddenAgentControlPlaneUrl('https://api.github.com/repos/ngabika/NovaSwarmNextGenHydrogen');
  assert.equal(externalCheck.forbidden, false);

  const baseAgent = getState().agents[0];
  const agent = { ...baseAgent, webSearchEnabled: true, hostExecutionEnabled: true };
  const toolHttpBlock = await executeAgentTool({
    agent,
    toolName: 'http_request',
    args: { method: 'PATCH', url: 'http://localhost:3000/api/settings', body: '{"fullAutonomousMode":true}' },
    isolationMode: 'main_host',
  });
  assert.equal(toolHttpBlock.step.ok, false);
  assert.match(toolHttpBlock.observation, /vezérlősíkját|tiltott|helyi hálózati/i);

  const toolFetchBlock = await executeAgentTool({
    agent,
    toolName: 'web_fetch',
    args: { url: 'http://127.0.0.1:3000/api/autonomy-profile' },
    isolationMode: 'main_host',
  });
  assert.equal(toolFetchBlock.step.ok, false);
  assert.match(toolFetchBlock.observation, /vezérlősíkját|tiltott|helyi hálózati/i);

  const dynTool: DynamicToolDef = {
    id: 'dt-http-test',
    name: 'http_probe',
    description: 'test dynamic http_get',
    kind: 'http_get',
    targetOrCode: 'http://127.0.0.1:3000/api/settings',
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  const dynBlock = await executeDynamicTool(dynTool, {});
  assert.equal(dynBlock.ok, false);
  assert.match(dynBlock.output, /vezérlősíkját|tiltott/i);

  const { server, baseUrl } = await startTestApiServer();
  try {
    // Without human cookie -> rejected (401)
    const noCookieSettings = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dangerousExecAutoApprove: true }),
    });
    assert.equal(noCookieSettings.status, 401);

    const noCookieProfile = await fetch(`${baseUrl}/api/autonomy-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, password: 'HumanSecret2026!' }),
    });
    assert.equal(noCookieProfile.status, 401);

    const noCookieKill = await fetch(`${baseUrl}/api/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });
    assert.equal(noCookieKill.status, 401);

    // Attempting to toggle fullAutonomyProfileEnabled via PATCH /api/settings is forbidden (403)
    const tryBypassProfile = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullAutonomyProfileEnabled: true }),
    });
    assert.equal(tryBypassProfile.status, 403);

    // Log in to obtain human session cookie
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'HumanSecret2026!' }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('novaswarm_session='));
    const cookiePair = setCookie.split(';')[0];

    // Even with cookie, x-novaswarm-tool header is rejected (403)
    const toolHeaderRes = await fetch(`${baseUrl}/api/autonomy-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
        'X-NovaSwarm-Tool': 'http_request',
      },
      body: JSON.stringify({ enabled: true, password: 'HumanSecret2026!' }),
    });
    assert.equal(toolHeaderRes.status, 403);

    // Valid human session cookie + password succeeds
    const okRes = await fetch(`${baseUrl}/api/autonomy-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({ enabled: true, password: 'HumanSecret2026!' }),
    });
    assert.equal(okRes.status, 200);
    assert.equal(getState().settings.fullAutonomyProfileEnabled, true);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Sudo NOPASSWD diagnostics (mocked) & sudo -n non-interactive enforcement', async () => {
  const okStatus = checkSudoNopasswd({
    executor: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  assert.equal(okStatus.hasNopasswd, true);
  assert.match(okStatus.message, /NOPASSWD.*aktív/i);

  const missingStatus = checkSudoNopasswd({
    username: 'pi',
    executor: () => ({ status: 1, stdout: '', stderr: 'sudo: a password is required' }),
  });
  assert.equal(missingStatus.hasNopasswd, false);
  assert.equal(missingStatus.visudoCommand, 'sudo visudo -f /etc/sudoers.d/novaswarm');
  assert.equal(missingStatus.sudoersLine, 'pi ALL=(ALL) NOPASSWD:ALL');

  assert.equal(rewriteSudoNonInteractive('sudo apt-get update'), 'sudo -n apt-get update');
  assert.equal(rewriteSudoNonInteractive('sudo -n systemctl restart nginx'), 'sudo -n systemctl restart nginx');
  assert.equal(rewriteSudoNonInteractive('sudo -u root id'), 'sudo -n -u root id');

  const fakeSudoRun = await runTrackedHostCommand({
    bin: process.execPath,
    args: ['-e', 'console.error("sudo: a password is required"); process.exit(1);'],
    timeoutSec: 10,
  });
  assert.equal(fakeSudoRun.ok, false);
  assert.equal(fakeSudoRun.sudoMissingNopasswd, true);
  assert.match(fakeSudoRun.errorMessage || fakeSudoRun.stderr, /visudo.*novaswarm/);
});

test('Kill-switch (/stop) immediately terminates active running host command & autonomous commands are audit-logged', async () => {
  resetInMemoryStateForTests(createInitialState());
  updateState((s) => {
    s.settings.hostPermissionsGranted = true;
    s.settings.fullAutonomousMode = true;
    s.settings.dangerousExecAutoApprove = true;
    s.settings.fullAutonomyProfileEnabled = true;
    s.settings.telegramAllowedChatIds = ['777888999'];
    s.settings.telegramChatId = '777888999';
  });

  const agent = getState().agents[0];
  assert.ok(agent);

  const startedMs = Date.now();
  const runningPromise = executeHostCommandForAgentAsync(
    agent,
    `${process.execPath} -e "setTimeout(() => {}, 20000)"`
  );

  await new Promise((r) => setTimeout(r, 150));
  assert.ok(getActiveHostChildCount() >= 1, 'Futó gazdagép folyamat regisztrálva lett');

  const tgStopReply = await processTelegramInput('/stop');
  assert.match(tgStopReply, /VÉSZLEÁLLÍTÓ AKTIVÁLVA/);

  const finished = await runningPromise;
  const elapsedMs = Date.now() - startedMs;
  assert.equal(finished.executed, false);
  assert.match(finished.stderr, /Vészleállító \(\/stop\)/);
  assert.equal(getActiveHostChildCount(), 0);
  assert.ok(elapsedMs < 4000, `A vészleállítónak azonnal meg kellett szakítania a folyamatot (${elapsedMs}ms)`);

  deactivateKillSwitch();
  const okRun = await executeHostCommandForAgentAsync(agent, `${process.execPath} -e "console.log('AUDIT_OUTPUT_OK')"`);
  assert.equal(okRun.executed, true);
  const logs = getState().auditLogs;
  const secEntry = logs.find(
    (l) =>
      l.type === 'security' &&
      l.sourceAgentId === agent.id &&
      l.message.includes('AUDIT_OUTPUT_OK') &&
      /\[\d{4}-\d{2}-\d{2}T/.test(l.message)
  );
  assert.ok(
    secEntry,
    'Az autonóm parancs teljes biztonsági audit bejegyzése (parancs + ágens + időbélyeg + kimenet) rögzítve lett'
  );
});

test('Phoenix 24h staleness warning and daily auto-snapshot in Full Autonomy mode', () => {
  resetInMemoryStateForTests(createInitialState());
  const oldIso = new Date(Date.now() - 26 * 3_600_000).toISOString();
  const isolatedBackupsDir = `/tmp/novaswarm-empty-backups-${Date.now()}`;

  updateState((s) => {
    s.settings.fullAutonomyProfileEnabled = true;
    s.settings.autoPhoenixSnapshotInFullAutonomy = true;
    s.settings.lastPhoenixSnapshotAt = oldIso;
  });

  const stale = getPhoenixAutonomyStatus(Date.now(), isolatedBackupsDir);
  assert.equal(stale.fullAutonomyActive, true);
  assert.equal(stale.staleWarning, true);
  assert.ok(stale.warningMessage && stale.warningMessage.includes('>24 óra'));

  let createdCount = 0;
  const freshNow = Date.now();
  const created = maybeRunDailyAutoPhoenixSnapshot(
    freshNow,
    () => {
      createdCount += 1;
      return {
        fileName: 'novaswarm-phoenix-test.json',
        sizeBytes: 1024,
        sha256: 'deadbeef',
        createdAt: new Date(freshNow).toISOString(),
      };
    },
    isolatedBackupsDir
  );
  assert.equal(created.created, true);
  assert.equal(createdCount, 1);

  const afterFresh = getPhoenixAutonomyStatus(freshNow + 1000, isolatedBackupsDir);
  assert.equal(afterFresh.staleWarning, false);
  assert.equal(afterFresh.warningMessage, null);

  const skipped = maybeRunDailyAutoPhoenixSnapshot(
    freshNow + 3_600_000,
    () => {
      createdCount += 1;
      return {
        fileName: 'dup.json',
        sizeBytes: 1,
        sha256: 'cafebabe',
        createdAt: new Date().toISOString(),
      };
    },
    isolatedBackupsDir
  );
  assert.equal(skipped.created, false);
  assert.equal(createdCount, 1);
});
