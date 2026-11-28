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
import { InfoHint } from './InfoHint';
import { useLocale } from '../locales/translations';
import type { PhraseKey } from '../locales/phraseKeys';
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
  const { tx } = useLocale();
  const [tab, setTab] = useState<B8TabId>('persona_style');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab 1: Persona, Context, Style, Fact Vault, Tone/Prose, Framework
  const [newPersonaName, setNewPersonaName] = useState('');
  const [newPersonaRole, setNewPersonaRole] = useState('');
  const [newPersonaTone, setNewPersonaTone] = useState(() => tx('tárgyilagos, precíz'));
  const [newPersonaGuidance, setNewPersonaGuidance] = useState('');
  const [styleLabel, setStyleLabel] = useState(() => tx('Saját Minta'));
  const [styleSampleText, setStyleSampleText] = useState(
    () => tx('Kérlek vizsgáljuk meg a rendszer terhelését és a memória-használatot. Ha szükséges, állítsuk át a kontextust tömörebb módba a gyorsabb válaszidő érdekében.')
  );
  const [factCategory, setFactCategory] = useState(() => tx('Projekt'));
  const [factKey, setFactKey] = useState('');
  const [factValue, setFactValue] = useState('');
  const [factQuery, setFactQuery] = useState('');
  const [toneText, setToneText] = useState(
    () => tx('Szia! Köszi a segítséget, légyszi nézz rá a szerver naplókra mert talán lassult a válaszidő.')
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
  const [frameworkTopic, setFrameworkTopic] = useState(() => tx('SQLite WAL vs PostgreSQL választás Raspberry Pi csomóponton'));
  const [frameworkOut, setFrameworkOut] = useState<string | null>(null);

  // Tab 2: Cognitive Planner: Goal Tree, Handoff, Decision Matrix, Scenario, Red Team, PERT/RICE
  const [goalTitle, setGoalTitle] = useState('');
  const [goalHorizon, setGoalHorizon] = useState<HierarchicalGoalNode['horizon']>('quarterly');
  const [goalMilestones, setGoalMilestones] = useState(() => tx('Követelmények tisztázása\nPrototípus elkészítése\nÉles ellenőrzés'));
  const [handoffTitle, setHandoffTitle] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [matrixTitle, setMatrixTitle] = useState(() => tx('Szerver üzemeltetési opció'));
  const [matrixCriteriaRaw, setMatrixCriteriaRaw] = useState(() => tx('Megbízhatóság:5, Költség:3, Karbantartás:4'));
  const [matrixOptARaw, setMatrixOptARaw] = useState(() => tx('Helyi ARM64 Pi|9,9,7'));
  const [matrixOptBRaw, setMatrixOptBRaw] = useState(() => tx('Felhő VPS|8,5,9'));
  const [scenarioTopic, setScenarioTopic] = useState(() => tx('Önálló AI Gateway bevezetése irodai hálózaton'));
  const [redTeamProposal, setRedTeamProposal] = useState(() => tx('Azonnali élesítés minden külső szolgáltatásnál párhuzamosan.'));
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
  const [meetingTitle, setMeetingTitle] = useState(() => tx('Heti Architektúra Egyeztetés'));
  const [meetingRaw, setMeetingRaw] = useState(
    () => tx('- [ ] Docker memóriakorlát beállítása @Gábor holnap\n- [ ] SQLite backup ellenőrzése @Anna péntek\nMikor történik a külső kulcs rotáció?')
  );
  const [meetingImportInfo, setMeetingImportInfo] = useState<string | null>(null);
  const [digestTitle, setDigestTitle] = useState(() => tx('Rendszer Összefoglaló'));
  const [digestRaw, setDigestRaw] = useState(
    () => tx('A helyi elsődleges futtatás csökkenti a késleltést és megóvja a bizalmas adatokat. A hibrid router automatikusan vált tartalék szolgáltatóra hiba esetén. A rendszeres pillanatkép garantálja a gyors helyreállítást.')
  );
  const [studyTopic, setStudyTopic] = useState(() => tx('Docker cgroups és Linux memória menedzsment'));
  const [studyLevel, setStudyLevel] = useState<StudyPlanItem['level']>('intermediate');
  const [glTerm, setGlTerm] = useState('');
  const [glDomain, setGlDomain] = useState(() => tx('Infrastruktúra'));
  const [glDef, setGlDef] = useState('');
  const [conceptGraph, setConceptGraph] = useState<{ mermaid: string; nodeCount: number; edgeCount: number } | null>(null);
  const [snipTitle, setSnipTitle] = useState('');
  const [snipLang, setSnipLang] = useState('bash');
  const [snipCode, setSnipCode] = useState('');
  const [snipVarsRaw] = useState('service=novaswarm');
  const [snipRendered, setSnipRendered] = useState<string | null>(null);
  const [bpName, setBpName] = useState(() => tx('Otthoni Hibrid Szerver'));
  const [bpPattern, setBpPattern] = useState<ArchitectureBlueprint['pattern']>('iot_edge');
  const [sqlInput, setSqlInput] = useState('SELECT * FROM users WHERE active = 1;');
  const [sqlOut, setSqlOut] = useState<{ riskLevel: string; findings: string[]; recommendations: string[] } | null>(null);
  const [infraInput, setInfraInput] = useState('services:\n  app:\n    image: node:latest\n    privileged: true');
  const [infraOut, setInfraOut] = useState<{ issueCount: number; issues: Array<{ severity: string; message: string }> } | null>(null);
  const [convMode, setConvMode] = useState<'json_to_ts' | 'csv_to_markdown' | 'jwt_decode' | 'env_mask'>('json_to_ts');
  const [convPayload, setConvPayload] = useState('{"host": "192.168.1.10", "port": 3000, "active": true}');
  const [convOut, setConvOut] = useState<string | null>(null);
  const [piiText, setPiiText] = useState(
    () => tx('Ügyfél: teszt.user@example.com, telefon: +36 30 123 4567, IP: 192.168.1.44, kulcs: sk-testtoken1234567890abcdef')
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
  const [finMonthly] = useState(50000);
  const [finVat, setFinVat] = useState(27);
  const [finOut, setFinOut] = useState<{ summary: string; finalAmount: number; totalInterestOrTax: number } | null>(null);
  const [unitVal, setUnitVal] = useState(100);
  const [unitFrom, setUnitFrom] = useState('mbps');
  const [unitTo, setUnitTo] = useState('mb/s');
  const [unitOut, setUnitOut] = useState<{ formatted: string; worldClocks: Array<{ city: string; time: string }> } | null>(null);
  const [tbStart, setTbStart] = useState('09:00');
  const [tbEnd, setTbEnd] = useState('11:00');
  const [tbTitle, setTbTitle] = useState(() => tx('Mély fókusz fejlesztés'));
  const [tbKind, setTbKind] = useState<TimeBlockSlot['kind']>('deep_work');
  const [tbConflictMsg, setTbConflictMsg] = useState<string | null>(null);
  const [wellSleep, setWellSleep] = useState(7.5);
  const [wellWater, setWellWater] = useState(2200);
  const [wellEnergy, setWellEnergy] = useState(8);
  const [wellMove, setWellMove] = useState(40);
  const [draftPurpose, setDraftPurpose] = useState(() => tx('Ütemterv jóváhagyás kérése'));
  const [draftTone, setDraftTone] = useState<CommunicationDraft['tone']>('formal');
  const [draftPoints] = useState(() => tx('Első mérföldkő kész; tesztek sikeresek; pénteki élesítés javasolt.'));
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
              <span>{tx('Személyre Szabott Asszisztens & Képesség Stúdió')}</span>
              <InfoHint
                label={tx('Képesség Stúdió')}
                text={tx('Itt állíthatod be az AI stílusát (Persona), összerakhatsz tanulási és időbeosztási terveket, vagy átnézheted az összes elérhető képességet.')}
              />
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>{tx('Aktív Persona: {0}', personas.find((p) => p.id === state?.settings.activePersonaId)?.name || tx('Alapértelmezett'))}</span>
              <span aria-hidden="true">·</span>
              <span>{tx('Kontextus: {0}', contexts.find((c) => c.id === state?.settings.activeUserContextId)?.name || tx('Munka'))}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{tx('Ténybank: {0} tétel', (state?.factVault || []).length)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{tx('Célfák: {0}', (state?.goalTrees || []).length)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                {
                  id: 'persona_style',
                  label: 'Stílus & Személyiség',
                  hint: 'Beállíthatod, milyen hangnemben beszéljen az asszisztens, és milyen munka/otthoni helyzetben segítsen.',
                },
                {
                  id: 'cognitive',
                  label: 'Tervező & Döntéstámogató',
                  hint: 'Nagyobb célok lebontása lépésekre és pro/kontra döntési táblázatok készítése.',
                },
                {
                  id: 'studio_dev',
                  label: 'Megbeszélés, Tanulás & Kód',
                  hint: 'Megbeszélések összefoglalása, tanulási kártyák és fejlesztői ellenőrző eszközök.',
                },
                {
                  id: 'analytics_catalog',
                  label: 'Statisztika & Képességlista',
                  hint: 'Részletes használati adatok és a teljes kereshető funkció-katalógus.',
                },
              ] as Array<{ id: B8TabId; label: PhraseKey; hint: PhraseKey }>
            ).map((item) => (
              <div key={item.id} className="inline-flex items-center gap-0.5 pe-1">
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    tab === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tx(item.label)}
                </button>
                <InfoHint label={tx(item.label)} text={tx(item.hint)} />
              </div>
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
              {tx('Bezár')}
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
                  {tx('Szakértő Persona Könyvtár ({0})', personas.length)}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">{tx('Azonnali rendszerprompt váltás')}</span>
              </div>

              {personas.length === 0 ? (
                <p className="text-xs text-slate-500">{tx('Nincsenek betöltött personák.')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pe-1 pb-1">
                  {personas.map((p) => {
                    const active = state?.settings.activePersonaId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={async () => {
                          await postJson('/api/v8/persona/activate', { personaIdOrName: p.id });
                          setStatusMsg(tx('Aktív persona váltva: {0}', p.name));
                          await onRefreshState();
                        }}
                        className={`text-start p-3 rounded-lg border transition-colors ${
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
                    systemGuidance: newPersonaGuidance || tx('Segíts a felhasználónak mint {0}.', newPersonaRole),
                    strengths: [newPersonaRole],
                  });
                  setNewPersonaName('');
                  setNewPersonaRole('');
                  setNewPersonaGuidance('');
                  setStatusMsg(tx('Egyedi persona létrehozva.'));
                  await onRefreshState();
                }}
                className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2"
              >
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{tx('Új egyedi persona felvétele')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newPersonaName}
                    onChange={(e) => setNewPersonaName(e.target.value)}
                    placeholder={tx('Persona neve (pl. DevSecOps)')}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <input
                    type="text"
                    value={newPersonaRole}
                    onChange={(e) => setNewPersonaRole(e.target.value)}
                    placeholder={tx('Szerepkör')}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <input
                    type="text"
                    value={newPersonaTone}
                    onChange={(e) => setNewPersonaTone(e.target.value)}
                    placeholder={tx('Hangnem')}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPersonaGuidance}
                    onChange={(e) => setNewPersonaGuidance(e.target.value)}
                    placeholder={tx('Rendszerutasítás / elvárt működés...')}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Persona Mentése')}
                  </button>
                </div>
              </form>
            </div>

            {/* Context Profiles & Writing Style Fingerprint */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  {tx('Élethelyzet & Kontextus Profilok ({0})', contexts.length)}
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
                          setStatusMsg(tx('Kontextus profil aktív: {0}', ctx.name));
                          await onRefreshState();
                        }}
                        className={`w-full text-start p-2.5 rounded-lg border transition-colors ${
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
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tx('Írásstílus Ujjlenyomat Elemző')}</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={styleLabel}
                    onChange={(e) => setStyleLabel(e.target.value)}
                    placeholder={tx('Minta neve')}
                    className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/style/analyze', { label: styleLabel, sampleText: styleSampleText });
                      setStatusMsg(tx('Írásstílus minta elemezve és elmentve.'));
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Stílus Elemzése')}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={styleSampleText}
                  onChange={(e) => setStyleSampleText(e.target.value)}
                  aria-label={tx('Írásstílus minta szövege')}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                {(state?.writingStyleSamples || []).slice(0, 2).map((s) => (
                  <div key={s.id} className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 flex flex-wrap gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{s.label}</span>
                    <span>·</span>
                    <span>{s.avgSentenceWords} {tx('szó/mondat')}</span>
                    <span>·</span>
                    <span>{tx('Diverzitás:')} {s.lexicalDiversity}%</span>
                    <span>·</span>
                    <span>{tx('Formalitás:')} {s.formalityScore}%</span>
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
                  {tx('Személyes Ténybank (Fact Vault · {0})', (state?.factVault || []).length)}
                </h3>
                <input
                  type="search"
                  value={factQuery}
                  onChange={(e) => setFactQuery(e.target.value)}
                  placeholder={tx('Keresés a tényekben...')}
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
                  setStatusMsg(tx('Hiteles tény elmentve a Ténybankba.'));
                  await onRefreshState();
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <input
                  type="text"
                  value={factCategory}
                  onChange={(e) => setFactCategory(e.target.value)}
                  placeholder={tx('Kategória')}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <input
                  type="text"
                  value={factKey}
                  onChange={(e) => setFactKey(e.target.value)}
                  placeholder={tx('Kulcs (pl. SzerverIP)')}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={factValue}
                    onChange={(e) => setFactValue(e.target.value)}
                    placeholder={tx('Érték')}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <button
                    type="submit"
                    aria-label={tx('Tény hozzáadása')}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Mentés')}
                  </button>
                </div>
              </form>

              {facts.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  {tx('Még nincs rögzített tény vagy nincs találat. A mentett adatok automatikusan beépülnek az ágens kontextusába.')}
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
                        aria-label={tx('Tény törlése: {0}', f.factKey)}
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
                {tx('Hangnem-Átalakító, Próza-Minőség & Strukturált Keretrendszerek')}
              </h3>

              <textarea
                rows={3}
                value={toneText}
                onChange={(e) => setToneText(e.target.value)}
                aria-label={tx('Átalakítandó szöveg')}
                className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={targetTone}
                  onChange={(e) => setTargetTone(e.target.value as typeof targetTone)}
                  aria-label={tx('Cél hangnem')}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                >
                  <option value="formal">{tx('Hivatalos')}</option>
                  <option value="casual">{tx('Közvetlen')}</option>
                  <option value="assertive">{tx('Határozott')}</option>
                  <option value="empathetic">{tx('Empatikus')}</option>
                  <option value="bullet_executive">{tx('Vezetői (BLUF)')}</option>
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
                  {tx('Hangnem Átalakítása')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await postJson<NonNullable<typeof proseResult>>('/api/v8/prose/analyze', { text: toneText });
                    setProseResult(out);
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {tx('Olvashatóság Elemzése')}
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
                    {tx('Szavak: {0} · Mondatok: {1} · Olvashatóság: {2}/100 · Beszédidő: {3} mp', proseResult.wordCount, proseResult.sentenceCount, proseResult.readabilityScore, proseResult.estimatedSpeakSeconds)}
                  </div>
                  <div className="font-sans text-slate-500">{proseResult.suggestions.join(' · ')}</div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {tx('Strukturált Gondolkodási Sablonok (ADR, RFC, SWOT, 5 Miért, STAR, Eisenhower, BLUF)')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={frameworkKind}
                    onChange={(e) => setFrameworkKind(e.target.value as typeof frameworkKind)}
                    aria-label={tx('Keretrendszer típusa')}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="adr">{tx('ADR (Architektúra Döntés)')}</option>
                    <option value="rfc">{tx('RFC Javaslat')}</option>
                    <option value="swot">{tx('SWOT Mátrix')}</option>
                    <option value="5whys">{tx('5 Miért Gyökérok')}</option>
                    <option value="star">{tx('STAR Beszámoló')}</option>
                    <option value="postmortem">Post-Mortem</option>
                    <option value="eisenhower">{tx('Eisenhower Prioritás')}</option>
                    <option value="bluf">{tx('BLUF Vezetői')}</option>
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
                    {tx('Sablon Készítése')}
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
                {tx('Többszintű Célfa & Mérföldkövek ({0})', (state?.goalTrees || []).length)}
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
                  setStatusMsg(tx('Új célfa létrehozva.'));
                  await onRefreshState();
                }}
                className="space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder={tx('Cél megnevezése (pl. Homelab teljesség)')}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <select
                    value={goalHorizon}
                    onChange={(e) => setGoalHorizon(e.target.value as HierarchicalGoalNode['horizon'])}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="weekly">{tx('Heti')}</option>
                    <option value="monthly">{tx('Havi')}</option>
                    <option value="quarterly">{tx('Negyedéves')}</option>
                    <option value="yearly">{tx('Éves')}</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Cél Hozzáadása')}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={goalMilestones}
                  onChange={(e) => setGoalMilestones(e.target.value)}
                  placeholder={tx('Mérföldkövek soronként...')}
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
                {tx('Ágens-to-Ágens Átadási Lánc (Planner → Builder → Reviewer → Verifier)')}
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!handoffTitle.trim()) return;
                  await postJson('/api/v8/handoffs', { title: handoffTitle, initialNote: handoffNote });
                  setHandoffTitle('');
                  setHandoffNote('');
                  setStatusMsg(tx('Átadási lánc elindítva.'));
                  await onRefreshState();
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  type="text"
                  value={handoffTitle}
                  onChange={(e) => setHandoffTitle(e.target.value)}
                  placeholder={tx('Feladat címe...')}
                  className="flex-1 min-w-[150px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <input
                  type="text"
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder={tx('Kezdő tervezési megjegyzés')}
                  className="flex-1 min-w-[150px] px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                >
                  {tx('Indítás')}
                </button>
              </form>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {(state?.agentHandoffs || []).map((h) => (
                  <div key={h.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{h.title}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {tx('Aktuális fázis: {0} · {1} bejegyzés', h.stage.toUpperCase(), h.notes.length)}
                      </div>
                    </div>
                    {h.stage !== 'completed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await postJson(`/api/v8/handoffs/${h.id}/advance`, { summary: tx('Fázis jóváhagyva') });
                          await onRefreshState();
                        }}
                        className="px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        {tx('Következő Fázis')}
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
                {tx('Súlyozott Döntési Mátrix Kiértékelő')}
              </h3>
              <div className="space-y-2 text-xs">
                <input
                  type="text"
                  value={matrixTitle}
                  onChange={(e) => setMatrixTitle(e.target.value)}
                  placeholder={tx('Döntés tárgya')}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <input
                  type="text"
                  value={matrixCriteriaRaw}
                  onChange={(e) => setMatrixCriteriaRaw(e.target.value)}
                  placeholder={tx('Szempont:súly vesszővel')}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={matrixOptARaw}
                    onChange={(e) => setMatrixOptARaw(e.target.value)}
                    placeholder={tx('Opció A|9,8,7')}
                    className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                  <input
                    type="text"
                    value={matrixOptBRaw}
                    onChange={(e) => setMatrixOptBRaw(e.target.value)}
                    placeholder={tx('Opció B|7,6,9')}
                    className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const criteria = matrixCriteriaRaw.split(',').map((part) => {
                      const [name, w] = part.split(':').map((s) => s.trim());
                      return { name: name || tx('Szempont'), weight: Number(w) || 1 };
                    });
                    const parseOpt = (raw: string) => {
                      const [name, sc] = raw.split('|');
                      const scores = (sc || '').split(',').map((n) => Number(n.trim()) || 5);
                      return { name: (name || tx('Opció')).trim(), scores };
                    };
                    await postJson('/api/v8/cognitive/decision-matrix', {
                      title: matrixTitle,
                      criteria,
                      options: [parseOpt(matrixOptARaw), parseOpt(matrixOptBRaw)],
                    });
                    setStatusMsg(tx('Döntési mátrix kiértékelve.'));
                    await onRefreshState();
                  }}
                  className="px-3.5 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                >
                  {tx('Mátrix Kiértékelése')}
                </button>
              </div>

              {(state?.decisionMatrixRuns || []).slice(0, 3).map((dm) => (
                <div key={dm.id} className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{dm.title}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">{tx('Győztes: {0}', dm.winnerName)}</span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-500">{tx('+{0}% előny', dm.marginPercent)}</span>
                </div>
              ))}
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  {tx('3-Ágú Szcenárió Szimulátor & Red-Team Kritika')}
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
                      setStatusMsg(tx('3-ágú szcenárió szimuláció elkészült.'));
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {tx('3-Ágú Szimuláció')}
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
                      setStatusMsg(tx('Red-Team vakfolt elemzés kész.'));
                      await onRefreshState();
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Red-Team Elemzés')}
                  </button>
                </div>
                {(state?.redTeamCritiques || []).slice(0, 1).map((rt) => (
                  <div key={rt.id} className="p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs space-y-1">
                    <div className="font-semibold text-amber-900 dark:text-amber-200 tabular-nums">
                      {tx('Kockázati szint: {0}/100 · {1}', rt.riskScore, rt.proposal)}
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">{tx('Vakfoltok:')} {rt.blindSpots.join(' | ')}</div>
                  </div>
                ))}
                {(state?.scenarioSimulations || []).slice(0, 1).map((sc) => (
                  <div key={sc.id} className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{sc.topic}:</span> {tx('Reális')} ({sc.realistic.probabilityPct}%): {sc.realistic.summary}
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tx('PERT 3-Pontos & RICE Projektbecslés')}</div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">{tx('Opt (ó)')}</span>
                    <input type="number" value={pertO} onChange={(e) => setPertO(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">{tx('Valósz. (ó)')}</span>
                    <input type="number" value={pertM} onChange={(e) => setPertM(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">{tx('Pessz. (ó)')}</span>
                    <input type="number" value={pertP} onChange={(e) => setPertP(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">{tx('Elérés')}</span>
                    <input type="number" value={pertReach} onChange={(e) => setPertReach(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">{tx('Hatás')}</span>
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
                      {tx('Számol')}
                    </button>
                  </div>
                </div>
                {pertRes && (
                  <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {tx('Várható idő: {0} ó · 95% felső korlát: {1} ó · RICE pontszám: {2}', pertRes.pertExpectedHours, pertRes.safeUpperBound95Hours, pertRes.riceScore)}
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
                {tx('Megbeszélés Feldolgozó & 1-Kattintásos Kanban Import')}
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
                    setStatusMsg(tx('Megbeszélés jegyzet feldolgozva.'));
                    await onRefreshState();
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                >
                  {tx('Teendők Kinyerése')}
                </button>
              </div>
              <textarea
                rows={3}
                value={meetingRaw}
                onChange={(e) => setMeetingRaw(e.target.value)}
                aria-label={tx('Megbeszélés nyers jegyzet')}
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
                      setMeetingImportInfo(tx('{0} teendő átküldve a Kanban táblára.', out.createdCount));
                      await onRefreshState();
                    }}
                    className="px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {tx('Kanbanba Exportálás')}
                  </button>
                </div>
              ))}

              {/* 3-Level Reading Digest */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tx('3-Szintű Olvasmány Kivonatoló')}</div>
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
                      setStatusMsg(tx('Kivonat elkészült.'));
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {tx('Kivonat Készítése')}
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
                    <span className="font-semibold">{d.title}:</span> {d.tldrOneLine} ({tx('{0} szó', d.wordCount)})
                  </div>
                ))}
              </div>
            </div>

            {/* Study Plan + Glossary + Concept Graph */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  {tx('Interaktív Tanulási Terv & Feynman Kérdések')}
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
                    <option value="beginner">{tx('Kezdő')}</option>
                    <option value="intermediate">{tx('Középhaladó')}</option>
                    <option value="advanced">{tx('Haladó')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/studio/study', { topic: studyTopic, level: studyLevel });
                      await onRefreshState();
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Terv Generálása')}
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
                        className="w-full text-start p-2 rounded border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
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
                  <div className="text-xs font-semibold">{tx('Szakterületi Fogalomtár ({0}) & Tudásgráf', (state?.glossaryTerms || []).length)}</div>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v8/studio/concept-graph');
                      if (r.ok) setConceptGraph(await r.json());
                    }}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    {tx('Mermaid Gráf Mutatása')}
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
                  <input type="text" value={glTerm} onChange={(e) => setGlTerm(e.target.value)} placeholder={tx('Fogalom')} className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={glDomain} onChange={(e) => setGlDomain(e.target.value)} placeholder={tx('Terület')} className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <div className="flex gap-1.5">
                    <input type="text" value={glDef} onChange={(e) => setGlDef(e.target.value)} placeholder={tx('Definíció')} className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                    <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0">{tx('Hozzáad')}</button>
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
                {tx('SQL Biztonsági Auditor, Infra Linter & PII Anonimizáló')}
              </h3>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sqlInput}
                    onChange={(e) => setSqlInput(e.target.value)}
                    aria-label={tx('Vizsgálandó SQL lekérdezés')}
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
                    <span className="font-semibold">{tx('Kockázat:')} {sqlOut.riskLevel.toUpperCase()}</span> — {sqlOut.findings.join(' ')}
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
                    {tx('Manifest Ellenőrzése')}
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
                    {tx('Adatvédelmi PII & API Kulcs Anonimizáló')}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await postJson<NonNullable<typeof piiOut>>('/api/v8/privacy/sanitize', { text: piiText });
                      setPiiOut(out);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                  >
                    {tx('Anonimizálás')}
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
                    {piiOut.sanitized} ({tx('{0} maszkolás', piiOut.redactionsCount)})
                  </div>
                )}
              </div>
            </div>

            {/* Architecture Blueprint + Incident Playbooks + Converters + Snippets */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Network className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  {tx('Architektúra Tervrajz, Incidens Playbook & Fejlesztői Konverterek')}
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
                    <option value="iot_edge">{tx('IoT & Raspberry Pi Edge')}</option>
                    <option value="monolith_sqlite">Monolith + SQLite WAL</option>
                    <option value="microservices">{tx('Mikroszolgáltatások')}</option>
                    <option value="rag_pipeline">{tx('RAG Tudásgráf Pipeline')}</option>
                    <option value="event_driven">{tx('Eseményvezérelt Busz')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/dev/blueprint', { name: bpName, pattern: bpPattern });
                      setStatusMsg(tx('Architektúra tervrajz elkészült.'));
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {tx('Tervrajz Készítése')}
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
                  <span className="text-xs font-medium">{tx('Konverter:')}</span>
                  <select
                    value={convMode}
                    onChange={(e) => setConvMode(e.target.value as typeof convMode)}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="json_to_ts">{tx('JSON → TypeScript interfész')}</option>
                    <option value="csv_to_markdown">{tx('CSV → Markdown táblázat')}</option>
                    <option value="jwt_decode">{tx('JWT Token Dekóder')}</option>
                    <option value="env_mask">{tx('.env → .env.example Maszk')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await postJson<{ output: string }>('/api/v8/dev/convert', { mode: convMode, payload: convPayload });
                      setConvOut(res.output);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap"
                  >
                    {tx('Átalakítás')}
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
                <div className="text-xs font-semibold">{tx('Interaktív Incidens Playbookok ({0})', (state?.incidentPlaybooks || []).length)}</div>
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
                  <div className="text-xs font-semibold">{tx('Paraméterezett Kódrészlet Tár ({0})', (state?.codeSnippets || []).length)}</div>
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
                    <input type="text" value={snipTitle} onChange={(e) => setSnipTitle(e.target.value)} placeholder={tx('Új kódrészlet címe')} className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                    <input type="text" value={snipLang} onChange={(e) => setSnipLang(e.target.value)} placeholder={tx('Nyelv')} className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
                    <div className="flex gap-1">
                      <input type="text" value={snipCode} onChange={(e) => setSnipCode(e.target.value)} placeholder={tx('Kód ({{var}})')} className="flex-1 min-w-0 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
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
                {tx('Statisztikai Számsor Elemző, Pénzügyi & Mértékegység Motor')}
              </h3>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={statsInput}
                    onChange={(e) => setStatsInput(e.target.value)}
                    aria-label={tx('Számsor adatok')}
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
                    {tx('Statisztika Elemzése')}
                  </button>
                </div>
                {statsOut && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono tabular-nums space-y-1">
                    <div>
                      {tx('n={0} · Átlag: {1} · Medián: {2} · Szórás: {3} · P95: {4} · Trend: {5}', statsOut.count, statsOut.mean, statsOut.median, statsOut.stdDev, statsOut.p95, statsOut.trendSlope)}
                    </div>
                    <div className="text-amber-700 dark:text-amber-300">
                      {tx('Anomáliák (Z ≥ 2.0):')} {statsOut.anomalies.length > 0 ? statsOut.anomalies.map((a) => `${a.value} (z=${a.zScore})`).join(', ') : tx('nincs')}
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Engineering */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-medium">{tx('Pénzügyi Kalkulátor (Kamatos kamat · Hitel törlesztő · Magyar ÁFA 27/18/5%)')}</div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <select
                    value={finMode}
                    onChange={(e) => setFinMode(e.target.value as typeof finMode)}
                    className="col-span-2 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                  >
                    <option value="vat_hu">{tx('Magyar ÁFA')}</option>
                    <option value="compound">{tx('Kamatos kamat')}</option>
                    <option value="loan">{tx('Hitel törlesztő')}</option>
                  </select>
                  <input type="number" value={finPrincipal} onChange={(e) => setFinPrincipal(Number(e.target.value))} placeholder={tx('Összeg')} className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="number" value={finMode === 'vat_hu' ? finVat : finRate} onChange={(e) => (finMode === 'vat_hu' ? setFinVat(Number(e.target.value)) : setFinRate(Number(e.target.value)))} placeholder="%" className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="number" value={finYears} onChange={(e) => setFinYears(Number(e.target.value))} placeholder={tx('Év')} className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
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
                    {tx('Számítás')}
                  </button>
                </div>
                {finOut && <div className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{finOut.summary}</div>}
              </div>

              {/* Unit & World Clock */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-medium">{tx('Mértékegység & 5-Zónás Világóra Átváltó')}</div>
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
                    {tx('Átváltás')}
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
                    {tx('Napi Idősáv Tervező (Ütközésfigyelővel)')}
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
                    {tx('Vezetői Riport')}
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
                        ? tx('Figyelem: {0} időütközés észlelve! Mai mély fókusz: {1} perc.', res.conflicts.length, res.deepWorkMinutesToday)
                        : tx('Idősáv rögzítve. Mai mély fókusz: {0} perc.', res.deepWorkMinutesToday)
                    );
                    await onRefreshState();
                  }}
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"
                >
                  <input type="text" value={tbStart} onChange={(e) => setTbStart(e.target.value)} className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={tbEnd} onChange={(e) => setTbEnd(e.target.value)} className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <input type="text" value={tbTitle} onChange={(e) => setTbTitle(e.target.value)} className="col-span-2 sm:col-span-1 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <select value={tbKind} onChange={(e) => setTbKind(e.target.value as TimeBlockSlot['kind'])} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                    <option value="deep_work">{tx('Mély fókusz')}</option>
                    <option value="meeting">{tx('Megbeszélés')}</option>
                    <option value="admin">Admin</option>
                    <option value="recovery">{tx('Pihenő')}</option>
                  </select>
                  <button type="submit" className="px-3 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap">{tx('Hozzáad')}</button>
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
                  {tx('Napi Jóllét Napló & Okos Ellenőrzőlisták')}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">{tx('Alvás (ó)')}</span><input type="number" step="0.5" value={wellSleep} onChange={(e) => setWellSleep(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">{tx('Víz (ml)')}</span><input type="number" step="100" value={wellWater} onChange={(e) => setWellWater(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">{tx('Energia (1-10)')}</span><input type="number" min="1" max="10" value={wellEnergy} onChange={(e) => setWellEnergy(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
                  <label className="space-y-0.5"><span className="text-[11px] text-slate-500">{tx('Mozgás (p)')}</span><input type="number" value={wellMove} onChange={(e) => setWellMove(Number(e.target.value))} className="w-full px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" /></label>
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
                        setStatusMsg(tx('Napi jóllét check-in rögzítve.'));
                        await onRefreshState();
                      }}
                      className="w-full px-2.5 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
                    >
                      {tx('Mentés')}
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
                <div className="font-semibold">{tx('Kommunikációs Levélvázlat Stúdió')}</div>
                <div className="flex flex-wrap gap-2">
                  <input type="text" value={draftPurpose} onChange={(e) => setDraftPurpose(e.target.value)} className="flex-1 min-w-[140px] px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent" />
                  <select value={draftTone} onChange={(e) => setDraftTone(e.target.value as CommunicationDraft['tone'])} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                    <option value="formal">{tx('Hivatalos')}</option>
                    <option value="direct">{tx('Közvetlen')}</option>
                    <option value="empathetic">{tx('Empatikus')}</option>
                    <option value="assertive">{tx('Határozott')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await postJson('/api/v8/life/drafts', { purpose: draftPurpose, tone: draftTone, keyPoints: draftPoints });
                      setStatusMsg(tx('Levélvázlat elkészült.'));
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    {tx('Vázlat Készítése')}
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
                  <span>{tx('Teljes Képesség Katalógus')}</span>
                  <InfoHint
                    label={tx('Képesség katalógus')}
                    text={tx('Kereshető lista arról, milyen beépített eszközöket és végpontokat tud kezelni az asszisztens.')}
                  />
                </h3>
                <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                  {tx('Összes regisztrált képesség: {0} · Találatok: {1}', catalogData?.totalCount ?? 200, catalogData?.items.length ?? 0)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute start-2.5 top-2" />
                  <input
                    type="search"
                    value={capQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCapQuery(v);
                      void loadCatalog(v, capCategory);
                    }}
                    placeholder={tx('Keresés a 200+ funkció között...')}
                    aria-label={tx('Keresés a 200+ képesség között')}
                    className="ps-8 pe-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent w-60"
                  />
                </div>
                <select
                  value={capCategory}
                  onChange={(e) => {
                    const c = e.target.value;
                    setCapCategory(c);
                    void loadCatalog(capQuery, c);
                  }}
                  aria-label={tx('Képesség kategória szűrő')}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                >
                  <option value="">{tx('Minden kategória')}</option>
                  {(catalogData?.categories || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {!catalogData ? (
              <p className="text-xs text-slate-500 font-mono">{tx('Katalógus betöltése...')}</p>
            ) : catalogData.items.length === 0 ? (
              <p className="text-xs text-slate-500">{tx('Nincs a keresésnek megfelelő képesség.')}</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">{tx('Kód')}</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">{tx('Kategória')}</th>
                      <th className="px-3 py-2 font-medium">{tx('Funkció')}</th>
                      <th className="px-3 py-2 font-medium">{tx('Leírás')}</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">{tx('Végpont / Eszköz')}</th>
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
