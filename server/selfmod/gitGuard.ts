import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { appendAuditLog, atomicWriteFileSync } from '../state/store';
import { assertHostPermission, requireDestructiveApproval, shouldRequireApproval } from '../security/permissionGate';

/**
 * Explicit Forbidden Modification Zone (Section 8.5).
 * Self-modification MUST NEVER write to:
 * (a) its own git-rollback code (server/selfmod/)
 * (b) files holding secrets (.env, .config.json, .secrets.vault.json, .state.json)
 * (c) systemd unit files
 * (d) .gitignore
 */
export const FORBIDDEN_MODIFICATION_ZONES: RegExp[] = [
  /^server\/selfmod(\/|$)/i,
  /^\.env($|\.)/i,
  /^\.config\.json$/i,
  /^\.state\.json/i,
  /^\.secrets/i,
  /^\.login-locks\.json$/i,
  /^\.novaswarm-setup\.log$/i,
  /^audit-chain(\.[^/]+)?\.jsonl$/i,
  /^novaswarm\.sqlite/i,
  /^backups(\/|$)/i,
  /^\.migrated-away$/i,
  /\.service$/i,
  /systemd/i,
  /^\.gitignore$/i,
];

/** Sensitive core files outside the forbidden zone that trigger Telegram push + 1-click approval (Section 13.4) */
export const SENSITIVE_CORE_ZONES: RegExp[] = [
  /^server\/security\//i,
  /^server\/state\//i,
  /^server\.ts$/i,
  /^package\.json$/i,
];

/** Secret-pattern scanner before any git commit (Section 8.6) */
export const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{25,}/,
  /sk-[A-Za-z0-9\-_]{20,}/,
  /sk-or-v1-[A-Za-z0-9]{20,}/,
  /sk-ant-[A-Za-z0-9\-_]{20,}/,
  /ghp_[A-Za-z0-9]{25,}/,
  /\d{8,10}:[A-Za-z0-9_-]{30,}/, // Telegram bot token pattern
];

export class ForbiddenZoneError extends Error {
  public readonly code = 'FORBIDDEN_MODIFICATION_ZONE';
  constructor(targetPath: string) {
    super(
      `Tiltott önmódosítási zóna: "${targetPath}" módosítása szigorúan tilos a biztonsági házirend szerint.`
    );
    this.name = 'ForbiddenZoneError';
  }
}

export class SecretLeakDetectedError extends Error {
  public readonly code = 'SECRET_LEAK_DETECTED';
  constructor(file: string) {
    super(`Git-higiéniai hiba: API kulcs / titkos minta észlelve a(z) "${file}" fájlban commit előtt.`);
    this.name = 'SecretLeakDetectedError';
  }
}

export function normalizeRepoRelativePath(targetPath: string, repoRoot = process.cwd()): string {
  const abs = path.resolve(repoRoot, targetPath);
  const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ForbiddenZoneError(targetPath);
  }
  return rel;
}

export function assertNotForbiddenModificationZone(targetPath: string, repoRoot = process.cwd()): string {
  const rel = normalizeRepoRelativePath(targetPath, repoRoot);
  for (const pattern of FORBIDDEN_MODIFICATION_ZONES) {
    if (pattern.test(rel)) {
      throw new ForbiddenZoneError(rel);
    }
  }
  return rel;
}

export function isSensitiveCoreFile(relPath: string): boolean {
  return SENSITIVE_CORE_ZONES.some((p) => p.test(relPath));
}

export function scanContentForSecrets(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

export function scanStagedFilesForSecrets(repoRoot = process.cwd()): void {
  const stagedRaw = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  if (!stagedRaw) return;
  for (const file of stagedRaw.split('\n').filter(Boolean)) {
    const abs = path.join(repoRoot, file);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const text = fs.readFileSync(abs, 'utf8');
      if (scanContentForSecrets(text)) {
        throw new SecretLeakDetectedError(file);
      }
    }
  }
}

export interface SelfModOptions {
  repoRoot?: string;
  targetPath: string;
  newContent: string;
  commitMessage: string;
  agentId: string;
  verifyCommand?: string[];
  bypassApprovalForTest?: boolean;
}

export interface SelfModResult {
  applied: boolean;
  rolledBack: boolean;
  pendingApproval?: boolean;
  approvalId?: string;
  preCommitHash?: string;
  postCommitHash?: string;
  message: string;
}

/**
 * Executes a guarded self-modification (Section 13.2):
 * 1. Checks unified Host Permission Gate
 * 2. Enforces Forbidden Modification Zone
 * 3. Requests 1-click approval if target is a sensitive core file
 * 4. Creates pre-modification git commit as restore point
 * 5. Writes target file atomically & scans for leaked secrets
 * 6. Runs verification command; automatically rolls back via `git reset --hard` on failure.
 */
export function applyGuardedSelfModification(opts: SelfModOptions): SelfModResult {
  const repoRoot = opts.repoRoot ?? process.cwd();
  assertHostPermission(`self_modify:${opts.targetPath}`, opts.agentId);
  const relPath = assertNotForbiddenModificationZone(opts.targetPath, repoRoot);

  if (scanContentForSecrets(opts.newContent)) {
    throw new SecretLeakDetectedError(relPath);
  }

  if (isSensitiveCoreFile(relPath) && !opts.bypassApprovalForTest && shouldRequireApproval()) {
    const approval = requireDestructiveApproval(
      'sensitive_selfmod',
      `Érzékeny core fájl önmódosítása: ${relPath}`,
      relPath,
      opts.agentId
    );
    return {
      applied: false,
      rolledBack: false,
      pendingApproval: true,
      approvalId: approval.id,
      message: `Érzékeny fájl (${relPath}) módosításához jóváhagyás kérve (#${approval.id.slice(0, 8)}).`,
    };
  }

  // Ensure git repo exists
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    throw new Error('Git repository nem található az önmódosító biztonsági hálóhoz.');
  }

  // Stage & commit clean pre-modification baseline if working tree has tracked/untracked safe changes
  execFileSync('git', ['add', '-A'], { cwd: repoRoot });
  scanStagedFilesForSecrets(repoRoot);
  const statusBefore = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  if (statusBefore) {
    execFileSync(
      'git',
      ['commit', '-m', `chore(selfmod-checkpoint): pre-modification snapshot before ${relPath}`],
      { cwd: repoRoot }
    );
  }
  const preCommitHash = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();

  // Apply target write atomically
  const absTarget = path.join(repoRoot, relPath);
  atomicWriteFileSync(absTarget, opts.newContent);

  // Verify build / lint + unit tests (M14)
  const verifyCmd = opts.verifyCommand ?? ['npm', 'run', 'lint'];
  const verify = spawnSync(verifyCmd[0], verifyCmd.slice(1), {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60000,
  });

  let testFailed = false;
  let testErr = '';
  if (!opts.verifyCommand && verify.status === 0 && fs.existsSync(path.join(repoRoot, 'tests'))) {
    const testFiles = fs
      .readdirSync(path.join(repoRoot, 'tests'))
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => path.join('tests', f));
    if (testFiles.length > 0) {
      const testRun = spawnSync('./node_modules/.bin/tsx', ['--test', '--test-force-exit', ...testFiles], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60000,
      });
      if (testRun.status !== 0) {
        testFailed = true;
        testErr = testRun.stderr || testRun.stdout || 'Egységtesztek elbuktak';
      }
    }
  }

  if (verify.status !== 0 || testFailed) {
    // Automatic human-free rollback to preCommitHash
    execFileSync('git', ['reset', '--hard', preCommitHash], { cwd: repoRoot });
    execFileSync('git', ['clean', '-fd'], { cwd: repoRoot });
    appendAuditLog({
      type: 'system',
      sourceAgentId: opts.agentId,
      sourceAgentName: opts.agentId,
      message: `Önmódosítás (${relPath}) ellenőrzése elbukott — automatikus git rollback végrehajtva (${preCommitHash.slice(0, 7)}).`,
      verifiedExecution: true,
    });
    return {
      applied: false,
      rolledBack: true,
      preCommitHash,
      message: `Ellenőrzés sikertelen (${testFailed ? testErr : verify.stderr || verify.stdout}); visszaállítva a(z) ${preCommitHash.slice(0, 7)} commitra.`,
    };
  }

  execFileSync('git', ['add', relPath], { cwd: repoRoot });
  scanStagedFilesForSecrets(repoRoot);
  execFileSync('git', ['commit', '-m', opts.commitMessage], { cwd: repoRoot });
  const postCommitHash = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();

  appendAuditLog({
    type: 'action',
    sourceAgentId: opts.agentId,
    sourceAgentName: opts.agentId,
    message: `Önmódosítás sikeres (${relPath}) — új commit: ${postCommitHash.slice(0, 7)}`,
    verifiedExecution: true,
  });

  return {
    applied: true,
    rolledBack: false,
    preCommitHash,
    postCommitHash,
    message: `Önmódosítás alkalmazva és commitolva (${postCommitHash.slice(0, 7)}).`,
  };
}

export function getRecentGitHistory(repoRoot = process.cwd(), limit = 10): Array<{
  hash: string;
  date: string;
  message: string;
}> {
  try {
    const out = execFileSync(
      'git',
      ['log', `-n`, String(limit), '--pretty=format:%H|%aI|%s'],
      { cwd: repoRoot, encoding: 'utf8' }
    ).trim();
    if (!out) return [];
    return out.split('\n').map((line) => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, message: rest.join('|') };
    });
  } catch {
    return [];
  }
}

/** M15: Commit diff preview */
export function getCommitDiff(hash: string, repoRoot = process.cwd()): { hash: string; diff: string; ok: boolean } {
  const cleanHash = hash.trim().replace(/[^a-fA-F0-9]/g, '');
  if (!cleanHash || cleanHash.length < 6) {
    return { hash, diff: 'Érvénytelen commit hash.', ok: false };
  }
  try {
    const out = execFileSync('git', ['show', '--stat', '--patch', cleanHash], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 5000,
    });
    return { hash: cleanHash, diff: out.slice(0, 12000), ok: true };
  } catch (err) {
    return { hash: cleanHash, diff: err instanceof Error ? err.message : String(err), ok: false };
  }
}

/** M15: Explicit 1-click rollback to a known safe commit hash */
export function rollbackSelfModToCommit(hash: string, repoRoot = process.cwd()): {
  ok: boolean;
  commitHash: string;
  message: string;
} {
  assertHostPermission(`git_rollback:${hash}`, 'user');
  const cleanHash = hash.trim().replace(/[^a-fA-F0-9]/g, '');
  if (!cleanHash || cleanHash.length < 6) {
    throw new Error('Érvénytelen commit hash a visszaállításhoz.');
  }
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    throw new Error('Nem található .git tároló ebben a könyvtárban.');
  }
  execFileSync('git', ['reset', '--hard', cleanHash], { cwd: repoRoot, timeout: 10000 });
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'git-guard',
    sourceAgentName: 'Git Rollback',
    message: `Rendszer visszaállítva a(z) ${head} commit állapotára.`,
    verifiedExecution: true,
  });
  return { ok: true, commitHash: head, message: `Sikeresen visszaállítva: ${head}` };
}
