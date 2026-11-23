import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  CheckSquare,
  Code2,
  Cpu,
  Download,
  FileText,
  GitBranch,
  HeartPulse,
  Layers,
  Lock,
  Network,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  Sliders,
  Trash2,
  UserCheck,
  Wand2,
} from 'lucide-react';
import type {
  AgentPersonaProfile,
  ArchitectureBlueprint,
  CommunicationDraft,
  HierarchicalGoalNode,
  NovaSwarmState,
  OmniCapabilityEntry,
  StudyPlanItem,
  TimeBlockSlot,
  UserContextProfile,
} from '../../shared/types';

interface Props {
  state?: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

type B8TabId = 'persona_style' | 'cognitive' | 'studio_dev' | 'analytics_catalog';

export const Batch8SingularityPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  const [tab, setTab] = useState<B8TabId>('persona_style');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab 1: Persona, Context, Style, Fact Vault, Tone/Prose, Framework
  const [newPersonaName, setNewPersonaName] = useState('');
  const [newPersonaRole, setNewPersonaRole] = useState('');
  const [newPersonaTone, setNewPersonaTone] = useState('tárgyilagos, precíz');
  const [newPersonaGuidance, setNewPersonaGuidance] = useState('');
  const [styleLabel, setStyleLabel] = useState('Saját Minta');
  const [styleSampleText, setStyleSampleText] = useState(
    'Kérlek vizsgáljuk meg a rendszer terhelését és a memória-használatot. Ha szükséges, állítsuk át a kontextust tömörebb módba a gyorsabb válaszidő érdekében.'
  );
  const [factCategory, setFactCategory] = useState('Projekt');
  const [factKey, setFactKey] = useState('');
  const [factValue, setFactValue] = useState('');
  const [factQuery, setFactQuery] = useState('');
  const [toneText, setToneText] = useState(
    'Szia! Köszi a segítséget, légyszi nézz rá a szerver naplókra mert talán lassult a válaszidő.'
  );
  const [targetTone, setTargetTone] = useState<'formal' | 'casual' | 'assertive' | 'empathetic' | 'bullet_executive'>('formal');
  const [toneResult, setToneResult] = useState<{ transformed: string; changesApplied: string[] } | null>(null);
  const [proseResult, setProseResult] = useState<{
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: number;
    estimatedReadMinutes: number;
    estimatedSpeakSeconds: number;
    readabilityScore: number;
    suggestions: string[];
  } | null>(null);
  const [frameworkKind, setFrameworkKind] = useState<'adr' | 'rfc' | 'swot' | '5whys' | 'star' | 'postmortem' | 'eisenhower' | 'bluf'>('adr');
  const [frameworkTopic, setFrameworkTopic] = useState('SQLite WAL vs PostgreSQL választás Raspberry Pi csomóponton');
  const [frameworkOut, setFrameworkOut] = useState<string | null>(null);

  // Tab 2: Cognitive Planner: Goal Tree, Handoff, Decision Matrix, Scenario, Red Team, PERT/RICE
  const [goalTitle, setGoalTitle] = useState('');
  const [goalHorizon, setGoalHorizon] = useState<HierarchicalGoalNode['horizon']>('quarterly');
  const [goalMilestones, setGoalMilestones] = useState('Követelmények tisztázása\nPrototípus elkészítése\nÉles ellenőrzés');
  const [handoffTitle, setHandoffTitle] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [matrixTitle, setMatrixTitle] = useState('Szerver üzemeltetési opció');
  const [matrixCriteriaRaw, setMatrixCriteriaRaw] = useState('Megbízhatóság:5, Költség:3, Karbantartás:4');
  const [matrixOptARaw, setMatrixOptARaw] = useState('Helyi ARM64 Pi|9,9,7');
  const [matrixOptBRaw, setMatrixOptBRaw] = useState('Felhő VPS|8,5,9');
  const [scenarioTopic, setScenarioTopic] = useState('Önálló AI Gateway bevezetése irodai hálózaton');
  const [redTeamProposal, setRedTeamProposal] = useState('Azonnali élesítés minden külső szolgáltatásnál párhuzamosan.');
  const [pertO, setPertO] = useState(4);
  const [pertM, setPertM] = useState(8);
  const [pertP, setPertP] = useState(16);
  const [pertReach, setPertReach] = useState(10);
  const [pertImpact, setPertImpact] = useState(3);
  const [pertRes, setPertRes] = useState<{
    pertExpectedHours: number;
    pertStdDevHours: number;
    safeUpperBound95Hours: number;
    riceScore: number;
  } | null>(null);

  // Tab 3: Meeting, Study, Glossary, Concept Graph, Snippets, Blueprint, Playbooks, SQL/Infra, Converters, PII
  const [meetingTitle, setMeetingTitle] = useState('Heti Architektúra Egyeztetés');
  const [meetingRaw, setMeetingRaw] = useState(
    '- [ ] Docker memóriakorlát beállítása @Gábor holnap\n- [ ] SQLite backup ellenőrzése @Anna péntek\nMikor történik a külső kulcs rotáció?'
  );
  const [meetingImportInfo, setMeetingImportInfo] = useState<string | null>(null);
  const [digestTitle, setDigestTitle] = useState('Rendszer Összefoglaló');
  const [digestRaw, setDigestRaw] = useState(
    'A helyi elsődleges futtatás csökkenti a késleltetést és megóvja a bizalmas adatokat. A hibrid router automatikusan vált tartalék szolgáltatóra hiba esetén. A rendszeres pillanatkép garantálja a gyors helyreállítást.'
  );
  const [studyTopic, setStudyTopic] = useState('Docker cgroups és Linux memória menedzsment');
  const [studyLevel, setStudyLevel] = useState<StudyPlanItem['level']>('intermediate');
  const [glTerm, setGlTerm] = useState('');
  const [glDomain, setGlDomain] = useState('Infrastruktúra');
  const [glDef, setGlDef] = useState('');
  const [conceptGraph, setConceptGraph] = useState<{ mermaid: string; nodeCount: number; edgeCount: number } | null>(null);
  const [snipTitle, setSnipTitle] = useState('');
  const [snipLang, setSnipLang] = useState('bash');
  const [snipCode, setSnipCode] = useState('');
  const [snipVarsRaw, setSnipVarsRaw] = useState('service=novaswarm');
  const [snipRendered, setSnipRendered] = useState<string | null>(null);
  const [bpName, setBpName] = useState('Otthoni Hibrid Szerver');
  const [bpPattern, setBpPattern] = useState<ArchitectureBlueprint['pattern']>('iot_edge');
  const [sqlInput, setSqlInput] = useState('SELECT * FROM users WHERE active = 1;');
  const [sqlOut, setSqlOut] = useState<{ riskLevel: string; findings: string[]; recommendations: string[] } | null>(null);
  const [infraInput, setInfraInput] = useState('services:\n  app:\n    image: node:latest\n    privileged: true');
  const [infraOut, setInfraOut] = useState<{ issueCount: number; issues: Array<{ severity: string; message: string }> } | null>(null);
  const [convMode, setConvMode] = useState<'json_to_ts' | 'csv_to_markdown' | 'jwt_decode' | 'env_mask'>('json_to_ts');
  const [convPayload, setConvPayload] = useState('{"host": "192.168.1.10", "port": 3000, "active": true}');
  const [convOut, setConvOut] = useState<string | null>(null);
  const [piiText, setPiiText] = useState(
    'Ügyfél: teszt.user@example.com, telefon: +36 30 123 4567, IP: 192.168.1.44, kulcs: sk-testtoken1234567890abcdef'
  );
  const [piiOut, setPiiOut] = useState<{ sanitized: string; redactionsCount: number; categoriesFound: string[] } | null>(null);

  // Tab 4: Analytics, Finance, Units, Timeblocks, Checklists, Wellness, Drafts, Report & 200+ Catalog
  const [statsInput, setStatsInput] = useState('10, 12, 11, 13, 12, 95, 11, 12');
  const [statsOut, setStatsOut] = useState<{
    count: number;
    sum: number;
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    p95: number;
    trendSlope: number;
    anomalies: Array<{ index: number; value: number; zScore: number }>;
  } | null>(null);
  const [finMode, setFinMode] = useState<'compound' | 'loan' | 'vat_hu'>('vat_hu');
  const [finPrincipal, setFinPrincipal] = useState(127000);
  const [finRate, setFinRate] = useState(8);
  const [finYears, setFinYears] = useState(10);
  const [finMonthly, setFinMonthly] = useState(50000);
  const [finVat, setFinVat] = useState(27);
  const [finOut, setFinOut] = useState<{ summary: string; finalAmount: number; totalInterestOrTax: number } | null>(null);
  const [unitVal, setUnitVal] = useState(100);
  const [unitFrom, setUnitFrom] = useState('mbps');
  const [unitTo, setUnitTo] = useState('mb/s');
  const [unitOut, setUnitOut] = useState<{ formatted: string; worldClocks: Array<{ city: string; time: string }> } | null>(null);
  const [tbStart, setTbStart] = useState('09:00');
  const [tbEnd, setTbEnd] = useState('11:00');
  const [tbTitle, setTbTitle] = useState('Mély fókusz fejlesztés');
  const [tbKind, setTbKind] = useState<TimeBlockSlot['kind']>('deep_work');
  const [tbConflictMsg, setTbConflictMsg] = useState<string | null>(null);
  const [wellSleep, setWellSleep] = useState(7.5);
  const [wellWater, setWellWater] = useState(2200);
  const [wellEnergy, setWellEnergy] = useState(8);
  const [wellMove, setWellMove] = useState(40);
  const [draftPurpose, setDraftPurpose] = useState('Ütemterv jóváhagyás kérése');
  const [draftTone, setDraftTone] = useState<CommunicationDraft['tone']>('formal');
  const [draftPoints, setDraftPoints] = useState('Első mérföldkő kész; tesztek sikeresek; pénteki élesítés javasolt.');
  const [execReportMd, setExecReportMd] = useState<string | null>(null);

  // 200+ Capability Catalog state
  const [capQuery, setCapQuery] = useState('');
  const [capCategory, setCapCategory] = useState('');
  const [catalogData, setCatalogData] = useState<{
    totalCount: number;
    categories: string[];
    items: OmniCapabilityEntry[];
  } | null>(null);

  const postJson = async <T,>(url: string, body?: unknown): Promise<T> => {
    setErrorMsg(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok || data?.ok === false) {
      const msg = data?.error || `HTTP ${res.status}`;
      setErrorMsg(msg);
      throw new Error(msg);
    }
    return data;
  };

  const loadCatalog = async (q = capQuery, category = capCategory) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (category.trim()) params.set('category', category.trim());
    const r = await fetch(`/api/v8/capabilities?${params.toString()}`);
    if (r.ok) {
      const d = (await r.json()) as {
        totalCount: number;
        categories: string[];
        items: OmniCapabilityEntry[];
      };
      setCatalogData(d);
    }
  };

  useEffect(() => {
    if (tab === 'analytics_catalog') {
      void loadCatalog();
    }
  }, [tab]);

  const personas: AgentPersonaProfile[] = state?.agentPersonas || [];
  const contexts: UserContextProfile[] = state?.userContextProfiles || [];
  const facts = useMemo(() => {
    const all = state?.factVault || [];
    const q = factQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (f) =>
        f.factKey.toLowerCase().includes(q) ||
        f.factValue.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
    );
  }, [state?.factVault, factQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Single-Line Segmented Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              Omni-Ágens &amp; Szingularitás Stúdió (Batch 8 · Ú361–Ú560)
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>Aktív Persona: {personas.find((p) => p.id === state?.settings.activePersonaId)?.name || 'Alapértelmezett'}</span>
              <span aria-hidden="true">·</span>
              <span>Kontextus: {contexts.find((c) => c.id === state?.settings.activeUserContextId)?.name || 'Munka'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Ténybank: {(state?.factVault || []).length} tétel</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Célfák: {(state?.goalTrees || []).length}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'persona_style', label: 'Persona, Kontextus & Stúdió' },
                { id: 'cognitive', label: 'Kognitív Tervező & Döntés' },
                { id: 'studio_dev', label: 'Meeting, Tanulás & Kód Copilot' },
                { id: 'analytics_catalog', label: 'Analitika, Élet-OS & 200+ Katalógus' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  tab === item.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {(statusMsg || errorMsg) && (
          <div
            className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              errorMsg
                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
            }`}
          >
            <span>{errorMsg || statusMsg}</span>
            <button
              type="button"
              onClick={() => {
                setStatusMsg(null);
                setErrorMsg(null);
              }}
              className="text-xs font-medium underline shrink-0"
            >
              Bezár
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: Persona, Context, Style Fingerprint, Fact Vault, Tone, Frameworks */}
      {tab === 'persona_style' && (
        <div className="space-y-6">
          {/* Personas & Contexts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Szakértő Persona Könyvtár ({personas.length})
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">Azonnali rendszerprompt váltás</span>
              </div>

              {personas.length === 0 ? (
                <p className="text-xs text-slate-500">Nincsenek betöltött personák.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1 pb-1">
                  {personas.map((p) => {
                    const active = state?.settings.activePersonaId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={async () => {
                          await postJson('/api/v8/persona/activate', { personaIdOrName: p.id });
                          setStatusMsg(`Aktív persona váltva: ${p.name}`);
                          await onRefreshState();
                        }}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          active
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <div className="text-xs font-semibold flex items-center justify-between gap-2">
                          <span className="truncate">{p.name}</span>
                          {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </div>
                        <div className={`text-[11px] mt-0.5 truncate ${active ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                          {p.roleTitle} · {p.tone}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Create Custom Persona */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newPersonaName.trim() || !newPersonaRole.trim()) return;
                  await postJson('/api/v8/persona', {
                    name: newPersonaName,
                    roleTitle: newPersonaRole,
                    tone: newPersonaTone,
                    systemGuidance: newPersonaGuidance || `Segíts a felhasználónak mint ${newPersonaRole}.`,
                    strengths: [newPersonaRole],
                  });
                  setNewPersonaName('');
                  setNewPersonaRole('');
                  setNewPersonaGuidance('');
                  setStatusMsg('Egyedi persona létrehozva.');
                  await onRefreshState();
                }}
                className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2"
              >
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Új egyedi persona felvétele</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newPersonaName}
                    onChange={(e) => setNewPersonaName(e.target.value)}
                    placeholder="Persona neve (pl. DevSecOps)"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <input
                    type="text"
                    value={newPersonaRole}
                    onChange={(e) => setNewPersonaRole(e.target.value)}
                    placeholder="Szerepkör"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <input
                    type="text"
                    value={newPersonaTone}
                    onChange={(e) => setNewPersonaTone(e.target.value)}
                    placeholder="Hangnem"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPersonaGuidance}
                    onChange={(e) => setNewPersonaGuidance(e.target.value)}
                    placeholder="Rendszerutasítás / elvárt működés..."
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Persona Mentése
                  </button>
                </div>
              </form>
            </div>

            {/* Context Profiles & Writing Style Fingerprint */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Élethelyzet &amp; Kontextus Profilok ({contexts.length})
                </h3>
                <div className="space-y-2">
                  {contexts.map((ctx) => {
                    const active = state?.settings.activeUserContextId === ctx.id;
                    return (
                      <button
                        key={ctx.id}
                        type="button"
                        onClick={async () => {
                          await postJson('/api/v8/context/activate', { contextIdOrName: ctx.id });
                          setStatusMsg(`Kontextus profil aktív: ${ctx.name}`);
                          await onRefreshState();
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          active
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                          <span>{ctx.name}</span>
                          <span className="font-mono text-[11px]">{ctx.preferredVerbosity}</span>
                        </div>
                        <div className={`text-[11px] mt-0.5 ${active ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                          {ctx.focusArea} · {ctx.rules}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Írásstílus Ujjlenyomat Elemző</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={styleLabel}
                    onChange={(e) => setStyleLabel(e.target.value)}
                    placeholder="Minta neve"
                    className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/style/analyze', { label: styleLabel, sampleText: styleSampleText });
                      setStatusMsg('Írásstílus minta elemezve és elmentve.');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Stílus Elemzése
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={styleSampleText}
                  onChange={(e) => setStyleSampleText(e.target.value)}
                  aria-label="Írásstílus minta szövege"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                {(state?.writingStyleSamples || []).slice(0, 2).map((s) => (
                  <div key={s.id} className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 flex flex-wrap gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{s.label}</span>
                    <span>·</span>
                    <span>{s.avgSentenceWords} szó/mondat</span>
                    <span>·</span>
                    <span>Diverzitás: {s.lexicalDiversity}%</span>
                    <span>·</span>
                    <span>Formalitás: {s.formalityScore}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fact Vault + Tone Transformer + Structured Frameworks */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Személyes Ténybank (Fact Vault · {(state?.factVault || []).length})
                </h3>
                <input
                  type="search"
                  value={factQuery}
                  onChange={(e) => setFactQuery(e.target.value)}
                  placeholder="Keresés a tényekben..."
                  className="w-40 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!factKey.trim() || !factValue.trim()) return;
                  await postJson('/api/v8/facts', { category: factCategory, factKey, factValue });
                  setFactKey('');
                  setFactValue('');
                  setStatusMsg('Hiteles tény elmentve a Ténybankba.');
                  await onRefreshState();
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <input
                  type="text"
                  value={factCategory}
                  onChange={(e) => setFactCategory(e.target.value)}
                  placeholder="Kategória"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <input
                  type="text"
                  value={factKey}
                  onChange={(e) => setFactKey(e.target.value)}
                  placeholder="Kulcs (pl. SzerverIP)"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={factValue}
                    onChange={(e) => setFactValue(e.target.value)}
                    placeholder="Érték"
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="submit"
                    aria-label="Tény hozzáadása"
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Mentés
                  </button>
                </div>
              </form>

              {facts.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  Még nincs rögzített tény vagy nincs találat. A mentett adatok automatikusan beépülnek az ágens kontextusába.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                  {facts.map((f) => (
                    <div key={f.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{f.factKey}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600 dark:text-slate-300">{f.factValue}</span>
                        <div className="text-[11px] text-slate-400">{f.category}</div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Tény törlése: ${f.factKey}`}
                        onClick={async () => {
                          await fetch(`/api/v8/facts/${f.id}`, { method: 'DELETE' });
                          await onRefreshState();
                        }}
                        className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Hangnem-Átalakító, Próza-Minőség &amp; Strukturált Keretrendszerek
              </h3>

              <textarea
                rows={3}
                value={toneText}
                onChange={(e) => setToneText(e.target.value)}
                aria-label="Átalakítandó szöveg"
                className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={targetTone}
                  onChange={(e) => setTargetTone(e.target.value as typeof targetTone)}
                  aria-label="Cél hangnem"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                >
                  <option value="formal">Hivatalos</option>
                  <option value="casual">Közvetlen</option>
                  <option value="assertive">Határozott</option>
                  <option value="empathetic">Empatikus</option>
                  <option value="bullet_executive">Vezetői (BLUF)</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await postJson<{ transformed: string; changesApplied: string[] }>('/api/v8/tone/transform', {
                      text: toneText,
                      targetTone,
                    });
                    setToneResult(out);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                >
                  Hangnem Átalakítása
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await postJson<NonNullable<typeof proseResult>>('/api/v8/prose/analyze', { text: toneText });
                    setProseResult(out);
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Olvashatóság Elemzése
                </button>
              </div>

              {toneResult && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-1">
                  <div className="text-[11px] text-slate-500">{toneResult.changesApplied.join(' · ')}</div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200">{toneResult.transformed}</pre>
                </div>
              )}

              {proseResult && (
                <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 space-y-1 pt-1">
                  <div>
                    Szavak: {proseResult.wordCount} · Mondatok: {proseResult.sentenceCount} · Olvashatóság: {proseResult.readabilityScore}/100 · Beszédidő: {proseResult.estimatedSpeakSeconds} mp
                  </div>
                  <div className="font-sans text-slate-500">{proseResult.suggestions.join(' · ')}</div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Strukturált Gondolkodási Sablonok (ADR, RFC, SWOT, 5 Miért, STAR, Eisenhower, BLUF)
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={frameworkKind}
                    onChange={(e) => setFrameworkKind(e.target.value as typeof frameworkKind)}
                    aria-label="Keretrendszer típusa"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="adr">ADR (Architektúra Döntés)</option>
                    <option value="rfc">RFC Javaslat</option>
                    <option value="swot">SWOT Mátrix</option>
                    <option value="5whys">5 Miért Gyökérok</option>
                    <option value="star">STAR Beszámoló</option>
                    <option value="postmortem">Post-Mortem</option>
                    <option value="eisenhower">Eisenhower Prioritás</option>
                    <option value="bluf">BLUF Vezetői</option>
                  </select>
                  <input
                    type="text"
                    value={frameworkTopic}
                    onChange={(e) => setFrameworkTopic(e.target.value)}
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const d = await postJson<{ markdown: string }>('/api/v8/framework/generate', {
                        kind: frameworkKind,
                        topic: frameworkTopic,
                      });
                      setFrameworkOut(d.markdown);
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Sablon Készítése
                  </button>
                </div>
                {frameworkOut && (
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-44 overflow-auto whitespace-pre-wrap">
                    {frameworkOut}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Cognitive Planner & Decision Studio */}
      {tab === 'cognitive' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Hierarchical Goal Trees */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Többszintű Célfa &amp; Mérföldkövek ({(state?.goalTrees || []).length})
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!goalTitle.trim()) return;
                  await postJson('/api/v8/goals', {
                    title: goalTitle,
                    horizon: goalHorizon,
                    milestones: goalMilestones.split('\n').map((s) => s.trim()).filter(Boolean),
                  });
                  setGoalTitle('');
                  setStatusMsg('Új célfa létrehozva.');
                  await onRefreshState();
                }}
                className="space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="Cél megnevezése (pl. Homelab teljesség)"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <select
                    value={goalHorizon}
                    onChange={(e) => setGoalHorizon(e.target.value as HierarchicalGoalNode['horizon'])}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="weekly">Heti</option>
                    <option value="monthly">Havi</option>
                    <option value="quarterly">Negyedéves</option>
                    <option value="yearly">Éves</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Cél Hozzáadása
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={goalMilestones}
                  onChange={(e) => setGoalMilestones(e.target.value)}
                  placeholder="Mérföldkövek soronként..."
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
              </form>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {(state?.goalTrees || []).map((g) => (
                  <div key={g.id} className="py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{g.title} · {g.horizon}</span>
                      <span className="font-mono tabular-nums">{g.progressPercent}%</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {g.milestones.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={async () => {
                            await postJson(`/api/v8/goals/${g.id}/milestones/${m.id}/toggle`);
                            await onRefreshState();
                          }}
                          className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                            m.done
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 line-through'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {m.done ? '[x] ' : '[ ] '}{m.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent Handoff Pipeline */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Ágens-to-Ágens Átadási Lánc (Planner → Builder → Reviewer → Verifier)
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!handoffTitle.trim()) return;
                  await postJson('/api/v8/handoffs', { title: handoffTitle, initialNote: handoffNote });
                  setHandoffTitle('');
                  setHandoffNote('');
                  setStatusMsg('Átadási lánc elindítva.');
                  await onRefreshState();
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  type="text"
                  value={handoffTitle}
                  onChange={(e) => setHandoffTitle(e.target.value)}
                  placeholder="Feladat címe..."
                  className="flex-1 min-w-[150px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <input
                  type="text"
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder="Kezdő tervezési megjegyzés"
                  className="flex-1 min-w-[150px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                >
                  Indítás
                </button>
              </form>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {(state?.agentHandoffs || []).map((h) => (
                  <div key={h.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{h.title}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        Aktuális fázis: {h.stage.toUpperCase()} · {h.notes.length} bejegyzés
                      </div>
                    </div>
                    {h.stage !== 'completed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await postJson(`/api/v8/handoffs/${h.id}/advance`, { summary: 'Fázis jóváhagyva' });
                          await onRefreshState();
                        }}
                        className="px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        Következő Fázis
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Decision Matrix + Scenario + Red Team + PERT/RICE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Scale className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Súlyozott Döntési Mátrix Kiértékelő
              </h3>
              <div className="space-y-2 text-xs">
                <input
                  type="text"
                  value={matrixTitle}
                  onChange={(e) => setMatrixTitle(e.target.value)}
                  placeholder="Döntés tárgya"
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <input
                  type="text"
                  value={matrixCriteriaRaw}
                  onChange={(e) => setMatrixCriteriaRaw(e.target.value)}
                  placeholder="Szempont:súly vesszővel"
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={matrixOptARaw}
                    onChange={(e) => setMatrixOptARaw(e.target.value)}
                    placeholder="Opció A|9,8,7"
                    className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <input
                    type="text"
                    value={matrixOptBRaw}
                    onChange={(e) => setMatrixOptBRaw(e.target.value)}
                    placeholder="Opció B|7,6,9"
                    className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const criteria = matrixCriteriaRaw.split(',').map((part) => {
                      const [name, w] = part.split(':').map((s) => s.trim());
                      return { name: name || 'Szempont', weight: Number(w) || 1 };
                    });
                    const parseOpt = (raw: string) => {
                      const [name, sc] = raw.split('|');
                      const scores = (sc || '').split(',').map((n) => Number(n.trim()) || 5);
                      return { name: (name || 'Opció').trim(), scores };
                    };
                    await postJson('/api/v8/cognitive/decision-matrix', {
                      title: matrixTitle,
                      criteria,
                      options: [parseOpt(matrixOptARaw), parseOpt(matrixOptBRaw)],
                    });
                    setStatusMsg('Döntési mátrix kiértékelve.');
                    await onRefreshState();
                  }}
                  className="px-3.5 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                >
                  Mátrix Kiértékelése
                </button>
              </div>

              {(state?.decisionMatrixRuns || []).slice(0, 3).map((dm) => (
                <div key={dm.id} className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{dm.title}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Győztes: {dm.winnerName}</span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-500">+{dm.marginPercent}% előny</span>
                </div>
              ))}
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  3-Ágú Szcenárió Szimulátor &amp; Red-Team Kritika
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scenarioTopic}
                    onChange={(e) => setScenarioTopic(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/cognitive/scenario', { topic: scenarioTopic });
                      setStatusMsg('3-ágú szcenárió szimuláció elkészült.');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    3-Ágú Szimuláció
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={redTeamProposal}
                    onChange={(e) => setRedTeamProposal(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/cognitive/redteam', { proposal: redTeamProposal });
                      setStatusMsg('Red-Team vakfolt elemzés kész.');
                      await onRefreshState();
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Red-Team Elemzés
                  </button>
                </div>
                {(state?.redTeamCritiques || []).slice(0, 1).map((rt) => (
                  <div key={rt.id} className="p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs space-y-1">
                    <div className="font-semibold text-amber-900 dark:text-amber-200 tabular-nums">
                      Kockázati szint: {rt.riskScore}/100 · {rt.proposal}
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">Vakfoltok: {rt.blindSpots.join(' | ')}</div>
                  </div>
                ))}
                {(state?.scenarioSimulations || []).slice(0, 1).map((sc) => (
                  <div key={sc.id} className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{sc.topic}:</span> Reális ({sc.realistic.probabilityPct}%): {sc.realistic.summary}
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">PERT 3-Pontos &amp; RICE Projektbecslés</div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">Opt (ó)</span>
                    <input type="number" value={pertO} onChange={(e) => setPertO(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">Valósz. (ó)</span>
                    <input type="number" value={pertM} onChange={(e) => setPertM(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">Pessz. (ó)</span>
                    <input type="number" value={pertP} onChange={(e) => setPertP(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">Elérés</span>
                    <input type="number" value={pertReach} onChange={(e) => setPertReach(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">Hatás</span>
                    <input type="number" step="0.5" value={pertImpact} onChange={(e) => setPertImpact(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={async () => {
                        const out = await postJson<NonNullable<typeof pertRes>>('/api/v8/cognitive/estimate', {
                          optimisticHours: pertO,
                          mostLikelyHours: pertM,
                          pessimisticHours: pertP,
                          reach: pertReach,
                          impact: pertImpact,
                        });
                        setPertRes(out);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
                    >
                      Számol
                    </button>
                  </div>
                </div>
                {pertRes && (
                  <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    Várható idő: {pertRes.pertExpectedHours} ó · 95% felső korlát: {pertRes.safeUpperBound95Hours} ó · RICE pontszám: {pertRes.riceScore}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Meeting, Study, Glossary, Snippets, Blueprints, Playbooks, SQL/Infra Audit, Converters, PII */}
      {tab === 'studio_dev' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Meeting Processor + Digest */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Megbeszélés Feldolgozó &amp; 1-Kattintásos Kanban Import
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await postJson('/api/v8/studio/meeting', { title: meetingTitle, rawNotes: meetingRaw });
                    setStatusMsg('Megbeszélés jegyzet feldolgozva.');
                    await onRefreshState();
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                >
                  Teendők Kinyerése
                </button>
              </div>
              <textarea
                rows={3}
                value={meetingRaw}
                onChange={(e) => setMeetingRaw(e.target.value)}
                aria-label="Megbeszélés nyers jegyzet"
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
              {meetingImportInfo && <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{meetingImportInfo}</div>}
              {(state?.meetingBriefs || []).slice(0, 2).map((m) => (
                <div key={m.id} className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{m.title}</div>
                    <div className="text-[11px] text-slate-500">{m.summary}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<{ createdCount: number }>(`/api/v8/studio/meeting/${m.id}/import-kanban`);
                      setMeetingImportInfo(`${out.createdCount} teendő átküldve a Kanban táblára.`);
                      await onRefreshState();
                    }}
                    className="px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Kanbanba Exportálás
                  </button>
                </div>
              ))}

              {/* 3-Level Reading Digest */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">3-Szintű Olvasmány Kivonatoló</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={digestTitle}
                    onChange={(e) => setDigestTitle(e.target.value)}
                    className="w-44 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/studio/digest', { title: digestTitle, rawText: digestRaw });
                      setStatusMsg('Kivonat elkészült.');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Kivonat Készítése
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={digestRaw}
                  onChange={(e) => setDigestRaw(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                {(state?.readingDigests || []).slice(0, 1).map((d) => (
                  <div key={d.id} className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{d.title}:</span> {d.tldrOneLine} ({d.wordCount} szó)
                  </div>
                ))}
              </div>
            </div>

            {/* Study Plan + Glossary + Concept Graph */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Interaktív Tanulási Terv &amp; Feynman Kérdések
                </h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={studyTopic}
                    onChange={(e) => setStudyTopic(e.target.value)}
                    className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <select
                    value={studyLevel}
                    onChange={(e) => setStudyLevel(e.target.value as StudyPlanItem['level'])}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="beginner">Kezdő</option>
                    <option value="intermediate">Középhaladó</option>
                    <option value="advanced">Haladó</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/studio/study', { topic: studyTopic, level: studyLevel });
                      await onRefreshState();
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Terv Generálása
                  </button>
                </div>
                {(state?.studyPlans || []).slice(0, 1).map((pl) => (
                  <div key={pl.id} className="space-y-1.5 pt-1">
                    <div className="text-xs font-semibold">{pl.topic} ({pl.level})</div>
                    {pl.modules.map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={async () => {
                          await postJson(`/api/v8/studio/study/${pl.id}/modules/${mod.id}/toggle`);
                          await onRefreshState();
                        }}
                        className="w-full text-left p-2 rounded border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div className={mod.completed ? 'line-through text-emerald-700 dark:text-emerald-400 font-medium' : 'font-medium'}>
                          {mod.completed ? '[x] ' : '[ ] '}{mod.title}
                        </div>
                        <div className="text-[11px] text-slate-500">{mod.keyQuestion}</div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">Szakterületi Fogalomtár ({(state?.glossaryTerms || []).length}) &amp; Tudásgráf</div>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v8/studio/concept-graph');
                      if (r.ok) setConceptGraph(await r.json());
                    }}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Mermaid Gráf Mutatása
                  </button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!glTerm.trim() || !glDef.trim()) return;
                    await postJson('/api/v8/studio/glossary', { term: glTerm, domain: glDomain, definition: glDef });
                    setGlTerm('');
                    setGlDef('');
                    await onRefreshState();
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  <input type="text" value={glTerm} onChange={(e) => setGlTerm(e.target.value)} placeholder="Fogalom" className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={glDomain} onChange={(e) => setGlDomain(e.target.value)} placeholder="Terület" className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <div className="flex gap-1.5">
                    <input type="text" value={glDef} onChange={(e) => setGlDef(e.target.value)} placeholder="Definíció" className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                    <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0">Hozzáad</button>
                  </div>
                </form>
                {conceptGraph && (
                  <pre className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-36 overflow-auto">
                    {conceptGraph.mermaid}
                  </pre>
                )}
              </div>
            </div>
          </div>

          {/* Dev Copilot Row: SQL Audit, Infra Lint, Converters, PII Sanitizer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Code2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                SQL Biztonsági Auditor, Infra Linter &amp; PII Anonimizáló
              </h3>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sqlInput}
                    onChange={(e) => setSqlInput(e.target.value)}
                    aria-label="Vizsgálandó SQL lekérdezés"
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof sqlOut>>('/api/v8/dev/sql-audit', { sql: sqlInput });
                      setSqlOut(out);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    SQL Audit
                  </button>
                </div>
                {sqlOut && (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs">
                    <span className="font-semibold">Kockázat: {sqlOut.riskLevel.toUpperCase()}</span> — {sqlOut.findings.join(' ')}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Dockerfile / Docker Compose Linter</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof infraOut>>('/api/v8/dev/infra-lint', { manifest: infraInput });
                      setInfraOut(out);
                    }}
                    className="px-3 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Manifest Ellenőrzése
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={infraInput}
                  onChange={(e) => setInfraInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                {infraOut && (
                  <div className="text-xs space-y-1">
                    {infraOut.issues.map((iss, idx) => (
                      <div key={idx} className="text-amber-800 dark:text-amber-300">[{iss.severity.toUpperCase()}] {iss.message}</div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Adatvédelmi PII &amp; API Kulcs Anonimizáló
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof piiOut>>('/api/v8/privacy/sanitize', { text: piiText });
                      setPiiOut(out);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                  >
                    Anonimizálás
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={piiText}
                  onChange={(e) => setPiiText(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                {piiOut && (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono">
                    {piiOut.sanitized} ({piiOut.redactionsCount} maszkolás)
                  </div>
                )}
              </div>
            </div>

            {/* Architecture Blueprint + Incident Playbooks + Converters + Snippets */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Network className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Architektúra Tervrajz, Incidens Playbook &amp; Fejlesztői Konverterek
                </h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={bpName}
                    onChange={(e) => setBpName(e.target.value)}
                    className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <select
                    value={bpPattern}
                    onChange={(e) => setBpPattern(e.target.value as ArchitectureBlueprint['pattern'])}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="iot_edge">IoT &amp; Raspberry Pi Edge</option>
                    <option value="monolith_sqlite">Monolith + SQLite WAL</option>
                    <option value="microservices">Mikroszolgáltatások</option>
                    <option value="rag_pipeline">RAG Tudásgráf Pipeline</option>
                    <option value="event_driven">Eseményvezérelt Busz</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/dev/blueprint', { name: bpName, pattern: bpPattern });
                      setStatusMsg('Architektúra tervrajz elkészült.');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Tervrajz Készítése
                  </button>
                </div>
                {(state?.architectureBlueprints || []).slice(0, 1).map((bp) => (
                  <pre key={bp.id} className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-28 overflow-auto">
                    {bp.mermaidDiagram}
                  </pre>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">Konverter:</span>
                  <select
                    value={convMode}
                    onChange={(e) => setConvMode(e.target.value as typeof convMode)}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="json_to_ts">JSON → TypeScript interfész</option>
                    <option value="csv_to_markdown">CSV → Markdown táblázat</option>
                    <option value="jwt_decode">JWT Token Dekóder</option>
                    <option value="env_mask">.env → .env.example Maszk</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await postJson<{ output: string }>('/api/v8/dev/convert', { mode: convMode, payload: convPayload });
                      setConvOut(res.output);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                  >
                    Átalakítás
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={convPayload}
                  onChange={(e) => setConvPayload(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                {convOut && (
                  <pre className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-28 overflow-auto">
                    {convOut}
                  </pre>
                )}
              </div>

              {/* Incident Playbooks & Snippet Vault */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold">Interaktív Incidens Playbookok ({(state?.incidentPlaybooks || []).length})</div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {(state?.incidentPlaybooks || []).slice(0, 3).map((pb) => (
                    <div key={pb.id} className="text-xs space-y-1">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {pb.title} · <span className="font-mono text-[11px] text-slate-500">{pb.severity}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pb.steps.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={async () => {
                              await postJson(`/api/v8/dev/playbooks/${pb.id}/steps/${st.id}/toggle`);
                              await onRefreshState();
                            }}
                            className={`px-2 py-0.5 text-[11px] font-mono rounded border ${
                              st.done
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 line-through'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {st.done ? '[x] ' : '[ ] '}{st.commandOrCheck}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Snippet Render */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="text-xs font-semibold">Paraméterezett Kódrészlet Tár ({(state?.codeSnippets || []).length})</div>
                  <div className="flex flex-wrap gap-2">
                    {(state?.codeSnippets || []).slice(0, 3).map((sn) => (
                      <button
                        key={sn.id}
                        type="button"
                        onClick={async () => {
                          const vars: Record<string, string> = {};
                          snipVarsRaw.split(',').forEach((pair) => {
                            const [k, v] = pair.split('=').map((x) => x.trim());
                            if (k && v) vars[k] = v;
                          });
                          const out = await postJson<{ rendered: string }>(`/api/v8/dev/snippets/${sn.id}/render`, { vars });
                          setSnipRendered(out.rendered);
                          await onRefreshState();
                        }}
                        className="px-2.5 py-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {sn.title} ({sn.language})
                      </button>
                    ))}
                  </div>
                  {snipRendered && (
                    <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-auto">
                      {snipRendered}
                    </pre>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!snipTitle.trim() || !snipCode.trim()) return;
                      await postJson('/api/v8/dev/snippets', { title: snipTitle, language: snipLang, code: snipCode });
                      setSnipTitle('');
                      setSnipCode('');
                      await onRefreshState();
                    }}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1"
                  >
                    <input type="text" value={snipTitle} onChange={(e) => setSnipTitle(e.target.value)} placeholder="Új kódrészlet címe" className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                    <input type="text" value={snipLang} onChange={(e) => setSnipLang(e.target.value)} placeholder="Nyelv" className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                    <div className="flex gap-1">
                      <input type="text" value={snipCode} onChange={(e) => setSnipCode(e.target.value)} placeholder="Kód ({{var}})" className="flex-1 min-w-0 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                      <button type="submit" className="px-2.5 py-1 text-xs bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap">+</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Analytics, Finance, Time-Blocking, Checklists, Wellness, Drafts, Report & 200+ Catalog */}
      {tab === 'analytics_catalog' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Math / Statistics / Finance / Units */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Statisztikai Számsor Elemző, Pénzügyi &amp; Mértékegység Motor
              </h3>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={statsInput}
                    onChange={(e) => setStatsInput(e.target.value)}
                    aria-label="Számsor adatok"
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof statsOut>>('/api/v8/analytics/stats', { numbers: statsInput });
                      setStatsOut(out);
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Statisztika Elemzése
                  </button>
                </div>
                {statsOut && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono tabular-nums space-y-1">
                    <div>
                      n={statsOut.count} · Átlag: {statsOut.mean} · Medián: {statsOut.median} · Szórás: {statsOut.stdDev} · P95: {statsOut.p95} · Trend: {statsOut.trendSlope}
                    </div>
                    <div className="text-amber-700 dark:text-amber-300">
                      Anomáliák (Z ≥ 2.0): {statsOut.anomalies.length > 0 ? statsOut.anomalies.map((a) => `${a.value} (z=${a.zScore})`).join(', ') : 'nincs'}
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Engineering */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-medium">Pénzügyi Kalkulátor (Kamatos kamat · Hitel törlesztő · Magyar ÁFA 27/18/5%)</div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <select
                    value={finMode}
                    onChange={(e) => setFinMode(e.target.value as typeof finMode)}
                    className="col-span-2 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="vat_hu">Magyar ÁFA</option>
                    <option value="compound">Kamatos kamat</option>
                    <option value="loan">Hitel törlesztő</option>
                  </select>
                  <input type="number" value={finPrincipal} onChange={(e) => setFinPrincipal(Number(e.target.value))} placeholder="Összeg" className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="number" value={finMode === 'vat_hu' ? finVat : finRate} onChange={(e) => (finMode === 'vat_hu' ? setFinVat(Number(e.target.value)) : setFinRate(Number(e.target.value)))} placeholder="%" className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="number" value={finYears} onChange={(e) => setFinYears(Number(e.target.value))} placeholder="Év" className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof finOut>>('/api/v8/analytics/finance', {
                        mode: finMode,
                        principal: finPrincipal,
                        annualRatePct: finRate,
                        years: finYears,
                        monthlyContribution: finMonthly,
                        vatRatePct: finVat,
                      });
                      setFinOut(out);
                    }}
                    className="px-3 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                  >
                    Számítás
                  </button>
                </div>
                {finOut && <div className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{finOut.summary}</div>}
              </div>

              {/* Unit & World Clock */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-medium">Mértékegység &amp; 5-Zónás Világóra Átváltó</div>
                <div className="flex flex-wrap gap-2">
                  <input type="number" value={unitVal} onChange={(e) => setUnitVal(Number(e.target.value))} className="w-24 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={unitFrom} onChange={(e) => setUnitFrom(e.target.value)} className="w-20 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <span className="self-center text-slate-400">→</span>
                  <input type="text" value={unitTo} onChange={(e) => setUnitTo(e.target.value)} className="w-20 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof unitOut>>('/api/v8/analytics/units', {
                        value: unitVal,
                        fromUnit: unitFrom,
                        toUnit: unitTo,
                      });
                      setUnitOut(out);
                    }}
                    className="px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Átváltás
                  </button>
                </div>
                {unitOut && (
                  <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {unitOut.formatted} · {unitOut.worldClocks.map((w) => `${w.city} ${w.time}`).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {/* Time-Blocking, Wellness, Checklists & Drafts */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    Napi Idősáv Tervező (Ütközésfigyelővel)
                  </h3>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v8/studio/executive-report');
                      if (r.ok) {
                        const d = (await r.json()) as { markdown: string };
                        setExecReportMd(d.markdown);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Vezetői Riport
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const res = await postJson<{ conflicts: TimeBlockSlot[]; deepWorkMinutesToday: number }>('/api/v8/life/timeblocks', {
                      startHour: tbStart,
                      endHour: tbEnd,
                      title: tbTitle,
                      kind: tbKind,
                    });
                    setTbConflictMsg(
                      res.conflicts.length > 0
                        ? `Figyelem: ${res.conflicts.length} időütközés észlelve! Mai mély fókusz: ${res.deepWorkMinutesToday} perc.`
                        : `Idősáv rögzítve. Mai mély fókusz: ${res.deepWorkMinutesToday} perc.`
                    );
                    await onRefreshState();
                  }}
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"
                >
                  <input type="text" value={tbStart} onChange={(e) => setTbStart(e.target.value)} className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={tbEnd} onChange={(e) => setTbEnd(e.target.value)} className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={tbTitle} onChange={(e) => setTbTitle(e.target.value)} className="col-span-2 sm:col-span-1 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <select value={tbKind} onChange={(e) => setTbKind(e.target.value as TimeBlockSlot['kind'])} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                    <option value="deep_work">Mély fókusz</option>
                    <option value="meeting">Megbeszélés</option>
                    <option value="admin">Admin</option>
                    <option value="recovery">Pihenő</option>
                  </select>
                  <button type="submit" className="px-3 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap">Hozzáad</button>
                </form>
                {tbConflictMsg && <div className="text-xs text-slate-700 dark:text-slate-300">{tbConflictMsg}</div>}
                <div className="flex flex-wrap gap-1.5">
                  {(state?.timeBlocks || []).slice(0, 4).map((tb) => (
                    <span key={tb.id} className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                      {tb.startHour}–{tb.endHour} {tb.title} ·
                    </span>
                  ))}
                </div>
              </div>

              {/* Wellness Check-in & Checklists */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-semibold flex items-center gap-1.5">
                  <HeartPulse className="h-3.5 w-3.5" />
                  Napi Jóllét Napló &amp; Okos Ellenőrzőlisták
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">Alvás (ó)</span><input type="number" step="0.5" value={wellSleep} onChange={(e) => setWellSleep(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">Víz (ml)</span><input type="number" step="100" value={wellWater} onChange={(e) => setWellWater(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">Energia (1-10)</span><input type="number" min="1" max="10" value={wellEnergy} onChange={(e) => setWellEnergy(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">Mozgás (p)</span><input type="number" value={wellMove} onChange={(e) => setWellMove(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={async () => {
                        await postJson('/api/v8/life/wellness', {
                          sleepHours: wellSleep,
                          waterMl: wellWater,
                          energyScore: wellEnergy,
                          movementMinutes: wellMove,
                        });
                        setStatusMsg('Napi jóllét check-in rögzítve.');
                        await onRefreshState();
                      }}
                      className="w-full px-2.5 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
                    >
                      Mentés
                    </button>
                  </div>
                </div>

                {/* Checklists */}
                <div className="space-y-1.5 max-h-44 overflow-y-auto pt-1 pb-1">
                  {(state?.smartChecklists || []).slice(0, 2).map((cl) => (
                    <div key={cl.id} className="space-y-1">
                      <div className="font-medium text-slate-700 dark:text-slate-300">{cl.title}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {cl.items.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={async () => {
                              await postJson(`/api/v8/life/checklists/${cl.id}/items/${it.id}/toggle`);
                              await onRefreshState();
                            }}
                            className={`px-2 py-0.5 text-[11px] rounded border ${
                              it.checked
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 line-through'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {it.checked ? '[x] ' : '[ ] '}{it.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Communication Draft Studio */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-semibold">Kommunikációs Levélvázlat Stúdió</div>
                <div className="flex flex-wrap gap-2">
                  <input type="text" value={draftPurpose} onChange={(e) => setDraftPurpose(e.target.value)} className="flex-1 min-w-[140px] px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <select value={draftTone} onChange={(e) => setDraftTone(e.target.value as CommunicationDraft['tone'])} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                    <option value="formal">Hivatalos</option>
                    <option value="direct">Közvetlen</option>
                    <option value="empathetic">Empatikus</option>
                    <option value="assertive">Határozott</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/life/drafts', { purpose: draftPurpose, tone: draftTone, keyPoints: draftPoints });
                      setStatusMsg('Levélvázlat elkészült.');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Vázlat Készítése
                  </button>
                </div>
                {(state?.communicationDrafts || []).slice(0, 1).map((dr) => (
                  <pre key={dr.id} className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] whitespace-pre-wrap font-sans">
                    {dr.subject}{'\n'}{dr.body}
                  </pre>
                ))}
              </div>

              {execReportMd && (
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono max-h-40 overflow-auto whitespace-pre-wrap">
                  {execReportMd}
                </pre>
              )}
            </div>
          </div>

          {/* Searchable 200+ Capability Catalog (Ú361–Ú560) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Teljes 200+ Képesség Katalógus (Ú361–Ú560)
                </h3>
                <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                  Összes regisztrált képesség: {catalogData?.totalCount ?? 200} · Találatok: {catalogData?.items.length ?? 0}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="search"
                    value={capQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCapQuery(v);
                      void loadCatalog(v, capCategory);
                    }}
                    placeholder="Keresés a 200+ funkció között..."
                    aria-label="Keresés a 200+ képesség között"
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent w-60"
                  />
                </div>
                <select
                  value={capCategory}
                  onChange={(e) => {
                    const c = e.target.value;
                    setCapCategory(c);
                    void loadCatalog(capQuery, c);
                  }}
                  aria-label="Képesség kategória szűrő"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                >
                  <option value="">Minden kategória</option>
                  {(catalogData?.categories || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {!catalogData ? (
              <p className="text-xs text-slate-500 font-mono">Katalógus betöltése...</p>
            ) : catalogData.items.length === 0 ? (
              <p className="text-xs text-slate-500">Nincs a keresésnek megfelelő képesség.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Kód</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Kategória</th>
                      <th className="px-3 py-2 font-medium">Funkció</th>
                      <th className="px-3 py-2 font-medium">Leírás</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Végpont / Eszköz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {catalogData.items.map((item) => (
                      <tr key={item.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{item.code}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{item.category}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{item.title}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.summary}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{item.endpointOrTool}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
