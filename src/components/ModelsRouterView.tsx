import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Clock,
  Copy,
  Cpu,
  Flame,
  Gauge,
  Key,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type {
  GatewayAnalytics,
  KeyModelMatrixEntry,
  LanguageCode,
  ModelInfo,
  ProviderId,
  QueuedRequestSummary,
  QuotaStatus,
  RoutedCallLogEntry,
  Settings,
  TaskType,
  VirtualKey,
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  settings: Settings;
  discoveredModels: ModelInfo[];
  keyModelMatrix: KeyModelMatrixEntry[];
  routedCallLogs: RoutedCallLogEntry[];
  queuedLlmRequests: QueuedRequestSummary[];
  quotas: Record<ProviderId, QuotaStatus>;
  virtualKeys: VirtualKey[];
  gatewayAnalytics: GatewayAnalytics;
  cacheSize: number;
  onRefreshState: () => Promise<void>;
}

const PROVIDERS: ProviderId[] = ['gemini', 'openrouter', 'openai', 'anthropic', 'ollama'];

const TASK_TYPES: Array<{ id: TaskType; label: string }> = [
  { id: 'simple_fast', label: 'Egyszerű / Gyors (simple_fast)' },
  { id: 'summarization', label: 'Összefoglalás (summarization)' },
  { id: 'code_simple', label: 'Egyszerű kód (code_simple)' },
  { id: 'code_hard', label: 'Nehéz kód / debug (code_hard)' },
  { id: 'complex_planning', label: 'Összetett tervezés (complex_planning)' },
  { id: 'long_context', label: 'Hosszú kontextus (long_context)' },
  { id: 'vision', label: 'Képfeldolgozás (vision)' },
  { id: 'audio', label: 'Hangfeldolgozás (audio)' },
  { id: 'tool_heavy', label: 'Sok eszköz / MCP (tool_heavy)' },
  { id: 'embedding', label: 'Beágyazás (embedding)' },
];

interface ProjectionData {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  projectedMonthlyUsd: number;
  monthlyAlertThresholdUsd: number;
  alertTriggered: boolean;
}

interface RankedPreviewItem {
  provider: ProviderId;
  modelId: string;
  isVirtualFallback: boolean;
  score: number;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isFree: boolean;
  reason: string;
}

interface GeminiProjectReport {
  totalKeys: number;
  enabledKeys: number;
  distinctProjects: number;
  sharedProjects: Array<{ projectId: string; keyCount: number; keyLabels: string[] }>;
  unassignedCount: number;
  hasSharedProjectRisk: boolean;
  warningHu: string | null;
}

interface DetailedHardwareSummary {
  arch: string;
  platform: string;
  boardModel: string;
  isRaspberryPi: boolean;
  cpuCores: number;
  hasAvx2: boolean;
  hasNeon: boolean;
  ramTotalMb: number;
  ramFreeMb: number;
  swapTotalMb: number;
  diskFreeMb: number;
  storageKind: 'sd_or_emmc' | 'ssd_or_nvme' | 'unknown';
  gpuVendor: string;
  gpuName: string;
  gpuVramMb: number;
}

interface MatrixResponse {
  matrix: KeyModelMatrixEntry[];
  geminiProjectReport: GeminiProjectReport;
  routedCallLogs: RoutedCallLogEntry[];
  queuedLlmRequests: QueuedRequestSummary[];
  taskRankings: RankedPreviewItem[];
  hardware: DetailedHardwareSummary;
}

function formatMatrixStatus(entry: KeyModelMatrixEntry): { text: string; tone: string } {
  const now = Date.now();
  if (entry.status === 'disabled_invalid') {
    return {
      text: entry.reason ? `Hibás / Letiltva (${entry.reason})` : 'Hibás / Letiltva',
      tone: 'bg-red-100 text-red-800 border-red-200',
    };
  }
  if (entry.status === 'daily_exhausted' || (entry.resetAt && Date.parse(entry.resetAt) > now)) {
    const until = entry.resetAt ? new Date(entry.resetAt).toLocaleTimeString() : 'holnapig';
    return {
      text: `Napi limit kimerült (reset: ${until})`,
      tone: 'bg-rose-100 text-rose-800 border-rose-200',
    };
  }
  if (entry.status === 'rpm_cooldown' || (entry.cooldownUntil && Date.parse(entry.cooldownUntil) > now)) {
    const until = entry.cooldownUntil ? new Date(entry.cooldownUntil).toLocaleTimeString() : 'hamarosan';
    return {
      text: `Pihenőn (${until}${entry.reason ? ` · ${entry.reason}` : ''})`,
      tone: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }
  if (entry.status === 'error') {
    return {
      text: entry.reason ? `Hiba (${entry.reason})` : 'Hiba',
      tone: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }
  return {
    text: 'Elérhető',
    tone: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  };
}

export const ModelsRouterView: React.FC<Props> = ({
  language,
  settings,
  discoveredModels,
  keyModelMatrix,
  routedCallLogs,
  queuedLlmRequests,
  quotas,
  virtualKeys,
  gatewayAnalytics,
  cacheSize,
  onRefreshState,
}) => {
  // Single + bulk key pool management
  const [newKeyProvider, setNewKeyProvider] = useState<ProviderId>('gemini');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyProjectId, setNewKeyProjectId] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [keyActionMsg, setKeyActionMsg] = useState<string | null>(null);

  // Discovery, filtering & failover testing
  const [freeOnlyFilter, setFreeOnlyFilter] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [testTaskType, setTestTaskType] = useState<TaskType>('simple_fast');
  const [testPrompt, setTestPrompt] = useState('Válaszolj röviden: melyik útvonal és modell válaszolt?');
  const [failoverOutput, setFailoverOutput] = useState<string | null>(null);

  // Matrix & task rankings & blocklist
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>('simple_fast');
  const [matrixResp, setMatrixResp] = useState<MatrixResponse | null>(null);
  const [overrideInput, setOverrideInput] = useState<string>(
    (settings.taskModelRankingOverrides?.simple_fast || []).join(', ')
  );
  const [blocklistInput, setBlocklistInput] = useState<string>((settings.modelBlocklist || []).join(', '));
  const [routingMsg, setRoutingMsg] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);

  // Virtual Key creation
  const [vkName, setVkName] = useState('');
  const [vkBudget, setVkBudget] = useState(5.0);
  const [vkRpm, setVkRpm] = useState(60);
  const [vkModels, setVkModels] = useState('');
  const [vkExpiresAt, setVkExpiresAt] = useState('');
  const [vkAllowedIps, setVkAllowedIps] = useState('');
  const [revealedRawKey, setRevealedRawKey] = useState<string | null>(null);

  // Monthly projection (M9) & Ollama hardware optimizer
  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [numCtx, setNumCtx] = useState<number>(settings.ollamaNumCtx || 2048);
  const [keepAlive, setKeepAlive] = useState<string>(settings.ollamaKeepAlive || '10m');
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);
  const [ollamaBusy, setOllamaBusy] = useState(false);

  const loadMatrix = useCallback(async (task: TaskType) => {
    try {
      const res = await fetch(`/api/providers/matrix?taskType=${encodeURIComponent(task)}`);
      if (res.ok) {
        const data = (await res.json()) as MatrixResponse;
        setMatrixResp(data);
      }
    } catch {
      // keep existing UI state on transient fetch error
    }
  }, []);

  useEffect(() => {
    void loadMatrix(selectedTaskType);
  }, [loadMatrix, selectedTaskType, keyModelMatrix.length, routedCallLogs.length, queuedLlmRequests.length]);

  useEffect(() => {
    setOverrideInput((settings.taskModelRankingOverrides?.[selectedTaskType] || []).join(', '));
  }, [selectedTaskType, settings.taskModelRankingOverrides]);

  useEffect(() => {
    setBlocklistInput((settings.modelBlocklist || []).join(', '));
  }, [settings.modelBlocklist]);

  useEffect(() => {
    void fetch('/api/gateway/projection')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProjectionData | null) => {
        if (d) setProjection(d);
      })
      .catch(() => {});
  }, [settings.dailySpendUsd, settings.monthlyBudgetAlertUsd]);

  const effectiveMatrix = matrixResp?.matrix ?? keyModelMatrix;
  const effectiveLogs = (routedCallLogs && routedCallLogs.length > 0 ? routedCallLogs : matrixResp?.routedCallLogs) || [];
  const effectiveQueue =
    (queuedLlmRequests && queuedLlmRequests.length > 0 ? queuedLlmRequests : matrixResp?.queuedLlmRequests) || [];

  const localGeminiWarning = useMemo(() => {
    if (matrixResp?.geminiProjectReport?.warningHu) return matrixResp.geminiProjectReport.warningHu;
    const enabled = (settings.providerKeys.gemini || []).filter((k) => k.enabled);
    if (enabled.length < 2) return null;
    const byProj = new Map<string, number>();
    let missing = 0;
    for (const k of enabled) {
      const pid = (k.projectId || '').trim();
      if (!pid) {
        missing += 1;
      } else {
        byProj.set(pid, (byProj.get(pid) || 0) + 1);
      }
    }
    const shared = Array.from(byProj.entries()).filter(([, c]) => c > 1);
    if (shared.length > 0) {
      return `Figyelem: a Gemini API kvótája Google Cloud projektenként számít. Azonos projekt-azonosítón (${shared.map(([p, c]) => `${p}: ${c} kulcs`).join(', ')}) lévő kulcsok közös kereten osztoznak. Másik projekt vagy másodlagos szolgáltató használata ad valódi bővítést.`;
    }
    if (missing > 0) {
      return 'Tipp: A Gemini kvóta Google Cloud projektenként érvényes. Add meg a kulcsok Google Cloud projekt-azonosítóját, hogy a router lássa a közös kereteket.';
    }
    return null;
  }, [matrixResp?.geminiProjectReport?.warningHu, settings.providerKeys.gemini]);

  const handleSaveOllamaOpt = async () => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaNumCtx: numCtx, ollamaKeepAlive: keepAlive }),
    });
    setOllamaStatus(`Mentve: num_ctx=${numCtx}, keep_alive=${keepAlive}`);
    await onRefreshState();
  };

  const handleWarmOllama = async () => {
    setOllamaStatus('Ollama modell előmelegítése folyamatban...');
    const res = await fetch('/api/providers/ollama/warm', { method: 'POST' });
    const data = (await res.json()) as { ok: boolean; model?: string; message?: string; elapsedMs?: number };
    setOllamaStatus(
      data.ok
        ? `Modell előmelegítve: ${data.model || settings.ollamaModel} (${data.elapsedMs ?? 0}ms)`
        : data.message || 'Ollama nem érhető el'
    );
  };

  const handleUnloadOllama = async () => {
    const res = await fetch('/api/providers/ollama/unload', { method: 'POST' });
    const data = (await res.json()) as { ok: boolean; message?: string };
    setOllamaStatus(data.message || (data.ok ? 'Ollama RAM kiürítve.' : 'Kiürítés sikertelen.'));
  };

  const handleReselectOllama = async () => {
    setOllamaBusy(true);
    setOllamaStatus('Hardver-érzékeny Ollama csomag újraszámítása...');
    try {
      const res = await fetch('/api/providers/ollama/reselect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pullMissing: false, checkRemoteRegistry: false, runBenchmark: false }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        selection?: { tierLabel: string; mainModel: string; codeModel: string; fastModel: string; embeddingModel: string };
        error?: string;
      };
      if (res.ok && data.selection) {
        setOllamaStatus(
          `Újraválasztva (${data.selection.tierLabel}): fő=${data.selection.mainModel}, kód=${data.selection.codeModel}, gyors=${data.selection.fastModel}, embed=${data.selection.embeddingModel}`
        );
      } else {
        setOllamaStatus(data.error || 'Újraválasztás sikertelen');
      }
      await onRefreshState();
      await loadMatrix(selectedTaskType);
    } finally {
      setOllamaBusy(false);
    }
  };

  const handleBenchmarkOllama = async () => {
    setOllamaBusy(true);
    setOllamaStatus(`Sebességmérés (${settings.ollamaModel}) folyamatban...`);
    try {
      const res = await fetch('/api/providers/ollama/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.ollamaModel }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        telemetry?: { tokensPerSec: number; latencyMs: number; model: string };
        error?: string;
      };
      if (data.ok && data.telemetry) {
        setOllamaStatus(
          `Benchmark kész (${data.telemetry.model}): ${data.telemetry.tokensPerSec} tok/s · ${data.telemetry.latencyMs}ms`
        );
      } else {
        setOllamaStatus(`Benchmark nem futtatható: ${data.error || 'Ollama szerver nem válaszolt'}`);
      }
      await onRefreshState();
    } finally {
      setOllamaBusy(false);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyActionMsg(null);
    if (bulkMode) {
      if (!bulkText.trim()) return;
      const res = await fetch('/api/providers/keys/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newKeyProvider,
          rawKeysText: bulkText,
          labelPrefix: newKeyLabel.trim() || `${newKeyProvider.toUpperCase()} Kulcs`,
          projectId: newKeyProjectId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        added?: unknown[];
        skippedCount?: number;
        geminiProjectReport?: GeminiProjectReport;
        error?: string;
      };
      if (res.ok) {
        setBulkText('');
        setNewKeyLabel('');
        setNewKeyProjectId('');
        setKeyActionMsg(
          `Tömeges import kész: ${data.added?.length ?? 0} új kulcs hozzáadva (${data.skippedCount ?? 0} duplikátum kihagyva).`
        );
      } else {
        setKeyActionMsg(data.error || 'Tömeges hozzáadás hiba.');
      }
    } else {
      if (!newKeyValue.trim()) return;
      const res = await fetch('/api/providers/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newKeyProvider,
          rawKey: newKeyValue.trim(),
          label: newKeyLabel.trim() || `${newKeyProvider.toUpperCase()} Pool Key`,
          projectId: newKeyProjectId.trim() || undefined,
        }),
      });
      if (res.ok) {
        setNewKeyValue('');
        setNewKeyLabel('');
        setNewKeyProjectId('');
        setKeyActionMsg('Kulcs biztonságosan elmentve a vaultba.');
      }
    }
    await onRefreshState();
    await loadMatrix(selectedTaskType);
  };

  const handleToggleKeyEnabled = async (provider: ProviderId, keyId: string, currentEnabled: boolean) => {
    await fetch(`/api/providers/keys/${provider}/${keyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !currentEnabled }),
    });
    await onRefreshState();
    await loadMatrix(selectedTaskType);
  };

  const handleRemoveKey = async (provider: ProviderId, keyId: string) => {
    await fetch(`/api/providers/keys/${provider}/${keyId}`, { method: 'DELETE' });
    await onRefreshState();
    await loadMatrix(selectedTaskType);
  };

  const handleResetCooldowns = async () => {
    await fetch('/api/providers/reset-cooldowns', { method: 'POST' });
    await onRefreshState();
    await loadMatrix(selectedTaskType);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await fetch('/api/providers/discover', { method: 'POST' });
      await onRefreshState();
      await loadMatrix(selectedTaskType);
    } finally {
      setDiscovering(false);
    }
  };

  const handleDrainQueue = async () => {
    setQueueBusy(true);
    try {
      const res = await fetch('/api/providers/queue/drain', { method: 'POST' });
      const data = (await res.json()) as { processed?: number; completed?: number; remaining?: number };
      setRoutingMsg(
        `Várólista ellenőrizve: ${data.processed ?? 0} feldolgozva, ${data.completed ?? 0} teljesült, ${data.remaining ?? 0} várakozik.`
      );
      await onRefreshState();
      await loadMatrix(selectedTaskType);
    } finally {
      setQueueBusy(false);
    }
  };

  const handleSaveTaskRanking = async (e: React.FormEvent) => {
    e.preventDefault();
    const models = overrideInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch('/api/providers/task-rankings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskType: selectedTaskType, models }),
    });
    if (res.ok) {
      setRoutingMsg(`Manuális sorrend mentve a "${selectedTaskType}" feladathoz.`);
      await onRefreshState();
      await loadMatrix(selectedTaskType);
    }
  };

  const handleSaveBlocklist = async (e: React.FormEvent) => {
    e.preventDefault();
    const modelBlocklist = blocklistInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch('/api/providers/blocklist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelBlocklist }),
    });
    if (res.ok) {
      setRoutingMsg(`Modell tiltólista frissítve (${modelBlocklist.length} minta).`);
      await onRefreshState();
      await loadMatrix(selectedTaskType);
    }
  };

  const handleTestFailover = async () => {
    setFailoverOutput('Intelligens router lánc futtatása...');
    const res = await fetch('/api/providers/test-failover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: testPrompt.trim() || 'Válaszolj egy mondatban: melyik szolgáltató válaszolt?',
        taskType: testTaskType,
      }),
    });
    const data = (await res.json()) as {
      provider?: string;
      model?: string;
      keyLabel?: string;
      taskType?: string;
      switchReason?: string;
      degradedMode?: boolean;
      queued?: boolean;
      queueId?: string;
      text?: string;
      error?: string;
      cached?: boolean;
    };
    if (res.ok) {
      const tags = [
        data.provider,
        data.model,
        data.keyLabel ? `kulcs: ${data.keyLabel}` : '',
        data.taskType ? `feladat: ${data.taskType}` : '',
        data.degradedMode ? 'DEGRADÁLT (OLLAMA)' : '',
        data.queued ? `VÁRÓLISTÁN (${data.queueId})` : '',
        data.cached ? 'CACHE' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const reasonLine = data.switchReason ? `\nVáltás oka: ${data.switchReason}` : '';
      setFailoverOutput(`[${tags}]${reasonLine}\nVálasz: ${data.text || '(üres)'}`);
    } else {
      setFailoverOutput(`Failover teszt hiba: ${data.error}`);
    }
    await onRefreshState();
    await loadMatrix(selectedTaskType);
  };

  const handlePriorityChange = async (field: 'primaryProvider' | 'secondaryProvider', value: ProviderId) => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    await onRefreshState();
  };

  const handleToggleGatewayFlag = async (
    field:
      | 'responseCacheEnabled'
      | 'guardrailsEnabled'
      | 'guardrailBlockPii'
      | 'guardrailBlockSecrets'
      | 'guardrailBlockPromptInjection'
  ) => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !settings[field] }),
    });
    await onRefreshState();
  };

  const handleClearCache = async () => {
    await fetch('/api/gateway/cache/clear', { method: 'POST' });
    await onRefreshState();
  };

  const handleCreateVirtualKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vkName.trim()) return;
    const res = await fetch('/api/gateway/virtual-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: vkName.trim(),
        maxBudgetUsd: vkBudget,
        rpmLimit: vkRpm,
        allowedModels: vkModels
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
        expiresAt: vkExpiresAt.trim() || undefined,
        allowedIps: vkAllowedIps
          .split(',')
          .map((ip) => ip.trim())
          .filter(Boolean),
      }),
    });
    const data = (await res.json()) as { rawKey?: string };
    if (data.rawKey) {
      setRevealedRawKey(data.rawKey);
    }
    setVkName('');
    setVkModels('');
    setVkExpiresAt('');
    setVkAllowedIps('');
    await onRefreshState();
  };

  const handleToggleVirtualKey = async (vk: VirtualKey) => {
    await fetch(`/api/gateway/virtual-keys/${vk.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !vk.enabled }),
    });
    await onRefreshState();
  };

  const handleRevokeVirtualKey = async (id: string) => {
    await fetch(`/api/gateway/virtual-keys/${id}`, { method: 'DELETE' });
    await onRefreshState();
  };

  const visibleModels = freeOnlyFilter ? discoveredModels.filter((m) => m.isFree) : discoveredModels;
  const proxyEndpoint = `${window.location.origin}/v1/chat/completions`;
  const hw = matrixResp?.hardware;

  return (
    <div className="space-y-6">
      {/* Router Chain & Discovery Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label htmlFor="router-primary" className="block text-xs text-slate-500 mb-1">
                Elsődleges szolgáltató
              </label>
              <select
                id="router-primary"
                value={settings.primaryProvider}
                onChange={(e) => void handlePriorityChange('primaryProvider', e.target.value as ProviderId)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="router-secondary" className="block text-xs text-slate-500 mb-1">
                Másodlagos failover
              </label>
              <select
                id="router-secondary"
                value={settings.secondaryProvider}
                onChange={(e) => void handlePriorityChange('secondaryProvider', e.target.value as ProviderId)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500 pt-4">
              Végső helyi fallback:{' '}
              <span className="font-mono text-slate-800">{settings.ollamaModel || 'nincs'} (Ollama)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleResetCooldowns()}
              className="px-3 py-2 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Cooldown Reset
            </button>
            <button
              type="button"
              disabled={discovering}
              onClick={() => void handleDiscover()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${discovering ? 'animate-spin' : ''}`} />
              {tr(language, 'discoverModels')} (Kulcsonként)
            </button>
          </div>
        </div>

        {/* Task-aware Test Call Bar */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-3">
            <select
              aria-label="Teszt hívás feladattípus"
              value={testTaskType}
              onChange={(e) => setTestTaskType(e.target.value as TaskType)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {TASK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <input
              type="text"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Teszt prompt a teljes router lánc kipróbálásához..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="button"
              onClick={() => void handleTestFailover()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
            >
              <Zap className="h-3.5 w-3.5" />
              Teszt Hívás (Teljes Lánc)
            </button>
          </div>
        </div>
      </div>

      {failoverOutput && (
        <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono whitespace-pre-wrap">
          {failoverOutput}
        </div>
      )}

      {/* Active Waiting Queue Banner */}
      {effectiveQueue.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-amber-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-700" />
              Várólistás AI Kérések ({effectiveQueue.length}) — Automatikus folytatás kvóta/cooldown felszabaduláskor
            </div>
            <div className="space-y-0.5 text-[11px] font-mono text-amber-800">
              {effectiveQueue.slice(0, 5).map((q) => (
                <div key={q.id}>
                  #{q.id} [{q.taskType}] ({q.status}, próbák: {q.attempts}): {q.promptPreview}
                  {q.readyAt ? ` · újrapróbálás: ${new Date(q.readyAt).toLocaleTimeString()}` : ''} · {q.lastReason}
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={queueBusy}
            onClick={() => void handleDrainQueue()}
            className="px-3 py-1.5 text-xs font-medium bg-amber-800 text-white rounded-lg hover:bg-amber-900 disabled:opacity-50"
          >
            {queueBusy ? 'Futtatás...' : 'Sor Azonnali Ürítése'}
          </button>
        </div>
      )}

      {/* Hardware-Aware Local Ollama Suite + Cost Projection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-700" />
              Hardver-érzékeny Helyi Ollama Csomag
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={ollamaBusy}
                onClick={() => void handleReselectOllama()}
                className="px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Újraválasztás
              </button>
              <button
                type="button"
                disabled={ollamaBusy}
                onClick={() => void handleBenchmarkOllama()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                <Gauge className="h-3.5 w-3.5" />
                Benchmark
              </button>
              <button
                type="button"
                onClick={() => void handleUnloadOllama()}
                className="px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-50"
              >
                RAM Ürítés
              </button>
              <button
                type="button"
                onClick={() => void handleWarmOllama()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
              >
                <Flame className="h-3.5 w-3.5" />
                Előmelegítés
              </button>
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 space-y-1">
            <div>
              Tier: <span className="font-semibold text-slate-900">{settings.detectedHardwareTier || 'auto'}</span>
              {hw ? (
                <>
                  {' '}
                  · {hw.platform}/{hw.arch} ({hw.cpuCores} mag
                  {hw.hasAvx2 ? ', AVX2' : ''}
                  {hw.hasNeon ? ', NEON' : ''}) · RAM: {hw.ramFreeMb}/{hw.ramTotalMb} MB · Lemez:{' '}
                  {Math.round(hw.diskFreeMb / 1024)} GB ({hw.storageKind})
                  {hw.gpuVramMb > 0 ? ` · GPU: ${hw.gpuName} (${hw.gpuVramMb} MB VRAM)` : ' · CPU-mód'}
                </>
              ) : null}
            </div>
            <div>
              Fő: <span className="text-slate-900 font-semibold">{settings.ollamaModel || '-'}</span> · Gyors:{' '}
              {settings.ollamaFastModel || '-'} · Kód: {settings.ollamaCodeModel || '-'} · Embed:{' '}
              {settings.ollamaEmbeddingModel || '-'} · Vision: {settings.ollamaVisionModel || 'nincs'}
            </div>
            <div className="flex flex-wrap gap-3 text-slate-600">
              <span>
                SD-kímélő: {settings.sdCardSparingMode ? 'AKTÍV' : 'ki'} · Tömör helyi prompt:{' '}
                {settings.compactLocalPrompt ? 'be' : 'ki'}
              </span>
              {settings.ollamaBenchmark && (
                <span className="text-emerald-700 font-semibold">
                  Utolsó benchmark ({settings.ollamaBenchmark.model}): {settings.ollamaBenchmark.tokensPerSec} tok/s ·{' '}
                  {settings.ollamaBenchmark.latencyMs}ms
                </span>
              )}
            </div>
          </div>

          {settings.ollamaPendingPullModels && settings.ollamaPendingPullModels.length > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] font-mono text-amber-800">
              Letöltésre vár (offline/késleltetett): {settings.ollamaPendingPullModels.join(', ')}
            </div>
          )}
          {settings.ollamaCleanupSuggestions && settings.ollamaCleanupSuggestions.length > 0 && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-600">
              Tisztítási javaslat (elavult/nem használt helyi modellek): {settings.ollamaCleanupSuggestions.join(', ')}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-500 block">Kontextus (num_ctx)</span>
              <input
                type="number"
                step="256"
                min="512"
                max="32768"
                value={numCtx}
                onChange={(e) => setNumCtx(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 block">keep_alive</span>
              <input
                type="text"
                value={keepAlive}
                onChange={(e) => setKeepAlive(e.target.value)}
                placeholder="10m"
                className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void handleSaveOllamaOpt()}
                className="w-full px-3 py-1.5 font-medium border border-slate-300 bg-white hover:bg-slate-50 rounded"
              >
                Paraméterek Mentése
              </button>
            </div>
          </div>
          {ollamaStatus && <div className="text-[11px] font-mono text-slate-700">{ollamaStatus}</div>}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-700" />
              Havi Költség-Projekció & Kontextus Diéta
            </h3>
            <span
              className={`text-xs font-mono font-semibold ${
                projection?.alertTriggered ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {projection?.alertTriggered ? 'RIASZTÁSI KÜSZÖB FELETT' : 'Költségvetésen belül'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">Napi költés</div>
              <div className="font-mono font-semibold text-sm tabular-nums">
                ${(projection?.dailySpendUsd ?? settings.dailySpendUsd).toFixed(4)}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">30 napos projekció</div>
              <div className="font-mono font-semibold text-sm tabular-nums">
                ${(projection?.projectedMonthlyUsd ?? settings.dailySpendUsd * 30).toFixed(2)}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-slate-500">Havi riasztás</div>
              <div className="font-mono font-semibold text-sm tabular-nums">
                ${settings.monthlyBudgetAlertUsd.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Kontextus Diéta aktív: maxToolSteps={settings.maxToolSteps} · alap mód={settings.defaultPreset} · automatikus hosszú üzenet tömörítés · Szigorú verifikáció Ollama/degradált módban aktív.
          </div>
          {routingMsg && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-700">
              {routingMsg}
            </div>
          )}
        </div>
      </div>

      {/* Multi-Key Pool & Task Ranking + Blocklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Kulcs-Pool, Projekt-kvóta & Terheléselosztás</h2>
            <button
              type="button"
              onClick={() => setBulkMode((v) => !v)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
            >
              {bulkMode ? 'Egyesével megadás' : 'Tömeges beillesztés'}
            </button>
          </div>

          {localGeminiWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <span>{localGeminiWarning}</span>
            </div>
          )}

          <form onSubmit={handleAddKey} className="space-y-2.5 pb-4 border-b border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={newKeyProvider}
                onChange={(e) => setNewKeyProvider(e.target.value as ProviderId)}
                aria-label="Provider for new API key"
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <input
                type="text"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder={bulkMode ? 'Címke előtag (pl. Projekt A)' : 'Címke (pl. Saját kulcs #1)'}
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={newKeyProjectId}
                onChange={(e) => setNewKeyProjectId(e.target.value)}
                placeholder="Projekt ID (pl. gcp-proj-1)"
                title="Google Cloud Projekt ID (Gemini kvóták projektenként osztoznak)"
                className="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            {bulkMode ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Illessz be több API kulcsot soronként vagy vesszővel elválasztva..."
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tömeges Import a Vaultba
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="API kulcs (titkosítva a szerver vaultban tárolva)..."
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Hozzáadás
                </button>
              </div>
            )}

            {keyActionMsg && <div className="text-[11px] font-mono text-emerald-700">{keyActionMsg}</div>}
          </form>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {PROVIDERS.map((p) => {
              const keys = settings.providerKeys[p] || [];
              const q = quotas[p];
              const spendP = gatewayAnalytics.spendByProvider[p] ?? 0;
              return (
                <div key={p} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase text-slate-900">
                      {p} · <span className="font-mono text-slate-500">${spendP.toFixed(4)}</span>
                    </span>
                    <span className="text-slate-500 font-mono tabular-nums">
                      {q?.remainingRequests !== null && q?.limitRequests !== null
                        ? `${q.remainingRequests}/${q.limitRequests} (${tr(language, 'realHeaderBadge')})`
                        : `${q?.isEstimated ? tr(language, 'estimatedBadge') : q?.sourceNote}`}
                    </span>
                  </div>
                  {keys.length === 0 ? (
                    <div className="text-[11px] text-slate-500">
                      {p === 'ollama' ? 'Helyi motor — API kulcs nem szükséges' : 'Nincs hozzáadott kulcs'}
                    </div>
                  ) : (
                    keys.map((k) => {
                      const inCooldown = Boolean(k.cooldownUntil && Date.parse(k.cooldownUntil) > Date.now());
                      const dailyOut = Boolean(k.dailyExhaustedUntil && Date.parse(k.dailyExhaustedUntil) > Date.now());
                      const rpmCap = Math.max(1, k.rpmLimit || 15);
                      const rpmUsed = k.requestsLastMinute || 0;
                      const rpmPct = Math.min(100, Math.round((rpmUsed / rpmCap) * 100));
                      return (
                        <div
                          key={k.id}
                          className="bg-white px-2.5 py-2 rounded border border-slate-200 space-y-1.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-mono text-slate-700 flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-slate-900">{k.label}</span>
                              <span>· {k.maskedKey}</span>
                              {k.projectId && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-200 rounded">
                                  proj:{k.projectId}
                                </span>
                              )}
                              {!k.enabled && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-800 rounded">
                                  LETILTVA{k.disabledReason ? ` (${k.disabledReason})` : ''}
                                </span>
                              )}
                              {dailyOut && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-rose-100 text-rose-800 rounded">
                                  NAPI LIMIT
                                </span>
                              )}
                              {inCooldown && !dailyOut && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded">
                                  PIHENŐN
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleToggleKeyEnabled(p, k.id, k.enabled)}
                                title={k.enabled ? 'Kulcs szüneteltetése' : 'Kulcs engedélyezése'}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-slate-300 rounded hover:bg-slate-50"
                              >
                                {k.enabled ? (
                                  <>
                                    <PauseCircle className="h-3 w-3 text-amber-700" />
                                    Tiltás
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="h-3 w-3 text-emerald-700" />
                                    Engedélyez
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove key ${k.label}`}
                                onClick={() => void handleRemoveKey(p, k.id)}
                                className="text-slate-400 hover:text-red-600 p-0.5"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                            <span className="w-28 shrink-0">
                              RPM: {rpmUsed}/{rpmCap} ({rpmPct}%)
                            </span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                              <div
                                className={`h-full ${
                                  rpmPct >= 80 ? 'bg-amber-500' : 'bg-emerald-600'
                                }`}
                                style={{ width: `${rpmPct}%` }}
                              />
                            </div>
                            <span>Párh.: {k.activeConcurrency || 0}</span>
                            {k.failureCount > 0 && <span className="text-rose-700">Hibák: {k.failureCount}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Task-Based Ranking + Overrides + Blocklist */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-700" />
              Feladat-alapú Rangsor, Felülbírálás & Tiltólista
            </h2>
            <select
              aria-label="Feladattípus rangsor előnézet"
              value={selectedTaskType}
              onChange={(e) => setSelectedTaskType(e.target.value as TaskType)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {TASK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto max-h-[210px] border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-1.5 px-2.5 font-medium">#</th>
                  <th className="py-1.5 px-2.5 font-medium">Szolgáltató / Modell</th>
                  <th className="py-1.5 px-2.5 font-medium text-right">Pontszám</th>
                  <th className="py-1.5 px-2.5 font-medium text-right">Ár $/1M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(matrixResp?.taskRankings || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      Adj meg legalább egy kulcsot vagy futtasd a felderítést.
                    </td>
                  </tr>
                ) : (
                  (matrixResp?.taskRankings || []).map((r, i) => (
                    <tr key={`${r.provider}-${r.modelId}-${i}`} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2.5 font-mono text-slate-500">{i + 1}</td>
                      <td className="py-1.5 px-2.5 font-mono text-slate-900">
                        {r.provider} / {r.modelId || '(auto)'}
                        {r.reason ? <div className="text-[10px] text-slate-500 font-sans">{r.reason}</div> : null}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono font-semibold tabular-nums">
                        {r.score.toFixed(1)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-600">
                        {r.isFree ? '$0.00' : `$${r.inputCostPer1M.toFixed(2)}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleSaveTaskRanking} className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            <label className="block font-medium text-slate-700">
              Manuális modell prioritás ({selectedTaskType}, vesszővel elválasztva):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="Pl. gemini-2.5-pro, deepseek/deepseek-chat, qwen2.5:7b"
                className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium whitespace-nowrap"
              >
                Rangsor Mentése
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveBlocklist} className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            <label className="flex items-center gap-1.5 font-medium text-slate-700">
              <Ban className="h-3.5 w-3.5 text-slate-600" />
              Felhasználói Modell Tiltólista (vesszővel elválasztva, pl. legacy-model):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={blocklistInput}
                onChange={(e) => setBlocklistInput(e.target.value)}
                placeholder="Pl. deprecated-model, draga-modell*"
                className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
              <button
                type="submit"
                className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 rounded font-medium whitespace-nowrap"
              >
                Tiltólista Mentése
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Key x Model Availability Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-700" />
            Kulcs × Modell Elérhetőségi Mátrix ({effectiveMatrix.length} bejegyzés)
          </h2>
          <span className="text-xs text-slate-500">
            Automatikus 24 órás felderítés + élő kvóta, RPM és verifikációs statisztika
          </span>
        </div>

        <div className="overflow-x-auto max-h-[340px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 px-2.5 font-medium">Kulcs (Maszkolva)</th>
                <th className="py-2 px-2.5 font-medium">Modell ID</th>
                <th className="py-2 px-2.5 font-medium">Képességek & Ctx</th>
                <th className="py-2 px-2.5 font-medium text-right">RPM / Siker</th>
                <th className="py-2 px-2.5 font-medium">Státusz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {effectiveMatrix.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Még nincs mátrix bejegyzés — adj hozzá API kulcsot és kattints a Modellfelderítés gombra.
                  </td>
                </tr>
              ) : (
                effectiveMatrix.slice(0, 120).map((m) => {
                  const st = formatMatrixStatus(m);
                  const caps: string[] = [];
                  if (m.capabilities?.vision) caps.push('vision');
                  if (m.capabilities?.audio) caps.push('audio');
                  if (m.capabilities?.tools) caps.push('tools');
                  if (m.capabilities?.reasoning) caps.push('reasoning');
                  if (m.capabilities?.embedding) caps.push('embed');
                  return (
                    <tr key={`${m.keyId}-${m.modelId}`} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono text-slate-700">
                        <div className="font-semibold text-slate-900">{m.keyLabel}</div>
                        <div className="text-[10px] text-slate-500">
                          {m.provider} · {m.maskedKey}
                          {m.projectId ? ` · proj:${m.projectId}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 font-mono text-slate-900">
                        {m.modelId}
                        <div className="text-[10px] text-slate-500">
                          {m.isFree ? 'Ingyenes / Lokális' : `$${m.inputCostPer1M.toFixed(2)} / $${m.outputCostPer1M.toFixed(2)} /1M`}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-[11px] font-mono text-slate-600">
                        {Math.round((m.contextWindow || 0) / 1000)}k ctx
                        {caps.length > 0 ? ` · ${caps.join(', ')}` : ''}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums text-[11px] text-slate-700">
                        {m.requestsLastMinute}/{m.rpmLimit} RPM
                        <div className="text-[10px] text-slate-500">
                          OK:{m.successCount} · V+:{m.verificationPassCount}/V-:{m.verificationFailCount}
                        </div>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-medium border rounded ${st.tone}`}>
                          {st.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Last 20 Routed Decisions + Discovered Models */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-700" />
            Utolsó 20 Útvonalválasztás (Átláthatósági Napló)
          </h2>
          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-1.5 px-2 font-medium">Idő / Feladat</th>
                  <th className="py-1.5 px-2 font-medium">Modell & Kulcs</th>
                  <th className="py-1.5 px-2 font-medium">Váltás oka</th>
                  <th className="py-1.5 px-2 font-medium text-right">Ms / Ár</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {effectiveLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Még nem történt AI modellhívás.
                    </td>
                  </tr>
                ) : (
                  effectiveLogs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600">
                        <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
                        <div className="text-slate-900 font-semibold">{log.taskType}</div>
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[11px]">
                        <div className="text-slate-900">
                          {log.provider}/{log.modelId}
                          {log.degradedMode && (
                            <span className="ml-1 px-1 py-0.5 text-[9px] bg-amber-100 text-amber-800 rounded">
                              DEGRADÁLT
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500">
                          {log.keyLabel} ({log.maskedKey})
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-[11px] text-slate-600 max-w-[200px] truncate" title={log.switchReason || ''}>
                        {log.switchReason || (log.ok ? 'Optimális jelölt' : log.error || 'Hiba')}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[11px]">
                        <div>{log.latencyMs}ms</div>
                        <div className="text-slate-500">${log.costUsd.toFixed(4)}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Dinamikusan Felfedezett Modellek ({visibleModels.length})
            </h2>
            <button
              type="button"
              onClick={() => setFreeOnlyFilter((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
                freeOnlyFilter ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              Csak $0 Ingyenes / Lokális
            </button>
          </div>

          <div className="overflow-x-auto max-h-[340px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Modell ID</th>
                  <th className="py-2 pr-3 font-medium">Szolgáltató</th>
                  <th className="py-2 pr-3 font-medium">Kategória</th>
                  <th className="py-2 pr-3 font-medium text-right">Bemenet $/1M</th>
                  <th className="py-2 font-medium text-right">Forrás</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleModels.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Kattints a &ldquo;{tr(language, 'discoverModels')}&rdquo; gombra az élő végpontok lekérdezéséhez.
                    </td>
                  </tr>
                ) : (
                  visibleModels.map((m) => (
                    <tr key={`${m.provider}-${m.id}`} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 font-mono text-slate-900">{m.id}</td>
                      <td className="py-2 pr-3 text-slate-600">{m.provider}</td>
                      <td className="py-2 pr-3 text-slate-600">{m.tier}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {m.isFree ? '$0.00' : `$${m.inputCostPer1M.toFixed(2)}`}
                      </td>
                      <td className="py-2 text-right text-slate-500">{m.source}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* OpenAI-Compatible AI Gateway, Virtual Keys, Cache & Guardrails */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Key className="h-4 w-4 text-slate-700" />
                AI Gateway & Virtuális Kulcsok (/v1/*)
              </h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{proxyEndpoint}</p>
            </div>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(proxyEndpoint)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
            >
              <Copy className="h-3 w-3" />
              URL Másolás
            </button>
          </div>

          <form
            onSubmit={handleCreateVirtualKey}
            className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100"
          >
            <input
              type="text"
              value={vkName}
              onChange={(e) => setVkName(e.target.value)}
              placeholder="Kulcs neve (pl. Cursor)"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <input
              type="number"
              step="0.5"
              min="0"
              value={vkBudget}
              onChange={(e) => setVkBudget(Number(e.target.value))}
              aria-label="Virtual key max budget USD"
              title="Max USD budget"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <input
              type="number"
              min="1"
              value={vkRpm}
              onChange={(e) => setVkRpm(Number(e.target.value))}
              aria-label="Virtual key RPM limit"
              title="RPM limit"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
            >
              <Plus className="h-3.5 w-3.5" />
              Kulcs
            </button>
            <input
              type="text"
              value={vkModels}
              onChange={(e) => setVkModels(e.target.value)}
              placeholder="Engedélyezett modellek vesszővel (üres = mind)"
              className="sm:col-span-5 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded"
            />
            <input
              type="datetime-local"
              value={vkExpiresAt}
              onChange={(e) => setVkExpiresAt(e.target.value)}
              aria-label="Virtual key expiry"
              title="Lejárat (opcionális)"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded"
            />
            <input
              type="text"
              value={vkAllowedIps}
              onChange={(e) => setVkAllowedIps(e.target.value)}
              placeholder="Engedélyezett IP / CIDR (pl. 192.168.1.0/24)"
              className="sm:col-span-3 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded"
            />
          </form>

          {revealedRawKey && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-emerald-900">
                Új Virtuális API Kulcs (másold ki most, később csak maszkolva látszik):
              </div>
              <div className="font-mono text-emerald-800 break-all">{revealedRawKey}</div>
            </div>
          )}

          <div className="space-y-2 max-h-[210px] overflow-y-auto">
            {virtualKeys.length === 0 ? (
              <p className="text-xs text-slate-500">
                Még nincs virtuális kulcs — a /v1/chat/completions nyitott helyi módban fut amíg kulcsot nem hozol létre.
              </p>
            ) : (
              virtualKeys.map((vk) => (
                <div
                  key={vk.id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {vk.name} <span className="font-mono text-slate-500">({vk.maskedKey})</span>
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-slate-600">
                      Költés: ${vk.spendUsd.toFixed(4)} / ${vk.maxBudgetUsd.toFixed(2)} · {vk.rpmLimit} RPM ·{' '}
                      {vk.totalRequests} kérés · {vk.totalTokens} tok
                      {vk.expiresAt ? ` · Lejár: ${vk.expiresAt.slice(0, 10)}` : ''}
                      {vk.allowedIps && vk.allowedIps.length > 0 ? ` · IP: ${vk.allowedIps.join(',')}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleVirtualKey(vk)}
                      className={`px-2 py-0.5 text-[11px] rounded border ${
                        vk.enabled
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      {vk.enabled ? 'Aktív' : 'Tiltva'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Revoke virtual key ${vk.name}`}
                      onClick={() => void handleRevokeVirtualKey(vk.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-slate-700" />
            Gateway Cache, Guardrails & Analitika
          </h2>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Proxy Kérések</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {gatewayAnalytics.totalProxyRequests}
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-slate-500">LRU Cache Hit / Méret</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {gatewayAnalytics.cacheHits} / {cacheSize}
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Cache Megtakarítás</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                ${gatewayAnalytics.savedUsd.toFixed(4)}
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Guardrail Blokk</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {gatewayAnalytics.guardrailsBlocked}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.responseCacheEnabled}
                  onChange={() => void handleToggleGatewayFlag('responseCacheEnabled')}
                />
                <span>LRU Válasz Cache ({settings.responseCacheTtlSec}s TTL)</span>
              </label>
              <button
                type="button"
                onClick={() => void handleClearCache()}
                className="px-2 py-0.5 text-[11px] border border-slate-300 rounded hover:bg-slate-50"
              >
                Cache Törlés
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.guardrailsEnabled}
                onChange={() => void handleToggleGatewayFlag('guardrailsEnabled')}
              />
              <span>Guardrails Védelem Aktív</span>
            </label>
            <div className="pl-5 flex flex-wrap gap-4 text-[11px] text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.guardrailBlockSecrets}
                  onChange={() => void handleToggleGatewayFlag('guardrailBlockSecrets')}
                />
                Titkok szűrése
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.guardrailBlockPromptInjection}
                  onChange={() => void handleToggleGatewayFlag('guardrailBlockPromptInjection')}
                />
                Prompt Injection
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.guardrailBlockPii}
                  onChange={() => void handleToggleGatewayFlag('guardrailBlockPii')}
                />
                PII Szűrés
              </label>
            </div>
          </div>

          {gatewayAnalytics.providerHealth && (
            <div className="pt-3 border-t border-slate-200 space-y-1.5">
              <div className="text-xs font-semibold text-slate-800">Szolgáltatói Egészség & Késleltetés Ranglista</div>
              <div className="space-y-1 text-[11px] font-mono tabular-nums">
                {PROVIDERS.map((p) => {
                  const h = gatewayAnalytics.providerHealth?.[p];
                  if (!h) return null;
                  return (
                    <div
                      key={p}
                      className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded"
                    >
                      <span className="font-semibold uppercase text-slate-800">{p}</span>
                      <span className="text-slate-600">
                        {h.avgLatencyMs}ms · {Math.max(0, h.totalCalls - h.failedCalls)} OK / {h.failedCalls} hiba
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
