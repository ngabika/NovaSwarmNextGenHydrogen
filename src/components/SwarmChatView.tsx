import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  CheckSquare,
  Code2,
  Copy,
  Eye,
  FileAudio,
  FolderPlus,
  GitBranch,
  ImagePlus,
  Lightbulb,
  Mic,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Slash,
  Sparkles,
  Square,
  StopCircle,
  Trash2,
  Users,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type {
  Agent,
  ChatThread,
  ExecutionPreset,
  IdeaItem,
  IdeaStatus,
  KanbanCard,
  KanbanPriority,
  KanbanStatus,
  LanguageCode,
  MediaArtifact,
  MessageAttachment,
  PromptTemplate,
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
  promptTemplates: PromptTemplate[];
  artifacts: MediaArtifact[];
  settings: Settings;
  externalDraft?: { text: string; nonce: number } | null;
  onRefreshState: () => Promise<void>;
}

export const SwarmChatView: React.FC<Props> = ({
  language,
  agents,
  threads,
  messages,
  kanban,
  ideas,
  promptTemplates,
  artifacts,
  settings,
  externalDraft,
  onRefreshState,
}) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id || 'thread-main');
  const [viewMode, setViewMode] = useState<'summary' | 'team'>('summary');
  const [rightTab, setRightTab] = useState<'kanban' | 'ideas' | 'artifacts'>('kanban');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const [preset, setPreset] = useState<ExecutionPreset>(settings.defaultPreset || 'fast');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string>('');
  const [councilRunning, setCouncilRunning] = useState(false);
  const [listening, setListening] = useState(false);
  const [continuousVoice, setContinuousVoice] = useState<boolean>(Boolean(settings.continuousVoiceMode));
  const [usedVoiceInput, setUsedVoiceInput] = useState(false);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Prompt templates (M10)
  const [showTplDrawer, setShowTplDrawer] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplCmd, setTplCmd] = useState('');
  const [tplBody, setTplBody] = useState('');

  // Media / Image Generation & Artifacts (Ú4, Ú18, Ú20)
  const [imgBusy, setImgBusy] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(artifacts[0]?.id || null);

  // Kanban & Worker state
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerMsg, setWorkerMsg] = useState<string | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadFolder, setNewThreadFolder] = useState('Általános');
  const [newThreadIsolation, setNewThreadIsolation] = useState<SessionIsolationMode>('sandboxed');

  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');
  const [newCardPriority, setNewCardPriority] = useState<KanbanPriority>('medium');
  const [newCardBlockedBy, setNewCardBlockedBy] = useState<string>('');
  const [newCardSprint, setNewCardSprint] = useState('');
  const [newCardEstMins, setNewCardEstMins] = useState('');
  const [swimlane, setSwimlane] = useState<'none' | 'priority' | 'assignee'>('none');
  const [showArchived, setShowArchived] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [redTeamBusyId, setRedTeamBusyId] = useState<string | null>(null);
  const [previewOpenIds, setPreviewOpenIds] = useState<Record<string, boolean>>({});

  // Ötletláda (IdeaBox) state
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDesc, setIdeaDesc] = useState('');
  const [ideaImpact, setIdeaImpact] = useState(4);
  const [ideaEffort, setIdeaEffort] = useState(2);
  const [ideaFilter, setIdeaFilter] = useState<'active' | 'kanban' | 'rejected'>('active');
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [ideaComment, setIdeaComment] = useState('');

  useEffect(() => {
    if (externalDraft?.text) {
      setInput(externalDraft.text);
    }
  }, [externalDraft]);

  useEffect(() => {
    if (!selectedArtifactId && artifacts.length > 0) {
      setSelectedArtifactId(artifacts[0].id);
    }
  }, [artifacts, selectedArtifactId]);

  const userAgents = useMemo(() => agents.filter((a) => !a.isSupervisor), [agents]);

  const threadMessages = useMemo(() => {
    const inThread = messages.filter((m) => m.threadId === selectedThreadId);
    if (viewMode === 'summary') {
      return inThread.filter((m) => m.channel !== 'swarm_internal');
    }
    return inThread;
  }, [messages, selectedThreadId, viewMode]);

  const slashSuggestions = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const q = input.toLowerCase();
    return promptTemplates.filter(
      (t) => t.command.toLowerCase().includes(q) || t.title.toLowerCase().includes(q.slice(1))
    );
  }, [input, promptTemplates]);

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

  const handleAudioUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) return;
      const base64 = result.slice(commaIdx + 1);
      setMediaNotice('Hanganyag átírása folyamatban...');
      try {
        const res = await fetch('/api/media/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: file.type || 'audio/webm',
            dataBase64: base64,
            languageHint: language,
          }),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (data.text) {
          setInput((prev) => (prev ? `${prev} ${data.text}` : data.text || ''));
          setUsedVoiceInput(true);
          setMediaNotice('Hang átírva a szövegmezőbe.');
        } else {
          setMediaNotice(data.error || 'Hangátírás sikertelen.');
        }
      } catch (err) {
        setMediaNotice(err instanceof Error ? err.message : 'Hálózati hiba');
      }
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

  // Ú45: Hands-free wake-word listener when enabled in Settings
  useEffect(() => {
    if (!settings.wakeWordEnabled || listening) return;
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SpeechRec) return;

    let cancelled = false;
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.speechLocale || 'hu-HU';
    const wakePhrase = (settings.wakeWordPhrase || 'szia nova').toLowerCase();

    rec.onresult = (ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
      const len = ev.results?.length || 0;
      if (len === 0) return;
      const phrase = (ev.results?.[len - 1]?.[0]?.transcript || '').toLowerCase();
      if (phrase.includes(wakePhrase)) {
        const after = phrase.split(wakePhrase).slice(1).join(' ').trim();
        if (after) {
          setInput(after);
          setUsedVoiceInput(true);
        } else {
          rec.stop();
          handleVoiceDictate();
        }
      }
    };
    rec.onend = () => {
      if (!cancelled && settings.wakeWordEnabled) {
        try {
          rec.start();
        } catch {
          // ignore already started / permission denied
        }
      }
    };
    try {
      rec.start();
    } catch {
      // browser blocked auto-mic without gesture
    }
    return () => {
      cancelled = true;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    };
  }, [settings.wakeWordEnabled, settings.wakeWordPhrase, language, listening]);

  const handleSendStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || sending) return;
    const wasVoice = usedVoiceInput;
    const outboundAttachments = [...attachments];
    const promptText = input.trim() || 'Elemezd a mellékelt képet.';
    setSending(true);
    setStreamingText('');
    setInput('');
    setAttachments([]);
    setUsedVoiceInput(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          threadId: selectedThreadId,
          content: promptText,
          targetAgentId: targetAgentId || null,
          preset,
          attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
        }),
      });

      let replyData: { coordinatorReply?: UnifiedMessage } | null = null;
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = 'message';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const rawLine of lines) {
            const line = rawLine.trimEnd();
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              const jsonStr = line.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const payload = JSON.parse(jsonStr) as { delta?: string; coordinatorReply?: UnifiedMessage; error?: string };
                if (currentEvent === 'delta' && payload.delta) {
                  setStreamingText((prev) => prev + payload.delta);
                } else if (currentEvent === 'done') {
                  replyData = payload;
                } else if (currentEvent === 'error' && payload.error) {
                  setMediaNotice(`Stream hiba: ${payload.error}`);
                }
              } catch {
                // ignore partial line
              }
            }
          }
        }
      }

      setStreamingText('');
      await onRefreshState();

      const finalText = replyData?.coordinatorReply?.content;
      if (settings.ttsEnabled && finalText) {
        const responder = agents.find((a) => a.id === replyData?.coordinatorReply?.senderId);
        const mode = responder?.voiceReplyMode || 'always';
        const shouldSpeak = continuousVoice || mode === 'always' || (mode === 'on_voice' && wasVoice);
        if (shouldSpeak) {
          speakBrowserTts(finalText, language);
          if (continuousVoice) {
            setTimeout(() => handleVoiceDictate(), 900);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMediaNotice(err instanceof Error ? err.message : 'Küldési hiba');
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      setStreamingText('');
    }
  };

  const handleCouncil = async () => {
    if (!input.trim() || councilRunning || sending) return;
    setCouncilRunning(true);
    setMediaNotice(null);
    try {
      const res = await fetch('/api/chat/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThreadId,
          content: input.trim(),
          preset,
        }),
      });
      if (res.ok) {
        setInput('');
      } else {
        const d = (await res.json()) as { error?: string };
        setMediaNotice(d.error || 'Konzilium hiba');
      }
      await onRefreshState();
    } finally {
      setCouncilRunning(false);
    }
  };

  const handleRedTeam = async (targetMessageId: string) => {
    if (redTeamBusyId) return;
    setRedTeamBusyId(targetMessageId);
    setMediaNotice(null);
    try {
      const res = await fetch('/api/v3/chat/redteam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selectedThreadId, targetMessageId }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setMediaNotice(d.error || 'Red-Team elemzés hiba');
      }
      await onRefreshState();
    } finally {
      setRedTeamBusyId(null);
    }
  };

  const handleRewind = async (messageId: string) => {
    const res = await fetch('/api/v3/chat/rewind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: selectedThreadId, messageId }),
    });
    if (res.ok) {
      setMediaNotice('Beszélgetés visszapörgetve ehhez az állapothoz.');
      await onRefreshState();
    } else {
      const d = (await res.json()) as { error?: string };
      setMediaNotice(d.error || 'Visszapörgetés hiba');
    }
  };

  const handleGenerateImage = async () => {
    const prompt = input.trim();
    if (!prompt || imgBusy) return;
    setImgBusy(true);
    setMediaNotice('Képgenerálás folyamatban...');
    try {
      const res = await fetch('/api/media/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as { artifact?: MediaArtifact; error?: string };
      if (!res.ok || !data.artifact) {
        setMediaNotice(data.error || 'Képgenerálás sikertelen');
        return;
      }
      setMediaNotice(`Kép elkészült: ${data.artifact.title}`);
      setSelectedArtifactId(data.artifact.id);
      setRightTab('artifacts');
      await onRefreshState();
    } finally {
      setImgBusy(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim() || !tplCmd.trim() || !tplBody.trim()) return;
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: tplTitle, command: tplCmd, body: tplBody }),
    });
    setTplTitle('');
    setTplCmd('');
    setTplBody('');
    await onRefreshState();
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
        blockedBy: newCardBlockedBy ? [newCardBlockedBy] : [],
        sprintName: newCardSprint.trim() || undefined,
        estimatedMinutes: newCardEstMins ? Number(newCardEstMins) : undefined,
      }),
    });
    setNewCardTitle('');
    setNewCardDesc('');
    setNewCardBlockedBy('');
    setNewCardSprint('');
    setNewCardEstMins('');
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

  const handleBindBranch = async (id: string) => {
    const res = await fetch(`/api/kanban/${id}/branch`, { method: 'POST' });
    const data = (await res.json()) as { branch?: string; message?: string };
    if (data.message) setWorkerMsg(data.message);
    await onRefreshState();
  };

  const handleToggleWorktree = async (card: KanbanCard) => {
    const res = await fetch(`/api/kanban/${card.id}/worktree`, {
      method: card.worktreePath ? 'DELETE' : 'POST',
    });
    const data = (await res.json()) as { message?: string; error?: string };
    setWorkerMsg(data.message || data.error || 'Worktree frissítve.');
    await onRefreshState();
  };

  const handleForkFromMessage = async (messageId: string) => {
    const res = await fetch('/api/chat/fork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: selectedThreadId, messageId }),
    });
    const data = (await res.json()) as { thread?: ChatThread; error?: string };
    if (data.thread) {
      setSelectedThreadId(data.thread.id);
      setMediaNotice(`Új elágazó szál létrehozva: ${data.thread.title}`);
      await onRefreshState();
    } else if (data.error) {
      setMediaNotice(data.error);
    }
  };

  const handleRegenerateLast = async () => {
    if (regenerating || sending) return;
    setRegenerating(true);
    setMediaNotice('Utolsó válasz újragenerálása...');
    try {
      const res = await fetch('/api/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selectedThreadId, preset }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) setMediaNotice(d.error || 'Újragenerálás sikertelen.');
      else setMediaNotice('Utolsó válasz sikeresen újragenerálva.');
      await onRefreshState();
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // clipboard blocked
    }
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
  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0] || null;

  const filteredIdeas = ideas.filter((i) => {
    if (ideaFilter === 'active') return i.status === 'new' || i.status === 'reviewed';
    return i.status === ideaFilter;
  });

  const renderKanbanCard = (card: KanbanCard) => {
    const ageHours = Math.floor((Date.now() - Date.parse(card.updatedAt)) / 3_600_000);
    const isAged = card.status !== 'done' && ageHours >= agingHours;
    const assigneeName = agents.find((a) => a.id === card.assignedAgentId)?.name || 'Nincs felelős';
    const blockingCards = (card.blockedBy || [])
      .map((bid) => kanban.find((k) => k.id === bid))
      .filter((k): k is KanbanCard => Boolean(k && k.status !== 'done'));

    return (
      <div
        key={card.id}
        className={`p-3 border rounded-lg space-y-1.5 ${
          isAged ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">{card.title}</div>
            <div className="text-[11px] font-mono text-slate-500">
              {card.priority || 'medium'} · {assigneeName}
              {card.sprintName ? ` · sprint:${card.sprintName}` : ''}
              {typeof card.estimatedMinutes === 'number' ? ` · ${card.actualMinutes ?? 0}/${card.estimatedMinutes}p` : ''}
              {card.gitBranch ? ` · git:${card.gitBranch}` : ''}
              {card.worktreePath ? ` · wt:${card.worktreePath}` : ''}
              {isAged ? ` · BEAKADVA (${ageHours}h)` : ''}
            </div>
            {blockingCards.length > 0 && (
              <div className="text-[11px] font-mono text-amber-800">
                Blokkolva: {blockingCards.map((b) => b.title).join(', ')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              title="Git Branch létrehozása / kötése ehhez a kártyához"
              onClick={() => void handleBindBranch(card.id)}
              className="text-slate-500 hover:text-slate-900"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={card.worktreePath ? 'Külön munkamappa leválasztása' : 'Elkülönített Git munkamappa csatolása'}
              onClick={() => void handleToggleWorktree(card)}
              className={`px-1 py-0.5 text-[10px] font-mono border rounded ${
                card.worktreePath ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-500 border-slate-300 hover:text-slate-900'
              }`}
            >
              WT
            </button>
            <button
              type="button"
              title="AI részfeladat-bontás"
              onClick={() => void handleAiBreakdown(card.id)}
              className="text-slate-500 hover:text-slate-900"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={card.archived ? 'Visszaállítás' : 'Archiválás'}
              onClick={() => void handleArchiveCard(card)}
              className="text-slate-400 hover:text-slate-700"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete card ${card.title}`}
              onClick={() => void handleDeleteCard(card.id)}
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
                onClick={() => void handleToggleSubtask(card.id, sub.id)}
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
              onClick={() => void handleMoveCard(card.id, target)}
              className={`px-2 py-0.5 text-[11px] rounded border whitespace-nowrap shrink-0 ${
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
      {/* Left: Thread Folders, Streaming Unified Chat, Templates & Council Mode */}
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
            <option value="sandboxed">Sandboxed (Elszigetelt)</option>
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
          {threadMessages.length === 0 && !streamingText ? (
            <div className="text-sm text-slate-500 py-16 text-center">
              Tiszta állapot — küldj egy üzenetet, futtass Konziliumot vagy írj /parancsot a sablonokhoz.
            </div>
          ) : (
            threadMessages.map((m, msgIdx) => (
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
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80 mb-1.5">
                  <span className="font-semibold">
                    {m.senderName} · {m.channel}
                    {m.modelUsed ? ` · ${m.modelUsed}` : ''}
                    {(m.inputTokens || m.outputTokens || m.latencyMs) && (
                      <span className="font-mono font-normal ml-1.5 tabular-nums">
                        [{m.inputTokens ?? 0}↑/{m.outputTokens ?? 0}↓ tok{m.latencyMs ? ` · ${m.latencyMs}ms` : ''}]
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      title="Beszélgetés elágaztatása innen"
                      onClick={() => void handleForkFromMessage(m.id)}
                      className="hover:opacity-100 opacity-70"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Visszapörgetés eddig az üzenetig (Time-Travel Rewind)"
                      onClick={() => void handleRewind(m.id)}
                      className="hover:opacity-100 opacity-70"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    {m.senderType === 'agent' && (
                      <button
                        type="button"
                        disabled={redTeamBusyId === m.id}
                        title="Kritikai ellenőrzés (Ördög Ügyvédje)"
                        onClick={() => void handleRedTeam(m.id)}
                        className="hover:opacity-100 opacity-70 disabled:opacity-30"
                      >
                        <ShieldAlert className={`h-3.5 w-3.5 ${redTeamBusyId === m.id ? 'animate-pulse' : ''}`} />
                      </button>
                    )}
                    {m.senderType === 'agent' && msgIdx === threadMessages.length - 1 && (
                      <button
                        type="button"
                        disabled={regenerating}
                        title="Utolsó válasz újragenerálása"
                        onClick={() => void handleRegenerateLast()}
                        className="hover:opacity-100 opacity-70 disabled:opacity-30"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Másolás vágólapra"
                      onClick={() => void handleCopyMessage(m.id, m.content)}
                      className="hover:opacity-100 opacity-70"
                    >
                      {copiedId === m.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
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
                <div className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
                  {m.content.split(/(```[\s\S]*?```)/g).map((part, pIdx) => {
                    if (part.startsWith('```') && part.endsWith('```')) {
                      const langMatch = part.match(/^```([^\n]*)\n?/);
                      const fenceLang = (langMatch?.[1] || '').trim().toLowerCase();
                      const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
                      const canPreview = fenceLang === 'html' || fenceLang === 'svg' || code.trimStart().startsWith('<svg');
                      const previewKey = `${m.id}-${pIdx}`;
                      const isOpen = Boolean(previewOpenIds[previewKey]);
                      return (
                        <div key={pIdx} className="my-2 space-y-1.5">
                          {canPreview && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewOpenIds((prev) => ({ ...prev, [previewKey]: !prev[previewKey] }))
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-100 whitespace-nowrap shrink-0"
                              >
                                <Eye className="h-3 w-3" />
                                {isOpen ? 'Előnézet elrejtése' : 'Élő Előnézet'}
                              </button>
                            </div>
                          )}
                          <pre className="p-2.5 bg-slate-900 text-slate-100 rounded-md font-mono text-xs overflow-x-auto">
                            {code}
                          </pre>
                          {canPreview && isOpen && (
                            <iframe
                              sandbox=""
                              srcDoc={fenceLang === 'svg' || code.trimStart().startsWith('<svg') ? `<!doctype html><html><body style="margin:8px;display:flex;justify-content:center">${code}</body></html>` : code}
                              className="w-full h-56 bg-white border border-slate-300 rounded-md"
                              title="Élő HTML/SVG előnézet"
                            />
                          )}
                        </div>
                      );
                    }
                    return <React.Fragment key={pIdx}>{part}</React.Fragment>;
                  })}
                </div>
                {m.councilVotes && m.councilVotes.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-700 mb-1">Csapat Szavazási Összesítő</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono">
                      {m.councilVotes.map((v, vi) => (
                        <div key={vi} className="p-1.5 bg-white border border-slate-200 rounded">
                          <span className="font-semibold text-slate-900">{v.agentName}</span> ·{' '}
                          <span className={v.verdict === 'approve' ? 'text-emerald-700' : v.verdict === 'reject' ? 'text-red-700' : 'text-amber-700'}>
                            {v.verdict.toUpperCase()} ({v.confidence}%)
                          </span>
                          <div className="text-slate-600 font-sans truncate">{v.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

          {streamingText && (
            <div className="p-3.5 rounded-lg border bg-slate-50 border-slate-300 text-slate-900 mr-8 space-y-1">
              <div className="text-xs font-mono text-slate-500">Élő válasz streamelése ({preset})...</div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{streamingText}</div>
            </div>
          )}
        </div>

        {/* Prompt Template Manager Drawer */}
        {showTplDrawer && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">Prompt Sablonok (/parancs)</span>
              <button type="button" onClick={() => setShowTplDrawer(false)} className="text-slate-500 hover:text-slate-900">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {promptTemplates.map((tpl) => (
                <div key={tpl.id} className="inline-flex items-center gap-1 border border-slate-300 bg-white rounded px-2 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setInput(tpl.body);
                      setShowTplDrawer(false);
                    }}
                    className="font-mono text-slate-800 hover:underline"
                  >
                    {tpl.command} · {tpl.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete template ${tpl.title}`}
                    onClick={async () => {
                      await fetch(`/api/templates/${tpl.id}`, { method: 'DELETE' });
                      await onRefreshState();
                    }}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleCreateTemplate} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                placeholder="Sablon címe"
                className="px-2 py-1 border border-slate-300 rounded bg-white"
              />
              <input
                type="text"
                value={tplCmd}
                onChange={(e) => setTplCmd(e.target.value)}
                placeholder="/parancs"
                className="px-2 py-1 font-mono border border-slate-300 rounded bg-white"
              />
              <input
                type="text"
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                placeholder="Sablon szövege..."
                className="sm:col-span-2 px-2 py-1 border border-slate-300 rounded bg-white"
              />
              <button
                type="submit"
                className="sm:col-span-4 px-3 py-1 bg-slate-900 text-white rounded font-medium"
              >
                + Sablon Mentése
              </button>
            </form>
          </div>
        )}

        <form onSubmit={handleSendStream} className="p-4 border-t border-slate-200 space-y-2 relative">
          {slashSuggestions.length > 0 && (
            <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-1 text-xs max-h-36 overflow-y-auto">
              {slashSuggestions.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setInput(tpl.body)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 flex justify-between"
                >
                  <span className="font-mono font-semibold text-slate-900">{tpl.command}</span>
                  <span className="text-slate-500 truncate ml-2">{tpl.title}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
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

              <select
                aria-label="Execution preset"
                value={preset}
                onChange={(e) => setPreset(e.target.value as ExecutionPreset)}
                className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
              >
                <option value="fast">Gyors mód</option>
                <option value="deep">Mély kutatás</option>
                <option value="precise">Precíziós kód</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={continuousVoice}
                  onChange={(e) => setContinuousVoice(e.target.checked)}
                />
                Folyamatos hangmód
              </label>
              <button
                type="button"
                onClick={() => setShowTplDrawer((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Slash className="h-3 w-3" />
                Sablonok ({promptTemplates.length})
              </button>
            </div>
          </div>

          {mediaNotice && (
            <div className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
              {mediaNotice}
            </div>
          )}

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

          <div className="flex flex-wrap items-center gap-2">
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
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAudioUpload(file);
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
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              title="Hangfájl feltöltése és átírása (STT)"
              aria-label="Hangfájl feltöltése"
              className="p-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              <FileAudio className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              placeholder={tr(language, 'chatPlaceholder')}
              aria-label="Chat message"
              className="flex-1 min-w-[180px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="button"
              onClick={handleVoiceDictate}
              title="Hang diktálás (Web Speech STT)"
              aria-label="Hang diktálás"
              className={`p-2 border rounded-lg ${
                listening ? 'bg-red-600 text-white border-red-600' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!input.trim() || imgBusy}
              onClick={() => void handleGenerateImage()}
              title="AI Képgenerálás a beírt leírásból (Artifaktba menti)"
              aria-label="AI Képgenerálás"
              className="p-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Wand2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!input.trim() || councilRunning || sending}
              onClick={() => void handleCouncil()}
              title="Többágenses Konzilium (párhuzamos vélemény + szintézis)"
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Users className="h-3.5 w-3.5" />
              {councilRunning ? 'Konzilium...' : 'Konzilium'}
            </button>
            {sending ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-700 text-white rounded-lg hover:bg-red-800 whitespace-nowrap shrink-0"
              >
                <StopCircle className="h-4 w-4" />
                Leállítás
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && attachments.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="h-4 w-4" />
                {tr(language, 'send')}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Right: Kanban, Ötletláda & Interactive Artifacts */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setRightTab('kanban')}
              className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                rightTab === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tr(language, 'kanbanTitle')} ({visibleKanban.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('ideas')}
              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                rightTab === 'ideas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Ötletláda ({ideas.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('artifacts')}
              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                rightTab === 'artifacts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              Artifaktok ({artifacts.length})
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newCardDesc}
                  onChange={(e) => setNewCardDesc(e.target.value)}
                  placeholder="Részletek (opcionális)..."
                  aria-label="Kanban card description"
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                />
                <select
                  value={newCardBlockedBy}
                  onChange={(e) => setNewCardBlockedBy(e.target.value)}
                  aria-label="Előfeltétel (blocked by)"
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                >
                  <option value="">Nincs blokkoló előfeltétel</option>
                  {kanban
                    .filter((c) => !c.archived && c.status !== 'done')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Előfeltétel: {c.title}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={newCardSprint}
                  onChange={(e) => setNewCardSprint(e.target.value)}
                  placeholder="Sprint neve (opc.)"
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                />
                <input
                  type="number"
                  min="0"
                  value={newCardEstMins}
                  onChange={(e) => setNewCardEstMins(e.target.value)}
                  placeholder="Becsült idő (perc, opc.)"
                  className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                />
              </div>
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
        ) : rightTab === 'ideas' ? (
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
                            onClick={() => void handlePromoteIdea(idea.id, true)}
                            className="px-2 py-1 text-[11px] font-medium bg-slate-900 text-white rounded"
                          >
                            Kanban + AI
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleIdeaStatus(idea.id, 'rejected')}
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
                            onClick={() => void handleAddIdeaComment(idea.id)}
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
        ) : (
          <div className="flex-1 flex flex-col pt-3 space-y-3">
            {artifacts.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                Még nincs generált kép, SVG grafikon vagy interaktív HTML artifakt. Használd a varázspálcát a chatben vagy az SVG Generátort a Hubon.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {artifacts.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => setSelectedArtifactId(art.id)}
                      className={`px-2.5 py-1 text-xs rounded border whitespace-nowrap shrink-0 ${
                        selectedArtifact?.id === art.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {art.kind} · {art.title}
                    </button>
                  ))}
                </div>
                {selectedArtifact && (
                  <div className="flex-1 border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{selectedArtifact.title}</span>
                      <button
                        type="button"
                        aria-label={`Delete artifact ${selectedArtifact.title}`}
                        onClick={async () => {
                          await fetch(`/api/artifacts/${selectedArtifact.id}`, { method: 'DELETE' });
                          await onRefreshState();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {selectedArtifact.kind === 'image' ? (
                      <img
                        src={selectedArtifact.urlOrContent}
                        alt={selectedArtifact.title}
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[380px] object-contain bg-white border border-slate-200 rounded"
                      />
                    ) : selectedArtifact.kind === 'chart_svg' ? (
                      <div className="bg-white border border-slate-200 rounded p-2 overflow-auto">
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(selectedArtifact.urlOrContent)}`}
                          alt={selectedArtifact.title}
                          className="w-full h-auto"
                        />
                      </div>
                    ) : (
                      <iframe
                        title={selectedArtifact.title}
                        sandbox=""
                        srcDoc={selectedArtifact.urlOrContent}
                        className="w-full h-[380px] bg-white border border-slate-200 rounded"
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
