import React, { useState } from 'react';
import { GitBranch, Plus, Shield, Trash2 } from 'lucide-react';
import type { Agent, LanguageCode, ProviderId } from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  agents: Agent[];
  onRefreshState: () => Promise<void>;
}

const AgentTreeNode: React.FC<{
  agent: Agent;
  allAgents: Agent[];
  depth: number;
  onToggle: (agent: Agent, field: 'active' | 'webSearchEnabled' | 'hostExecutionEnabled') => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ agent, allAgents, depth, onToggle, onDelete }) => {
  const children = allAgents.filter((a) => a.parentAgentId === agent.id);
  return (
    <div className="space-y-2" style={{ marginLeft: depth > 0 ? `${Math.min(depth * 24, 96)}px` : '0px' }}>
      <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-4">
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
          <div className="text-xs text-slate-500 font-mono">
            {agent.providerId} / {agent.modelId} · Mélység: {depth}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(agent, 'webSearchEnabled')}
            className={`px-2.5 py-1 text-xs rounded border ${
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
            className={`px-2.5 py-1 text-xs rounded border ${
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
                onClick={() => onToggle(agent, 'active')}
                className={`px-2.5 py-1 text-xs rounded border ${
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

      {children.map((child) => (
        <AgentTreeNode
          key={child.id}
          agent={child}
          allAgents={allAgents}
          depth={depth + 1}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export const OrgAgentsView: React.FC<Props> = ({ language, agents, onRefreshState }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [providerId, setProviderId] = useState<ProviderId>('gemini');
  const [modelId, setModelId] = useState('gemini-4-hydrogen');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [hostExecutionEnabled, setHostExecutionEnabled] = useState(true);

  const rootAgents = agents.filter((a) => !a.parentAgentId);
  const selectableParents = agents.filter((a) => !a.isSupervisor);

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

  const handleDelete = async (id: string) => {
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    await onRefreshState();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Szervezeti Hierarchia (tetszőleges mélység)
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">{agents.length} ágens</span>
        </div>

        <div className="space-y-3">
          {rootAgents.map((root) => (
            <AgentTreeNode
              key={root.id}
              agent={root}
              allAgents={agents}
              depth={0}
              onToggle={handleToggle}
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
  );
};
