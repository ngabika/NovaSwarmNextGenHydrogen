import assert from 'node:assert/strict';
import test from 'node:test';
import { HostPermissionDeniedError } from '../server/security/permissionGate';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';
import {
  closeAllTerminalSessions,
  createTerminalSession,
  listTerminalSessions,
  writeToTerminalSession,
} from '../server/terminal/ptyManager';

test('Terminal PTY sessions enforce unified Host Permission Gate, support multi-session, and audit executed commands', async () => {
  const state = createInitialState();
  state.settings.hostPermissionsGranted = false;
  resetInMemoryStateForTests(state);

  // Blocked when host permission is NOT granted
  assert.throws(
    () => createTerminalSession({ initiator: 'Felhasználó' }),
    HostPermissionDeniedError
  );

  // Grant host permission
  state.settings.hostPermissionsGranted = true;

  const s1 = createTerminalSession({ initiator: 'Felhasználó', cols: 80, rows: 24 });
  const s2 = createTerminalSession({ initiator: 'Rendszer Ágens', cols: 80, rows: 24 });

  try {
    const active = listTerminalSessions();
    assert.equal(active.length, 2);

    // Send a full command line (newline triggers terminal AuditLog entry, NOT individual keystrokes)
    writeToTerminalSession(s1.id, 'echo ', 'Felhasználó');
    const beforeEnterCount = state.auditLogs.filter((l) => l.type === 'terminal' && l.message.includes('echo')).length;
    assert.equal(beforeEnterCount, 0);

    writeToTerminalSession(s1.id, 'novaswarm-pty-ok\n', 'Felhasználó');
    const afterEnterLogs = state.auditLogs.filter(
      (l) => l.type === 'terminal' && l.message.includes('echo novaswarm-pty-ok')
    );
    assert.equal(afterEnterLogs.length, 1);
    assert.equal(afterEnterLogs[0].sourceAgentName, 'Felhasználó');
  } finally {
    closeAllTerminalSessions();
  }
});
