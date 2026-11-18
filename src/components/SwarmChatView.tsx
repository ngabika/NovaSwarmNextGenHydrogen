import React, { useMemo, useState } from 'react';
import { FolderPlus, Plus, Send, Trash2, Volume2 } from 'lucide-react';
import type {
  Agent,
  ChatThread,
  KanbanCard,
  KanbanStatus,
  LanguageCode,
  UnifiedMessage,
} from '../../shared/types';
import { speakBrowserTts, tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  agents: Agent[];
  threads: ChatThread[];
  messages: UnifiedMessage[];
  kanban: KanbanCard[];
  ttsEnabled: boolean;
  onRefreshState: () => Promise<void>;
}

export const SwarmChatView: React.FC<Props> = ({
  language,
  agents,
  threads,
  messages,
  kanban,
  ttsEnabled,
  onRefreshState,
}) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || 'thread-main');
  const [viewMode, setViewMode] = useState<'summary' | 'team'>('summary');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadFolder, setNewThreadFolder] = useState('Általános');

  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');

  const userAgents = useMemo(() => agents.filter((a) => !a.isSupervisor), [agents]);

  const threadMessages = useMemo(() => {
    const inThread = messages.filter((m) => m.threadId === selectedThreadId);
    if (viewMode === 'summary') {
      return inThread.filter((m) => m.channel !== 'swarm_internal');
    }
    return inThread;
  }, [messages, selectedThreadId, viewMode]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThreadId,
          content: input.trim(),
          targetAgentId: targetAgentId || null,
        }),
      });
      const data = (await res.json()) as { coordinatorReply?: UnifiedMessage };
      setInput('');
      await onRefreshState();
      if (ttsEnabled && data.coordinatorReply?.content) {
        speakBrowserTts(data.coordinatorReply.content, language);
      }
    } finally {
      setSending(false);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim()) return;
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newThreadTitle.trim(), folder: newThreadFolder.trim() }),
    });
    const data = (await res.json()) as { thread?: ChatThread };
    setNewThreadTitle('');
    if (data.thread) setSelectedThreadId(data.thread.id);
    await onRefreshState();
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardTitle.trim()) return;
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newCardTitle.trim(),
        description: newCardDesc.trim(),
        status: 'todo',
        assignedAgentId: userAgents[0]?.id ?? null,
      }),
    });
    setNewCardTitle('');
    setNewCardDesc('');
    await onRefreshState();
  };

  const handleMoveCard = async (id: string, status: KanbanStatus) => {
    await fetch(`/api/kanban/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await onRefreshState();
  };

  const handleDeleteCard = async (id: string) => {
    await fetch(`/api/kanban/${id}`, { method: 'DELETE' });
    await onRefreshState();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Left: Thread Folders & Unified Chat (7 cols) */}
      <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[600px]">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedThreadId(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedThreadId === t.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.folder} / {t.title}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('summary')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tr(language, 'summaryView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('team')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'team' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tr(language, 'teamRoom')}
            </button>
          </div>
        </div>

        {/* New thread inline bar */}
        <form onSubmit={handleCreateThread} className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={newThreadFolder}
            onChange={(e) => setNewThreadFolder(e.target.value)}
            placeholder="Mappa"
            aria-label="Thread folder"
            className="w-28 px-2 py-1 text-xs border border-slate-200 rounded"
          />
          <input
            type="text"
            value={newThreadTitle}
            onChange={(e) => setNewThreadTitle(e.target.value)}
            placeholder="Új szál címe..."
            aria-label="New thread title"
            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            + Szál
          </button>
        </form>

        {/* Messages */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[420px]">
          {threadMessages.length === 0 ? (
            <div className="text-sm text-slate-500 py-16 text-center">
              Tiszta állapot — küldj egy üzenetet a Web UI-n vagy Telegramon (közös egységes üzenet-tár).
            </div>
          ) : (
            threadMessages.map((m) => (
              <div
                key={m.id}
                className={`p-3.5 rounded-lg border ${
                  m.senderType === 'user'
                    ? 'bg-slate-900 text-white border-slate-900 ml-8'
                    : m.channel === 'swarm_internal'
                    ? 'bg-amber-50/60 border-amber-200 text-slate-800 mr-8'
                    : 'bg-slate-50 border-slate-200 text-slate-900 mr-8'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs opacity-75 mb-1.5">
                  <span className="font-semibold">
                    {m.senderName} · {m.channel}
                    {m.modelUsed ? ` · ${m.modelUsed}` : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      aria-label={`${tr(language, 'ttsSpeak')}: ${m.senderName}`}
                      onClick={() => speakBrowserTts(m.content, language)}
                      className="hover:opacity-100 opacity-70"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</div>
              </div>
            ))
          )}
        </div>

        {/* Message input */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-200 space-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="chat-target-agent" className="text-xs text-slate-500 whitespace-nowrap">
              Címzett:
            </label>
            <select
              id="chat-target-agent"
              value={targetAgentId}
              onChange={(e) => setTargetAgentId(e.target.value)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="">Koordinátor (automatikus delegálás)</option>
              {userAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={tr(language, 'chatPlaceholder')}
              aria-label="Chat message"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" />
              {tr(language, 'send')}
            </button>
          </div>
        </form>
      </div>

      {/* Right: Clean Kanban Board (5 cols) */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{tr(language, 'kanbanTitle')}</h2>
          <span className="text-xs text-slate-500 tabular-nums">{kanban.length} db</span>
        </div>

        <form onSubmit={handleAddCard} className="py-3 border-b border-slate-100 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Feladat címe..."
              aria-label="Kanban card title"
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              {tr(language, 'addCard')}
            </button>
          </div>
          <input
            type="text"
            value={newCardDesc}
            onChange={(e) => setNewCardDesc(e.target.value)}
            placeholder="Részletek (opcionális)..."
            aria-label="Kanban card description"
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
          />
        </form>

        <div className="flex-1 overflow-y-auto pt-4 space-y-4 max-h-[460px]">
          {kanban.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-12">{tr(language, 'kanbanEmpty')}</p>
          ) : (
            (['todo', 'in_progress', 'done'] as KanbanStatus[]).map((statusKey) => {
              const items = kanban.filter((c) => c.status === statusKey);
              const label =
                statusKey === 'todo'
                  ? tr(language, 'todo')
                  : statusKey === 'in_progress'
                  ? tr(language, 'inProgress')
                  : tr(language, 'done');
              return (
                <div key={statusKey} className="space-y-2">
                  <div className="text-xs font-semibold text-slate-600 flex justify-between">
                    <span>{label}</span>
                    <span className="font-mono tabular-nums">{items.length}</span>
                  </div>
                  {items.map((card) => (
                    <div
                      key={card.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-slate-900">{card.title}</div>
                        <button
                          type="button"
                          aria-label={`Delete card ${card.title}`}
                          onClick={() => handleDeleteCard(card.id)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {card.description && (
                        <p className="text-xs text-slate-600">{card.description}</p>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        {(['todo', 'in_progress', 'done'] as KanbanStatus[]).map((target) => (
                          <button
                            key={target}
                            type="button"
                            disabled={card.status === target}
                            onClick={() => handleMoveCard(card.id, target)}
                            className={`px-2 py-0.5 text-[11px] rounded border ${
                              card.status === target
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {target === 'todo'
                              ? tr(language, 'todo')
                              : target === 'in_progress'
                              ? tr(language, 'inProgress')
                              : tr(language, 'done')}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
