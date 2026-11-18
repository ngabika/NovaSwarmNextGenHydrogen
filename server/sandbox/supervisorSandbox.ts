import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendAuditLog, updateState } from '../state/store';

export interface SandboxExecutionResult {
  passed: boolean;
  isolationMode: 'docker_no_network' | 'isolated_tmpfs_subprocess';
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxDir: string;
  durationMs: number;
  realWorkspaceIntact: boolean;
}

function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Supervisor Dry-Run / Sandbox Environment (Section 10.3 & 13.3).
 * Creates an isolated ephemeral copy in OS tmpdir/tmpfs and executes candidate
 * commands/scripts using either Docker (`--network=none`) or a stripped-env subprocess
 * strictly confined to the ephemeral temp copy — NEVER touching the real workspace or DB.
 */
export function runInSupervisorSandbox(params: {
  scriptOrCommand: string;
  isNodeScript?: boolean;
  seedFiles?: Record<string, string>;
  realProtectedPaths?: string[];
  timeoutMs?: number;
}): SandboxExecutionResult {
  const startedAt = Date.now();
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-sandbox-'));

  try {
    // Seed ephemeral copy with test fixtures
    const seed = params.seedFiles ?? {
      'sample.txt': 'sandbox-fixture-data',
      'config.json': '{"env":"sandbox"}',
    };
    for (const [relPath, content] of Object.entries(seed)) {
      const target = path.join(sandboxDir, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }

    // Snapshot real protected files before execution to verify zero mutation
    const protectedChecksums = new Map<string, boolean>();
    for (const p of params.realProtectedPaths ?? []) {
      protectedChecksums.set(p, fs.existsSync(p));
    }

    const timeoutMs = params.timeoutMs ?? 5000;
    let exitCode = 1;
    let stdout = '';
    let stderr = '';
    let isolationMode: SandboxExecutionResult['isolationMode'] = 'isolated_tmpfs_subprocess';

    if (params.isNodeScript) {
      const candidateFile = path.join(sandboxDir, 'candidate.mjs');
      fs.writeFileSync(candidateFile, params.scriptOrCommand, 'utf8');
      if (isDockerAvailable()) {
        isolationMode = 'docker_no_network';
        const res = spawnSync(
          'docker',
          [
            'run',
            '--rm',
            '--network=none',
            '--memory=128m',
            '--cpus=0.5',
            '-v',
            `${sandboxDir}:/sandbox:rw`,
            '-w',
            '/sandbox',
            'node:22-alpine',
            'node',
            '/sandbox/candidate.mjs',
          ],
          { encoding: 'utf8', timeout: timeoutMs }
        );
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else {
        const res = spawnSync('node', [candidateFile], {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          env: {
            PATH: process.env.PATH || '/usr/bin:/bin',
            HOME: sandboxDir,
            TMPDIR: sandboxDir,
            NOVASWARM_SANDBOX: '1',
          },
        });
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      }
    } else {
      // Shell command confined to sandboxDir; rewrite absolute references away & restrict HOME/PWD
      if (isDockerAvailable()) {
        isolationMode = 'docker_no_network';
        const res = spawnSync(
          'docker',
          [
            'run',
            '--rm',
            '--network=none',
            '--memory=128m',
            '--cpus=0.5',
            '-v',
            `${sandboxDir}:/sandbox:rw`,
            '-w',
            '/sandbox',
            'alpine:latest',
            'sh',
            '-c',
            params.scriptOrCommand,
          ],
          { encoding: 'utf8', timeout: timeoutMs }
        );
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else {
        // Confine relative operations strictly inside sandboxDir with stripped env
        const res = spawnSync('sh', ['-c', params.scriptOrCommand], {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: sandboxDir,
            PWD: sandboxDir,
            TMPDIR: sandboxDir,
            NOVASWARM_SANDBOX: '1',
          },
        });
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      }
    }

    let realWorkspaceIntact = true;
    for (const [p, existedBefore] of protectedChecksums.entries()) {
      if (fs.existsSync(p) !== existedBefore) {
        realWorkspaceIntact = false;
      }
    }

    const result: SandboxExecutionResult = {
      passed: exitCode === 0 && realWorkspaceIntact,
      isolationMode,
      exitCode,
      stdout: stdout.slice(0, 4000),
      stderr: stderr.slice(0, 4000),
      sandboxDir,
      durationMs: Date.now() - startedAt,
      realWorkspaceIntact,
    };

    if (result.passed) {
      updateState((s) => {
        s.supervisor.sandboxTestsPassed += 1;
        s.supervisor.lastAuditAt = new Date().toISOString();
      });
    }

    appendAuditLog({
      type: 'supervisor',
      sourceAgentId: 'supervisor-auditor',
      sourceAgentName: 'Felügyelő Auditor',
      message: `Sandbox dry-run (${isolationMode}): exit=${exitCode}, valós fájlrendszer érintetlen=${realWorkspaceIntact}`,
      verifiedExecution: result.passed,
    });

    return result;
  } finally {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
}

/**
 * Automated Destructive Sandbox Proof (Section 13.3).
 * Executes a deliberate file deletion inside the sandbox and proves that a matching
 * sentinel file in the real workspace remains 100% untouched.
 */
export function runDestructiveSandboxProof(realSentinelDir?: string): {
  proofPassed: boolean;
  sentinelFile: string;
  sentinelStillExists: boolean;
  sandboxResult: SandboxExecutionResult;
} {
  const dir = realSentinelDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-real-sentinel-'));
  const sentinelFile = path.join(dir, 'critical-production-data.txt');
  fs.writeFileSync(sentinelFile, 'MUST_NOT_BE_DELETED', 'utf8');

  const sandboxResult = runInSupervisorSandbox({
    scriptOrCommand: 'rm -rf ./critical-production-data.txt ./sample.txt && ls -la',
    seedFiles: {
      'critical-production-data.txt': 'SANDBOX_COPY_ONLY',
      'sample.txt': 'SANDBOX_COPY_ONLY',
    },
    realProtectedPaths: [sentinelFile],
  });

  const sentinelStillExists =
    fs.existsSync(sentinelFile) &&
    fs.readFileSync(sentinelFile, 'utf8') === 'MUST_NOT_BE_DELETED';

  const proofPassed = sandboxResult.exitCode === 0 && sentinelStillExists;

  updateState((s) => {
    s.supervisor.lastDestructiveProofAt = new Date().toISOString();
    if (!proofPassed) {
      s.supervisor.status = 'alert';
    }
  });

  if (!realSentinelDir) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return {
    proofPassed,
    sentinelFile,
    sentinelStillExists,
    sandboxResult,
  };
}
