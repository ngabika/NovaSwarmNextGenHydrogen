import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cliRemoveOperatorPassword,
  cliResetLoginLocks,
  cliSetOperatorPassword,
} from '../scripts/novaswarm-cli';
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetAuthSecurityStateForTests,
} from '../server/security/auth';
import {
  assertNotForbiddenModificationZone,
  ForbiddenZoneError,
} from '../server/selfmod/gitGuard';
import {
  appendAuditLog,
  getState,
  resetInMemoryStateForTests,
  rotateAuditJsonlLog,
  updateState,
  verifyAuditJsonlChain,
  verifyWebAuthPassword,
} from '../server/state/store';

function createTempEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-cli-audit-'));
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
  return {
    tmpDir,
    auditPath: process.env.NOVASWARM_AUDIT_JSONL_PATH,
    restore() {
      resetInMemoryStateForTests();
      resetAuthSecurityStateForTests();
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test('3 & 4: running server detects external .state.json edits and CLI set-password / remove-password / reset-login-lock without restart', () => {
  const env = createTempEnv();
  try {
    // Seed initial state on disk
    updateState((s) => {
      s.settings.webAuthEnabled = false;
      s.settings.webAuthHasPassword = false;
    });
    assert.equal(getState().settings.webAuthEnabled, false);

    // Simulate external CLI set-password changing .state.json + secrets
    const setRes = cliSetOperatorPassword('ExternalCliPass!2026');
    assert.equal(setRes.webAuthEnabled, true);
    assert.equal(setRes.webAuthHasPassword, true);
    assert.equal(verifyWebAuthPassword('ExternalCliPass!2026'), true);

    // Simulate an external process mutating .state.json slightly later
    const stateFile = path.join(env.tmpDir, '.state.json');
    const diskRaw = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as {
      settings: { userProfile: string };
    };
    diskRaw.settings.userProfile = 'Mutated-From-External-CLI';
    fs.writeFileSync(stateFile, JSON.stringify(diskRaw, null, 2), 'utf8');
    // Bump mtime explicitly so millisecond clocks always notice disk change
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(stateFile, future, future);

    // Running process getState() must immediately pick up the disk mutation
    assert.equal(getState().settings.userProfile, 'Mutated-From-External-CLI');

    // Lock an IP, persist to .login-locks.json, then clear via cliResetLoginLocks
    for (let i = 0; i < 5; i++) {
      recordLoginFailure('192.168.1.99');
    }
    assert.equal(checkLoginRateLimit('192.168.1.99').allowed, false);

    const unlocked = cliResetLoginLocks('test-cli');
    assert.equal(unlocked.clearedCount >= 1, true);
    assert.equal(checkLoginRateLimit('192.168.1.99').allowed, true);

    // Remove password -> switches cleanly back to passwordless LAN mode
    const remRes = cliRemoveOperatorPassword('test-cli');
    assert.equal(remRes.webAuthEnabled, false);
    assert.equal(remRes.webAuthHasPassword, false);
  } finally {
    env.restore();
  }
});

test('5: append-only audit-chain.jsonl verifies integrity, catches single-line tampering, rotates with anchor, and blocks agent modification', () => {
  const env = createTempEnv();
  try {
    // Initialize state and emit 5 audit log entries
    getState();
    for (let i = 1; i <= 5; i++) {
      appendAuditLog({
        type: 'security',
        sourceAgentId: `agent-${i}`,
        sourceAgentName: `Ügynök ${i}`,
        message: `Esemény #${i} ellenőrzése`,
        verifiedExecution: true,
      });
    }

    assert.equal(fs.existsSync(env.auditPath), true);
    const vClean = verifyAuditJsonlChain(env.auditPath);
    assert.equal(vClean.valid, true);
    assert.equal(vClean.checkedEntries, 5);
    assert.deepEqual(vClean.brokenLines, []);

    // Forbidden zone blocks direct reads/writes to audit-chain.jsonl and .login-locks.json
    assert.throws(() => assertNotForbiddenModificationZone('audit-chain.jsonl'), ForbiddenZoneError);
    assert.throws(() => assertNotForbiddenModificationZone('.login-locks.json'), ForbiddenZoneError);

    // Rotate audit log and verify new chain continues cleanly from rotation anchor
    const rot = rotateAuditJsonlLog(env.auditPath);
    assert.equal(rot.rotated, true);
    assert.ok(rot.archivePath && fs.existsSync(rot.archivePath));
    appendAuditLog({
      type: 'action',
      sourceAgentId: 'post-rot',
      sourceAgentName: 'Post Rot',
      message: 'Forgatás utáni bejegyzés',
      verifiedExecution: true,
    });
    const vPostRot = verifyAuditJsonlChain(env.auditPath);
    assert.equal(vPostRot.valid, true);
    assert.equal(vPostRot.checkedEntries, 1); // 1 real entry chained from rotation_anchor

    // Tamper line 1 in archived file -> verifyAuditJsonlChain MUST report broken line 1
    const archLines = fs.readFileSync(rot.archivePath!, 'utf8').trim().split('\n');
    archLines[0] = archLines[0].replace('Esemény #1 ellenőrzése', 'HAMISÍTOTT #1');
    fs.writeFileSync(rot.archivePath!, archLines.join('\n') + '\n', 'utf8');

    const vTampered = verifyAuditJsonlChain(rot.archivePath!);
    assert.equal(vTampered.valid, false);
    assert.equal(vTampered.brokenLines.includes(1), true);
  } finally {
    env.restore();
  }
});
