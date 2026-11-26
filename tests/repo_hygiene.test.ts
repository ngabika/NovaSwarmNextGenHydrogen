import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

test('7: repository hygiene — single npm lockfile, valid package-lock.json, complete .gitignore, clean install/update scripts', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'bun.lock')), false, 'bun.lock must not exist');
  assert.equal(fs.existsSync(path.join(ROOT, 'bun.lockb')), false, 'bun.lockb must not exist');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  const lockRaw = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
  const lock = JSON.parse(lockRaw) as { name?: string; version?: string; lockfileVersion?: number };
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.ok((lock.lockfileVersion || 0) >= 2, 'package-lock.json must be lockfile v2+');

  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  for (const required of [
    '.env',
    '.secrets*',
    '.state.json*',
    '.config.json',
    '.novaswarm-setup.log',
    '.login-locks.json',
    'audit-chain.jsonl*',
    'novaswarm.sqlite*',
    'backups/',
  ]) {
    assert.equal(gitignore.includes(required), true, `.gitignore missing pattern: ${required}`);
  }

  const installSh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  const updateSh = fs.readFileSync(path.join(ROOT, 'update.sh'), 'utf8');
  const uninstallSh = fs.readFileSync(path.join(ROOT, 'uninstall.sh'), 'utf8');

  assert.equal(installSh.includes('initStateStore'), false, 'install.sh must not reference missing initStateStore');
  assert.equal(updateSh.includes('initStateStore'), false, 'update.sh must not reference missing initStateStore');
  assert.equal(installSh.includes('--no-password'), true, 'install.sh must support --no-password');
  assert.equal(installSh.includes('--generate-password'), true, 'install.sh must support --generate-password');
  assert.equal(installSh.includes('chattr +a'), true, 'install.sh must attempt chattr +a on audit-chain.jsonl');
  assert.equal(uninstallSh.includes('--service-only'), true, 'uninstall.sh must support --service-only');
});
