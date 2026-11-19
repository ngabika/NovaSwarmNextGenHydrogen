import { spawn as cpSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { WebSocket } from 'ws';
import { assertHostPermission } from '../security/permissionGate';
import { appendAuditLog } from '../state/store';

interface PtyLikeProcess {
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (ev: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

type NodePtyModule = {
  spawn: (
    file: string,
    args: string[],
    opts: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }
  ) => PtyLikeProcess;
};

let cachedNodePty: NodePtyModule | null | undefined;

function getNodePty(): NodePtyModule | null {
  if (cachedNodePty !== undefined) return cachedNodePty;
  try {
    const req = createRequire(import.meta.url);
    cachedNodePty = req('node-pty') as NodePtyModule;
  } catch (err) {
    console.warn(
      '[NovaSwarm PTY] node-pty natív modul nem tölthető be, pipe-shell fallback aktív:',
      err instanceof Error ? err.message : String(err)
    );
    cachedNodePty = null;
  }
  return cachedNodePty;
}

function spawnFallbackShell(shell: string, cwd: string): PtyLikeProcess {
  const child = cpSpawn(shell, ['-i'], {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(ev: { exitCode: number }) => void> = [];

  const emitData = (chunk: Buffer | string) => {
    const text = chunk.toString().replace(/\r?\n/g, '\r\n');
    for (const cb of dataListeners) cb(text);
  };
  child.stdout?.on('data', emitData);
  child.stderr?.on('data', emitData);
  child.on('exit', (code) => {
    for (const cb of exitListeners) cb({ exitCode: code ?? 0 });
  });

  setTimeout(() => {
    emitData('[NovaSwarm: pipe-shell fallback aktív (node-pty natív modul nélkül)]\n');
  }, 50);

  return {
    onData: (cb) => {
      dataListeners.push(cb);
    },
    onExit: (cb) => {
      exitListeners.push(cb);
    },
    write: (data) => {
      if (child.stdin?.writable) {
        child.stdin.write(data.replace(/\r/g, '\n'));
      }
    },
    resize: () => {
      // No-op in pipe fallback mode
    },
    kill: () => {
      child.kill('SIGTERM');
    },
  };
}

export interface TerminalSessionInfo {
  id: string;
  initiator: string;
  createdAt: string;
  cols: number;
  rows: number;
  shell: string;
}

interface InternalPtySession {
  info: TerminalSessionInfo;
  ptyProcess: PtyLikeProcess;
  clients: Set<WebSocket>;
  lineBuffer: string;
}

const sessions = new Map<string, InternalPtySession>();

export function listTerminalSessions(): TerminalSessionInfo[] {
  return Array.from(sessions.values()).map((s) => s.info);
}

export function createTerminalSession(params: {
  initiator: string;
  agentId?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
}): TerminalSessionInfo {
  // Enforce the exact same unified Host Permission Gate
  assertHostPermission('terminal_create_session', params.agentId);

  const id = `pty-${crypto.randomUUID().slice(0, 8)}`;
  const shell = process.env.SHELL || '/bin/bash';
  const cols = params.cols ?? 100;
  const rows = params.rows ?? 30;
  const cwd = params.cwd || process.cwd();

  const ptyMod = getNodePty();
  let ptyProcess: PtyLikeProcess;
  if (ptyMod) {
    try {
      ptyProcess = ptyMod.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: process.env as Record<string, string>,
      });
    } catch {
      ptyProcess = spawnFallbackShell(shell, cwd);
    }
  } else {
    ptyProcess = spawnFallbackShell(shell, cwd);
  }

  const info: TerminalSessionInfo = {
    id,
    initiator: params.initiator,
    createdAt: new Date().toISOString(),
    cols,
    rows,
    shell,
  };

  const session: InternalPtySession = {
    info,
    ptyProcess,
    clients: new Set(),
    lineBuffer: '',
  };

  ptyProcess.onData((data) => {
    for (const ws of session.clients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'output', sessionId: id, data }));
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    for (const ws of session.clients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'exit', sessionId: id, exitCode }));
      }
    }
    sessions.delete(id);
  });

  sessions.set(id, session);

  appendAuditLog({
    type: 'terminal',
    sourceAgentId: params.agentId || 'user',
    sourceAgentName: params.initiator,
    message: `Interaktív terminál session indítva (${id}, shell: ${shell})`,
    verifiedExecution: true,
  });

  return info;
}

export function writeToTerminalSession(sessionId: string, data: string, actor = 'Felhasználó', agentId?: string): void {
  assertHostPermission('terminal_write', agentId);
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Terminál session nem található: ${sessionId}`);
  }

  // Record executed command lines (not individual keystrokes) into AuditLog (Section 9.5)
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      const cmd = session.lineBuffer.trim();
      session.lineBuffer = '';
      if (cmd.length > 0) {
        appendAuditLog({
          type: 'terminal',
          sourceAgentId: agentId || 'user',
          sourceAgentName: actor,
          message: `[${sessionId}] $ ${cmd}`,
          verifiedExecution: true,
        });
      }
    } else if (ch === '\u007f' || ch === '\b') {
      session.lineBuffer = session.lineBuffer.slice(0, -1);
    } else if (ch >= ' ') {
      session.lineBuffer += ch;
    }
  }

  session.ptyProcess.write(data);
}

export function resizeTerminalSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  const safeCols = Math.max(20, Math.min(300, Math.floor(cols)));
  const safeRows = Math.max(5, Math.min(120, Math.floor(rows)));
  session.info.cols = safeCols;
  session.info.rows = safeRows;
  session.ptyProcess.resize(safeCols, safeRows);
}

export function attachWebSocketToSession(sessionId: string, ws: WebSocket): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.clients.add(ws);
  ws.on('close', () => {
    session.clients.delete(ws);
  });
}

export function closeTerminalSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    session.ptyProcess.kill();
  } catch {
    // ignore already exited
  }
  sessions.delete(sessionId);
}

export function closeAllTerminalSessions(): void {
  for (const id of Array.from(sessions.keys())) {
    closeTerminalSession(id);
  }
}
