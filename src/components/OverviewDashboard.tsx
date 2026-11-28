import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  Bot,
  Calendar,
  CheckCircle2,
  CloudSun,
  Cpu,
  DollarSign,
  Eye,
  EyeOff,
  LayoutGrid,
  Moon,
  Newspaper,
  RefreshCw,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { DashboardWidgetConfig, HardwareMetrics, NovaSwarmState } from '../../shared/types';
import { useLocale, type PhraseKey } from '../locales/translations';
import { InfoHint } from './InfoHint';

interface Props {
  state: NovaSwarmState;
  hardware: HardwareMetrics | null;
  onNavigate: (tab: string) => void;
  onRefreshState: () => Promise<void>;
}

interface ProjectionData {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  projectedMonthlyUsd: number;
  monthlyAlertThresholdUsd: number;
  alertTriggered: boolean;
}

export const OverviewDashboard: React.FC<Props> = ({
  state,
  hardware,
  onNavigate,
  onRefreshState,
}) => {
  const { t, tx, intlLocale } = useLocale();
  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [weather, setWeather] = useState<{ location?: string; tempC?: number; description?: string; forecast?: Array<{ date: string; maxC: number; minC: number }> } | null>(null);
  const [hardening, setHardening] = useState<{ score: number; checksCount?: number } | null>(null);
  const [doctorMsg, setDoctorMsg] = useState<string | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [omniQuery, setOmniQuery] = useState('');
  const [omniHits, setOmniHits] = useState<Array<{ source: string; title: string; snippet: string }>>([]);
  const [omniBusy, setOmniBusy] = useState(false);
  const [omniRan, setOmniRan] = useState(false);
  const [widgetsBusy, setWidgetsBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/gateway/projection')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProjectionData | null) => {
        if (d) setProjection(d);
      })
      .catch(() => {});
  }, [state.settings.dailySpendUsd]);

  useEffect(() => {
    void fetch('/api/weather')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setWeather(d);
      })
      .catch(() => {});
    void fetch('/api/system/hardening')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.score === 'number') setHardening(d);
      })
      .catch(() => {});
  }, []);

  const handleRunDoctor = async () => {
    setDoctorBusy(true);
    try {
      const r = await fetch('/api/system/doctor', { method: 'POST' });
      const d = (await r.json()) as { repairedCount?: number; summary?: string };
      setDoctorMsg(d.summary || tx('Auto-Doctor kész ({0} javítás).', d.repairedCount ?? 0));
      await onRefreshState();
    } finally {
      setDoctorBusy(false);
    }
  };

  const widgets: DashboardWidgetConfig[] = state.settings.dashboardWidgets || [];
  const isVisible = (id: string) => {
    const found = widgets.find((w) => w.id === id);
    return found ? found.visible : true;
  };

  const toggleWidget = async (id: string) => {
    const next = widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardWidgets: next }),
    });
    await onRefreshState();
  };

  const loadBriefing = async () => {
    const res = await fetch('/api/rss/briefing');
    if (res.ok) {
      const data = (await res.json()) as { briefing: string };
      setBriefing(data.briefing);
    }
  };

  const toggleHabitToday = async (habitId: string) => {
    await fetch(`/api/habits/${habitId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await onRefreshState();
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const activeAgents = state.agents.filter((a) => !a.isSupervisor && a.active);
  const todoCards = state.kanban.filter((c) => !c.archived && c.status === 'todo');
  const inProgCards = state.kanban.filter((c) => !c.archived && c.status === 'in_progress');
  const doneCards = state.kanban.filter((c) => !c.archived && c.status === 'done');
  const pendingApprovals = state.approvals.filter((a) => a.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {tx('NovaSwarm Operátori Áttekintő')}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {tx('Csomópont:')} <span className="font-mono text-slate-700">{state.settings.instanceName}</span> {tx('· Aktív ágensek:')} {activeAgents.length} {tx('· Függő jóváhagyások:')} {pendingApprovals.length}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('workbench')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Rocket className="h-3.5 w-3.5" />
            {tx('Küldetés Indítása')}
          </button>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={doctorBusy}
              onClick={() => void handleRunDoctor()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Wrench className="h-3.5 w-3.5" />
              {doctorBusy ? tx('Javítás...') : tx('Rendszer Gyorsjavító')}
            </button>
            <InfoHint
              theme="light"
              align="right"
              label={tx('Rendszer Gyorsjavító')}
              description={tx('Átnézi a mentéseket, a fájlokat és a beállításokat, és egy kattintással kijavítja az alapvető hibákat.')}
            />
          </div>
          <button
            type="button"
            onClick={() => setConfiguring((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {configuring ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {tx('Kártyák ki/bekapcsolása')}
          </button>
        </div>
      </div>

      {doctorMsg && (
        <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">
          {doctorMsg}
        </div>
      )}

      {configuring && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-2">
          {widgets.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => void toggleWidget(w.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
                w.visible
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {w.title}: {w.visible ? tx('Látható') : tx('Inaktív')}
            </button>
          ))}
        </div>
      )}

      {/* Ú237 RPG XP Profile Strip + Ú259 Quick Global Omnisearch */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Award className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Lv.{state.userXp?.level ?? 1} · {state.userXp?.xp ?? 0} XP · {state.userXp?.streakDays ?? 0} {tx('napos széria')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {(state.userXp?.badges || []).slice(0, 3).map((b) => tx(b as PhraseKey)).join(' · ') || tx('Autopilot 24/7 Aktív')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('ecosystem')}
            className="text-[11px] font-medium px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {tx('Élet-OS & XP →')}
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!omniQuery.trim()) return;
            setOmniBusy(true);
            setOmniRan(true);
            try {
              const r = await fetch(`/api/v4/omnisearch?q=${encodeURIComponent(omniQuery.trim())}`);
              if (r.ok) {
                const d = (await r.json()) as { hits?: Array<{ source: string; title: string; snippet: string }> };
                setOmniHits(d.hits || []);
              }
            } finally {
              setOmniBusy(false);
            }
          }}
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-500 shrink-0" />
            <input
              type="text"
              value={omniQuery}
              onChange={(e) => setOmniQuery(e.target.value)}
              placeholder={tx('Mindent-kereső (memória, feladatok, okmányok, beszélgetések)...')}
              aria-label={tx('Mindent-kereső')}
              className="flex-1 min-w-0 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={omniBusy || !omniQuery.trim()}
              className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {omniBusy ? tx('Keresés...') : tx('Keresés')}
            </button>
            <InfoHint
              theme="light"
              align="right"
              label={tx('Mindent-kereső')}
              description={tx('Egyszerre keres végig a jegyzeteidben, az AI emlékeiben, a feladatokban, az okmányaidban és a korábbi beszélgetésekben.')}
            />
          </div>
          {omniRan && (
            <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
              {omniHits.length === 0 ? (
                <div className="text-slate-500">{tx('Nincs találat erre: “')}{omniQuery}”.</div>
              ) : (
                omniHits.slice(0, 6).map((h, i) => (
                  <div key={i} className="p-1.5 bg-slate-50 dark:bg-slate-800/70 rounded flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded me-1.5">
                        {h.source}
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{h.title}</span>
                      <span className="text-slate-500 dark:text-slate-400 ms-1.5 truncate">{h.snippet}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isVisible('hardware') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-slate-600" />
                {tx('Gép Állapota')}
                <InfoHint
                  theme="light"
                  label={tx('Gép Állapota')}
                  description={tx('Megmutatja, mennyire van leterhelve a processzor, mennyi memória fogyott, mennyi hely maradt a lemezen és hány fokos a gép.')}
                />
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                {tx('Részletek →')}
              </button>
            </div>
            {hardware ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">{tx('CPU Terhelés')}</div>
                  <div className="text-lg font-mono font-semibold tabular-nums">{hardware.cpuLoadPercent}%</div>
                </div>
                <div>
                  <div className="text-slate-500">{tx('RAM Memória')}</div>
                  <div className="text-lg font-mono font-semibold tabular-nums">
                    {hardware.ramUsedMb}/{hardware.ramTotalMb} MB
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{tx('Tárhely')}</div>
                  <div className="text-sm font-mono font-semibold tabular-nums">
                    {hardware.diskUsedGb}/{hardware.diskTotalGb} GB ({hardware.diskPercent}%)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{tx('Hőmérséklet')}</div>
                  <div className="text-sm font-mono font-semibold tabular-nums">
                    {hardware.temperatureCelsius !== null ? `${hardware.temperatureCelsius}°C` : 'N/A'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">{tx('Hardver metrika betöltése...')}</div>
            )}
          </div>
        )}

        {isVisible('budget') && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                {tx('AI Költségkeret')}
                <InfoHint
                  theme="light"
                  label={tx('AI Költségkeret')}
                  description={tx('Követi, mennyibe kerültek ma a fizetős AI hívások, és mennyire számíthatsz a hónap végén. A napi limit megvéd a túlköltekezéstől.')}
                />
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('models')}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-mono"
              >
                {tx('Router →')}
              </button>
            </div>
            <div className={`grid grid-cols-2 gap-3 text-xs ${state.settings.privacyMaskEnabled ? 'blur-sm select-none' : ''}`}>
              <div>
                <div className="text-slate-500">{tx('Mai költés / Limit')}</div>
                <div className="text-lg font-mono font-semibold tabular-nums">
                  ${state.settings.dailySpendUsd.toFixed(3)} / ${state.settings.dailyCostLimitUsd.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">{tx('Várható havi (30 nap)')}</div>
                <div
                  className={`text-lg font-mono font-semibold tabular-nums ${
                    projection?.alertTriggered ? 'text-red-700' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  ${(projection?.projectedMonthlyUsd ?? state.settings.dailySpendUsd * 30).toFixed(2)}
                </div>
              </div>
            </div>
            <div className={`text-xs text-slate-500 font-mono tabular-nums ${state.settings.privacyMaskEnabled ? 'blur-sm select-none' : ''}`}>
              {tx('Cache megtakarítás: $')}{state.gatewayAnalytics.savedUsd.toFixed(4)} {tx('· Guardrail blokk:')} {state.gatewayAnalytics.guardrailsBlocked}
            </div>
          </div>
        )}

        {isVisible('kanban') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Bot className="h-4 w-4 text-slate-600" />
                {tx('Feladatok Állapota')}
                <InfoHint
                  theme="light"
                  label={tx('Feladatok Állapota')}
                  description={tx('Megmutatja, hány feladat vár elvégzésre, mennyi van folyamatban, és hány készült már el.')}
                />
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('swarm')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                {tx('Tábla →')}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">{t('todo')}</div>
                <div className="text-lg font-mono font-semibold tabular-nums">{todoCards.length}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">{t('inProgress')}</div>
                <div className="text-lg font-mono font-semibold tabular-nums">{inProgCards.length}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">{t('done')}</div>
                <div className="text-lg font-mono font-semibold tabular-nums">{doneCards.length}</div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {tx('Memória:')} {state.memories.length} {tx('elem · Skill-ek:')} {state.skills.filter((s) => s.status === 'verified').length} {tx('aktív')}
            </div>
          </div>
        )}

        {isVisible('uptime') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-600" />
                {tx('Uptime & SSL Tanúsítványok')}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                {tx('Infra →')}
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {state.uptimeTargets.length === 0 && state.sslTargets.length === 0 ? (
                <p className="text-slate-500">{tx('Még nincs felvett uptime vagy SSL célpont.')}</p>
              ) : (
                <>
                  {state.uptimeTargets.slice(0, 3).map((u) => (
                    <div key={u.id} className="flex justify-between font-mono">
                      <span className="truncate text-slate-800">{u.name}</span>
                      <span className={u.status === 'up' ? 'text-emerald-700' : 'text-red-700'}>
                        {u.status.toUpperCase()} {u.lastLatencyMs ? `${u.lastLatencyMs}ms` : ''}
                      </span>
                    </div>
                  ))}
                  {state.sslTargets.slice(0, 3).map((s) => (
                    <div key={s.id} className="flex justify-between font-mono">
                      <span className="truncate text-slate-700">{s.host}:{s.port}</span>
                      <span className={(s.daysRemaining ?? 99) < 14 ? 'text-amber-700' : 'text-emerald-700'}>
                        SSL {s.daysRemaining ?? '?'} d
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {isVisible('briefing') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-slate-600" />
                {tx('Napi RSS & Feladat Briefing')}
              </h2>
              <button
                type="button"
                onClick={() => void loadBriefing()}
                className="text-xs font-medium text-slate-700 border border-slate-300 px-2 py-0.5 rounded hover:bg-slate-50"
              >
                {tx('Generálás')}
              </button>
            </div>
            {briefing ? (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                {briefing}
              </pre>
            ) : (
              <div className="text-xs text-slate-500 space-y-1">
                <div>{tx('RSS feedek:')} {state.rssFeeds.length} {tx('· Friss cikkek:')} {state.rssFeedItems.length}</div>
                {state.rssFeedItems.slice(0, 2).map((item) => (
                  <div key={item.id} className="truncate text-slate-700">
                    • {item.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isVisible('habits') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-600" />
                {tx('Szokások & Közelgő Események')}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('ecosystem')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                {tx('Hub →')}
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {state.habits.length === 0 ? (
                <p className="text-slate-500">{tx('Nincs még felvett napi szokás az Automatizálás & Hub fülön.')}</p>
              ) : (
                state.habits.slice(0, 4).map((h) => {
                  const doneToday = h.completedDates.includes(todayStr);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => void toggleHabitToday(h.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 border border-slate-200 rounded hover:bg-slate-50"
                    >
                      <span className={doneToday ? 'line-through text-slate-400' : 'text-slate-800'}>{h.name}</span>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                        <CheckCircle2 className={`h-3.5 w-3.5 ${doneToday ? 'text-emerald-700' : 'text-slate-300'}`} />
                        {h.completedDates.length}
                      </span>
                    </button>
                  );
                })
              )}
              {state.calendarEvents.slice(0, 2).map((ev) => (
                <div key={ev.id} className="text-[11px] font-mono text-slate-600 truncate pt-1">
                  <ShieldCheck className="h-3 w-3 inline me-1" />
                  {new Date(ev.startAt).toLocaleString(intlLocale)} · {ev.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ú59 Weather + M54 Hardening + M46 Morning Digest */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0" />
              {tx('Helyi Időjárás & Védelem')}
              <InfoHint
                theme="light"
                label={tx('Időjárás és Biztonsági Pontszám')}
                description={tx('Kiírja a beállított város időjárását, valamint egy 0-100-as biztonsági pontszámot, ami jelzi, mennyire van védve a rendszer.')}
              />
            </h2>
            {hardening && (
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 hover:underline tabular-nums whitespace-nowrap shrink-0"
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                {tx('Biztonság:')} {hardening.score}/100
              </button>
            )}
          </div>
          {weather ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-slate-900">{weather.location || state.settings.weatherLocation}</span>
                <span className="text-lg font-mono font-semibold tabular-nums">
                  {typeof weather.tempC === 'number' ? `${weather.tempC}°C` : '-'}
                </span>
              </div>
              {weather.description && <div className="text-slate-600">{weather.description}</div>}
              {weather.forecast && weather.forecast.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 pt-1 font-mono text-[11px] tabular-nums text-slate-600">
                  {weather.forecast.slice(0, 3).map((d) => (
                    <div key={d.date} className="p-1.5 bg-slate-50 border border-slate-200 rounded text-center">
                      <div>{d.date.slice(5)}</div>
                      <div className="font-semibold text-slate-900">{d.minC}..{d.maxC}°C</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {tx('Helyszín:')} {state.settings.weatherLocation || 'Budapest'} {tx('(offline vagy lekérésre vár).')}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Moon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              {tx('Legutóbbi Éjszakai Álom Digest')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('memory')}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-mono"
            >
              {tx('Álomnapló →')}
            </button>
          </div>
          {state.dreamJournal.length === 0 ? (
            <p className="text-xs text-slate-500">{tx('Még nem futott le éjszakai REM álmodási ciklus.')}</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              <div className="font-mono text-[11px] text-slate-500">
                {new Date(state.dreamJournal[state.dreamJournal.length - 1].timestamp).toLocaleString(intlLocale)}
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {state.dreamJournal[state.dreamJournal.length - 1].morningDigest ||
                  state.dreamJournal[state.dreamJournal.length - 1].narrative}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              {tx('Heti Összefoglaló & Éjszakai Munka')}
              <InfoHint
                theme="light"
                label={tx('Heti Időkapszula és Éjszakai Műszak')}
                description={tx('Összefoglalja az elmúlt hét legfontosabb eseményeit, vagy elindítja az éjszakai háttérfeldolgozást.')}
              />
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v3/time-capsule/generate', { method: 'POST' });
                await onRefreshState();
              }}
              className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium whitespace-nowrap shrink-0"
            >
              {tx('Időkapszula Készítése')}
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v3/nightshift/run', { method: 'POST' });
                await onRefreshState();
              }}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {tx('Éjszakai Munka Indítása')}
            </button>
          </div>
          {state.timeCapsules?.[0] ? (
            <pre className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {state.timeCapsules[0].summaryMarkdown}
            </pre>
          ) : (
            <p className="text-xs text-slate-500">{tx('Még nincs generált heti időkapszula.')}</p>
          )}
          {state.nightShiftRuns?.[0] && (
            <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
              {tx('Utolsó műszak:')} {state.nightShiftRuns[0].reportSummary}
            </div>
          )}
        </div>

        {/* Custom Dynamic Widgets */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0">
              <LayoutGrid className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0" />
              <span>{tx('Saját Állapotdobozok')}</span>
              <InfoHint
                theme="light"
                label={tx('Saját Állapotdobozok')}
                description={tx('Olyan egyedi kártyák, amelyeket te állítottál be a Rendszer fülön (például egy szerver vagy API állapotának gyors ellenőrzésére).')}
              />
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={widgetsBusy}
                onClick={async () => {
                  setWidgetsBusy(true);
                  try {
                    await fetch('/api/v4/widgets/custom/refresh', { method: 'POST' });
                    await onRefreshState();
                  } finally {
                    setWidgetsBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3 w-3" />
                {widgetsBusy ? tx('Frissítés...') : tx('Frissítés')}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-mono whitespace-nowrap shrink-0"
              >
                {tx('Szerkesztés →')}
              </button>
            </div>
          </div>
          {(state.customWidgets || []).length === 0 ? (
            <p className="text-xs text-slate-500">
              {tx('Még nincs saját dobozod. A Rendszer & Költöztetés fül Hardver & Fájlok részén hozhatsz létre újat.')}
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {(state.customWidgets || []).map((w) => (
                <div key={w.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-blue-600 shrink-0" />
                      {w.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate">{w.source}</div>
                  </div>
                  <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                    {w.lastValue || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
