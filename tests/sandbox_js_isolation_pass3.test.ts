import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAgent, executeHostCommandForAgent } from '../server/agents/engine';
import {
  createAndSelfTestDynamicTool,
  executeIsolatedJsInSubprocess,
  SandboxBackendUnavailableError,
} from '../server/power/batch5AutonomyEngine';
import { executeDynamicTool } from '../server/power/universalSuite';
import {
  buildBwrapBaseArgs,
  buildDockerSandboxJsArgs,
  buildMinimalSandboxEnv,
  buildSandboxJsNodeArgs,
  detectNodePermissionSupport,
  detectStrongJsSandboxBackend,
  getSandboxCapabilities,
  parseStrictSandboxJsonOutput,
  runStrictJsSandbox,
  type StrictJsSandboxMockExecutor,
} from '../server/sandbox/supervisorSandbox';
import { parseSafeAllowlistedHostCommand, resolveWorkspacePathForAllowlist } from '../server/security/permissionGate';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

function createNodePermissionRuntimeExecutor(): StrictJsSandboxMockExecutor {
  return (ctx) => {
    const { args: localNodeArgs } = buildSandboxJsNodeArgs({
      sandboxMountRoot: ctx.sandboxDir,
    });
    const res = spawnSync(process.execPath, [...localNodeArgs, ctx.runnerPath], {
      cwd: ctx.sandboxDir,
      encoding: 'utf8',
      timeout: 3000,
      killSignal: 'SIGKILL',
      env: ctx.env,
    });
    return {
      status: res.status,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      error: res.error,
    };
  };
}

test('Pass 3 Fix 1 & 2: Missing docker/bwrap causes immediate sandbox_js refusal (no unshare/subprocess fallback)', async () => {
  resetInMemoryStateForTests(createInitialState());

  const sb = runStrictJsSandbox({
    userCode: 'return 21 * 2;',
    inputData: { sample: 21 },
    _testBackendOverride: null,
  });
  assert.equal(sb.ok, false);
  assert.equal(sb.code, 'NO_SANDBOX_BACKEND');
  assert.equal(sb.isolationMode, 'unavailable');
  assert.match(sb.error || '', /Docker vagy Bubblewrap/);

  assert.throws(
    () => executeIsolatedJsInSubprocess('return 1 + 1;', {}, { _testBackendOverride: null }),
    SandboxBackendUnavailableError
  );

  await assert.rejects(
    () =>
      createAndSelfTestDynamicTool({
        name: 'refused_without_backend',
        description: 'Backend nélküli tiltás teszt',
        kind: 'sandbox_js',
        targetOrCode: 'return 1 + 1;',
        _testBackendOverride: null,
      }),
    /Docker vagy Bubblewrap/
  );

  const dynRes = await executeDynamicTool(
    {
      id: 'dyn-no-backend',
      name: 'dyn_no_backend',
      description: 'No backend check',
      kind: 'sandbox_js',
      targetOrCode: 'return 42;',
      enabled: true,
      createdAt: new Date().toISOString(),
    },
    {},
    fetch,
    { _testBackendOverride: null }
  );
  assert.equal(dynRes.ok, false);
  assert.match(dynRes.output, /Docker vagy Bubblewrap/);

  if (!detectStrongJsSandboxBackend()) {
    const liveRefusal = runStrictJsSandbox({ userCode: 'return 42;' });
    assert.equal(liveRefusal.ok, false);
    assert.equal(liveRefusal.code, 'NO_SANDBOX_BACKEND');
  }
});

test('Pass 3 Fix 2: Real Docker/bwrap container sandbox_js verification (skipped if backend missing)', async (t) => {
  const realBackend = detectStrongJsSandboxBackend();
  if (!realBackend) {
    t.skip('SKIPPED: Sem docker, sem bwrap nincs telepítve ebben a környezetben; a valós konténeres futtatás éles Pi/Linux gépen ellenőrzendő.');
    return;
  }

  const probeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-pass3-real-'));
  const pwnedFile = path.join(probeTmp, 'pwned');
  const fakeEnv = path.join(probeTmp, '.env.test');
  fs.writeFileSync(fakeEnv, 'TOP_SECRET_PROBE=pass3-secret\n', 'utf8');

  try {
    const okRes = runStrictJsSandbox({
      userCode: 'return Number(input.sample) * 2;',
      inputData: { sample: 21 },
    });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.value, 42);

    const bypass1 = runStrictJsSandbox({
      userCode: `return import/**/('node:child_process').then(m => m.execSync('touch ${pwnedFile}'));`,
    });
    assert.equal(bypass1.ok, false);
    assert.equal(fs.existsSync(pwnedFile), false);

    const bypass2 = runStrictJsSandbox({
      userCode: `return import /*x*/ ('node:fs').then(m => m.readFileSync(${JSON.stringify(fakeEnv)}, 'utf8'));`,
    });
    assert.equal(bypass2.ok, false);
    assert.equal((bypass2.stderr || '').includes('TOP_SECRET_PROBE'), false);
  } finally {
    fs.rmSync(probeTmp, { recursive: true, force: true });
  }
});

test('Pass 3 Fix 1, 2, 3 & 5: Mock-backend verifies bwrap/docker args, Node --permission + registerHooks block comment import() bypass & secret reads, JSON output enforced', () => {
  const probeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-pass3-mock-'));
  const pwnedFsFile = path.join(probeTmp, 'pwned-fs');
  const pwnedCpFile = path.join(probeTmp, 'pwned-cp');
  const pwnedBreakoutFile = path.join(probeTmp, 'pwned-breakout');
  const fakeEnvFile = path.join(probeTmp, '.env');
  const fakeKeyFile = path.join(probeTmp, '.secrets.key');
  const fakeStateFile = path.join(probeTmp, '.state.json');
  fs.writeFileSync(fakeEnvFile, 'API_KEY=PASS3_TEST_SECRET_ENV\n', 'utf8');
  fs.writeFileSync(fakeKeyFile, 'PASS3_TEST_SECRET_KEY\n', 'utf8');
  fs.writeFileSync(fakeStateFile, '{"secret":"PASS3_TEST_SECRET_STATE"}\n', 'utf8');

  try {
    // 1. Validate bwrap args never bind host workspace, /home, /root, or secret files
    const bwrap = buildBwrapBaseArgs(probeTmp);
    const joinedBwrap = bwrap.args.join(' ');
    assert.ok(bwrap.args.includes('--tmpfs'));
    assert.ok(bwrap.args.includes('--unshare-all'));
    assert.ok(bwrap.args.includes('--die-with-parent'));
    assert.ok(bwrap.args.includes('--new-session'));
    assert.ok(bwrap.args.includes('--clearenv'));
    assert.equal(joinedBwrap.includes('--ro-bind / /'), false);
    assert.equal(bwrap.args.includes(process.cwd()), false);
    assert.equal(bwrap.args.includes('/home'), false);
    assert.equal(bwrap.args.includes('/root'), false);

    // 2. Validate Docker isolation flags
    const docker = buildDockerSandboxJsArgs({ sandboxDir: probeTmp, nodeArgs: ['--disallow-code-generation-from-strings'] });
    assert.ok(docker.args.includes('--network=none'));
    assert.ok(docker.args.includes('--read-only'));
    assert.ok(docker.args.includes('--cap-drop=ALL'));
    assert.ok(docker.args.includes('--pids-limit=32'));
    assert.ok(docker.args.includes('--memory=128m'));
    assert.ok(docker.args.includes('nobody'));
    assert.ok(docker.args.includes(`${probeTmp}:/sandbox:ro`));

    // 3. Validate minimal env inherits zero host secrets
    const minEnv = buildMinimalSandboxEnv();
    assert.equal(Object.keys(minEnv).includes('TELEGRAM_BOT_TOKEN'), false);
    assert.equal(Object.keys(minEnv).includes('NOVASWARM_MASTER_KEY'), false);

    // 4. Verify runtime Node --permission support detection + direct FS read refusal outside allowlisted files
    const permInfo = detectNodePermissionSupport();
    assert.equal(permInfo.supported, true, `Node ${process.versions.node} should support --permission`);
    const permReadProbe = spawnSync(
      process.execPath,
      [
        permInfo.flag!,
        `--allow-fs-read=${probeTmp}/only-allowed-placeholder.json`,
        '-e',
        `const fs = require('node:fs'); try { console.log(fs.readFileSync(${JSON.stringify(fakeEnvFile)}, 'utf8')); } catch (e) { console.error(e.code); process.exit(42); }`,
      ],
      { encoding: 'utf8', env: minEnv }
    );
    assert.equal(permReadProbe.status, 42);
    assert.match(permReadProbe.stderr || '', /ERR_ACCESS_DENIED/);
    assert.equal((permReadProbe.stdout || '').includes('PASS3_TEST_SECRET_ENV'), false);

    // 5. Run strict sandbox via mock executor + real Node --permission + registerHooks
    const mockExecutor = createNodePermissionRuntimeExecutor();

    // Comment-obfuscated dynamic import('node:fs') MUST NOT bypass registerHooks or create host file
    const fsCommentBypass = runStrictJsSandbox({
      userCode: `return import/**/('node:fs').then(m => m.writeFileSync(${JSON.stringify(pwnedFsFile)}, 'pwned'));`,
      _testBackendOverride: 'bwrap_sandbox',
      _testMockExecutor: mockExecutor,
    });
    assert.equal(fsCommentBypass.ok, false);
    assert.equal(fs.existsSync(pwnedFsFile), false, 'import/**/("node:fs") MUST NOT write to host');

    // Comment-obfuscated dynamic import('node:child_process') MUST NOT execute commands
    const cpCommentBypass = runStrictJsSandbox({
      userCode: `return import /*x*/ ('node:child_process').then(m => m.execSync(${JSON.stringify(`touch ${pwnedCpFile}`)}));`,
      _testBackendOverride: 'bwrap_sandbox',
      _testMockExecutor: mockExecutor,
    });
    assert.equal(cpCommentBypass.ok, false);
    assert.equal(fs.existsSync(pwnedCpFile), false, 'import /*x*/ ("node:child_process") MUST NOT run commands');

    // Static ESM import syntax-breakout MUST NOT load node:fs
    const syntaxBreakout = runStrictJsSandbox({
      userCode: `return 1; }\nimport fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(pwnedBreakoutFile)}, 'pwned');\nexport function _unused() {`,
      _testBackendOverride: 'bwrap_sandbox',
      _testMockExecutor: mockExecutor,
    });
    assert.equal(syntaxBreakout.ok, false);
    assert.equal(fs.existsSync(pwnedBreakoutFile), false);

    // Non-JSON stdout is rejected
    assert.throws(() => parseStrictSandboxJsonOutput('non-json-stdout-from-attacker'), /nem JSON/);

    // Legitimate pure computation & console logs pass with strict JSON parsing
    let capturedCommandArgs: string[] = [];
    const validRes = runStrictJsSandbox({
      userCode: 'console.log(Number(ARGS.a) + Number(ARGS.b)); return Number(input.sample) * 2;',
      inputData: { sample: 42, a: 17, b: 25 },
      _testBackendOverride: 'bwrap_sandbox',
      _testMockExecutor: (ctx) => {
        capturedCommandArgs = ctx.args;
        return mockExecutor(ctx);
      },
    });
    assert.equal(validRes.ok, true);
    assert.equal(validRes.value, 84);
    assert.deepEqual(validRes.logs, ['42']);
    assert.ok(capturedCommandArgs.includes('--tmpfs'));
    assert.ok(capturedCommandArgs.includes('--unshare-all'));
    assert.ok(capturedCommandArgs.some((a) => a.startsWith('--allow-fs-read=/sandbox/runner.mjs')));

    // Capabilities object reports consistent status
    const caps = getSandboxCapabilities();
    assert.equal(typeof caps.jsSandboxAvailable, 'boolean');
    assert.equal(caps.nodePermissionSupported, true);
  } finally {
    fs.rmSync(probeTmp, { recursive: true, force: true });
  }
});

test('Pass 3 Fix 6 (Alacsony): permissionGate blocks symlink pointing to .env or secret files in cat allowlist', async () => {
  const s = createInitialState();
  s.settings.hostPermissionsGranted = true;
  resetInMemoryStateForTests(s);

  const probeSecretName = `.env.pass3-symlink-probe-${process.pid}`;
  const probeSecretPath = path.join(process.cwd(), probeSecretName);
  const probeDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-symlink-probe-'));
  const symlinkRel = path.relative(process.cwd(), path.join(probeDir, 'harmless-notes.txt'));

  fs.writeFileSync(probeSecretPath, 'SYMLINK_SECRET=DO_NOT_READ\n', 'utf8');
  fs.symlinkSync(probeSecretPath, path.join(process.cwd(), symlinkRel));

  try {
    const resolved = resolveWorkspacePathForAllowlist(symlinkRel);
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.reason, /Védett rendszer- vagy titokfájlra mutató symlink blokkolva/);
    }

    const parsed = parseSafeAllowlistedHostCommand(`cat ${symlinkRel}`);
    assert.equal(parsed.allowed, false);
    if (!parsed.allowed) {
      assert.match(parsed.reason, /symlink/i);
    }

    const agent = createAgent({
      name: 'SymlinkTeszt',
      role: 'Tester',
      systemPrompt: 'test',
      hostExecutionEnabled: true,
    });

    const execResult = await executeHostCommandForAgent(agent, `cat ${symlinkRel}`);
    assert.equal(execResult.executed, false);
    assert.equal(execResult.pendingApproval, true);
    assert.equal(Boolean(execResult.approvalId), true);
    assert.equal(execResult.stdout.includes('SYMLINK_SECRET'), false);

    // Safe regular file in workspace still passes allowlist
    const safeParsed = parseSafeAllowlistedHostCommand('cat package.json');
    assert.equal(safeParsed.allowed, true);
    if (safeParsed.allowed) {
      assert.equal(safeParsed.bin, 'cat');
    }
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
    fs.rmSync(probeSecretPath, { force: true });
  }
});
