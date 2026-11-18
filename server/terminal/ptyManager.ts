import crypto from 'node:crypto';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import { assertHostPermission } from '../security/permissionGate';
import { appendAuditLog } from '../state/store';

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
  ptyProcess: pty.IPty;
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
  // Enforce the exact same unified Host Permission Gate (Section 8.2 & 9.2)
  assertHostPermission('terminal_create_session', params.agentId);

  const id = `pty-${crypto.randomUUID().slice(0, 8)}`;
  const shell = process.env.SHELL || '/bin/bash';
  const cols = params.cols ?? 100;
  const rows = params.rows ?? 30;

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: params.cwd || process.cwd(),
    env: process.env as Record<string, string>,
  });

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
