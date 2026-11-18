import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Play, Plus } from 'lucide-react';
import type { LanguageCode, McpAuthType, McpServer, Skill } from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  mcpServers: McpServer[];
  skills: Skill[];
  onRefreshState: () => Promise<void>;
}

export const McpSkillsView: React.FC<Props> = ({
  language,
  mcpServers,
  skills,
  onRefreshState,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [credsForm, setCredsForm] = useState<Record<string, string>>({});

  // New MCP server form
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpAuth, setMcpAuth] = useState<McpAuthType>('apikey');

  // External Catalog Import
  const [catalogUrl, setCatalogUrl] = useState('');
  const [catalogItems, setCatalogItems] = useState<
    Array<{ name: string; description: string; endpointUrl: string; authType: McpAuthType; kind: 'mcp' | 'skill' }>
  >([]);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

  // Google OAuth info
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  // Dynamic Skill creation
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillCode, setSkillCode] = useState('console.log("Skill sandbox verification OK");');

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

  const handleRegisterMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: mcpName, endpointUrl: mcpUrl, authType: mcpAuth }),
    });
    setMcpName('');
    setMcpUrl('');
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
      setCatalogErr(data.error || 'Import failed');
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
      body: JSON.stringify({ name: skillName, description: skillDesc, code: skillCode }),
    });
    setSkillName('');
    setSkillDesc('');
    await onRefreshState();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* MCP Servers List with Expandable Auth & Real Probes */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            MCP Szerverek & Valós Kapcsolat-Ellenőrzés
          </h2>

          <div className="space-y-3">
            {mcpServers.map((srv) => {
              const isExpanded = expandedId === srv.id;
              return (
                <div key={srv.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{srv.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {srv.endpointUrl} · {srv.authType} · Állapot:{' '}
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
                    </div>

                    <div className="flex items-center gap-2">
                      {srv.isGoogleWorkspace && (
                        <button
                          type="button"
                          onClick={handleGoogleOAuth}
                          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          Google OAuth2
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTestMcp(srv.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        {tr(language, 'testConnection')}
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
                        onClick={() => handleSaveMcpCreds(srv.id)}
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

          {/* Register New MCP */}
          <form onSubmit={handleRegisterMcp} className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={mcpName}
              onChange={(e) => setMcpName(e.target.value)}
              placeholder="Új MCP neve"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
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
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
            >
              <Plus className="h-3.5 w-3.5" />
              MCP Felvétel
            </button>
          </form>
        </div>

        {/* Right: External Catalog & Dynamic Sandbox-Verified Skills */}
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
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">
              Dinamikus Skillek (Felügyelő Sandbox Ellenőrzéssel)
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
              <button
                type="submit"
                className="w-full px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                Dry-Run Sandbox Teszt & Aktiválás
              </button>
            </form>

            <div className="space-y-2 pt-2 max-h-[200px] overflow-y-auto">
              {skills.map((sk) => (
                <div key={sk.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>{sk.name}</span>
                    <span className={sk.status === 'verified' ? 'text-emerald-700' : 'text-red-700'}>
                      {sk.status}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 whitespace-pre-wrap">{sk.sandboxReport}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
