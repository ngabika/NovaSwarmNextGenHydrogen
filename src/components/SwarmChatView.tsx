import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckSquare,
  FolderPlus,
  ImagePlus,
  Lightbulb,
  Mic,
  Play,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type {
  Agent,
  ChatThread,
  IdeaItem,
  IdeaStatus,
  KanbanCard,
  KanbanPriority,
  KanbanStatus,
  LanguageCode,
  MessageAttachment,
  SessionIsolationMode,
  Settings,
  UnifiedMessage,
} from '../../shared/types';
import { speakBrowserTts, SUPPORTED_LANGUAGES, tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  agents: Agent[];
  threads: ChatThread[];
  messages: UnifiedMessage[];
  kanban: KanbanCard[];
  ideas: IdeaItem[];
  settings: Settings;
  onRefreshState: () => Promise<void>;
}

export const SwarmChatView: React.FC<Props> = ({
  language,
  agents,
  threads,
  messages,
  kanban,
  ideas,
  settings,
  onRefreshState,
}) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || 'thread-main');
  const [viewMode, setViewMode] = useState<'summary' | 'team'>('summary');
  const [rightTab, setRightTab] = useState<'kanban' | 'ideas'>('kanban');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [usedVoiceInput, setUsedVoiceInput] = useState(false);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerMsg, setWorkerMsg] = useState<string | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadFolder, setNewThreadFolder] = useState('Általános');
  const [newThreadIsolation, setNewThreadIsolation] = useState<SessionIsolationMode>('sandboxed');

  // Rich Kanban state
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');
  const [newCardPriority, setNewCardPriority] = useState<KanbanPriority>('medium');
  const [swimlane, setSwimlane] = useState<'none' | 'priority' | 'assignee'>('none');
  const [showArchived, setShowArchived] = useState(false);

  // Ötletláda (IdeaBox) state
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDesc, setIdeaDesc] = useState('');
  const [ideaImpact, setIdeaImpact] = useState(4);
  const [ideaEffort, setIdeaEffort] = useState(2);
  const [ideaFilter, setIdeaFilter] = useState<'active' | 'kanban' | 'rejected'>('active');
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [ideaComment, setIdeaComment] = useState('');

  const userAgents = useMemo(() => agents.filter((a) => !a.isSupervisor), [agents]);

  const threadMessages = useMemo(() => {
    const inThread = messages.filter((m) => m.threadId === selectedThreadId);
    if (viewMode === 'summary') {
      return inThread.filter((m) => m.channel !== 'swarm_internal');
    }
    return inThread;
  }, [messages, selectedThreadId, viewMode]);

  const attachImageFile = (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) return;
      const base64 = result.slice(commaIdx + 1);
      setAttachments((prev) => [
        ...prev,
        {
          kind: 'image',
          mimeType: file.type || 'image/png',
          dataBase64: base64,
          name: file.name,
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) attachImageFile(f);
      }
    }
  };

  const handleVoiceDictate = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.lang = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.speechLocale || 'hu-HU';
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
      const text = ev.results?.[0]?.[0]?.transcript;
      if (text) {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        setUsedVoiceInput(true);
      }
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || sending) return;
    const wasVoice = usedVoiceInput;
    const outboundAttachments = [...attachments];
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThreadId,
          content: input.trim() || (outboundAttachments.length > 0 ? 'Elemezd a mellékelt képet.' : ''),
          targetAgentId: targetAgentId || null,
          attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
        }),
      });
      const data = (await res.json()) as { coordinatorReply?: UnifiedMessage };
      setInput('');
      setAttachments([]);
      setUsedVoiceInput(false);
      await onRefreshState();
      if (settings.ttsEnabled && data.coordinatorReply?.content) {
        const responder = agents.find((a) => a.id === data.coordinatorReply?.senderId);
        const mode = responder?.voiceReplyMode || 'always';
        const shouldSpeak = mode === 'always' || (mode === 'on_voice' && wasVoice);
        if (shouldSpeak) {
          speakBrowserTts(data.coordinatorReply.content, language);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const handleRunKanbanWorker = async () => {
    setWorkerRunning(true);
    setWorkerMsg(null);
    try {
      const res = await fetch('/api/kanban/worker/run', { method: 'POST' });
      const data = (await res.json()) as { worked: boolean; reason?: string; cardId?: string; status?: string };
      setWorkerMsg(
        data.worked
          ? `Feladat végrehajtva: ${data.cardId} (${data.status || 'done'})`
          : data.reason || 'Nincs várakozó feladat.'
      );
      await onRefreshState();
    } finally {
      setWorkerRunning(false);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim()) return;
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newThreadTitle.trim(),
        folder: newThreadFolder.trim(),
        isolationMode: newThreadIsolation,
      }),
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
        priority: newCardPriority,
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

  const handleAiBreakdown = async (id: string) => {
    await fetch(`/api/kanban/${id}/breakdown`, { method: 'POST' });
    await onRefreshState();
  };

  const handleToggleSubtask = async (cardId: string, subId: string) => {
    await fetch(`/api/kanban/${cardId}/subtasks/${subId}/toggle`, { method: 'POST' });
    await onRefreshState();
  };

  const handleArchiveCard = async (card: KanbanCard) => {
    await fetch(`/api/kanban/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !card.archived }),
    });
    await onRefreshState();
  };

  const handleDeleteCard = async (id: string) => {
    await fetch(`/api/kanban/${id}`, { method: 'DELETE' });
    await onRefreshState();
  };

  // IdeaBox handlers
  const handleAddIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaTitle.trim()) return;
    await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: ideaTitle.trim(),
        description: ideaDesc.trim(),
        impact: ideaImpact,
        effort: ideaEffort,
      }),
    });
    setIdeaTitle('');
    setIdeaDesc('');
    await onRefreshState();
  };

  const handlePromoteIdea = async (id: string, withAiBreakdown: boolean) => {
    await fetch(`/api/ideas/${id}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withAiBreakdown }),
    });
    await onRefreshState();
    setRightTab('kanban');
  };

  const handleIdeaStatus = async (id: string, status: IdeaStatus) => {
    await fetch(`/api/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await onRefreshState();
  };

  const handleAddIdeaComment = async (id: string) => {
    if (!ideaComment.trim()) return;
    await fetch(`/api/ideas/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ideaComment.trim() }),
    });
    setIdeaComment('');
    await onRefreshState();
  };

  const visibleKanban = kanban.filter((c) => (showArchived ? c.archived : !c.archived));
  const inProgressCount = kanban.filter((c) => !c.archived && c.status === 'in_progress').length;
  const agingHours = settings.kanbanAgingHours || 48;

  const filteredIdeas = ideas.filter((i) => {
    if (ideaFilter === 'active') return i.status === 'new' || i.status === 'reviewed';
    return i.status === ideaFilter;
  });

  const renderKanbanCard = (card: KanbanCard) => {
    const ageHours = Math.floor((Date.now() - Date.parse(card.updatedAt)) / 3_600_000);
    const isAged = card.status !== 'done' && ageHours >= agingHours;
    const assigneeName = agents.find((a) => a.id === card.assignedAgentId)?.name || 'Nincs felelős';
    return (
      <div
        key={card.id}
        className={`p-3 border rounded-lg space-y-1.5 ${
          isAged ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-slate-900">{card.title}</div>
            <div className="text-[11px] font-mono text-slate-500">
              [{card.priority || 'medium'}] · {assigneeName}
              {isAged ? ` · BEAKADVA (${ageHours}h)` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="AI részfeladat-bontás"
              onClick={() => handleAiBreakdown(card.id)}
              className="text-slate-500 hover:text-slate-900"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={card.archived ? 'Visszaállítás' : 'Archiválás'}
              onClick={() => handleArchiveCard(card)}
              className="text-slate-400 hover:text-slate-700"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete card ${card.title}`}
              onClick={() => handleDeleteCard(card.id)}
              className="text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {card.description && <p className="text-xs text-slate-600">{card.description}</p>}
        {card.subtasks && card.subtasks.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-200">
            {card.subtasks.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleToggleSubtask(card.id, sub.id)}
                className="flex items-center gap-1.5 text-[11px] text-left text-slate-700 hover:text-slate-900 w-full"
              >
                {sub.done ? (
                  <CheckSquare className="h-3 w-3 text-emerald-700 shrink-0" />
                ) : (
                  <Square className="h-3 w-3 text-slate-400 shrink-0" />
                )}
                <span className={sub.done ? 'line-through text-slate-400' : ''}>{sub.title}</span>
              </button>
            ))}
          </div>
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
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Left: Thread Folders, Session Isolation & Unified Chat */}
      <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[640px]">
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
                {t.folder} / {t.title} [{t.isolationMode === 'main_host' ? 'host' : 'sandbox'}]
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

        <form onSubmit={handleCreateThread} className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <FolderPlus className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={newThreadFolder}
            onChange={(e) => setNewThreadFolder(e.target.value)}
            placeholder="Mappa"
            aria-label="Thread folder"
            className="w-24 px-2 py-1 text-xs border border-slate-200 rounded"
          />
          <input
            type="text"
            value={newThreadTitle}
            onChange={(e) => setNewThreadTitle(e.target.value)}
            placeholder="Új szál címe..."
            aria-label="New thread title"
            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
          />
          <select
            value={newThreadIsolation}
            onChange={(e) => setNewThreadIsolation(e.target.value as SessionIsolationMode)}
            aria-label="Session isolation mode"
            className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
          >
            <option value="sandboxed">Sandboxed (OpenClaw)</option>
            <option value="main_host">Main Host</option>
          </select>
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            + Szál
          </button>
        </form>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[430px]">
          {threadMessages.length === 0 ? (
            <div className="text-sm text-slate-500 py-16 text-center">
              Tiszta állapot — küldj egy üzenetet a Web UI-n, Telegramon, Discordon, Slacken vagy Föderáción át.
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
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((att, idx) =>
                      att.kind === 'image' ? (
                        <img
                          key={idx}
                          src={`data:${att.mimeType};base64,${att.dataBase64}`}
                          alt={att.name || `Melléklet ${idx + 1}`}
                          className="max-h-40 rounded-md border border-slate-200 object-contain bg-white"
                        />
                      ) : null
                    )}
                  </div>
                )}
                {m.toolTrace && m.toolTrace.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-1 text-[11px] font-mono text-slate-600">
                    {m.toolTrace.map((t, idx) => (
                      <div key={idx}>
                        [{t.sandboxed ? 'SANDBOX' : 'HOST'}] {t.tool} ({t.ok ? 'OK' : 'ERR'}): {t.outputPreview}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

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
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs"
                >
                  <img
                    src={`data:${att.mimeType};base64,${att.dataBase64}`}
                    alt={att.name || 'image'}
                    className="h-6 w-6 rounded object-cover"
                  />
                  <span className="max-w-[120px] truncate text-slate-700">{att.name || 'Kép'}</span>
                  <button
                    type="button"
                    aria-label="Melléklet eltávolítása"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-500 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) attachImageFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Kép csatolása (Vision)"
              aria-label="Kép csatolása"
              className="p-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              placeholder={tr(language, 'chatPlaceholder')}
              aria-label="Chat message"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="button"
              onClick={handleVoiceDictate}
              title="Hang diktálás (Web Speech STT)"
              className={`p-2 border rounded-lg ${
                listening ? 'bg-red-600 text-white border-red-600' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={sending || (!input.trim() && attachments.length === 0)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" />
              {tr(language, 'send')}
            </button>
          </div>
        </form>
      </div>

      {/* Right: Rich Kanban Board & Ötletláda (IdeaBox) */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setRightTab('kanban')}
              className={`px-3 py-1 text-xs font-semibold rounded-md ${
                rightTab === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tr(language, 'kanbanTitle')} ({visibleKanban.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('ideas')}
              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md ${
                rightTab === 'ideas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Ötletláda ({ideas.length})
            </button>
          </div>

          {rightTab === 'kanban' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`font-mono tabular-nums ${
                  inProgressCount > settings.kanbanWipLimit ? 'text-red-700 font-semibold' : 'text-slate-500'
                }`}
              >
                WIP {inProgressCount}/{settings.kanbanWipLimit}
              </span>
              <select
                value={swimlane}
                onChange={(e) => setSwimlane(e.target.value as 'none' | 'priority' | 'assignee')}
                aria-label="Kanban swimlane"
                className="px-2 py-1 text-[11px] border border-slate-200 rounded bg-white"
              >
                <option value="none">Normál nézet</option>
                <option value="priority">Swimlane: Prioritás</option>
                <option value="assignee">Swimlane: Felelős</option>
              </select>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className={`px-2 py-1 text-[11px] border rounded ${
                  showArchived ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'
                }`}
              >
                Archív
              </button>
              <button
                type="button"
                disabled={workerRunning}
                onClick={() => void handleRunKanbanWorker()}
                title="Autonóm Kanban Backlog Munkás azonnali futtatása"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                Munkás Fut
              </button>
            </div>
          )}
        </div>
        {workerMsg && rightTab === 'kanban' && (
          <div className="mt-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-700">
            {workerMsg}
          </div>
        )}

        {rightTab === 'kanban' ? (
          <>
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
                <select
                  value={newCardPriority}
                  onChange={(e) => setNewCardPriority(e.target.value as KanbanPriority)}
                  aria-label="Kanban priority"
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
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
              {visibleKanban.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-12">{tr(language, 'kanbanEmpty')}</p>
              ) : swimlane === 'none' ? (
                (['todo', 'in_progress', 'done'] as KanbanStatus[]).map((statusKey) => {
                  const items = visibleKanban.filter((c) => c.status === statusKey);
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
                      {items.map(renderKanbanCard)}
                    </div>
                  );
                })
              ) : swimlane === 'priority' ? (
                (['urgent', 'high', 'medium', 'low'] as KanbanPriority[]).map((prio) => {
                  const items = visibleKanban.filter((c) => (c.priority || 'medium') === prio);
                  if (items.length === 0) return null;
                  return (
                    <div key={prio} className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-slate-600 flex justify-between">
                        <span>Prioritás: {prio}</span>
                        <span className="font-mono tabular-nums">{items.length}</span>
                      </div>
                      {items.map(renderKanbanCard)}
                    </div>
                  );
                })
              ) : (
                Array.from(new Set(visibleKanban.map((c) => c.assignedAgentId || 'unassigned'))).map((aid) => {
                  const items = visibleKanban.filter((c) => (c.assignedAgentId || 'unassigned') === aid);
                  const agName = agents.find((a) => a.id === aid)?.name || 'Nincs felelős';
                  return (
                    <div key={aid} className="space-y-2">
                      <div className="text-xs font-semibold text-slate-600 flex justify-between">
                        <span>Felelős: {agName}</span>
                        <span className="font-mono tabular-nums">{items.length}</span>
                      </div>
                      {items.map(renderKanbanCard)}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col pt-3 space-y-3">
            <form onSubmit={handleAddIdea} className="space-y-2 pb-3 border-b border-slate-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="Új ötlet címe..."
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md"
                >
                  + Ötlet
                </button>
              </div>
              <input
                type="text"
                value={ideaDesc}
                onChange={(e) => setIdeaDesc(e.target.value)}
                placeholder="Ötlet leírása..."
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
              />
              <div className="flex items-center gap-4 text-[11px] text-slate-600">
                <label className="flex items-center gap-1.5">
                  Impact (1-5):
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={ideaImpact}
                    onChange={(e) => setIdeaImpact(Number(e.target.value))}
                    className="w-12 px-1.5 py-0.5 border border-slate-300 rounded font-mono"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  Effort (1-5):
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={ideaEffort}
                    onChange={(e) => setIdeaEffort(Number(e.target.value))}
                    className="w-12 px-1.5 py-0.5 border border-slate-300 rounded font-mono"
                  />
                </label>
                <span className="font-mono font-semibold text-slate-900">
                  Score: {ideaImpact - ideaEffort}
                </span>
              </div>
            </form>

            <div className="flex gap-2 text-xs">
              {(['active', 'kanban', 'rejected'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setIdeaFilter(f)}
                  className={`px-2.5 py-1 rounded border ${
                    ideaFilter === f ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {f === 'active' ? 'Aktív' : f === 'kanban' ? 'Kanbanon' : 'Elutasítva'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[380px]">
              {filteredIdeas.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Nincs ötlet ebben a nézetben.</p>
              ) : (
                filteredIdeas.map((idea) => (
                  <div key={idea.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedIdeaId(expandedIdeaId === idea.id ? null : idea.id)}
                        className="text-left"
                      >
                        <div className="text-sm font-semibold text-slate-900">{idea.title}</div>
                        <div className="text-[11px] font-mono text-slate-600">
                          I{idea.impact}·E{idea.effort} (Score: {idea.score}) · {idea.status} · {idea.comments.length} hsz
                        </div>
                      </button>
                      {idea.status !== 'kanban' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePromoteIdea(idea.id, true)}
                            className="px-2 py-1 text-[11px] font-medium bg-slate-900 text-white rounded"
                          >
                            Kanban + AI
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIdeaStatus(idea.id, 'rejected')}
                            className="px-2 py-1 text-[11px] border border-slate-300 rounded text-slate-600"
                          >
                            Elutasít
                          </button>
                        </div>
                      )}
                    </div>
                    {expandedIdeaId === idea.id && (
                      <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                        {idea.description && <p className="text-slate-700">{idea.description}</p>}
                        <div className="space-y-1">
                          {idea.comments.map((c) => (
                            <div key={c.id} className="p-1.5 bg-white border border-slate-200 rounded text-[11px]">
                              <span className="font-semibold">{c.author}:</span> {c.text}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={ideaComment}
                            onChange={(e) => setIdeaComment(e.target.value)}
                            placeholder="Megjegyzés..."
                            className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddIdeaComment(idea.id)}
                            className="px-2.5 py-1 bg-slate-800 text-white rounded text-xs"
                          >
                            Küldés
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
