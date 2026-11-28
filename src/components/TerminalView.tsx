import React, { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Film, Plus, Send, ShieldAlert, Trash2, X } from 'lucide-react';
import { useLocale } from '../locales/translations';

export interface TerminalSessionSummary {
  id: string;
  initiator: string;
  createdAt: string;
  cols: number;
  rows: number;
  shell: string;
}

interface RecordingSummary {
  sessionId: string;
  initiator: string;
  shell: string;
  createdAt: string;
  frameCount: number;
  active: boolean;
}

interface RecordingFull extends RecordingSummary {
  frames: Array<{ offsetMs: number; dir: 'in' | 'out'; data: string }>;
}

interface Props {
  language?: string;
  hostPermissionsGranted: boolean;
  sessions: TerminalSessionSummary[];
  onRefreshState: () => Promise<void>;
  onOpenSettings: () => void;
  onSendToSwarm: (draftText: string) => void;
}

export const TerminalView: React.FC<Props> = ({
  hostPermissionsGranted,
  sessions,
  onRefreshState,
  onOpenSettings,
  onSendToSwarm,
}) => {
  const { t, tx } = useLocale();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    sessions[0]?.id ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [showRecordings, setShowRecordings] = useState(false);
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [activeRecording, setActiveRecording] = useState<RecordingFull | null>(null);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const loadRecordings = async () => {
    const r = await fetch('/api/terminal/recordings');
    if (r.ok) {
      const d = (await r.json()) as { recordings?: RecordingSummary[] };
      setRecordings(d.recordings || []);
    }
  };

  const openRecording = async (sessionId: string) => {
    const r = await fetch(`/api/terminal/recordings/${encodeURIComponent(sessionId)}`);
    if (r.ok) {
      const d = (await r.json()) as { recording?: RecordingFull };
      if (d.recording) {
        setActiveRecording(d.recording);
        setReplayIndex(Math.max(0, d.recording.frames.length - 1));
      }
    }
  };

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
        body: JSON.stringify({ initiator: tx('Felhasználó'), cols: 100, rows: 30 }),
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

  const handleRunSnippet = (cmd: string) => {
    if (!activeSessionId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'input', sessionId: activeSessionId, data: `${cmd}\n` }));
  };

  const handleSendBufferToSwarm = async () => {
    if (!activeSessionId) return;
    const res = await fetch(`/api/terminal/sessions/${activeSessionId}/buffer?lines=50`);
    if (!res.ok) return;
    const data = (await res.json()) as { buffer?: string };
    const text = (data.buffer || '').trim();
    if (!text) return;
    onSendToSwarm(`${tx('Elemezd ezt a terminál kimenetet (utolsó 50 sor)')}:\n\`\`\`\n${text.slice(-3000)}\n\`\`\``);
  };

  if (!hostPermissionsGranted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-2xl">
        <div className="flex items-start gap-4">
          <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('terminalLockedTitle')}
            </h2>
            <p className="text-sm text-slate-600">{t('terminalLockedDesc')}</p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {t('navSettings')}
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
            <span className="text-xs text-slate-500">{t('terminalNoSession')}</span>
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
                  onClick={() => void handleCloseSession(s.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSessionId && (
            <>
              <button
                type="button"
                onClick={() => handleRunSnippet('df -h && free -m')}
                className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                df/free
              </button>
              <button
                type="button"
                onClick={() => handleRunSnippet('systemctl list-units --failed')}
                className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                systemd
              </button>
              <button
                type="button"
                onClick={() => void handleSendBufferToSwarm()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-900 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                {t('terminalSendSwarm50')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setShowRecordings((v) => !v);
              void loadRecordings();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Film className="h-3.5 w-3.5" />
            {t('terminalRecordings')}
          </button>
          <button
            type="button"
            onClick={() => void handleCreateSession()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('terminalNewSession')}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      {showRecordings && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">{t('terminalRecordingsTitle')}</h3>
            <button type="button" onClick={() => setShowRecordings(false)} className="text-slate-400 hover:text-slate-900">
              <X className="h-4 w-4" />
            </button>
          </div>
          {recordings.length === 0 ? (
            <p className="text-xs text-slate-500">{t('terminalNoRecordings')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recordings.map((rec) => (
                <button
                  key={rec.sessionId}
                  type="button"
                  onClick={() => void openRecording(rec.sessionId)}
                  className={`px-2.5 py-1.5 text-xs font-mono border rounded whitespace-nowrap shrink-0 ${
                    activeRecording?.sessionId === rec.sessionId
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {rec.sessionId} · {rec.frameCount} frame {rec.active ? tx('(élő)') : ''}
                </button>
              ))}
            </div>
          )}
          {activeRecording && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3 text-xs font-mono">
                <span>{tx('Időcsúszka:')} {replayIndex + 1} / {Math.max(1, activeRecording.frames.length)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, activeRecording.frames.length - 1)}
                  value={replayIndex}
                  onChange={(e) => setReplayIndex(Number(e.target.value))}
                  className="flex-1"
                />
              </div>
              <pre className="p-3 bg-[#0b1120] text-slate-100 rounded-lg font-mono text-xs max-h-56 overflow-auto whitespace-pre-wrap">
                {activeRecording.frames
                  .slice(0, replayIndex + 1)
                  .filter((f) => f.dir === 'out')
                  .map((f) => f.data.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, ''))
                  .join('')}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-3 min-h-[460px]">
        {activeSessionId ? (
          <div ref={containerRef} className="w-full h-[440px]" data-testid="xterm-container" />
        ) : (
          <div className="h-[440px] flex flex-col items-center justify-center text-slate-400 text-sm gap-2 px-6 text-center">
            <p>{t('terminalEmptyTitle')}</p>
            <p className="text-xs text-slate-500">{t('terminalEmptyDesc', t('terminalNewSession'))}</p>
          </div>
        )}
      </div>
    </div>
  );
};
