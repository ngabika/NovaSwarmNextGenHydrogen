import React, { useState } from 'react';
import { GitBranch, Globe, Plus, RefreshCw, Send, Share2, Shield, Trash2 } from 'lucide-react';
import type {
  Agent,
  FederationPeer,
  KanbanCard,
  LanguageCode,
  McpServer,
  ProviderId,
  VoiceReplyMode,
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  agents: Agent[];
  mcpServers: McpServer[];
  kanban: KanbanCard[];
  federationPeers: FederationPeer[];
  federationEnabled: boolean;
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
    }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ agent, allAgents, mcpServers, depth, onToggle, onSavePolicy, onDelete }) => {
  const children = allAgents.filter((a) => a.parentAgentId === agent.id);
  const [editingBot, setEditingBot] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [budget, setBudget] = useState(agent.dailyBudgetUsd ?? 0);
  const [voiceMode, setVoiceMode] = useState<VoiceReplyMode>(agent.voiceReplyMode ?? 'off');
  const [allowedMcpIds, setAllowedMcpIds] = useState<string[]>(agent.allowedMcpIds || []);
  const [activeHoursStart, setActiveHoursStart] = useState<number>(agent.activeHoursStart ?? 0);
  const [activeHoursEnd, setActiveHoursEnd] = useState<number>(agent.activeHoursEnd ?? 23);
  const [maxRunsPerHour, setMaxRunsPerHour] = useState<number>(agent.maxRunsPerHour ?? 60);

  const toggleMcpId = (id: string) => {
    setAllowedMcpIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-2" style={{ marginLeft: depth > 0 ? `${Math.min(depth * 24, 96)}px` : '0px' }}>
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
              {agent.providerId} / {agent.modelId} · Mélység: {depth} · Napi költés: $
              {(agent.dailySpendUsd ?? 0).toFixed(4)}
              {agent.dailyBudgetUsd ? ` / $${agent.dailyBudgetUsd.toFixed(2)}` : ''}
              {agent.telegramHasToken ? ' · Dedikált TG Bot' : ''}
              {agent.allowedMcpIds && agent.allowedMcpIds.length > 0
                ? ` · MCP:${agent.allowedMcpIds.length}`
                : ' · MCP:Mind'}
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
              Web: {agent.webSearchEnabled ? 'Be' : 'Ki'}
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
              Host: {agent.hostExecutionEnabled ? 'Be' : 'Ki'}
            </button>
            {!agent.isSupervisor && (
              <>
                <button
                  type="button"
                  onClick={() => setEditingBot((v) => !v)}
                  className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Bot, MCP & Ütemezés
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
                  {agent.active ? 'Aktív' : 'Inaktív'}
                </button>
                <button
                  type="button"
                  aria-label={`Delete agent ${agent.name}`}
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
                placeholder={agent.telegramHasToken ? 'Új Telegram Bot Token...' : 'Dedikált Telegram Bot Token'}
                className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <input
                type="number"
                step="0.2"
                min="0"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                placeholder="Napi limit ($)"
                title="Ágens napi USD limit (0 = globális)"
                className="px-2.5 py-1.5 font-mono border border-slate-300 rounded"
              />
              <select
                value={voiceMode}
                onChange={(e) => setVoiceMode(e.target.value as VoiceReplyMode)}
                className="px-2 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="off">Hangválasz: Ki</option>
                <option value="on_voice">Hangra hang</option>
                <option value="always">Mindig hang</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 block">Aktív óra kezdete (0-23)</span>
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
                <span className="text-[11px] text-slate-500 block">Aktív óra vége (0-23)</span>
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
                <span className="text-[11px] text-slate-500 block">Max futás / óra</span>
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
                  MCP Jogosultsági Mátrix (üres = minden MCP engedélyezve):
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
                });
                setTgToken('');
                setEditingBot(false);
              }}
              className="w-full px-3 py-1.5 bg-slate-900 text-white rounded font-medium"
            >
              Ágens Szabályok & Bot Mentése
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
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export const OrgAgentsView: React.FC<Props> = ({
  language,
  agents,
  mcpServers,
  kanban,
  federationPeers,
  federationEnabled,
  onRefreshState,
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [providerId, setProviderId] = useState<ProviderId>('gemini');
  const [modelId, setModelId] = useState('gemini-4-hydrogen');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [hostExecutionEnabled, setHostExecutionEnabled] = useState(true);

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
        role: role.trim() || 'Specialista',
        parentAgentId: parentAgentId || null,
        providerId,
        modelId,
        systemPrompt: systemPrompt.trim() || 'Autonóm AI specialista ágens.',
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
      }),
    });
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
    setFedReply(data.reply || data.error || 'Elküldve');
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
    setFedReply(data.message || data.error || (data.ok ? 'Kanban feladat átadva.' : 'Handoff hiba'));
    await onRefreshState();
  };

  const handleSyncSharedMemory = async () => {
    const res = await fetch('/api/federation/memory-sync', { method: 'POST' });
    const data = (await res.json()) as { pushed?: number; peers?: number };
    setFedReply(`Közös (shared) memóriák szinkronizálva: ${data.pushed ?? 0} bejegyzés -> ${data.peers ?? 0} társ.`);
    await onRefreshState();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Szervezeti Hierarchia, MCP Mátrix & Ütemezés
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{agents.length} ágens</span>
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
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>

        <form
          onSubmit={handleCreate}
          className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
        >
          <h3 className="text-base font-semibold text-slate-900">{tr(language, 'createAgent')}</h3>
          <div>
            <label htmlFor="ag-name" className="block text-xs font-medium text-slate-700 mb-1">
              Név
            </label>
            <input
              id="ag-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pl. Adatbázis Mérnök"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="ag-role" className="block text-xs font-medium text-slate-700 mb-1">
              Szerepkör
            </label>
            <input
              id="ag-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Pl. SQL & Optimalizáció"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="ag-parent" className="block text-xs font-medium text-slate-700 mb-1">
              Felettes ágens (opcionális)
            </label>
            <select
              id="ag-parent"
              value={parentAgentId}
              onChange={(e) => setParentAgentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Felső szint (nincs felettes)</option>
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
                Szolgáltató
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
                Modell ID
              </label>
              <input
                id="ag-model"
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ag-prompt" className="block text-xs font-medium text-slate-700 mb-1">
              Rendszerutasítás
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
              Web keresés
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hostExecutionEnabled}
                onChange={(e) => setHostExecutionEnabled(e.target.checked)}
              />
              Host parancsfuttatás
            </label>
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {tr(language, 'createAgent')}
          </button>
        </form>
      </div>

      {/* P2P Federation Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-700" />
              Föderáció — Távoli NovaSwarm Példányok, Kanban Handoff & Memória Szinkron
            </h3>
            <p className="text-xs text-slate-500">
              Állapot: {federationEnabled ? 'Bekapcsolva' : 'Kikapcsolva'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSyncSharedMemory()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Share2 className="h-3.5 w-3.5" />
              Shared Memória Szinkron
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
              {federationEnabled ? 'Föderáció Aktív' : 'Föderáció Bekapcsolása'}
            </button>
          </div>
        </div>

        <form onSubmit={handleAddPeer} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            type="text"
            value={peerName}
            onChange={(e) => setPeerName(e.target.value)}
            placeholder="Társ neve (pl. pi-node-2)"
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
            placeholder="Közös token (opcionális)"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
          >
            + Föderációs Társ
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
                      Szinkron
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
                  Státusz: {p.status} · Távoli ágensek: {p.remoteAgents.length}
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
              placeholder="társ/ágens (pl. pi-2/kutato)"
              className="w-44 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <input
              type="text"
              value={fedContent}
              onChange={(e) => setFedContent(e.target.value)}
              placeholder="Üzenet a föderált ágensnek..."
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
            >
              <Send className="h-3 w-3" />
              Küldés
            </button>
          </form>

          <form onSubmit={handleKanbanHandoff} className="flex flex-wrap gap-2">
            <select
              value={handoffCardId}
              onChange={(e) => setHandoffCardId(e.target.value)}
              aria-label="Handoff Kanban card"
              className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="">Kanban kártya átadása...</option>
              {activeCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              value={handoffPeerId}
              onChange={(e) => setHandoffPeerId(e.target.value)}
              aria-label="Handoff peer"
              className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="">Cél társ...</option>
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
              Kártya Átadása
            </button>
          </form>
        </div>

        {fedReply && <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono">{fedReply}</div>}
      </div>
    </div>
  );
};
