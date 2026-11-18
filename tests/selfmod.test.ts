import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyGuardedSelfModification,
  assertNotForbiddenModificationZone,
  ForbiddenZoneError,
  scanContentForSecrets,
  SecretLeakDetectedError,
} from '../server/selfmod/gitGuard';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

test('Forbidden modification zone strictly blocks git-rollback code, secret files, systemd units, and .gitignore', () => {
  const blockedTargets = [
    'server/selfmod/gitGuard.ts',
    '.env',
    '.env.production',
    '.config.json',
    '.state.json',
    'novaswarm.service',
    '.gitignore',
  ];

  for (const target of blockedTargets) {
    assert.throws(
      () => assertNotForbiddenModificationZone(target),
      (err: unknown) => err instanceof ForbiddenZoneError
    );
  }

  // Allowed feature file does not throw
  assert.equal(assertNotForbiddenModificationZone('src/components/SampleWidget.tsx'), 'src/components/SampleWidget.tsx');
});

test('Secret-pattern scanner detects leaked API keys before commit', () => {
  assert.equal(scanContentForSecrets('const k = "AIzaSyD1234567890abcdefghijklmnopqr";'), true);
  assert.equal(scanContentForSecrets('const k = "sk-proj-1234567890abcdefghijklmnop";'), true);
  assert.equal(scanContentForSecrets('export const version = "1.0.0";'), false);
});

test('Self-modification commits pre-change snapshot and automatically rolls back via git reset on verification failure', () => {
  const state = createInitialState();
  state.settings.hostPermissionsGranted = true;
  resetInMemoryStateForTests(state);

  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-selfmod-repo-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.email', 'test@novaswarm.local'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.name', 'NovaSwarm Test'], { cwd: tmpRepo });

    const targetFile = path.join(tmpRepo, 'feature.ts');
    fs.writeFileSync(targetFile, 'export const status = "HEALTHY";\n', 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: tmpRepo });
    execFileSync('git', ['commit', '-m', 'initial healthy commit'], { cwd: tmpRepo });

    // 1. Secret leak attempt is blocked before writing/committing
    assert.throws(
      () =>
        applyGuardedSelfModification({
          repoRoot: tmpRepo,
          targetPath: 'feature.ts',
          newContent: 'export const leak = "AIzaSyD1234567890abcdefghijklmnopqr";',
          commitMessage: 'should fail secret scan',
          agentId: 'test-agent',
        }),
      SecretLeakDetectedError
    );

    // 2. Broken modification triggers failing verifyCommand -> automatic rollback restores HEALTHY
    const failedMod = applyGuardedSelfModification({
      repoRoot: tmpRepo,
      targetPath: 'feature.ts',
      newContent: 'export const status = "BROKEN";\n',
      commitMessage: 'broken change',
      agentId: 'test-agent',
      verifyCommand: ['node', '-e', 'process.exit(1)'],
    });

    assert.equal(failedMod.applied, false);
    assert.equal(failedMod.rolledBack, true);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'export const status = "HEALTHY";\n');

    // 3. Valid modification passes verifyCommand -> committed cleanly
    const goodMod = applyGuardedSelfModification({
      repoRoot: tmpRepo,
      targetPath: 'feature.ts',
      newContent: 'export const status = "UPGRADED";\n',
      commitMessage: 'valid upgrade',
      agentId: 'test-agent',
      verifyCommand: ['node', '-e', 'process.exit(0)'],
    });

    assert.equal(goodMod.applied, true);
    assert.equal(goodMod.rolledBack, false);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'export const status = "UPGRADED";\n');
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
