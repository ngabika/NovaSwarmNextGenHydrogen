import React, { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';
import type { LanguageCode } from '../../shared/types';
import { tr } from '../locales/translations';

export interface TerminalSessionSummary {
  id: string;
  initiator: string;
  createdAt: string;
  cols: number;
  rows: number;
  shell: string;
}

interface Props {
  language: LanguageCode;
  hostPermissionsGranted: boolean;
  sessions: TerminalSessionSummary[];
  onRefreshState: () => Promise<void>;
  onOpenSettings: () => void;
}

export const TerminalView: React.FC<Props> = ({
  language,
  hostPermissionsGranted,
  sessions,
  onRefreshState,
  onOpenSettings,
}) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    sessions[0]?.id ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (!hostPermissionsGranted || !containerRef.current || !activeSessionId) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      theme: {
        background: '#0b1120',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'attach', sessionId: activeSessionId }));
      ws.send(
        JSON.stringify({
          type: 'resize',
          sessionId: activeSessionId,
          cols: term.cols,
          rows: term.rows,
        })
      );
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type: string; data?: string; error?: string; exitCode?: number };
        if (msg.type === 'output' && msg.data) {
          term.write(msg.data);
        } else if (msg.type === 'error' && msg.error) {
          setError(msg.error);
          term.writeln(`\r\n[Permission/PTY Error] ${msg.error}`);
        } else if (msg.type === 'exit') {
          term.writeln(`\r\n[Session exited with code ${msg.exitCode ?? 0}]`);
          void onRefreshState();
        }
      } catch {
        // ignore non-json
      }
    };

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', sessionId: activeSessionId, data }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            sessionId: activeSessionId,
            cols: term.cols,
            rows: term.rows,
          })
        );
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      dataDisposable.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [hostPermissionsGranted, activeSessionId, onRefreshState]);

  const handleCreateSession = async () => {
    setError(null);
    try {
      const res = await fetch('/api/terminal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initiator: 'Felhasználó', cols: 100, rows: 30 }),
      });
      const data = (await res.json()) as { session?: TerminalSessionSummary; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to create PTY session');
      if (data.session) {
        setActiveSessionId(data.session.id);
      }
      await onRefreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCloseSession = async (id: string) => {
    await fetch(`/api/terminal/sessions/${id}`, { method: 'DELETE' });
    if (activeSessionId === id) setActiveSessionId(null);
    await onRefreshState();
  };

  if (!hostPermissionsGranted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-2xl">
        <div className="flex items-start gap-4">
          <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {tr(language, 'terminalLockedTitle')}
            </h2>
            <p className="text-sm text-slate-600">{tr(language, 'terminalLockedDesc')}</p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {tr(language, 'navSettings')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {sessions.length === 0 ? (
            <span className="text-xs text-slate-500">Nincs aktív PTY munkamenet. Indíts egyet a gombbal.</span>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSessionId(s.id)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeSessionId === s.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s.id} · {s.initiator}
                </button>
                <button
                  type="button"
                  aria-label={`Close terminal session ${s.id}`}
                  onClick={() => handleCloseSession(s.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={handleCreateSession}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          {tr(language, 'terminalNewSession')}
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-3 min-h-[460px]">
        {activeSessionId ? (
          <div ref={containerRef} className="w-full h-[440px]" data-testid="xterm-container" />
        ) : (
          <div className="h-[440px] flex flex-col items-center justify-center text-slate-400 text-sm gap-2 px-6 text-center">
            <p>Valódi Linux PTY terminál (node-pty + xterm.js). Teljes képernyős CLI programok is támogatottak.</p>
            <p className="text-xs text-slate-500">Kattints a fenti {tr(language, 'terminalNewSession')} gombra egy interaktív shell indításához.</p>
          </div>
        )}
      </div>
    </div>
  );
};
