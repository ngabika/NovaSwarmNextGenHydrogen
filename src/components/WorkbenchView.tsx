import React, { lazy, Suspense, useState } from 'react';
import {
  BookOpen,
  Code2,
  Database,
  Download,
  FileSpreadsheet,
  Flame,
  GitCompare,
  Globe,
  Languages,
  Play,
  Plus,
  Printer,
  Rocket,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import type {
  Agent,
  DynamicToolDef,
  FlashcardItem,
  NovaSwarmState,
  ProviderId,
} from '../../shared/types';

const Batch3DevOpsPanel = lazy(() =>
  import('./Batch3DevOpsPanel').then((m) => ({ default: m.Batch3DevOpsPanel }))
);
const Batch3DataCreativePanel = lazy(() =>
  import('./Batch3DataCreativePanel').then((m) => ({ default: m.Batch3DataCreativePanel }))
);

interface Props {
  state: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

type WorkbenchTab =
  | 'missions'
  | 'tools'
  | 'research'
  | 'api_sql'
  | 'diff_review'
  | 'lang_learn'
  | 'arena'
  | 'devops'
  | 'data_creative';

interface DiffRow {
  type: 'same' | 'added' | 'removed' | 'changed';
  leftLineNo: number | null;
  rightLineNo: number | null;
  leftText: string;
  rightText: string;
}

interface ArenaResult {
  provider: ProviderId;
  model: string;
  latencyMs: number;
  text: string;
  error?: string;
}

export const WorkbenchView: React.FC<Props> = ({ state, onRefreshState }) => {
  const [subTab, setSubTab] = useState<WorkbenchTab>('missions');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // B1: Autonomous Missions
  const [missionGoal, setMissionGoal] = useState('');
  const [missionAgentId, setMissionAgentId] = useState('');
  const [missionBusy, setMissionBusy] = useState(false);

  // B2: Dynamic Tools
  const [toolName, setToolName] = useState('');
  const [toolDesc, setToolDesc] = useState('');
  const [toolKind, setToolKind] = useState<DynamicToolDef['kind']>('http_get');
  const [toolTarget, setToolTarget] = useState('');

  // Ú31: Deep Research
  const [resQuery, setResQuery] = useState('');
  const [resBusy, setResBusy] = useState(false);

  // Ú32: API Studio
  const [apiName, setApiName] = useState('');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  const [apiUrl, setApiUrl] = useState('https://api.github.com/zen');
  const [apiHeaders, setApiHeaders] = useState('{"Accept":"application/json"}');
  const [apiBody, setApiBody] = useState('');
  const [apiOut, setApiOut] = useState<{ status?: number; latencyMs?: number; body?: string; error?: string } | null>(null);
  const [apiBusy, setApiBusy] = useState(false);

  // Ú33: DB Explorer
  const [dbName, setDbName] = useState('');
  const [dbEngine, setDbEngine] = useState<'sqlite' | 'postgres'>('sqlite');
  const [dbTarget, setDbTarget] = useState('');
  const [dbConnId, setDbConnId] = useState('');
  const [dbSql, setDbSql] = useState("SELECT name, type FROM sqlite_master WHERE type='table';");
  const [dbRows, setDbRows] = useState<Array<Record<string, unknown>>>([]);
  const [dbErr, setDbErr] = useState<string | null>(null);

  // Ú34 & Ú35: Diff & PR Review
  const [diffLeft, setDiffLeft] = useState('const limit = 10;\nfunction run(x) {\n  return x * limit;\n}');
  const [diffRight, setDiffRight] = useState('const limit = 25;\nfunction run(x) {\n  if (!x) return 0;\n  return x * limit;\n}');
  const [diffAi, setDiffAi] = useState(true);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [diffSummary, setDiffSummary] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState('');
  const [rawCodeDiff, setRawCodeDiff] = useState('');
  const [prReviewText, setPrReviewText] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  // Ú47: Interpreter, Ú48: Flashcards, Ú49: Structured Reports
  const [trText, setTrText] = useState('');
  const [trSourceLang, setTrSourceLang] = useState('Magyar');
  const [trTargetLang, setTrTargetLang] = useState('Angol');
  const [trOut, setTrOut] = useState<string | null>(null);
  const [fcFront, setFcFront] = useState('');
  const [fcBack, setFcBack] = useState('');
  const [fcTags, setFcTags] = useState('linux, dev');
  const [repKind, setRepKind] = useState<'worklog' | 'audit' | 'invoice' | 'meeting'>('worklog');
  const [repTitle, setRepTitle] = useState('Heti Működési Összefoglaló');
  const [repNotes, setRepNotes] = useState('');
  const [repOut, setRepOut] = useState<{ html: string; markdown: string } | null>(null);

  // Ú54: Prompt Arena
  const [arenaPrompt, setArenaPrompt] = useState('');
  const [arenaTargets, setArenaTargets] = useState<Array<{ provider: ProviderId; model: string }>>([
    { provider: state.settings.primaryProvider, model: state.discoveredModels[0]?.id || 'gemini-2.5-flash' },
    { provider: state.settings.secondaryProvider, model: state.settings.ollamaModel },
  ]);
  const [arenaResults, setArenaResults] = useState<ArenaResult[]>([]);
  const [arenaBusy, setArenaBusy] = useState(false);

  const workerAgents: Agent[] = state.agents.filter((a) => !a.isSupervisor && a.active);
  const dueCards: FlashcardItem[] = (state.flashcards || []).filter(
    (c) => Date.parse(c.nextReviewAt) <= Date.now()
  );

  const tabs: Array<{ id: WorkbenchTab; label: string; icon: React.ReactNode }> = [
    { id: 'missions', label: `Küldetések (${(state.missions || []).length})`, icon: <Rocket className="h-3.5 w-3.5" /> },
    { id: 'tools', label: `Dinamikus Eszközök (${(state.dynamicTools || []).length})`, icon: <Wrench className="h-3.5 w-3.5" /> },
    { id: 'research', label: `Mélykutatás (${(state.researchReports || []).length})`, icon: <Globe className="h-3.5 w-3.5" /> },
    { id: 'api_sql', label: 'API & SQL Stúdió', icon: <Database className="h-3.5 w-3.5" /> },
    { id: 'diff_review', label: 'Kód Diff & PR Audit', icon: <GitCompare className="h-3.5 w-3.5" /> },
    { id: 'lang_learn', label: `Nyelv, SM-2 (${dueCards.length}) & Riport`, icon: <Languages className="h-3.5 w-3.5" /> },
    { id: 'arena', label: 'Prompt Aréna', icon: <Scale className="h-3.5 w-3.5" /> },
    { id: 'devops', label: 'DevOps & CVE', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
    { id: 'data_creative', label: 'Adat, QR & Közjegyző', icon: <Sparkles className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSubTab(t.id);
              setStatusMsg(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              subTab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">
          {statusMsg}
        </div>
      )}

      {/* B1: Autonomous Goal / Mission Planner & Executor */}
      {subTab === 'missions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!missionGoal.trim() || missionBusy) return;
              setMissionBusy(true);
              setStatusMsg('Autonóm küldetés tervezése és végrehajtása folyamatban...');
              try {
                const res = await fetch('/api/missions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    goal: missionGoal.trim(),
                    agentId: missionAgentId || undefined,
                  }),
                });
                const d = (await res.json()) as { mission?: { status?: string }; error?: string };
                setStatusMsg(
                  res.ok
                    ? `Küldetés állapota: ${d.mission?.status || 'kész'}`
                    : d.error || 'Küldetés hiba'
                );
                setMissionGoal('');
                await onRefreshState();
              } finally {
                setMissionBusy(false);
              }
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-slate-700" />
              Autonóm Küldetés Indítása (Terv → Eszközlánc → Összegzés)
            </h2>
            <p className="text-xs text-slate-500">
              Adj meg egy összetett célt. A választott ágens önállóan alfeladatokra bontja, valós eszközökkel végrehajtja és összegzi.
            </p>
            <select
              value={missionAgentId}
              onChange={(e) => setMissionAgentId(e.target.value)}
              aria-label="Küldetés felelős ágens"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Első aktív ágens (automatikus)</option>
              {workerAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
            <textarea
              rows={4}
              value={missionGoal}
              onChange={(e) => setMissionGoal(e.target.value)}
              placeholder="Pl. Kutasd fel a legújabb LTS Linux kernel újdonságokat, és készíts belőle rövid technikai összefoglalót..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={missionBusy || !missionGoal.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              {missionBusy ? 'Küldetés fut...' : 'Küldetés Végrehajtása'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Küldetés Napló</h3>
            {(state.missions || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Még nem futott autonóm küldetés.</p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto">
                {(state.missions || []).map((m) => (
                  <div key={m.id} className="p-3.5 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{m.goal}</span>
                      <span
                        className={`font-mono font-semibold uppercase ${
                          m.status === 'completed'
                            ? 'text-emerald-700'
                            : m.status === 'failed'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {m.steps.map((st, idx) => (
                        <div key={idx} className="py-1.5 flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-slate-800">{st.title}</div>
                            {st.detail && <div className="text-[11px] text-slate-500">{st.detail}</div>}
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 shrink-0">{st.status}</span>
                        </div>
                      ))}
                    </div>
                    {m.finalSummary && (
                      <div className="pt-2 border-t border-slate-100 text-slate-700 whitespace-pre-wrap">
                        {m.finalSummary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* B2: Dynamic Runtime Tool Creator */}
      {subTab === 'tools' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!toolName.trim() || !toolTarget.trim()) return;
              const r = await fetch('/api/tools/dynamic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: toolName.trim(),
                  description: toolDesc.trim() || toolName.trim(),
                  kind: toolKind,
                  targetOrCode: toolTarget.trim(),
                }),
              });
              const d = (await r.json()) as { error?: string; tool?: DynamicToolDef };
              if (!r.ok) {
                setStatusMsg(d.error || 'Eszköz létrehozási hiba');
              } else {
                setToolName('');
                setToolDesc('');
                setToolTarget('');
                setStatusMsg(`Dinamikus eszköz regisztrálva: ${d.tool?.name}`);
                await onRefreshState();
              }
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-slate-700" />
              Új Dinamikus Ágens Eszköz
            </h2>
            <p className="text-xs text-slate-500">
              Az itt felvett eszközök azonnal elérhetővé válnak minden ágens tool-hívásában (ReAct ciklusban).
            </p>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="Eszköz neve (pl. btc_eur_arfolyam)"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={toolDesc}
              onChange={(e) => setToolDesc(e.target.value)}
              placeholder="Mit csinál az eszköz? (pl. Lekéri a jelenlegi EUR/HUF árfolyamot)"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <select
              value={toolKind}
              onChange={(e) => setToolKind(e.target.value as DynamicToolDef['kind'])}
              aria-label="Eszköz típusa"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="http_get">HTTP GET végpont (&#123;&#123;input&#125;&#125; paraméterrel)</option>
              <option value="http_post">HTTP POST végpont (JSON input)</option>
              <option value="sandbox_js">Elszigetelt JavaScript (node --permission)</option>
            </select>
            <textarea
              rows={4}
              value={toolTarget}
              onChange={(e) => setToolTarget(e.target.value)}
              placeholder={
                toolKind === 'sandbox_js'
                  ? 'const x = Number(INPUT || 1); console.log(JSON.stringify({ result: x * 2 }));'
                  : 'https://api.frankfurter.app/latest?from=EUR&to=HUF'
              }
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Eszköz Regisztrálása
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Aktív Dinamikus Eszközök</h3>
            {(state.dynamicTools || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Még nincs létrehozott egyedi eszköz.</p>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto">
                {(state.dynamicTools || []).map((t) => (
                  <div key={t.id} className="p-3 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-semibold text-slate-900">{t.name}</span> ·{' '}
                        <span className="font-mono text-slate-500">{t.kind}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/tools/dynamic/${t.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ enabled: !t.enabled }),
                            });
                            await onRefreshState();
                          }}
                          className={`px-2 py-0.5 text-[11px] rounded border whitespace-nowrap shrink-0 ${
                            t.enabled
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          {t.enabled ? 'Aktív' : 'Tiltva'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete tool ${t.name}`}
                          onClick={async () => {
                            await fetch(`/api/tools/dynamic/${t.id}`, { method: 'DELETE' });
                            await onRefreshState();
                          }}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-slate-600">{t.description}</div>
                    <pre className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] overflow-x-auto">
                      {t.targetOrCode}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ú31: Deep Research Agent */}
      {subTab === 'research' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-700" />
            Mélykutatási Ügynök (Több Al-kérdés · Élő Webes Keresés · Hivatkozott Szintézis)
          </h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!resQuery.trim() || resBusy) return;
              setResBusy(true);
              try {
                const r = await fetch('/api/research', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: resQuery.trim() }),
                });
                const d = (await r.json()) as { error?: string };
                if (!r.ok) setStatusMsg(d.error || 'Kutatási hiba');
                else setResQuery('');
                await onRefreshState();
              } finally {
                setResBusy(false);
              }
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={resQuery}
              onChange={(e) => setResQuery(e.target.value)}
              placeholder="Kutatási kérdés vagy technológia összehasonlítás..."
              className="flex-1 min-w-[240px] px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={resBusy || !resQuery.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Search className="h-3.5 w-3.5" />
              {resBusy ? 'Kutatás fut...' : 'Mélykutatás Indítása'}
            </button>
          </form>

          <div className="space-y-4 max-h-[540px] overflow-y-auto">
            {(state.researchReports || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Még nem készült mélykutatási jelentés.</p>
            ) : (
              (state.researchReports || []).map((rep) => (
                <div key={rep.id} className="p-4 border border-slate-200 rounded-lg space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{rep.query}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {new Date(rep.createdAt).toLocaleString()} · {rep.sources.length} forrás
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600">
                    Al-kérdések: {rep.subQueries.join(' | ')}
                  </div>
                  <pre className="p-3 bg-slate-50 border border-slate-200 rounded whitespace-pre-wrap font-sans leading-relaxed text-slate-800">
                    {rep.summaryMarkdown}
                  </pre>
                  {rep.sources.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {rep.sources.slice(0, 8).map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-slate-700 underline hover:text-slate-900"
                        >
                          [{idx + 1}] {s.title.slice(0, 42)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Ú32 & Ú33: API Studio + Read-Only SQL Database Explorer */}
      {subTab === 'api_sql' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Send className="h-4 w-4 text-slate-700" />
              API Teszt Stúdió (HTTP / REST)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <select
                value={apiMethod}
                onChange={(e) => setApiMethod(e.target.value as typeof apiMethod)}
                className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
              >
                {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://..."
                className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <input
                type="text"
                value={apiName}
                onChange={(e) => setApiName(e.target.value)}
                placeholder="Mentési név (opc.)"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <textarea
              rows={2}
              value={apiHeaders}
              onChange={(e) => setApiHeaders(e.target.value)}
              placeholder='Fejléc JSON {"Accept":"application/json"}'
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            {apiMethod !== 'GET' && (
              <textarea
                rows={3}
                value={apiBody}
                onChange={(e) => setApiBody(e.target.value)}
                placeholder="Request body (JSON / text)..."
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            )}
            <button
              type="button"
              disabled={apiBusy || !apiUrl.trim()}
              onClick={async () => {
                setApiBusy(true);
                try {
                  const r = await fetch('/api/api-studio/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: apiName.trim() || undefined,
                      method: apiMethod,
                      url: apiUrl.trim(),
                      headersJson: apiHeaders,
                      body: apiBody,
                      save: Boolean(apiName.trim()),
                    }),
                  });
                  const d = (await r.json()) as {
                    status?: number;
                    latencyMs?: number;
                    responseBody?: string;
                    error?: string;
                  };
                  setApiOut({
                    status: d.status,
                    latencyMs: d.latencyMs,
                    body: d.responseBody,
                    error: d.error,
                  });
                  await onRefreshState();
                } finally {
                  setApiBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              {apiBusy ? 'Küldés...' : 'Kérés Végrehajtása'}
            </button>
            {apiOut && (
              <div className="space-y-1">
                <div className="text-[11px] font-mono tabular-nums text-slate-600">
                  HTTP {apiOut.status ?? '-'} · {apiOut.latencyMs ?? 0}ms {apiOut.error ? `· ${apiOut.error}` : ''}
                </div>
                <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-44 overflow-auto whitespace-pre-wrap">
                  {apiOut.body || apiOut.error}
                </pre>
              </div>
            )}
            {(state.savedApiRequests || []).length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-40 overflow-y-auto">
                {(state.savedApiRequests || []).map((req) => (
                  <div key={req.id} className="flex items-center justify-between text-xs p-2 border border-slate-200 rounded">
                    <button
                      type="button"
                      onClick={() => {
                        setApiName(req.name);
                        setApiMethod(req.method);
                        setApiUrl(req.url);
                        setApiHeaders(req.headersJson);
                        setApiBody(req.body);
                      }}
                      className="text-left font-mono truncate flex-1 hover:underline"
                    >
                      {req.method} {req.name} ({req.lastStatus ?? '-'})
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/api-studio/requests/${req.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600 ml-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-700" />
              Adatbázis Felfedező (Csak Olvasás · SQLite / PostgreSQL)
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!dbName.trim() || !dbTarget.trim()) return;
                const r = await fetch('/api/db/connections', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: dbName.trim(), engine: dbEngine, target: dbTarget.trim() }),
                });
                const d = (await r.json()) as { connection?: { id: string } };
                if (d.connection) setDbConnId(d.connection.id);
                setDbName('');
                setDbTarget('');
                await onRefreshState();
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-2"
            >
              <input
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="Kapcsolat neve"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
              <select
                value={dbEngine}
                onChange={(e) => setDbEngine(e.target.value as 'sqlite' | 'postgres')}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="sqlite">SQLite fájl</option>
                <option value="postgres">PostgreSQL DSN</option>
              </select>
              <input
                type="text"
                value={dbTarget}
                onChange={(e) => setDbTarget(e.target.value)}
                placeholder={dbEngine === 'sqlite' ? '/útvonal/db.sqlite' : 'postgres://...'}
                className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">
                + Kapcsolat
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              <select
                value={dbConnId}
                onChange={(e) => setDbConnId(e.target.value)}
                aria-label="Aktív adatbázis kapcsolat"
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="">Válassz mentett kapcsolatot...</option>
                {(state.databaseConnections || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.engine}: {c.target})
                  </option>
                ))}
              </select>
              {dbConnId && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/db/connections/${dbConnId}`, { method: 'DELETE' });
                    setDbConnId('');
                    await onRefreshState();
                  }}
                  className="px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded hover:bg-red-50"
                >
                  Törlés
                </button>
              )}
            </div>

            <textarea
              rows={3}
              value={dbSql}
              onChange={(e) => setDbSql(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <button
              type="button"
              disabled={!dbConnId}
              onClick={async () => {
                setDbErr(null);
                const r = await fetch('/api/db/query', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ connectionId: dbConnId, sql: dbSql }),
                });
                const d = (await r.json()) as { rows?: Array<Record<string, unknown>>; error?: string };
                if (!r.ok) {
                  setDbErr(d.error || 'SQL hiba');
                  setDbRows([]);
                } else {
                  setDbRows(d.rows || []);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              SELECT Futtatása
            </button>
            {dbErr && <div className="text-xs font-mono text-red-700">{dbErr}</div>}
            {dbRows.length > 0 && (
              <div className="overflow-x-auto max-h-56 border border-slate-200 rounded">
                <table className="w-full text-left text-[11px] font-mono border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {Object.keys(dbRows[0]).map((col) => (
                        <th key={col} className="py-1.5 px-2 font-semibold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dbRows.slice(0, 50).map((row, idx) => (
                      <tr key={idx}>
                        {Object.values(row).map((val, cIdx) => (
                          <td key={cIdx} className="py-1 px-2 truncate max-w-[180px]">
                            {String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ú34 & Ú35: Side-by-Side Diff Viewer + AI PR/Git Code Reviewer */}
      {subTab === 'diff_review' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-slate-700" />
                Kétoldali Szöveg & Kód Összehasonlító (LCS Diff)
              </h2>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={diffAi} onChange={(e) => setDiffAi(e.target.checked)} />
                  AI Összegzés kérése
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/diff/compare', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ leftText: diffLeft, rightText: diffRight, withAiSummary: diffAi }),
                    });
                    const d = (await r.json()) as { rows?: DiffRow[]; aiSummary?: string };
                    setDiffRows(d.rows || []);
                    setDiffSummary(d.aiSummary || null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
                >
                  Összehasonlítás
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <textarea
                rows={5}
                value={diffLeft}
                onChange={(e) => setDiffLeft(e.target.value)}
                aria-label="Régi szöveg"
                className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <textarea
                rows={5}
                value={diffRight}
                onChange={(e) => setDiffRight(e.target.value)}
                aria-label="Új szöveg"
                className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            {diffSummary && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs whitespace-pre-wrap text-slate-800">
                {diffSummary}
              </div>
            )}
            {diffRows.length > 0 && (
              <div className="border border-slate-200 rounded overflow-x-auto max-h-64 text-[11px] font-mono">
                {diffRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-2 divide-x divide-slate-200 px-2 py-0.5 ${
                      row.type === 'added'
                        ? 'bg-emerald-50'
                        : row.type === 'removed'
                        ? 'bg-red-50'
                        : row.type === 'changed'
                        ? 'bg-amber-50'
                        : ''
                    }`}
                  >
                    <div className="pr-2 truncate">
                      <span className="text-slate-400 mr-2 tabular-nums">{row.leftLineNo ?? ' '}</span>
                      {row.leftText}
                    </div>
                    <div className="pl-2 truncate">
                      <span className="text-slate-400 mr-2 tabular-nums">{row.rightLineNo ?? ' '}</span>
                      {row.rightText}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-slate-700" />
              Git Diff / GitHub PR Automatikus Kód-Auditor
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="GitHub PR URL (pl. https://github.com/owner/repo/pull/12) vagy hagyd üresen lokális git diffhez"
                className="flex-1 min-w-[260px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                disabled={reviewBusy}
                onClick={async () => {
                  setReviewBusy(true);
                  try {
                    const r = await fetch('/api/code/review', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prUrl: prUrl.trim() || undefined,
                        rawDiff: rawCodeDiff.trim() || undefined,
                      }),
                    });
                    const d = (await r.json()) as { review?: string; error?: string };
                    setPrReviewText(d.review || d.error || 'Nincs eredmény.');
                  } finally {
                    setReviewBusy(false);
                  }
                }}
                className="px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
              >
                {reviewBusy ? 'Elemzés...' : 'Kód-Audit Indítása'}
              </button>
            </div>
            <textarea
              rows={3}
              value={rawCodeDiff}
              onChange={(e) => setRawCodeDiff(e.target.value)}
              placeholder="Opcionális: közvetlen git diff beillesztése..."
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
            />
            {prReviewText && (
              <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
                {prReviewText}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Ú47 Interpreter, Ú48 SM-2 Flashcards, Ú49 Structured Reports */}
      {subTab === 'lang_learn' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Languages className="h-4 w-4 text-slate-700" />
                Kétnyelvű Élő Tolmács & Fordító
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  value={trSourceLang}
                  onChange={(e) => setTrSourceLang(e.target.value)}
                  placeholder="Forrásnyelv"
                  className="px-2.5 py-1.5 border border-slate-300 rounded"
                />
                <input
                  type="text"
                  value={trTargetLang}
                  onChange={(e) => setTrTargetLang(e.target.value)}
                  placeholder="Célnyelv"
                  className="px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <textarea
                rows={3}
                value={trText}
                onChange={(e) => setTrText(e.target.value)}
                placeholder="Írj vagy illessz be szöveget fordításhoz..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                disabled={!trText.trim()}
                onClick={async () => {
                  const r = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: trText, sourceLang: trSourceLang, targetLang: trTargetLang }),
                  });
                  const d = (await r.json()) as { translated?: string; error?: string };
                  setTrOut(d.translated || d.error || '');
                }}
                className="px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                Azonnali Fordítás
              </button>
              {trOut && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs whitespace-pre-wrap text-slate-900">
                  {trOut}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-slate-700" />
                  SM-2 Villámkártyák ({dueCards.length} esedékes)
                </h2>
                <a
                  href="/api/flashcards/export"
                  download="novaswarm-flashcards.csv"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                >
                  <Download className="h-3 w-3" />
                  Anki CSV Export
                </a>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!fcFront.trim() || !fcBack.trim()) return;
                  await fetch('/api/flashcards', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      front: fcFront.trim(),
                      back: fcBack.trim(),
                      tags: fcTags.split(',').map((t) => t.trim()).filter(Boolean),
                    }),
                  });
                  setFcFront('');
                  setFcBack('');
                  await onRefreshState();
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <input type="text" value={fcFront} onChange={(e) => setFcFront(e.target.value)} placeholder="Kérdés / Fogalom" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
                <input type="text" value={fcBack} onChange={(e) => setFcBack(e.target.value)} placeholder="Válasz" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
                <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">+ Kártya</button>
              </form>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(state.flashcards || []).map((c) => (
                  <div key={c.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-slate-900">{c.front}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/flashcards/${c.id}`, { method: 'DELETE' });
                          await onRefreshState();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-slate-700">{c.back}</div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        EF:{c.easeFactor.toFixed(2)} · {c.intervalDays} nap · Köv: {c.nextReviewAt.slice(0, 10)}
                      </span>
                      <div className="flex gap-1">
                        {[0, 3, 4, 5].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={async () => {
                              await fetch(`/api/flashcards/${c.id}/review`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ quality: q }),
                              });
                              await onRefreshState();
                            }}
                            className="px-2 py-0.5 text-[11px] font-mono border border-slate-300 bg-white rounded hover:bg-slate-100"
                          >
                            {q === 0 ? 'Újra(0)' : q === 3 ? 'Nehéz(3)' : q === 4 ? 'Jó(4)' : 'Könnyű(5)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-slate-700" />
              Strukturált Munka-, Audit- és Nyomtatható Jelentés Generátor
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <select value={repKind} onChange={(e) => setRepKind(e.target.value as typeof repKind)} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white">
                <option value="worklog">Munkanapló</option>
                <option value="audit">Biztonsági Audit</option>
                <option value="invoice">Teljesítés / Számla melléklet</option>
                <option value="meeting">Megbeszélés jegyzőkönyv</option>
              </select>
              <input type="text" value={repTitle} onChange={(e) => setRepTitle(e.target.value)} placeholder="Dokumentum címe" className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/reports/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind: repKind, title: repTitle, customNotes: repNotes }),
                  });
                  const d = (await r.json()) as { html?: string; markdown?: string };
                  if (d.html && d.markdown) setRepOut({ html: d.html, markdown: d.markdown });
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
              >
                Jelentés Generálása
              </button>
            </div>
            <input
              type="text"
              value={repNotes}
              onChange={(e) => setRepNotes(e.target.value)}
              placeholder="Egyéni megjegyzések a jelentéshez..."
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
            />
            {repOut && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([repOut.html], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${repKind}-report.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Nyomtatható HTML Letöltése
                  </button>
                </div>
                <iframe
                  title="Jelentés előnézet"
                  sandbox=""
                  srcDoc={repOut.html}
                  className="w-full h-72 border border-slate-200 rounded bg-white"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ú54: Prompt Arena */}
      {subTab === 'arena' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Flame className="h-4 w-4 text-slate-700" />
              Prompt Aréna (Párhuzamos Modell Összehasonlítás)
            </h2>
            <button
              type="button"
              onClick={() =>
                setArenaTargets((prev) =>
                  prev.length < 3 ? [...prev, { provider: 'ollama', model: state.settings.ollamaModel }] : prev
                )
              }
              className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
            >
              + 3. Modell Hozzáadása
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {arenaTargets.map((t, idx) => (
              <div key={idx} className="flex gap-1.5 text-xs">
                <select
                  value={t.provider}
                  onChange={(e) =>
                    setArenaTargets((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, provider: e.target.value as ProviderId } : x))
                    )
                  }
                  className="px-2 py-1.5 border border-slate-300 rounded bg-white"
                >
                  {(['gemini', 'openrouter', 'openai', 'anthropic', 'ollama'] as ProviderId[]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={t.model}
                  onChange={(e) =>
                    setArenaTargets((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, model: e.target.value } : x))
                    )
                  }
                  className="flex-1 px-2 py-1.5 font-mono border border-slate-300 rounded"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={arenaPrompt}
              onChange={(e) => setArenaPrompt(e.target.value)}
              placeholder="Írj egy teszt-promptot a párhuzamos kiértékeléshez..."
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              disabled={arenaBusy || !arenaPrompt.trim()}
              onClick={async () => {
                setArenaBusy(true);
                try {
                  const r = await fetch('/api/arena/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: arenaPrompt, targets: arenaTargets }),
                  });
                  const d = (await r.json()) as { results?: ArenaResult[] };
                  setArenaResults(d.results || []);
                } finally {
                  setArenaBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {arenaBusy ? 'Verseny fut...' : 'Futtatás Arénában'}
            </button>
          </div>

          {arenaResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {arenaResults.map((res, idx) => (
                <div key={idx} className="p-3.5 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-semibold text-slate-900">{res.provider} / {res.model}</span>
                    <span className="tabular-nums text-slate-500">{res.latencyMs}ms</span>
                  </div>
                  <div className="text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {res.error ? `Hiba: ${res.error}` : res.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'devops' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">DevOps & CVE modul betöltése...</div>}>
          <Batch3DevOpsPanel />
        </Suspense>
      )}

      {subTab === 'data_creative' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Adat & Kreatív Stúdió betöltése...</div>}>
          <Batch3DataCreativePanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
    </div>
  );
};
