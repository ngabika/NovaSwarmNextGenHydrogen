import React, { useState } from 'react';
import { Gauge, GitBranch, Globe, Moon, Play, Plus, RefreshCw, Send, Share2, Shield, Trash2 } from 'lucide-react';
import type {
  Agent,
  AgentBenchmarkRun,
  FederationPeer,
  KanbanCard,
  LanguageCode,
  McpServer,
  NightShiftRun,
  ProviderId,
  VoiceReplyMode,
} from '../../shared/types';
import { useLocale } from '../locales/translations';
import { InfoHint } from './InfoHint';

interface Props {
  language?: LanguageCode;
  agents: Agent[];
  mcpServers: McpServer[];
  kanban: KanbanCard[];
  federationPeers: FederationPeer[];
  federationEnabled: boolean;
  agentBenchmarks?: AgentBenchmarkRun[];
  nightShiftRuns?: NightShiftRun[];
  onRefreshState: () => Promise<void>;
}

const AgentTreeNode: React.FC<{
  agent: Agent;
  allAgents: Agent[];
  mcpServers: McpServer[];
  depth: number;
  onToggle: (agent: Agent, field: 'active' | 'webSearchEnabled' | 'hostExecutionEnabled') => Promise<void>;
  onSavePolicy: (
    agentId: string,
    payload: {
      token: string;
      budget: number;
      voiceMode: VoiceReplyMode;
      allowedMcpIds: string[];
      activeHoursStart: number;
      activeHoursEnd: number;
      maxRunsPerHour: number;
      modelChain: string[];
    }
  ) => Promise<void>;
  onRunBenchmark: (agentId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ agent, allAgents, mcpServers, depth, onToggle, onSavePolicy, onRunBenchmark, onDelete }) => {
  const { tx } = useLocale();
  const children = allAgents.filter((a) => a.parentAgentId === agent.id);
  const [editingBot, setEditingBot] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [budget, setBudget] = useState(agent.dailyBudgetUsd ?? 0);
  const [voiceMode, setVoiceMode] = useState<VoiceReplyMode>(agent.voiceReplyMode ?? 'off');
  const [allowedMcpIds, setAllowedMcpIds] = useState<string[]>(agent.allowedMcpIds || []);
  const [activeHoursStart, setActiveHoursStart] = useState<number>(agent.activeHoursStart ?? 0);
  const [activeHoursEnd, setActiveHoursEnd] = useState<number>(agent.activeHoursEnd ?? 23);
  const [maxRunsPerHour, setMaxRunsPerHour] = useState<number>(agent.maxRunsPerHour ?? 60);
  const [chainText, setChainText] = useState<string>((agent.modelChain || []).join(', '));
  const [benchBusy, setBenchBusy] = useState(false);

  const toggleMcpId = (id: string) => {
    setAllowedMcpIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-2" style={{ marginInlineStart: depth > 0 ? `${Math.min(depth * 24, 96)}px` : '0px' }}>
      <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {agent.isSupervisor ? (
                <Shield className="h-4 w-4 text-slate-700" />
              ) : (
                <GitBranch className="h-4 w-4 text-slate-500" />
              )}
              <span className="text-sm font-semibold text-slate-900">{agent.name}</span>
              <span className="text-xs text-slate-500">· {agent.role}</span>
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              {agent.providerId} / {agent.modelId} {tx('· Mélység:')} {depth} {tx('· Napi költés: $')}
              {(agent.dailySpendUsd ?? 0).toFixed(4)}
              {agent.dailyBudgetUsd ? ` / $${agent.dailyBudgetUsd.toFixed(2)}` : ''}
              {agent.telegramHasToken ? tx(' · Dedikált TG Bot') : ''}
              {typeof agent.benchmarkScore === 'number' ? tx(' · Benchmark: {0}%', agent.benchmarkScore) : ''}
              {agent.allowedMcpIds && agent.allowedMcpIds.length > 0
                ? ` · MCP:${agent.allowedMcpIds.length}`
                : tx(' · MCP:Mind')}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggle(agent, 'webSearchEnabled')}
              className={`px-2.5 py-1 text-xs rounded border whitespace-nowrap shrink-0 ${
                agent.webSearchEnabled
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Web: {agent.webSearchEnabled ? tx('Aktív') : tx('Inaktív')}
            </button>
            <button
              type="button"
              onClick={() => onToggle(agent, 'hostExecutionEnabled')}
              className={`px-2.5 py-1 text-xs rounded border whitespace-nowrap shrink-0 ${
                agent.hostExecutionEnabled
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Host: {agent.hostExecutionEnabled ? tx('Aktív') : tx('Inaktív')}
            </button>
            {!agent.isSupervisor && (
              <>
                <button
                  type="button"
                  disabled={benchBusy}
                  onClick={async () => {
                    setBenchBusy(true);
                    try {
                      await onRunBenchmark(agent.id);
                    } finally {
                      setBenchBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Gauge className="h-3.5 w-3.5" />
                  {benchBusy ? `${tx('Futtatás')}...` : 'Benchmark'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBot((v) => !v)}
                  className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  {tx('Bot, MCP & Ütemezés')}
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(agent, 'active')}
                  className={`px-2.5 py-1 text-xs rounded border whitespace-nowrap shrink-0 ${
                    agent.active
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {agent.active ? tx('Aktív') : tx('Inaktív')}
                </button>
                <button
                  type="button"
                  aria-label={tx('Ágens törlése: {0}', agent.name)}
                  onClick={() => onDelete(agent.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {editingBot && (
          <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder={agent.telegramHasToken ? tx('Új Telegram Bot Token...') : tx('Dedikált Telegram Bot Token')}
                className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <input
                type="number"
                step="0.2"
                min="0"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                placeholder={tx('Napi limit ($)')}
                title={tx('Ágens napi USD limit (0 = globális)')}
                className="px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
              <select
                value={voiceMode}
                onChange={(e) => setVoiceMode(e.target.value as VoiceReplyMode)}
                className="px-2 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="off">{tx('Hangválasz: Ki')}</option>
                <option value="on_voice">{tx('Hangra hang')}</option>
                <option value="always">{tx('Mindig hang')}</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 block">{tx('Aktív óra kezdete (0-23)')}</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(Number(e.target.value))}
                  className="w-full px-2 py-1 font-mono border border-slate-300 rounded"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 block">{tx('Aktív óra vége (0-23)')}</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={activeHoursEnd}
                  onChange={(e) => setActiveHoursEnd(Number(e.target.value))}
                  className="w-full px-2 py-1 font-mono border border-slate-300 rounded"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 block">{tx('Max futás / óra')}</span>
                <input
                  type="number"
                  min="0"
                  value={maxRunsPerHour}
                  onChange={(e) => setMaxRunsPerHour(Number(e.target.value))}
                  className="w-full px-2 py-1 font-mono border border-slate-300 rounded"
                />
              </label>
            </div>

            {mcpServers.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-600">
                  {tx('MCP Jogosultsági Mátrix (üres = minden MCP engedélyezve):')}
                </div>
                <div className="flex flex-wrap gap-3">
                  {mcpServers.map((m) => (
                    <label key={m.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedMcpIds.includes(m.id)}
                        onChange={() => toggleMcpId(m.id)}
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                <span>{tx('Tartalék Modell Sorrend (vesszővel elválasztva, pl. openrouter:deepseek/deepseek-chat, ollama:qwen2.5:3b)')}</span>
                <InfoHint
                  label={tx('Tartalék modell sorrend')}
                  text={tx('Ha az elsődleges AI szolgáltató nem elérhető vagy drága, ebben a sorrendben próbálkozik a tartalék modellekkel.')}
                />
              </label>
              <input
                type="text"
                value={chainText}
                onChange={(e) => setChainText(e.target.value)}
                placeholder="provider:model, provider:model"
                className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
            </div>

            <button
              type="button"
              onClick={async () => {
                await onSavePolicy(agent.id, {
                  token: tgToken,
                  budget,
                  voiceMode,
                  allowedMcpIds,
                  activeHoursStart,
                  activeHoursEnd,
                  maxRunsPerHour,
                  modelChain: chainText
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                setTgToken('');
                setEditingBot(false);
              }}
              className="w-full px-3 py-1.5 bg-slate-900 text-white rounded font-medium"
            >
              {tx('Ágens Szabályok & Bot Mentése')}
            </button>
          </div>
        )}
      </div>

      {children.map((child) => (
        <AgentTreeNode
          key={child.id}
          agent={child}
          allAgents={allAgents}
          mcpServers={mcpServers}
          depth={depth + 1}
          onToggle={onToggle}
          onSavePolicy={onSavePolicy}
          onRunBenchmark={onRunBenchmark}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export const OrgAgentsView: React.FC<Props> = ({
  agents,
  mcpServers,
  kanban,
  federationPeers,
  federationEnabled,
  agentBenchmarks = [],
  nightShiftRuns = [],
  onRefreshState,
}) => {
  const { t, tx, intlLocale } = useLocale();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [providerId, setProviderId] = useState<ProviderId>('gemini');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [hostExecutionEnabled, setHostExecutionEnabled] = useState(true);
  const [nightBusy, setNightBusy] = useState(false);
  const [nightStatus, setNightStatus] = useState<string | null>(null);

  // Federation Peer form + Handoff + Memory Sync
  const [peerName, setPeerName] = useState('');
  const [peerUrl, setPeerUrl] = useState('');
  const [peerToken, setPeerToken] = useState('');
  const [fedAddress, setFedAddress] = useState('');
  const [fedContent, setFedContent] = useState('');
  const [handoffCardId, setHandoffCardId] = useState('');
  const [handoffPeerId, setHandoffPeerId] = useState('');
  const [fedReply, setFedReply] = useState<string | null>(null);

  const rootAgents = agents.filter((a) => !a.parentAgentId);
  const selectableParents = agents.filter((a) => !a.isSupervisor);
  const activeCards = kanban.filter((c) => !c.archived);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        role: role.trim() || tx('Specialista'),
        parentAgentId: parentAgentId || null,
        providerId,
        modelId,
        systemPrompt: systemPrompt.trim() || tx('Autonóm AI specialista ágens.'),
        webSearchEnabled,
        hostExecutionEnabled,
      }),
    });
    setName('');
    setRole('');
    setSystemPrompt('');
    await onRefreshState();
  };

  const handleToggle = async (
    agent: Agent,
    field: 'active' | 'webSearchEnabled' | 'hostExecutionEnabled'
  ) => {
    await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !agent[field] }),
    });
    await onRefreshState();
  };

  const handleSavePolicy = async (
    agentId: string,
    payload: {
      token: string;
      budget: number;
      voiceMode: VoiceReplyMode;
      allowedMcpIds: string[];
      activeHoursStart: number;
      activeHoursEnd: number;
      maxRunsPerHour: number;
      modelChain: string[];
    }
  ) => {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentTelegramToken: payload.token.trim() || undefined,
        dailyBudgetUsd: payload.budget,
        voiceReplyMode: payload.voiceMode,
        allowedMcpIds: payload.allowedMcpIds,
        activeHoursStart: payload.activeHoursStart,
        activeHoursEnd: payload.activeHoursEnd,
        maxRunsPerHour: payload.maxRunsPerHour,
        modelChain: payload.modelChain,
      }),
    });
    await onRefreshState();
  };

  const handleRunBenchmark = async (agentId: string) => {
    await fetch(`/api/agents/${agentId}/benchmark`, { method: 'POST' });
    await onRefreshState();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    await onRefreshState();
  };

  const handleAddPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerName.trim() || !peerUrl.trim()) return;
    await fetch('/api/federation/peers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: peerName, baseUrl: peerUrl, sharedToken: peerToken }),
    });
    setPeerName('');
    setPeerUrl('');
    setPeerToken('');
    await onRefreshState();
  };

  const handlePingPeer = async (id: string) => {
    await fetch(`/api/federation/peers/${id}/ping`, { method: 'POST' });
    await onRefreshState();
  };

  const handleSendFed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fedAddress.trim() || !fedContent.trim()) return;
    const res = await fetch('/api/federation/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: fedAddress.trim(), content: fedContent.trim() }),
    });
    const data = (await res.json()) as { reply?: string; error?: string };
    setFedReply(data.reply || data.error || tx('Elküldve'));
    await onRefreshState();
  };

  const handleKanbanHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoffCardId || !handoffPeerId) return;
    const res = await fetch('/api/federation/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: handoffCardId, peerId: handoffPeerId }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
    setFedReply(data.message || data.error || (data.ok ? tx('Kanban feladat átadva.') : tx('Handoff hiba')));
    await onRefreshState();
  };

  const handleSyncSharedMemory = async () => {
    const res = await fetch('/api/federation/memory-sync', { method: 'POST' });
    const data = (await res.json()) as { pushed?: number; peers?: number };
    setFedReply(tx('Közös (shared) memóriák szinkronizálva: {0} bejegyzés -> {1} társ.', data.pushed ?? 0, data.peers ?? 0));
    await onRefreshState();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {tx('Szervezeti Hierarchia, MCP Mátrix & Ütemezés')}
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{agents.length} {tx('ágens')}</span>
          </div>

          <div className="space-y-3">
            {rootAgents.map((root) => (
              <AgentTreeNode
                key={root.id}
                agent={root}
                allAgents={agents}
                mcpServers={mcpServers}
                depth={0}
                onToggle={handleToggle}
                onSavePolicy={handleSavePolicy}
                onRunBenchmark={handleRunBenchmark}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {agentBenchmarks.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="text-xs font-semibold text-slate-900">{tx('Legutóbbi Ágens Benchmark Eredmények')}</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {agentBenchmarks.slice(-6).reverse().map((b) => (
                  <div key={b.id} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between text-xs font-mono tabular-nums">
                    <span>{b.agentName} · {b.passed}/{b.total} {tx('teszt')}</span>
                    <span>{b.score}% · {b.avgLatencyMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleCreate}
          className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
        >
          <h3 className="text-base font-semibold text-slate-900">{t('createAgent')}</h3>
          <div>
            <label htmlFor="ag-name" className="block text-xs font-medium text-slate-700 mb-1">
              {tx('Név')}
            </label>
            <input
              id="ag-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tx('Pl. Adatbázis Mérnök')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="ag-role" className="block text-xs font-medium text-slate-700 mb-1">
              {tx('Szerepkör')}
            </label>
            <input
              id="ag-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={tx('Pl. SQL & Optimalizáció')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="ag-parent" className="block text-xs font-medium text-slate-700 mb-1">
              {tx('Felettes ágens (opcionális)')}
            </label>
            <select
              id="ag-parent"
              value={parentAgentId}
              onChange={(e) => setParentAgentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">{tx('Felső szint (nincs felettes)')}</option>
              {selectableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ag-prov" className="block text-xs font-medium text-slate-700 mb-1">
                {tx('Szolgáltató')}
              </label>
              <select
                id="ag-prov"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value as ProviderId)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="gemini">Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            <div>
              <label htmlFor="ag-model" className="block text-xs font-medium text-slate-700 mb-1">
                {tx('Modell ID')}
              </label>
              <input
                id="ag-model"
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder={tx('Automatikus (router választ)')}
                className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ag-prompt" className="block text-xs font-medium text-slate-700 mb-1">
              {tx('Rendszerutasítás')}
            </label>
            <textarea
              id="ag-prompt"
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={webSearchEnabled}
                onChange={(e) => setWebSearchEnabled(e.target.checked)}
              />
              {tx('Web keresés')}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hostExecutionEnabled}
                onChange={(e) => setHostExecutionEnabled(e.target.checked)}
              />
              {tx('Host parancsfuttatás')}
            </label>
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {t('createAgent')}
          </button>
        </form>
      </div>

      {/* P2P Federation Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-700" />
              {tx('Föderáció — Távoli NovaSwarm Példányok, Kanban Handoff & Memória Szinkron')}
            </h3>
            <p className="text-xs text-slate-500">
              {tx('Állapot:')} {federationEnabled ? tx('AKTÍV') : tx('Inaktív')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/federation/ping-all', { method: 'POST' });
                await onRefreshState();
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {tx('Mind Pingelése')}
            </button>
            <button
              type="button"
              onClick={() => void handleSyncSharedMemory()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Share2 className="h-3.5 w-3.5" />
              {tx('Shared Memória Szinkron')}
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ federationEnabled: !federationEnabled }),
                });
                await onRefreshState();
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 ${
                federationEnabled ? 'bg-emerald-700 text-white border-emerald-700' : 'border-slate-300 text-slate-700'
              }`}
            >
              {federationEnabled ? tx('Föderáció Aktív') : tx('Föderáció Bekapcsolása')}
            </button>
          </div>
        </div>

        {/* Ú58: Live Federation Topology SVG Graph */}
        {federationPeers.length > 0 && (
          <div className="border border-slate-200 rounded-lg bg-slate-50 p-2 overflow-x-auto">
            <svg viewBox="0 0 600 150" className="w-full min-w-[460px] h-36" role="img" aria-label={tx('Föderációs topológia')}>
              {federationPeers.map((p, idx) => {
                const spacing = 460 / Math.max(1, federationPeers.length);
                const px = 70 + idx * spacing + spacing / 2;
                const py = 112;
                const stroke = p.status === 'online' ? '#047857' : p.status === 'offline' ? '#b91c1c' : '#94a3b8';
                return (
                  <g key={p.id}>
                    <line x1={300} y1={32} x2={px} y2={py - 14} stroke={stroke} strokeWidth={1.8} />
                    <rect x={px - 58} y={py - 14} width={116} height={28} rx={4} fill="#ffffff" stroke={stroke} strokeWidth={1.5} />
                    <text x={px} y={py + 3} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#0f172a">
                      {p.name.slice(0, 14)} ({p.status})
                    </text>
                  </g>
                );
              })}
              <rect x={225} y={14} width={150} height={28} rx={4} fill="#0f172a" />
              <text x={300} y={32} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#ffffff">
                {tx('Helyi Csomópont ({0} ágens)', agents.filter((a) => !a.isSupervisor).length)}
              </text>
            </svg>
          </div>
        )}

        <form onSubmit={handleAddPeer} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            type="text"
            value={peerName}
            onChange={(e) => setPeerName(e.target.value)}
            placeholder={tx('Társ neve (pl. pi-node-2)')}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
          />
          <input
            type="url"
            value={peerUrl}
            onChange={(e) => setPeerUrl(e.target.value)}
            placeholder="https://peer:3000"
            className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
          />
          <input
            type="password"
            value={peerToken}
            onChange={(e) => setPeerToken(e.target.value)}
            placeholder={tx('Közös token (opcionális)')}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
          >
            {tx('+ Föderációs Társ')}
          </button>
        </form>

        {federationPeers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {federationPeers.map((p) => (
              <div key={p.id} className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900">{p.name}</span> ·{' '}
                    <span className="font-mono text-slate-600">{p.baseUrl}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePingPeer(p.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 border border-slate-300 bg-white rounded"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {tx('Futtatás')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/federation/peers/${p.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="font-mono text-[11px] text-slate-600">
                  {tx('Státusz:')} {p.status} {tx('· Távoli ágensek:')} {p.remoteAgents.length}
                  {p.lastError ? ` (${p.lastError})` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <form onSubmit={handleSendFed} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={fedAddress}
              onChange={(e) => setFedAddress(e.target.value)}
              placeholder={tx('társ/ágens (pl. pi-2/kutato)')}
              className="w-44 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <input
              type="text"
              value={fedContent}
              onChange={(e) => setFedContent(e.target.value)}
              placeholder={tx('Üzenet a föderált ágensnek...')}
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
            >
              <Send className="h-3 w-3" />
              {tx('Küldés')}
            </button>
          </form>

          <form onSubmit={handleKanbanHandoff} className="flex flex-wrap gap-2">
            <select
              value={handoffCardId}
              onChange={(e) => setHandoffCardId(e.target.value)}
              aria-label={tx('Kanban kártya átadása...')}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="">{tx('Kanban kártya átadása...')}</option>
              {activeCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              value={handoffPeerId}
              onChange={(e) => setHandoffPeerId(e.target.value)}
              aria-label={tx('Cél társ...')}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="">{tx('Cél társ...')}</option>
              {federationPeers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
            >
              {tx('Kártya Átadása')}
            </button>
          </form>
        </div>

        {fedReply && <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono">{fedReply}</div>}
      </div>

      {/* Ú61: Night Shift Autonomous Coder */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Moon className="h-4 w-4 text-indigo-600" />
              <span>{tx('Éjszakai Műszak — Önálló Háttér Karbantartó')}</span>
              <InfoHint
                label={tx('Éjszakai műszak')}
                text={tx('Manuálisan is elindíthatod az éjszakai karbantartási kört, ami összegzi a függő kártyákat és rendezi a memóriát.')}
              />
            </h3>
            <p className="text-xs text-slate-500">
              {tx('Önállóan feldolgozza a függő Kanban kártyákat és frissíti a memóriát rákérdezés nélkül.')}
            </p>
          </div>
          <button
            type="button"
            disabled={nightBusy}
            onClick={async () => {
              setNightBusy(true);
              setNightStatus(null);
              try {
                const res = await fetch('/api/v3/nightshift/run', { method: 'POST' });
                const d = (await res.json()) as { reportSummary?: string; tasksCompleted?: number; error?: string };
                setNightStatus(
                  res.ok
                    ? tx('Műszak kész ({0} feladat): {1}', d.tasksCompleted ?? 0, d.reportSummary || 'OK')
                    : d.error || tx('Éjszakai műszak hiba')
                );
                await onRefreshState();
              } finally {
                setNightBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5" />
            {nightBusy ? tx('Műszak fut...') : tx('Műszak Indítása Most')}
          </button>
        </div>

        {nightStatus && (
          <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono">
            {nightStatus}
          </div>
        )}

        {nightShiftRuns.length === 0 ? (
          <p className="text-xs text-slate-500">{tx('Még nem futott éjszakai műszak.')}</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {nightShiftRuns.slice(0, 8).map((run) => (
              <div
                key={run.id}
                className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {run.tasksCompleted} {tx('feladat')} · {run.actionsTaken?.length ?? 0} {tx('lépés · KÉSZ')}
                  </span>
                  <span className="text-slate-500">{new Date(run.completedAt || run.startedAt).toLocaleString(intlLocale)}</span>
                </div>
                <div className="text-slate-700 dark:text-slate-300">{run.reportSummary}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
