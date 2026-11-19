import React, { useState } from 'react';
import { Copy, Key, Plus, RefreshCw, ShieldAlert, Trash2, Zap } from 'lucide-react';
import type {
  GatewayAnalytics,
  LanguageCode,
  ModelInfo,
  ProviderId,
  QuotaStatus,
  Settings,
  VirtualKey,
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  settings: Settings;
  discoveredModels: ModelInfo[];
  quotas: Record<ProviderId, QuotaStatus>;
  virtualKeys: VirtualKey[];
  gatewayAnalytics: GatewayAnalytics;
  cacheSize: number;
  onRefreshState: () => Promise<void>;
}

const PROVIDERS: ProviderId[] = ['gemini', 'openrouter', 'openai', 'anthropic', 'ollama'];

export const ModelsRouterView: React.FC<Props> = ({
  language,
  settings,
  discoveredModels,
  quotas,
  virtualKeys,
  gatewayAnalytics,
  cacheSize,
  onRefreshState,
}) => {
  const [newKeyProvider, setNewKeyProvider] = useState<ProviderId>('gemini');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [freeOnlyFilter, setFreeOnlyFilter] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [failoverOutput, setFailoverOutput] = useState<string | null>(null);

  // Virtual Key creation
  const [vkName, setVkName] = useState('');
  const [vkBudget, setVkBudget] = useState(5.0);
  const [vkRpm, setVkRpm] = useState(60);
  const [vkModels, setVkModels] = useState('');
  const [revealedRawKey, setRevealedRawKey] = useState<string | null>(null);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;
    await fetch('/api/providers/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: newKeyProvider,
        rawKey: newKeyValue.trim(),
        label: newKeyLabel.trim() || `${newKeyProvider.toUpperCase()} Pool Key`,
      }),
    });
    setNewKeyValue('');
    setNewKeyLabel('');
    await onRefreshState();
  };

  const handleRemoveKey = async (provider: ProviderId, keyId: string) => {
    await fetch(`/api/providers/keys/${provider}/${keyId}`, { method: 'DELETE' });
    await onRefreshState();
  };

  const handleResetCooldowns = async () => {
    await fetch('/api/providers/reset-cooldowns', { method: 'POST' });
    await onRefreshState();
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await fetch('/api/providers/discover', { method: 'POST' });
      await onRefreshState();
    } finally {
      setDiscovering(false);
    }
  };

  const handleTestFailover = async () => {
    setFailoverOutput('Fut...');
    const res = await fetch('/api/providers/test-failover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Válaszolj egy mondatban: melyik szolgáltató válaszolt?' }),
    });
    const data = (await res.json()) as { provider?: string; model?: string; text?: string; error?: string; cached?: boolean };
    if (res.ok) {
      setFailoverOutput(`Sikeres [${data.provider} / ${data.model}${data.cached ? ' · CACHE' : ''}]: ${data.text}`);
    } else {
      setFailoverOutput(`Failover lánc hiba: ${data.error}`);
    }
    await onRefreshState();
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
    field: 'responseCacheEnabled' | 'guardrailsEnabled' | 'guardrailBlockPii' | 'guardrailBlockSecrets' | 'guardrailBlockPromptInjection'
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
      }),
    });
    const data = (await res.json()) as { rawKey?: string };
    if (data.rawKey) {
      setRevealedRawKey(data.rawKey);
    }
    setVkName('');
    setVkModels('');
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

  return (
    <div className="space-y-6">
      {/* Router Chain & Discovery Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="router-primary" className="block text-xs text-slate-500 mb-1">
              Elsődleges szolgáltató
            </label>
            <select
              id="router-primary"
              value={settings.primaryProvider}
              onChange={(e) => handlePriorityChange('primaryProvider', e.target.value as ProviderId)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
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
              onChange={(e) => handlePriorityChange('secondaryProvider', e.target.value as ProviderId)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-500 pt-4">
            Végső fallback: <span className="font-mono text-slate-800">{settings.ollamaModel} (Ollama)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleResetCooldowns}
            className="px-3 py-2 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Cooldown Reset
          </button>
          <button
            type="button"
            disabled={discovering}
            onClick={handleDiscover}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${discovering ? 'animate-spin' : ''}`} />
            {tr(language, 'discoverModels')}
          </button>
          <button
            type="button"
            onClick={handleTestFailover}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Zap className="h-3.5 w-3.5" />
            {tr(language, 'testFailover')}
          </button>
        </div>
      </div>

      {failoverOutput && (
        <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">
          {failoverOutput}
        </div>
      )}

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

          <form onSubmit={handleCreateVirtualKey} className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
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
                      Költés: ${vk.spendUsd.toFixed(4)} / ${vk.maxBudgetUsd.toFixed(2)} · {vk.rpmLimit} RPM · {vk.totalRequests} kérés · {vk.totalTokens} tok
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleVirtualKey(vk)}
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
                      onClick={() => handleRevokeVirtualKey(vk.id)}
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
                  onChange={() => handleToggleGatewayFlag('responseCacheEnabled')}
                />
                <span>LRU Válasz Cache ({settings.responseCacheTtlSec}s TTL)</span>
              </label>
              <button
                type="button"
                onClick={handleClearCache}
                className="px-2 py-0.5 text-[11px] border border-slate-300 rounded hover:bg-slate-50"
              >
                Cache Törlés
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.guardrailsEnabled}
                onChange={() => handleToggleGatewayFlag('guardrailsEnabled')}
              />
              <span>Guardrails Védelem Aktív</span>
            </label>
            <div className="pl-5 flex flex-wrap gap-4 text-[11px] text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.guardrailBlockSecrets}
                  onChange={() => handleToggleGatewayFlag('guardrailBlockSecrets')}
                />
                Titkok szűrése
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.guardrailBlockPromptInjection}
                  onChange={() => handleToggleGatewayFlag('guardrailBlockPromptInjection')}
                />
                Prompt Injection
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.guardrailBlockPii}
                  onChange={() => handleToggleGatewayFlag('guardrailBlockPii')}
                />
                PII Szűrés
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Key Pools + Real/Estimated Quotas & Discovered Models */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Kulcs-Pool Rotáció & Cooldown</h2>
          <form onSubmit={handleAddKey} className="space-y-2.5 pb-4 border-b border-slate-200">
            <div className="grid grid-cols-2 gap-2">
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
                placeholder="Címke (pl. Családi kulcs #2)"
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="API kulcs..."
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
          </form>

          <div className="space-y-3">
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
                    <div className="text-[11px] text-slate-500">Nincs hozzáadott kulcs</div>
                  ) : (
                    keys.map((k) => {
                      const inCooldown = Boolean(k.cooldownUntil && Date.parse(k.cooldownUntil) > Date.now());
                      return (
                        <div key={k.id} className="flex items-center justify-between text-xs bg-white px-2.5 py-1.5 rounded border border-slate-200">
                          <span className="font-mono text-slate-700">
                            {k.label} · {k.maskedKey}
                            {inCooldown && <span className="ml-2 text-amber-700">[COOLDOWN]</span>}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove key ${k.label}`}
                            onClick={() => handleRemoveKey(p, k.id)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
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

          <div className="overflow-x-auto max-h-[460px]">
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
    </div>
  );
};
