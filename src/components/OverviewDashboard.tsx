import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Calendar,
  CheckCircle2,
  CloudSun,
  Cpu,
  DollarSign,
  Eye,
  EyeOff,
  Moon,
  Newspaper,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { DashboardWidgetConfig, HardwareMetrics, NovaSwarmState } from '../../shared/types';

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
  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [weather, setWeather] = useState<{ location?: string; tempC?: number; description?: string; forecast?: Array<{ date: string; maxC: number; minC: number }> } | null>(null);
  const [hardening, setHardening] = useState<{ score: number; checksCount?: number } | null>(null);
  const [doctorMsg, setDoctorMsg] = useState<string | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);

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
      setDoctorMsg(d.summary || `Auto-Doctor kész (${d.repairedCount ?? 0} javítás).`);
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
            NovaSwarm Operátori Áttekintő
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Csomópont: <span className="font-mono text-slate-700">{state.settings.instanceName}</span> · Aktív ágensek: {activeAgents.length} · Függő jóváhagyások: {pendingApprovals.length}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('workbench')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Rocket className="h-3.5 w-3.5" />
            Küldetés Indítása
          </button>
          <button
            type="button"
            disabled={doctorBusy}
            onClick={() => void handleRunDoctor()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Wrench className="h-3.5 w-3.5" />
            {doctorBusy ? 'Javítás...' : 'Swarm Auto-Doctor'}
          </button>
          <button
            type="button"
            onClick={() => setConfiguring((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {configuring ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Widgetek testreszabása
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
              {w.title}: {w.visible ? 'Látható' : 'Rejtett'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isVisible('hardware') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-slate-600" />
                Gazdagép Telemetria
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                Részletek →
              </button>
            </div>
            {hardware ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">CPU Terhelés</div>
                  <div className="text-lg font-mono font-semibold tabular-nums">{hardware.cpuLoadPercent}%</div>
                </div>
                <div>
                  <div className="text-slate-500">RAM Memória</div>
                  <div className="text-lg font-mono font-semibold tabular-nums">
                    {hardware.ramUsedMb}/{hardware.ramTotalMb} MB
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Tárhely</div>
                  <div className="text-sm font-mono font-semibold tabular-nums">
                    {hardware.diskUsedGb}/{hardware.diskTotalGb} GB ({hardware.diskPercent}%)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Hőmérséklet</div>
                  <div className="text-sm font-mono font-semibold tabular-nums">
                    {hardware.temperatureCelsius !== null ? `${hardware.temperatureCelsius}°C` : 'N/A'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Hardver metrika betöltése...</div>
            )}
          </div>
        )}

        {isVisible('budget') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-slate-600" />
                Költségkeret & Havi Projekció
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('models')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                Router →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Mai költés / Limit</div>
                <div className="text-lg font-mono font-semibold tabular-nums">
                  ${state.settings.dailySpendUsd.toFixed(3)} / ${state.settings.dailyCostLimitUsd.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Várható havi (30 nap)</div>
                <div
                  className={`text-lg font-mono font-semibold tabular-nums ${
                    projection?.alertTriggered ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  ${(projection?.projectedMonthlyUsd ?? state.settings.dailySpendUsd * 30).toFixed(2)}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Cache megtakarítás: ${state.gatewayAnalytics.savedUsd.toFixed(4)} · Guardrail blokk: {state.gatewayAnalytics.guardrailsBlocked}
            </div>
          </div>
        )}

        {isVisible('kanban') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Bot className="h-4 w-4 text-slate-600" />
                Raj & Kanban Állapot
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('swarm')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                Tábla →
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Teendő</div>
                <div className="text-lg font-mono font-semibold tabular-nums">{todoCards.length}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Folyamatban</div>
                <div className="text-lg font-mono font-semibold tabular-nums">{inProgCards.length}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Kész</div>
                <div className="text-lg font-mono font-semibold tabular-nums">{doneCards.length}</div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Memória: {state.memories.length} elem · Skill-ek: {state.skills.filter((s) => s.status === 'verified').length} aktív
            </div>
          </div>
        )}

        {isVisible('uptime') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-600" />
                Uptime & SSL Tanúsítványok
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                Infra →
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {state.uptimeTargets.length === 0 && state.sslTargets.length === 0 ? (
                <p className="text-slate-500">Még nincs felvett uptime vagy SSL célpont.</p>
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
                        SSL {s.daysRemaining ?? '?'} nap
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
                Napi RSS & Feladat Briefing
              </h2>
              <button
                type="button"
                onClick={() => void loadBriefing()}
                className="text-xs font-medium text-slate-700 border border-slate-300 px-2 py-0.5 rounded hover:bg-slate-50"
              >
                Generálás
              </button>
            </div>
            {briefing ? (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                {briefing}
              </pre>
            ) : (
              <div className="text-xs text-slate-500 space-y-1">
                <div>RSS feedek: {state.rssFeeds.length} · Friss cikkek: {state.rssFeedItems.length}</div>
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
                Szokások & Közelgő Események
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('ecosystem')}
                className="text-xs text-slate-500 hover:text-slate-900 font-mono"
              >
                Hub →
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {state.habits.length === 0 ? (
                <p className="text-slate-500">Nincs még felvett napi szokás az Automatizálás & Hub fülön.</p>
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
                  <ShieldCheck className="h-3 w-3 inline mr-1" />
                  {new Date(ev.startAt).toLocaleString()} · {ev.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ú59 Weather + M54 Hardening + M46 Morning Digest */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-slate-600" />
              Helyi Időjárás & Hardening
            </h2>
            {hardening && (
              <button
                type="button"
                onClick={() => onNavigate('system')}
                className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-slate-800 hover:underline tabular-nums"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Biztonság: {hardening.score}/100
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
              Helyszín: {state.settings.weatherLocation || 'Budapest'} (offline vagy lekérésre vár).
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Moon className="h-4 w-4 text-slate-600" />
              Legutóbbi Éjszakai Álom Digest
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('memory')}
              className="text-xs text-slate-500 hover:text-slate-900 font-mono"
            >
              Álomnapló →
            </button>
          </div>
          {state.dreamJournal.length === 0 ? (
            <p className="text-xs text-slate-500">Még nem futott le éjszakai REM álmodási ciklus.</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              <div className="font-mono text-[11px] text-slate-500">
                {new Date(state.dreamJournal[state.dreamJournal.length - 1].timestamp).toLocaleString()}
              </div>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                {state.dreamJournal[state.dreamJournal.length - 1].morningDigest ||
                  state.dreamJournal[state.dreamJournal.length - 1].narrative}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
