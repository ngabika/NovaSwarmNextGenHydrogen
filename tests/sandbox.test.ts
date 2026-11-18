import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { executeHostCommandForAgent, hostReadFileForAgent, hostWriteFileForAgent } from '../server/agents/engine';
import { runDestructiveSandboxProof, runInSupervisorSandbox } from '../server/sandbox/supervisorSandbox';
import { assertHostPermission, HostPermissionDeniedError } from '../server/security/permissionGate';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

test('Unified Host Permission Gate blocks all host-touching operations when disabled and permits when enabled', () => {
  const state = createInitialState();
  state.settings.hostPermissionsGranted = false;
  resetInMemoryStateForTests(state);

  assert.throws(
    () => assertHostPermission('exec:ls'),
    (err: unknown) => err instanceof HostPermissionDeniedError && err.code === 'HOST_PERMISSION_DENIED'
  );

  const dummyAgent = {
    ...state.agents[0],
    id: 'user-agent-1',
    name: 'Test Agent',
    isSupervisor: false,
    hostExecutionEnabled: true,
  };

  assert.throws(
    () => executeHostCommandForAgent(dummyAgent, 'echo hi'),
    HostPermissionDeniedError
  );
  assert.throws(
    () => hostReadFileForAgent(dummyAgent.id, 'package.json'),
    HostPermissionDeniedError
  );
  assert.throws(
    () => hostWriteFileForAgent(dummyAgent.id, 'tmp-blocked.txt', 'data'),
    HostPermissionDeniedError
  );

  // Enable global host permission
  state.settings.hostPermissionsGranted = true;
  assert.doesNotThrow(() => assertHostPermission('exec:ls'));
});

test('Supervisor sandbox isolates destructive deletion commands and leaves real filesystem intact', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-test-sentinel-'));
  try {
    const proof = runDestructiveSandboxProof(sentinelDir);
    assert.equal(proof.proofPassed, true);
    assert.equal(proof.sentinelStillExists, true);
    assert.equal(fs.readFileSync(proof.sentinelFile, 'utf8'), 'MUST_NOT_BE_DELETED');
  } finally {
    fs.rmSync(sentinelDir, { recursive: true, force: true });
  }

  // Also test Node script validation inside Supervisor sandbox
  const nodeRun = runInSupervisorSandbox({
    isNodeScript: true,
    scriptOrCommand: 'console.log("SANDBOX_NODE_OK");',
  });
  assert.equal(nodeRun.passed, true);
  assert.match(nodeRun.stdout, /SANDBOX_NODE_OK/);
});
