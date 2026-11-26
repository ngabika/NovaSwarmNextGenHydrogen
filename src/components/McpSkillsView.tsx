import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
  KeyRound,
  Monitor,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Agent,
  ChannelConnector,
  ChannelConnectorType,
  LanguageCode,
  McpAuthType,
  McpServer,
  McpTransport,
  PairingRequest,
  Skill,
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  mcpServers: McpServer[];
  skills: Skill[];
  channelConnectors: ChannelConnector[];
  pairingRequests: PairingRequest[];
  agents: Agent[];
  onRefreshState: () => Promise<void>;
}

export const McpSkillsView: React.FC<Props> = ({
  language,
  mcpServers,
  skills,
  channelConnectors,
  pairingRequests,
  agents,
  onRefreshState,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [credsForm, setCredsForm] = useState<Record<string, string>>({});
  const [mcpToolsMap, setMcpToolsMap] = useState<
    Record<string, { ok: boolean; tools: Array<{ name: string; description?: string }>; error?: string }>
  >({});

  // New MCP server form (HTTP or stdio M20)
  const [mcpName, setMcpName] = useState('');
  const [mcpTransport, setMcpTransport] = useState<McpTransport>('http');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpAuth, setMcpAuth] = useState<McpAuthType>('apikey');

  // External Catalog Import
  const [catalogUrl, setCatalogUrl] = useState('');
  const [catalogItems, setCatalogItems] = useState<
    Array<{ name: string; description: string; endpointUrl: string; authType: McpAuthType; kind: 'mcp' | 'skill' }>
  >([]);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

  // Google OAuth info
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  // Dynamic Skill creation & pitfalls + GitHub import (Ú60)
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillCode, setSkillCode] = useState('console.log("Skill sandbox verification OK");');
  const [skillTestCode, setSkillTestCode] = useState('');
  const [pitfallDrafts, setPitfallDrafts] = useState<Record<string, string>>({});
  const [ghSkillUrl, setGhSkillUrl] = useState('');
  const [ghSkillMsg, setGhSkillMsg] = useState<string | null>(null);
  const [mcpDiscoveryQuery, setMcpDiscoveryQuery] = useState('');
  const [mcpRoiMsg, setMcpRoiMsg] = useState<string | null>(null);

  // Multi-Channel Connectors & Bidirectional Polling (M18)
  const [chType, setChType] = useState<ChannelConnectorType>('discord');
  const [chName, setChName] = useState('');
  const [chWebhook, setChWebhook] = useState('');
  const [chSecret, setChSecret] = useState('');
  const [chAgentId, setChAgentId] = useState('');
  const [chStatusMsg, setChStatusMsg] = useState<string | null>(null);
  const [pollForm, setPollForm] = useState<Record<string, { channelId: string; botToken: string; enabled: boolean }>>({});

  // Web Search & Headless Browser Inspector (Ú1, Ú2)
  const [webQuery, setWebQuery] = useState('');
  const [webResults, setWebResults] = useState<Array<{ title: string; url: string; snippet: string }>>([]);
  const [webSearchProvider, setWebSearchProvider] = useState<string | null>(null);
  const [browserInfo, setBrowserInfo] = useState<{ available: boolean; binary: string | null } | null>(null);
  const [browserUrl, setBrowserUrl] = useState('https://example.com');
  const [browserOut, setBrowserOut] = useState<{ title?: string; textPreview?: string; text?: string; screenshotBase64?: string; error?: string } | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/browser/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { available: boolean; binary: string | null } | null) => {
        if (d) setBrowserInfo(d);
      })
      .catch(() => {});
  }, []);

  const workerAgents = agents.filter((a) => !a.isSupervisor);
  const pendingPairings = pairingRequests.filter((p) => p.status === 'pending');

  const handleSaveMcpCreds = async (id: string) => {
    await fetch(`/api/mcp/${id}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credsForm),
    });
    setCredsForm({});
    await onRefreshState();
  };

  const handleTestMcp = async (id: string) => {
    await fetch(`/api/mcp/${id}/test`, { method: 'POST' });
    await onRefreshState();
  };

  const handleListMcpTools = async (id: string) => {
    const res = await fetch(`/api/mcp/${id}/tools`);
    const data = (await res.json()) as {
      tools?: Array<{ name: string; description?: string }>;
      error?: string;
    };
    setMcpToolsMap((prev) => ({
      ...prev,
      [id]: {
        ok: res.ok,
        tools: data.tools || [],
        error: data.error,
      },
    }));
  };

  const handleRegisterMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim()) return;
    if (mcpTransport === 'http' && !mcpUrl.trim()) return;
    if (mcpTransport === 'stdio' && !mcpCommand.trim()) return;
    await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mcpName.trim(),
        transport: mcpTransport,
        endpointUrl: mcpTransport === 'http' ? mcpUrl.trim() : `stdio://${mcpCommand.trim()}`,
        command: mcpTransport === 'stdio' ? mcpCommand.trim() : undefined,
        args: mcpTransport === 'stdio' ? mcpArgs.trim() : undefined,
        authType: mcpTransport === 'stdio' ? 'none' : mcpAuth,
      }),
    });
    setMcpName('');
    setMcpUrl('');
    setMcpCommand('');
    setMcpArgs('');
    await onRefreshState();
  };

  const handleImportCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatalogErr(null);
    const res = await fetch('/api/mcp/import-catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogUrl }),
    });
    const data = (await res.json()) as { items?: typeof catalogItems; error?: string };
    if (!res.ok) {
      setCatalogErr(data.error || 'Import sikertelen');
      return;
    }
    setCatalogItems(data.items || []);
  };

  const handleGoogleOAuth = async () => {
    const res = await fetch('/api/mcp/google-oauth-url');
    const data = (await res.json()) as { configured: boolean; url: string | null; reason?: string };
    if (data.configured && data.url) {
      window.location.href = data.url;
    } else {
      setOauthMessage(data.reason || tr(language, 'notConnected'));
    }
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim() || !skillCode.trim()) return;
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: skillName,
        description: skillDesc,
        code: skillCode,
        testCode: skillTestCode.trim() || undefined,
      }),
    });
    setSkillName('');
    setSkillDesc('');
    setSkillTestCode('');
    await onRefreshState();
  };

  const handleRunSkillSelfTest = async (skillId: string) => {
    await fetch(`/api/skills/${skillId}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    await onRefreshState();
  };

  const handleEvaluateMcpRoi = async () => {
    setMcpRoiMsg('MCP ROI kiértékelés fut...');
    const res = await fetch('/api/mcp/evaluate-roi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilityQuery: mcpDiscoveryQuery.trim() || undefined,
        catalogUrl: catalogUrl.trim() || undefined,
      }),
    });
    const data = (await res.json()) as {
      evaluations?: Array<{ name: string; roiVerdict: string }>;
      newlyInstalled?: Array<{ name: string }>;
      disabledLowValueIds?: string[];
      error?: string;
    };
    if (!res.ok) {
      setMcpRoiMsg(data.error || 'Hiba az MCP ROI értékelésnél.');
    } else {
      const inst = data.newlyInstalled?.length ? ` · Új telepítés: ${data.newlyInstalled.map((x) => x.name).join(', ')}` : '';
      const dis = data.disabledLowValueIds?.length ? ` · Letiltva: ${data.disabledLowValueIds.length}` : '';
      setMcpRoiMsg(`Kiértékelve (${data.evaluations?.length ?? 0} szerver)${inst}${dis}`);
      await onRefreshState();
    }
  };

  const handleAddPitfall = async (skillId: string) => {
    const text = (pitfallDrafts[skillId] || '').trim();
    if (!text) return;
    await fetch(`/api/skills/${skillId}/pitfalls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitfall: text }),
    });
    setPitfallDrafts((prev) => ({ ...prev, [skillId]: '' }));
    await onRefreshState();
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chName.trim() || !chWebhook.trim()) return;
    setChStatusMsg(null);
    await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: chType,
        name: chName.trim(),
        webhookUrl: chWebhook.trim(),
        secret: chSecret.trim() || undefined,
        defaultAgentId: chAgentId || null,
      }),
    });
    setChName('');
    setChWebhook('');
    setChSecret('');
    await onRefreshState();
  };

  const handleSaveChannelPolling = async (connector: ChannelConnector) => {
    const draft = pollForm[connector.id] || {
      channelId: connector.channelId || '',
      botToken: '',
      enabled: !connector.pollingEnabled,
    };
    await fetch(`/api/channels/${connector.id}/polling`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollingEnabled: draft.enabled,
        channelId: draft.channelId.trim() || undefined,
        botToken: draft.botToken.trim() || undefined,
      }),
    });
    setChStatusMsg(`${connector.name} kétirányú polling frissítve.`);
    await onRefreshState();
  };

  const handlePollChannelsNow = async () => {
    const res = await fetch('/api/channels/poll', { method: 'POST' });
    const data = (await res.json()) as { checked?: number; ingested?: number };
    setChStatusMsg(`Csatornák lekérdezve (${data.checked ?? 0} aktív, ${data.ingested ?? 0} új üzenet).`);
    await onRefreshState();
  };

  const handleTestChannel = async (id: string) => {
    setChStatusMsg(null);
    const res = await fetch(`/api/channels/${id}/test`, { method: 'POST' });
    const data = (await res.json()) as { sent: boolean; reason?: string };
    setChStatusMsg(data.sent ? 'Tesztüzenet elküldve.' : `Teszt sikertelen: ${data.reason || 'hiba'}`);
    await onRefreshState();
  };

  const handleDeleteChannel = async (id: string) => {
    await fetch(`/api/channels/${id}`, { method: 'DELETE' });
    await onRefreshState();
  };

  const handleResolvePairing = async (id: string, decision: 'approved' | 'rejected') => {
    await fetch(`/api/pairing/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    await onRefreshState();
  };

  const handleWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webQuery.trim()) return;
    const res = await fetch('/api/web/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: webQuery.trim(), maxResults: 5 }),
    });
    const data = (await res.json()) as {
      provider?: string;
      results?: Array<{ title: string; url: string; snippet: string }>;
    };
    setWebSearchProvider(data.provider || null);
    setWebResults(data.results || []);
  };

  const handleBrowserAction = async (action: 'inspect' | 'screenshot') => {
    if (!browserUrl.trim()) return;
    setBrowserBusy(true);
    setBrowserOut(null);
    try {
      const res = await fetch('/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: browserUrl.trim(), action }),
      });
      const data = (await res.json()) as {
        title?: string;
        textPreview?: string;
        text?: string;
        screenshotBase64?: string;
        error?: string;
      };
      setBrowserOut(data);
    } finally {
      setBrowserBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* MCP Servers List (HTTP + stdio) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            MCP Szerverek (HTTP & Lokális stdio)
          </h2>

          <div className="space-y-3">
            {mcpServers.map((srv) => {
              const isExpanded = expandedId === srv.id;
              return (
                <div key={srv.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{srv.name}</div>
                      <div className="text-xs text-slate-500 font-mono truncate">
                        {srv.transport === 'stdio'
                          ? `stdio: ${srv.command} ${(srv.args || []).join(' ')}`
                          : srv.endpointUrl}{' '}
                        · {srv.authType} · Állapot:{' '}
                        <span
                          className={
                            srv.status === 'connected'
                              ? 'text-emerald-700 font-semibold'
                              : srv.status === 'error' || srv.status === 'disconnected'
                              ? 'text-red-700 font-semibold'
                              : 'text-amber-700 font-semibold'
                          }
                        >
                          {srv.status === 'not_configured' ? tr(language, 'notConnected') : srv.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">{srv.lastCheckMessage}</div>
                      {(srv.metrics || srv.roiNote) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                          {srv.roiVerdict && (
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
                                srv.roiVerdict === 'worth_it'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : srv.roiVerdict === 'low_value'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              ROI: {srv.roiVerdict === 'worth_it' ? 'MEGÉRI' : srv.roiVerdict === 'low_value' ? 'ALACSONY' : 'TESZTELENDŐ'}
                            </span>
                          )}
                          {srv.metrics && (
                            <span className="font-mono text-slate-500 tabular-nums">
                              Hívások: {srv.metrics.successCalls}/{srv.metrics.totalCalls} · Átlag: {srv.metrics.avgLatencyMs}ms
                            </span>
                          )}
                          {srv.roiNote && <span className="text-slate-600">{srv.roiNote}</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {srv.isGoogleWorkspace && (
                        <button
                          type="button"
                          onClick={() => void handleGoogleOAuth()}
                          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          Google OAuth2
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleTestMcp(srv.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        {tr(language, 'testConnection')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleListMcpTools(srv.id)}
                        className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        Eszközök listázása
                      </button>
                      <button
                        type="button"
                        aria-label={`Toggle auth panel for ${srv.name}`}
                        onClick={() => setExpandedId(isExpanded ? null : srv.id)}
                        className="p-1.5 border border-slate-200 rounded-md hover:bg-slate-50"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {mcpToolsMap[srv.id] && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                      {!mcpToolsMap[srv.id].ok ? (
                        <div className="text-red-700 font-mono">
                          Eszköz lekérés sikertelen: {mcpToolsMap[srv.id].error}
                        </div>
                      ) : mcpToolsMap[srv.id].tools.length === 0 ? (
                        <div className="text-slate-500 font-mono">0 MCP eszköz érhető el.</div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-700">
                            Elérhető MCP eszközök ({mcpToolsMap[srv.id].tools.length}):
                          </div>
                          {mcpToolsMap[srv.id].tools.map((tool) => (
                            <div key={tool.name} className="font-mono text-[11px] text-slate-700">
                              • <span className="font-bold">{tool.name}</span>
                              {tool.description ? ` — ${tool.description}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      {srv.authType === 'basic' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Felhasználónév"
                            onChange={(e) => setCredsForm({ ...credsForm, username: e.target.value })}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                          />
                          <input
                            type="password"
                            placeholder="Jelszó"
                            onChange={(e) => setCredsForm({ ...credsForm, password: e.target.value })}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                          />
                        </div>
                      )}
                      {srv.authType === 'apikey' && (
                        <input
                          type="password"
                          placeholder="API Kulcs (titkosítva tárolva)"
                          onChange={(e) => setCredsForm({ ...credsForm, apiKey: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                        />
                      )}
                      {srv.authType === 'oauth2' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="OAuth2 Client ID"
                            onChange={(e) => setCredsForm({ ...credsForm, clientId: e.target.value })}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                          />
                          <input
                            type="password"
                            placeholder="OAuth2 Access/Secret Token"
                            onChange={(e) => setCredsForm({ ...credsForm, accessToken: e.target.value })}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSaveMcpCreds(srv.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded"
                      >
                        Hitelesítési adatok mentése
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {oauthMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              {oauthMessage}
            </div>
          )}

          {/* Register New MCP (HTTP or stdio) */}
          <form onSubmit={handleRegisterMcp} className="pt-4 border-t border-slate-200 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={mcpName}
                onChange={(e) => setMcpName(e.target.value)}
                placeholder="Új MCP neve"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
              <select
                value={mcpTransport}
                onChange={(e) => setMcpTransport(e.target.value as McpTransport)}
                aria-label="MCP transport"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
              >
                <option value="http">HTTP / JSON-RPC</option>
                <option value="stdio">Lokális stdio</option>
              </select>
              {mcpTransport === 'http' ? (
                <>
                  <input
                    type="url"
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                    placeholder="https://endpoint..."
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                  />
                  <select
                    value={mcpAuth}
                    onChange={(e) => setMcpAuth(e.target.value as McpAuthType)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    <option value="none">Nincs auth</option>
                    <option value="apikey">API Kulcs</option>
                    <option value="basic">Felhasználó + Jelszó</option>
                    <option value="oauth2">OAuth2</option>
                  </select>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    placeholder="Parancs (pl. npx)"
                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    value={mcpArgs}
                    onChange={(e) => setMcpArgs(e.target.value)}
                    placeholder="Argok (pl. -y @mcp/server)"
                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                  />
                </>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
            >
              <Plus className="h-3.5 w-3.5" />
              MCP Felvétel
            </button>
          </form>
        </div>

        {/* Right: External Catalog & Dynamic Sandbox-Verified Skill Factory */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Külső Gyűjtemény Import</h3>
            <form onSubmit={handleImportCatalog} className="flex gap-2">
              <input
                type="url"
                value={catalogUrl}
                onChange={(e) => setCatalogUrl(e.target.value)}
                placeholder="https://.../catalog.json"
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Betöltés
              </button>
            </form>
            {catalogErr && <div className="text-xs text-red-700">{catalogErr}</div>}
            {catalogItems.map((item, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold">{item.name}</div>
                  <div className="text-[11px] text-slate-500">{item.endpointUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/mcp', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(item),
                    });
                    await onRefreshState();
                  }}
                  className="px-2.5 py-1 text-xs bg-slate-900 text-white rounded"
                >
                  Telepítés
                </button>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-700">Autonóm MCP Képesség-Felderítés &amp; ROI Értékelés</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mcpDiscoveryQuery}
                  onChange={(e) => setMcpDiscoveryQuery(e.target.value)}
                  placeholder="Keresett képesség (pl. naptár, postgres, github)..."
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => void handleEvaluateMcpRoi()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Felderítés &amp; ROI
                </button>
              </div>
              {mcpRoiMsg && <div className="text-[11px] font-mono text-slate-700">{mcpRoiMsg}</div>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">
              Skill Gyár (Sandbox Ellenőrzés, Önteszt &amp; Buktatók)
            </h3>
            <form onSubmit={handleCreateSkill} className="space-y-2">
              <input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="Skill neve"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
              />
              <input
                type="text"
                value={skillDesc}
                onChange={(e) => setSkillDesc(e.target.value)}
                placeholder="Rövid leírás"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
              />
              <textarea
                rows={3}
                value={skillCode}
                onChange={(e) => setSkillCode(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <textarea
                rows={2}
                value={skillTestCode}
                onChange={(e) => setSkillTestCode(e.target.value)}
                placeholder="Opcionális automatikus egységteszt (üresen hagyva automatikusan generálódik)..."
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <button
                type="submit"
                className="w-full px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                Dry-Run Sandbox + Egységteszt &amp; Aktiválás
              </button>
            </form>

            {/* Ú60: GitHub Skill Import + Static Security Scan */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-700">GitHub Képesség Biztonsági Ellenőrzés &amp; Import</div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={ghSkillUrl}
                  onChange={(e) => setGhSkillUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/.../skill.js"
                  className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!ghSkillUrl.trim()) return;
                    setGhSkillMsg('Biztonsági ellenőrzés fut...');
                    const r = await fetch('/api/skills/import-github', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ url: ghSkillUrl.trim() }),
                    });
                    const d = (await r.json()) as {
                      ok?: boolean;
                      findings?: string[];
                      error?: string;
                      skill?: { name: string };
                    };
                    if (!r.ok) {
                      setGhSkillMsg(`ELUTASÍTVA: ${d.error || ''} ${(d.findings || []).join(' | ')}`);
                    } else {
                      setGhSkillMsg(`Importálva és jóváhagyva: ${d.skill?.name}`);
                      setGhSkillUrl('');
                      await onRefreshState();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Import & Audit
                </button>
              </div>
              {ghSkillMsg && <div className="text-[11px] font-mono text-slate-700">{ghSkillMsg}</div>}
            </div>

            <div className="space-y-2.5 pt-2 max-h-[280px] overflow-y-auto">
              {skills.map((sk) => (
                <div key={sk.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex flex-wrap justify-between items-center gap-2 font-semibold">
                    <span>{sk.name}</span>
                    <span className="font-mono tabular-nums flex items-center gap-2">
                      <span className="text-slate-500">használat: {sk.usageCount ?? 0}</span>
                      {sk.testPassed !== undefined && (
                        <span className={sk.testPassed ? 'text-emerald-700' : 'text-red-700'}>
                          teszt: {sk.testPassed ? 'OK' : 'HIBA'}
                        </span>
                      )}
                      <span className={sk.status === 'verified' ? 'text-emerald-700' : 'text-red-700'}>
                        {sk.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRunSkillSelfTest(sk.id)}
                        className="px-2 py-0.5 text-[10px] font-medium border border-slate-300 bg-white rounded hover:bg-slate-100"
                      >
                        Önteszt
                      </button>
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 whitespace-pre-wrap">{sk.sandboxReport}</div>
                  {sk.testReport && (
                    <div className="font-mono text-[11px] text-slate-700 bg-white border border-slate-200 rounded p-1.5 whitespace-pre-wrap">
                      {sk.testReport}
                    </div>
                  )}

                  {sk.pitfalls && sk.pitfalls.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-200">
                      <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Buktatók (tanult hibák)
                      </div>
                      <ul className="list-disc pl-4 text-[11px] text-slate-700 space-y-0.5">
                        {sk.pitfalls.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={pitfallDrafts[sk.id] || ''}
                      onChange={(e) => setPitfallDrafts((prev) => ({ ...prev, [sk.id]: e.target.value }))}
                      placeholder="Új buktató / tanulság rögzítése..."
                      className="flex-1 px-2 py-1 text-[11px] border border-slate-300 rounded bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddPitfall(sk.id)}
                      className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 bg-white rounded hover:bg-slate-100"
                    >
                      Mentés
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Web Search & Headless Browser Inspector (Ú1, Ú2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-700" />
            Élő Web Keresés (DuckDuckGo / SearXNG / Brave)
          </h3>
          <form onSubmit={handleWebSearch} className="flex gap-2">
            <input
              type="text"
              value={webQuery}
              onChange={(e) => setWebQuery(e.target.value)}
              placeholder="Webes keresőkifejezés tesztelése..."
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
            >
              <Search className="h-3.5 w-3.5" />
              Keresés
            </button>
          </form>
          {webSearchProvider && (
            <div className="text-[11px] font-mono text-slate-500">Motor: {webSearchProvider} · {webResults.length} találat</div>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {webResults.map((r, i) => (
              <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-0.5">
                <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">
                  {r.title}
                </a>
                <div className="font-mono text-[11px] text-slate-500 truncate">{r.url}</div>
                <p className="text-slate-600">{r.snippet}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Monitor className="h-4 w-4 text-slate-700" />
              Headless Böngésző & Képernyőkép
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {browserInfo ? (browserInfo.available ? `Chromium: ${browserInfo.binary}` : 'Chromium nem telepített') : '...'}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={browserUrl}
              onChange={(e) => setBrowserUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              disabled={browserBusy}
              onClick={() => void handleBrowserAction('inspect')}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              DOM Olvasás
            </button>
            <button
              type="button"
              disabled={browserBusy}
              onClick={() => void handleBrowserAction('screenshot')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Screenshot
            </button>
          </div>
          {browserOut && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-2 max-h-56 overflow-y-auto">
              {browserOut.error && <div className="text-red-700 font-mono">{browserOut.error}</div>}
              {browserOut.title && <div className="font-semibold text-slate-900">{browserOut.title}</div>}
              {browserOut.screenshotBase64 && (
                <img
                  src={`data:image/png;base64,${browserOut.screenshotBase64}`}
                  alt="Headless browser capture"
                  className="max-h-36 rounded border border-slate-200"
                />
              )}
              {(browserOut.textPreview || browserOut.text) && (
                <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                  {(browserOut.textPreview || browserOut.text || '').slice(0, 800)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Multi-Channel Connectors (with Bidirectional Polling M18) & Pairing Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Radio className="h-4 w-4 text-slate-600" />
              Csatorna Csatlakozók (Discord · Slack · Webhook)
            </h3>
            <button
              type="button"
              onClick={() => void handlePollChannelsNow()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              Csatornák Poll Most
            </button>
          </div>

          <form onSubmit={handleCreateChannel} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <select
              value={chType}
              onChange={(e) => setChType(e.target.value as ChannelConnectorType)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white uppercase font-mono"
            >
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
            </select>
            <input
              type="text"
              value={chName}
              onChange={(e) => setChName(e.target.value)}
              placeholder="Csatorna neve"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <input
              type="url"
              value={chWebhook}
              onChange={(e) => setChWebhook(e.target.value)}
              placeholder="Kimenő Webhook URL"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
            >
              <Plus className="h-3.5 w-3.5" />
              Hozzáadás
            </button>
            <input
              type="password"
              value={chSecret}
              onChange={(e) => setChSecret(e.target.value)}
              placeholder="Bearer / Signing Secret (opcionális)"
              className="sm:col-span-3 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <select
              value={chAgentId}
              onChange={(e) => setChAgentId(e.target.value)}
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="">Alapértelmezett ágens (koordinátor)</option>
              {workerAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </form>

          {chStatusMsg && <div className="text-xs font-mono text-slate-700">{chStatusMsg}</div>}

          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {channelConnectors.length === 0 ? (
              <p className="text-xs text-slate-500">Nincs beállított Discord, Slack vagy Webhook csatlakozó.</p>
            ) : (
              channelConnectors.map((c) => {
                const draft = pollForm[c.id] || {
                  channelId: c.channelId || '',
                  botToken: '',
                  enabled: Boolean(c.pollingEnabled),
                };
                return (
                  <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono uppercase font-semibold text-slate-700">[{c.type}]</span>{' '}
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        {c.pollingEnabled && <span className="ml-2 font-mono text-emerald-700">· Polling BE</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleTestChannel(c.id)}
                          className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 bg-white rounded hover:bg-slate-100"
                        >
                          Teszt küldés
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChannel(c.id)}
                          aria-label={`Delete connector ${c.name}`}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">
                      Bejövő endpoint: <span className="text-slate-700">/api/channels/inbound/{c.id}</span>
                    </div>
                    {(c.type === 'discord' || c.type === 'slack') && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 pt-1 border-t border-slate-200">
                        <input
                          type="text"
                          value={draft.channelId}
                          onChange={(e) =>
                            setPollForm((prev) => ({
                              ...prev,
                              [c.id]: { ...draft, channelId: e.target.value },
                            }))
                          }
                          placeholder="Csatorna ID"
                          className="px-2 py-1 text-[11px] font-mono border border-slate-300 rounded bg-white"
                        />
                        <input
                          type="password"
                          value={draft.botToken}
                          onChange={(e) =>
                            setPollForm((prev) => ({
                              ...prev,
                              [c.id]: { ...draft, botToken: e.target.value },
                            }))
                          }
                          placeholder={c.botTokenConfigured ? 'Új Bot Token...' : 'Bot Token'}
                          className="px-2 py-1 text-[11px] border border-slate-300 rounded bg-white"
                        />
                        <label className="inline-flex items-center gap-1 text-[11px] cursor-pointer px-1">
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(e) =>
                              setPollForm((prev) => ({
                                ...prev,
                                [c.id]: { ...draft, enabled: e.target.checked },
                              }))
                            }
                          />
                          2-irányú Poll
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleSaveChannelPolling(c)}
                          className="px-2 py-1 text-[11px] font-medium bg-slate-800 text-white rounded"
                        >
                          Poll Mentés
                        </button>
                      </div>
                    )}
                    {c.lastError && <div className="text-[11px] text-red-700 font-mono">{c.lastError}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-600" />
              Párosítási Sor ({pendingPairings.length} függő)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">/pairing approve KÓD</span>
          </div>
          <p className="text-xs text-slate-500">
            Ismeretlen külső feladók (Telegram / Discord / Slack / Webhook) 6 jegyű párosítási kódot kapnak, amíg jóvá nem hagyod őket.
          </p>

          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {pairingRequests.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Még nincs párosítási kérelem.</p>
            ) : (
              pairingRequests.map((p) => (
                <div
                  key={p.id}
                  className={`p-3 border rounded-lg text-xs flex items-center justify-between gap-2 ${
                    p.status === 'pending'
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      [{p.channel.toUpperCase()}] {p.senderLabel}
                    </div>
                    <div className="font-mono text-[11px] text-slate-600">
                      Kód: <span className="font-bold">{p.code}</span> · Állapot: {p.status}
                    </div>
                  </div>
                  {p.status === 'pending' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleResolvePairing(p.id, 'approved')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-700 text-white rounded"
                      >
                        <Check className="h-3 w-3" />
                        Jóváhagyás
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResolvePairing(p.id, 'rejected')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-700 text-white rounded"
                      >
                        <X className="h-3 w-3" />
                        Tiltás
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
