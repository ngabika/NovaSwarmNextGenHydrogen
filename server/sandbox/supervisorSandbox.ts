import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SandboxCapabilities, SandboxIsolationMode } from '../../shared/types';
import { appendAuditLog, updateState } from '../state/store';

export type { SandboxIsolationMode };
export type StrongSandboxBackend = 'docker_no_network' | 'bwrap_sandbox';

export const MAX_SANDBOX_STDOUT_BYTES = 64 * 1024;
export const MAX_SANDBOX_STDERR_BYTES = 16 * 1024;
export const MAX_SANDBOX_OUTPUT_CHARS = 4000;

export interface SandboxExecutionResult {
  passed: boolean;
  isolationMode: SandboxIsolationMode;
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxDir: string;
  durationMs: number;
  realWorkspaceIntact: boolean;
}

export interface NodePermissionSupportInfo {
  supported: boolean;
  flag: '--permission' | '--experimental-permission' | null;
  nodeVersion: string;
  warning: string | null;
}

export interface StrictJsSandboxExecutionResult {
  ok: boolean;
  isolationMode: StrongSandboxBackend | 'unavailable';
  code?: 'NO_SANDBOX_BACKEND' | 'SANDBOX_EXECUTION_ERROR' | 'SANDBOX_INVALID_OUTPUT';
  value?: unknown;
  wasUndefined?: boolean;
  logs: string[];
  stderr: string;
  warning: string | null;
  error?: string;
}

export type StrictJsSandboxMockExecutor = (ctx: {
  backend: StrongSandboxBackend;
  sandboxDir: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  runnerPath: string;
  inputPath: string;
  userFnPath: string;
}) => {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

let cachedNodePermissionInfo: NodePermissionSupportInfo | null = null;

export function detectNodePermissionSupport(): NodePermissionSupportInfo {
  if (cachedNodePermissionInfo) return cachedNodePermissionInfo;
  const nodeVersion = process.versions.node || '0.0.0';
  const [majorStr, minorStr] = nodeVersion.split('.');
  const major = Number(majorStr || 0);
  const minor = Number(minorStr || 0);

  const candidates: Array<'--permission' | '--experimental-permission'> =
    major > 22 || (major === 22 && minor >= 13)
      ? ['--permission', '--experimental-permission']
      : major >= 20
        ? ['--experimental-permission', '--permission']
        : [];

  for (const flag of candidates) {
    try {
      const probe = spawnSync(process.execPath, [flag, '-e', '0'], {
        stdio: 'ignore',
        timeout: 1500,
      });
      if (probe.status === 0) {
        cachedNodePermissionInfo = {
          supported: true,
          flag,
          nodeVersion,
          warning: null,
        };
        return cachedNodePermissionInfo;
      }
    } catch {
      // try next candidate
    }
  }

  cachedNodePermissionInfo = {
    supported: false,
    flag: null,
    nodeVersion,
    warning: `Figyelem: a futó Node.js (${nodeVersion}) nem támogatja a --permission izolációs modellt (Node 20+ szükséges).`,
  };
  return cachedNodePermissionInfo;
}

export function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

export function buildMinimalSandboxEnv(): Record<string, string> {
  return {
    PATH: '/sandbox-bin:/usr/local/bin:/usr/bin:/bin',
    HOME: '/sandbox',
    PWD: '/sandbox',
    TMPDIR: '/tmp',
    NOVASWARM_SANDBOX: '1',
  };
}

/**
 * Builds isolated Bubblewrap arguments with an empty tmpfs root (--tmpfs /),
 * ONLY minimal read-only runtime mounts (/usr, /lib, /lib64, /bin, node binary),
 * full namespace isolation (--unshare-all --new-session --die-with-parent),
 * cleared environment, and ONLY sandboxDir mounted writable at /sandbox.
 * Never binds project root, /home, /root, /etc, or credential/state files.
 */
export function buildBwrapBaseArgs(sandboxDir: string): {
  args: string[];
  nodeBinInSandbox: string;
} {
  const args: string[] = ['--tmpfs', '/'];

  if (fs.existsSync('/usr')) {
    args.push('--ro-bind', '/usr', '/usr');
  }

  for (const sysPath of ['/bin', '/lib', '/lib64', '/lib32']) {
    try {
      const st = fs.lstatSync(sysPath);
      if (st.isSymbolicLink()) {
        const target = fs.readlinkSync(sysPath);
        args.push('--symlink', target, sysPath);
      } else if (st.isDirectory()) {
        args.push('--ro-bind', sysPath, sysPath);
      }
    } catch {
      // path absent on host
    }
  }

  let nodeBinInSandbox = '/usr/local/bin/node';
  try {
    const realNode = fs.realpathSync(process.execPath);
    if (realNode.startsWith('/usr/') || realNode.startsWith('/bin/')) {
      nodeBinInSandbox = realNode;
    } else {
      args.push('--dir', '/sandbox-bin', '--ro-bind', realNode, '/sandbox-bin/node');
      nodeBinInSandbox = '/sandbox-bin/node';
    }
  } catch {
    nodeBinInSandbox = process.execPath;
  }

  args.push(
    '--dev',
    '/dev',
    '--proc',
    '/proc',
    '--tmpfs',
    '/tmp',
    '--bind',
    sandboxDir,
    '/sandbox',
    '--chdir',
    '/sandbox',
    '--unshare-all',
    '--die-with-parent',
    '--new-session',
    '--clearenv',
    '--setenv',
    'PATH',
    '/sandbox-bin:/usr/local/bin:/usr/bin:/bin',
    '--setenv',
    'HOME',
    '/sandbox',
    '--setenv',
    'PWD',
    '/sandbox',
    '--setenv',
    'TMPDIR',
    '/tmp',
    '--setenv',
    'NOVASWARM_SANDBOX',
    '1'
  );

  return { args, nodeBinInSandbox };
}

export function buildBwrapSandboxJsArgs(params: {
  sandboxDir: string;
  nodeArgs: string[];
}): { command: string; args: string[]; nodeBinInSandbox: string } {
  const { args: baseArgs, nodeBinInSandbox } = buildBwrapBaseArgs(params.sandboxDir);
  return {
    command: 'bwrap',
    nodeBinInSandbox,
    args: [...baseArgs, '--', nodeBinInSandbox, ...params.nodeArgs, '/sandbox/runner.mjs'],
  };
}

export function buildDockerSandboxJsArgs(params: {
  sandboxDir: string;
  nodeArgs: string[];
}): { command: string; args: string[] } {
  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--pids-limit=32',
      '--memory=128m',
      '--cpus=0.5',
      '--security-opt=no-new-privileges',
      '--user',
      'nobody',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '-e',
      'PATH=/usr/local/bin:/usr/bin:/bin',
      '-e',
      'HOME=/sandbox',
      '-e',
      'PWD=/sandbox',
      '-e',
      'TMPDIR=/tmp',
      '-e',
      'NOVASWARM_SANDBOX=1',
      '-v',
      `${params.sandboxDir}:/sandbox:ro`,
      '-w',
      '/sandbox',
      'node:22-alpine',
      'node',
      ...params.nodeArgs,
      '/sandbox/runner.mjs',
    ],
  };
}

export function isBwrapAvailable(): boolean {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-bwrap-probe-'));
  try {
    const { args } = buildBwrapBaseArgs(probeDir);
    const res = spawnSync('bwrap', [...args, '--', 'true'], {
      stdio: 'ignore',
      timeout: 1500,
    });
    return res.status === 0;
  } catch {
    return false;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

export function isUnshareNetAvailable(): boolean {
  try {
    const res = spawnSync('unshare', ['-rn', 'true'], { stdio: 'ignore', timeout: 1500 });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Strong isolation check strictly for untrusted dynamic JS execution (`sandbox_js`).
 * NEVER falls back to unshare or plain subprocess.
 */
export function detectStrongJsSandboxBackend(): StrongSandboxBackend | null {
  if (isDockerAvailable()) return 'docker_no_network';
  if (isBwrapAvailable()) return 'bwrap_sandbox';
  return null;
}

/**
 * Supervisor dry-run isolation check (may use unshare or stripped tmpfs subprocess for trusted dry-runs).
 */
export function detectActiveSandboxBackend(): SandboxIsolationMode {
  const strong = detectStrongJsSandboxBackend();
  if (strong) return strong;
  if (isUnshareNetAvailable()) return 'unshare_net_sandbox';
  return 'isolated_tmpfs_subprocess';
}

export function getSandboxCapabilities(): SandboxCapabilities {
  const supervisorBackend = detectActiveSandboxBackend();
  const strong = detectStrongJsSandboxBackend();
  const perm = detectNodePermissionSupport();
  let warning: string | null = null;
  if (!strong) {
    warning =
      'Nincs elérhető valódi izolációs backend (Docker vagy Bubblewrap / bwrap) — a sandbox_js futtatás biztonsági okból letiltva.';
  } else if (perm.warning) {
    warning = perm.warning;
  }
  return {
    supervisorBackend,
    jsSandboxBackend: strong ?? 'unavailable',
    jsSandboxAvailable: strong !== null,
    nodeVersion: perm.nodeVersion,
    nodePermissionFlag: perm.flag,
    nodePermissionSupported: perm.supported,
    warning,
  };
}

export function buildSandboxJsNodeArgs(opts?: {
  sandboxMountRoot?: string;
  permissionOverride?: NodePermissionSupportInfo;
}): { args: string[]; permissionWarning: string | null } {
  const mountRoot = opts?.sandboxMountRoot || '/sandbox';
  const perm = opts?.permissionOverride ?? detectNodePermissionSupport();
  const args = ['--disallow-code-generation-from-strings', '--max-old-space-size=64'];
  if (perm.supported && perm.flag) {
    args.push(
      perm.flag,
      `--allow-fs-read=${mountRoot}/runner.mjs`,
      `--allow-fs-read=${mountRoot}/input.json`,
      `--allow-fs-read=${mountRoot}/user-fn.mjs`
    );
  }
  return { args, permissionWarning: perm.warning };
}

export function parseStrictSandboxJsonOutput(rawStdout: string): {
  ok: boolean;
  value: unknown;
  wasUndefined: boolean;
  logs: string[];
} {
  const bounded = String(rawStdout || '').slice(0, MAX_SANDBOX_STDOUT_BYTES).trim();
  if (!bounded) {
    throw new Error('Sandbox nem adott vissza JSON kimenetet.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bounded);
  } catch {
    throw new Error('Sandbox érvénytelen (nem JSON) kimenetet adott vissza.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Sandbox kimenet formátuma hibás (JSON objektum szükséges).');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok !== true) {
    throw new Error(typeof obj.error === 'string' ? obj.error : 'Sandbox végrehajtási hiba.');
  }
  const logs = Array.isArray(obj.logs)
    ? obj.logs.map((entry) => String(entry).slice(0, MAX_SANDBOX_OUTPUT_CHARS)).slice(0, 50)
    : [];
  return {
    ok: true,
    value: obj.value,
    wasUndefined: obj.wasUndefined === true,
    logs,
  };
}

/**
 * Hardened `sandbox_js` execution engine.
 * - Requires real isolation (`docker_no_network` or `bwrap_sandbox`). Refuses execution otherwise.
 * - Uses 2-file ESM harness (`runner.mjs` + `user-fn.mjs`) with `node:module` `registerHooks` blocking ALL module imports (comments or dynamic strings cannot bypass it).
 * - Adds `--disallow-code-generation-from-strings`, `--max-old-space-size=64`, and Node `--permission` (when supported).
 * - Parses stdout exclusively as bounded JSON.
 */
export function runStrictJsSandbox(params: {
  userCode: string;
  inputData?: Record<string, unknown>;
  timeoutMs?: number;
  _testBackendOverride?: StrongSandboxBackend | null;
  _testMockExecutor?: StrictJsSandboxMockExecutor;
}): StrictJsSandboxExecutionResult {
  const backend =
    params._testBackendOverride !== undefined
      ? params._testBackendOverride
      : detectStrongJsSandboxBackend();

  if (!backend) {
    const errMsg =
      'A sandbox_js futtatás megtagadva: nincs elérhető valódi izolációs backend (Docker vagy Bubblewrap / bwrap szükséges; unshare vagy sima alfolyamat nem engedélyezett).';
    appendAuditLog({
      type: 'security',
      sourceAgentId: 'sandbox-js',
      sourceAgentName: 'JS Sandbox Őr',
      message: errMsg,
      verifiedExecution: false,
    });
    return {
      ok: false,
      isolationMode: 'unavailable',
      code: 'NO_SANDBOX_BACKEND',
      logs: [],
      stderr: errMsg,
      warning: null,
      error: errMsg,
    };
  }

  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-jsbox-'));
  try {
    fs.chmodSync(sandboxDir, 0o755);
    const clonedInput = structuredClone(params.inputData ?? { sample: 42 });
    const inputPath = path.join(sandboxDir, 'input.json');
    const userFnPath = path.join(sandboxDir, 'user-fn.mjs');
    const runnerPath = path.join(sandboxDir, 'runner.mjs');

    fs.writeFileSync(inputPath, JSON.stringify(clonedInput), { encoding: 'utf8', mode: 0o644 });
    fs.writeFileSync(
      userFnPath,
      [
        'export default function runUntrustedSandboxUserFn(input, ARGS, console) {',
        '  "use strict";',
        '  const process = undefined, require = undefined, module = undefined, exports = undefined;',
        '  const global = undefined, globalThis = undefined, Buffer = undefined, Function = undefined;',
        params.userCode,
        '}',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o644 }
    );

    const runnerScript = [
      "import fs from 'node:fs';",
      "import { registerHooks } from 'node:module';",
      'const __realStdoutWrite = process.stdout.write.bind(process.stdout);',
      'const __rawInput = JSON.parse(fs.readFileSync(\'./input.json\', \'utf8\'));',
      'let __userFnLoaded = false;',
      'registerHooks({',
      '  resolve(specifier, context, nextResolve) {',
      "    if (!__userFnLoaded && (specifier === './user-fn.mjs' || specifier.endsWith('/user-fn.mjs'))) {",
      '      __userFnLoaded = true;',
      '      return nextResolve(specifier, context);',
      '    }',
      "    throw new Error('Modulbetöltés (import) tiltott a sandboxban: ' + specifier);",
      '  },',
      '});',
      "for (const k of ['process', 'global', 'Buffer', 'setTimeout', 'setInterval', 'setImmediate', 'fetch', 'eval', 'Function']) {",
      '  try {',
      '    Object.defineProperty(globalThis, k, { value: undefined, writable: false, configurable: false });',
      '  } catch {}',
      '}',
      'const __logs = [];',
      'let __logsLen = 0;',
      'const __appendLog = (...parts) => {',
      "  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');",
      '  if (__logsLen < 4000) {',
      '    const chunk = line.slice(0, Math.max(0, 4000 - __logsLen));',
      '    __logs.push(chunk);',
      '    __logsLen += chunk.length;',
      '  }',
      '};',
      'const __safeConsole = Object.freeze({ log: __appendLog, info: __appendLog, warn: __appendLog, error: __appendLog });',
      'try {',
      "  Object.defineProperty(globalThis, 'console', { value: __safeConsole, writable: false, configurable: false });",
      '} catch {}',
      "const __mod = await import('./user-fn.mjs');",
      'const __val = __mod.default(__rawInput, __rawInput, __safeConsole);',
      "if (__val && typeof __val.then === 'function') {",
      "  throw new Error('Aszinkron Promise visszatérés nem támogatott a sandboxban.');",
      '}',
      '__realStdoutWrite(JSON.stringify({ ok: true, value: __val ?? null, wasUndefined: __val === undefined, logs: __logs }).slice(0, 65000) + \'\\n\');',
    ].join('\n');

    fs.writeFileSync(runnerPath, runnerScript, { encoding: 'utf8', mode: 0o644 });

    const { args: nodeArgs, permissionWarning } = buildSandboxJsNodeArgs({
      sandboxMountRoot: '/sandbox',
    });
    if (permissionWarning) {
      console.warn(`[NovaSwarm BIZTONSÁG] ${permissionWarning}`);
    }

    const minimalEnv = buildMinimalSandboxEnv();
    const spec =
      backend === 'docker_no_network'
        ? buildDockerSandboxJsArgs({ sandboxDir, nodeArgs })
        : buildBwrapSandboxJsArgs({ sandboxDir, nodeArgs });

    const timeoutMs = params.timeoutMs ?? 2000;
    const rawRes = params._testMockExecutor
      ? params._testMockExecutor({
          backend,
          sandboxDir,
          command: spec.command,
          args: spec.args,
          env: minimalEnv,
          runnerPath,
          inputPath,
          userFnPath,
        })
      : spawnSync(spec.command, spec.args, {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          env: minimalEnv,
          maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
        });

    const cappedStderr = String(rawRes.stderr || rawRes.error?.message || '')
      .slice(0, MAX_SANDBOX_STDERR_BYTES)
      .slice(0, MAX_SANDBOX_OUTPUT_CHARS)
      .trim();

    if (rawRes.error || rawRes.status !== 0) {
      const errDetail = cappedStderr || `Sandbox kilépési kód: ${rawRes.status ?? 1}`;
      return {
        ok: false,
        isolationMode: backend,
        code: 'SANDBOX_EXECUTION_ERROR',
        logs: [],
        stderr: errDetail,
        warning: permissionWarning,
        error: errDetail,
      };
    }

    try {
      const parsed = parseStrictSandboxJsonOutput(rawRes.stdout || '');
      return {
        ok: true,
        isolationMode: backend,
        value: parsed.value,
        wasUndefined: parsed.wasUndefined,
        logs: parsed.logs,
        stderr: cappedStderr,
        warning: permissionWarning,
      };
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        ok: false,
        isolationMode: backend,
        code: 'SANDBOX_INVALID_OUTPUT',
        logs: [],
        stderr: cappedStderr || errMsg,
        warning: permissionWarning,
        error: errMsg,
      };
    }
  } finally {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
}

/**
 * Supervisor Dry-Run / Sandbox Environment (Section 10.3 & 13.3).
 * Creates an isolated ephemeral copy in OS tmpdir/tmpfs and executes trusted dry-run
 * commands/scripts using Docker (`--network=none`), hardened Bubblewrap (`--tmpfs /`),
 * Linux `unshare -rn`, or a stripped-env subprocess confined to the ephemeral temp copy.
 * NOTE: Untrusted `sandbox_js` MUST NEVER use this function — use `runStrictJsSandbox` instead.
 */
export function runInSupervisorSandbox(params: {
  scriptOrCommand: string;
  isNodeScript?: boolean;
  nodeArgs?: string[];
  seedFiles?: Record<string, string>;
  realProtectedPaths?: string[];
  timeoutMs?: number;
}): SandboxExecutionResult {
  const startedAt = Date.now();
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-sandbox-'));

  try {
    fs.chmodSync(sandboxDir, 0o755);
    const seed = params.seedFiles ?? {
      'sample.txt': 'sandbox-fixture-data',
      'config.json': '{"env":"sandbox"}',
    };
    for (const [relPath, content] of Object.entries(seed)) {
      const target = path.join(sandboxDir, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { encoding: 'utf8', mode: 0o644 });
    }

    const protectedChecksums = new Map<string, boolean>();
    for (const p of params.realProtectedPaths ?? []) {
      protectedChecksums.set(p, fs.existsSync(p));
    }

    const timeoutMs = params.timeoutMs ?? 5000;
    let exitCode = 1;
    let stdout = '';
    let stderr = '';
    const backend = detectActiveSandboxBackend();
    let isolationMode: SandboxIsolationMode = backend;

    const strippedEnv = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: sandboxDir,
      PWD: sandboxDir,
      TMPDIR: sandboxDir,
      NOVASWARM_SANDBOX: '1',
    };

    const safeNodeArgs = (params.nodeArgs || []).filter((a) =>
      /^--[a-z0-9-]+(=[a-z0-9_./=-]+)?$/i.test(a)
    );

    if (params.isNodeScript) {
      const candidateFile = path.join(sandboxDir, 'candidate.mjs');
      fs.writeFileSync(candidateFile, params.scriptOrCommand, { encoding: 'utf8', mode: 0o644 });
      if (backend === 'docker_no_network') {
        const res = spawnSync(
          'docker',
          [
            'run',
            '--rm',
            '--network=none',
            '--read-only',
            '--cap-drop=ALL',
            '--pids-limit=32',
            '--memory=128m',
            '--cpus=0.5',
            '--user',
            'nobody',
            '--tmpfs',
            '/tmp:rw,noexec,nosuid,size=16m',
            '-v',
            `${sandboxDir}:/sandbox:rw`,
            '-w',
            '/sandbox',
            'node:22-alpine',
            'node',
            ...safeNodeArgs,
            '/sandbox/candidate.mjs',
          ],
          { encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: MAX_SANDBOX_STDOUT_BYTES }
        );
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else if (backend === 'bwrap_sandbox') {
        const { args: bwrapBase, nodeBinInSandbox } = buildBwrapBaseArgs(sandboxDir);
        const res = spawnSync(
          'bwrap',
          [...bwrapBase, '--', nodeBinInSandbox, ...safeNodeArgs, '/sandbox/candidate.mjs'],
          {
            encoding: 'utf8',
            timeout: timeoutMs,
            killSignal: 'SIGKILL',
            env: buildMinimalSandboxEnv(),
            maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
          }
        );
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else if (backend === 'unshare_net_sandbox') {
        const res = spawnSync('unshare', ['-rn', process.execPath, ...safeNodeArgs, candidateFile], {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          env: strippedEnv,
          maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
        });
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else {
        isolationMode = 'isolated_tmpfs_subprocess';
        const res = spawnSync(process.execPath, [...safeNodeArgs, candidateFile], {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          env: strippedEnv,
          maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
        });
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      }
    } else {
      if (backend === 'docker_no_network') {
        const res = spawnSync(
          'docker',
          [
            'run',
            '--rm',
            '--network=none',
            '--read-only',
            '--cap-drop=ALL',
            '--pids-limit=32',
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
          { encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: MAX_SANDBOX_STDOUT_BYTES }
        );
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else if (backend === 'bwrap_sandbox') {
        const { args: bwrapBase } = buildBwrapBaseArgs(sandboxDir);
        const res = spawnSync('bwrap', [...bwrapBase, '--', 'sh', '-c', params.scriptOrCommand], {
          encoding: 'utf8',
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          env: buildMinimalSandboxEnv(),
          maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
        });
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else if (backend === 'unshare_net_sandbox') {
        const res = spawnSync('unshare', ['-rn', 'sh', '-c', params.scriptOrCommand], {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          env: strippedEnv,
          maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
        });
        exitCode = res.status ?? 1;
        stdout = res.stdout ?? '';
        stderr = res.stderr ?? '';
      } else {
        isolationMode = 'isolated_tmpfs_subprocess';
        const res = spawnSync('sh', ['-c', params.scriptOrCommand], {
          cwd: sandboxDir,
          encoding: 'utf8',
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          env: { ...strippedEnv, PATH: '/usr/bin:/bin' },
          maxBuffer: MAX_SANDBOX_STDOUT_BYTES,
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
      stdout: stdout.slice(0, MAX_SANDBOX_OUTPUT_CHARS),
      stderr: stderr.slice(0, MAX_SANDBOX_OUTPUT_CHARS),
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
