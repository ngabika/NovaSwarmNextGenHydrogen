import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Brain,
  Command,
  Cpu,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plug,
  Send,
  Settings as SettingsIcon,
  Shield,
  StickyNote,
  Sun,
  Terminal as TerminalIcon,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import type { HardwareMetrics, NovaSwarmState, SandboxCapabilities } from '../shared/types';
import { CommandPalette } from './components/CommandPalette';
import { InfoHint } from './components/InfoHint';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PWAControls } from './components/PWAControls';
import { SwarmChatView } from './components/SwarmChatView';
import type { TerminalSessionSummary } from './components/TerminalView';
import { getLanguageDir, tr } from './locales/translations';

const EcosystemView = lazy(() =>
  import('./components/EcosystemView').then((m) => ({ default: m.EcosystemView }))
);
const McpSkillsView = lazy(() =>
  import('./components/McpSkillsView').then((m) => ({ default: m.McpSkillsView }))
);
const MemoryDreamingView = lazy(() =>
  import('./components/MemoryDreamingView').then((m) => ({ default: m.MemoryDreamingView }))
);
const ModelsRouterView = lazy(() =>
  import('./components/ModelsRouterView').then((m) => ({ default: m.ModelsRouterView }))
);
const OrgAgentsView = lazy(() =>
  import('./components/OrgAgentsView').then((m) => ({ default: m.OrgAgentsView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const SystemOpsView = lazy(() =>
  import('./components/SystemOpsView').then((m) => ({ default: m.SystemOpsView }))
);
const TerminalView = lazy(() =>
  import('./components/TerminalView').then((m) => ({ default: m.TerminalView }))
);
const WorkbenchView = lazy(() =>
  import('./components/WorkbenchView').then((m) => ({ default: m.WorkbenchView }))
);

type TabId =
  | 'overview'
  | 'swarm'
  | 'workbench'
  | 'agents'
  | 'memory'
  | 'models'
  | 'mcp'
  | 'ecosystem'
  | 'terminal'
  | 'system'
  | 'settings';

export default function App() {
  const [state, setState] = useState<NovaSwarmState | null>(null);
  const [hardware, setHardware] = useState<HardwareMetrics | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [cacheSize, setCacheSize] = useState(0);
  const [sandboxBackend, setSandboxBackend] = useState<string>('isolated_tmpfs_subprocess');
  const [sandboxCapabilities, setSandboxCapabilities] = useState<SandboxCapabilities | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [externalDraft, setExternalDraft] = useState<{ text: string; nonce: number } | null>(null);
  const [reminderBanner, setReminderBanner] = useState<string | null>(null);

  // M230: Alt+N Global Scratchpad Drawer persisted in localStorage
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState<string>(() => {
    try {
      return localStorage.getItem('novaswarm_scratchpad_v1') || '';
    } catch {
      return '';
    }
  });

  // M238: Live LAN Ping Latency Indicator (ms)
  const [lanPingMs, setLanPingMs] = useState<number | null>(null);

  // LAN Operator Auth Gate
  const [authLocked, setAuthLocked] = useState(false);
  const [authSetupRequired, setAuthSetupRequired] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [passwordBannerDismissed, setPasswordBannerDismissed] = useState(false);

  const tryFetchState = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/state');
      if (res.status === 401) {
        const errBody = (await res.json().catch(() => ({}))) as { code?: string };
        setAuthSetupRequired(errBody.code === 'AUTH_SETUP_REQUIRED');
        setAuthLocked(true);
        setLoadError(null);
        return true;
      }
      if (!res.ok) {
        setLoadError(`HTTP ${res.status}`);
        return false;
      }
      const data = (await res.json()) as {
        state: NovaSwarmState;
        hardware: HardwareMetrics;
        terminalSessions: TerminalSessionSummary[];
        cacheSize?: number;
        sandboxBackend?: string;
        sandboxCapabilities?: SandboxCapabilities;
      };
      setAuthLocked(false);
      setAuthSetupRequired(false);
      setState(data.state);
      setHardware(data.hardware);
      setTerminalSessions(data.terminalSessions || []);
      setCacheSize(data.cacheSize ?? 0);
      if (data.sandboxBackend) setSandboxBackend(data.sandboxBackend);
      if (data.sandboxCapabilities) setSandboxCapabilities(data.sandboxCapabilities);
      setLoadError(null);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Server connection unavailable');
      return false;
    }
  }, []);

  const fetchState = useCallback(async (): Promise<void> => {
    await tryFetchState();
  }, [tryFetchState]);

  useEffect(() => {
    const mode = state?.settings.themeMode || 'light';
    const isDark = mode === 'dark' || mode === 'high_contrast';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', mode);
  }, [state?.settings.themeMode]);

  useEffect(() => {
    let lastGTime = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setScratchpadOpen((v) => !v);
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setScratchpadOpen(false);
        return;
      }
      const now = Date.now();
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        lastGTime = now;
        return;
      }
      if (now - lastGTime < 800) {
        const map: Record<string, TabId> = {
          o: 'overview',
          c: 'swarm',
          w: 'workbench',
          a: 'agents',
          m: 'memory',
          r: 'system',
          s: 'settings',
        };
        const target = map[e.key.toLowerCase()];
        if (target) {
          setActiveTab(target);
          lastGTime = 0;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('novaswarm_scratchpad_v1', scratchpadText);
    } catch {
      // ignore storage quota errors
    }
  }, [scratchpadText]);

  useEffect(() => {
    if (typeof state?.sharedScratchpad === 'string' && state.sharedScratchpad.length > 0 && !scratchpadText) {
      setScratchpadText(state.sharedScratchpad);
    }
  }, [state?.sharedScratchpad]);

  useEffect(() => {
    if (authLocked || !state) return;
    let active = true;
    const measurePing = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch('/api/v4/summary', { cache: 'no-store' });
        if (active && r.ok) {
          setLanPingMs(Math.max(1, Math.round(performance.now() - t0)));
        }
      } catch {
        if (active) setLanPingMs(null);
      }
    };
    void measurePing();
    const timer = setInterval(() => void measurePing(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authLocked, state]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async (attempt = 0) => {
      let ok = await tryFetchState();
      try {
        const params = new URLSearchParams(window.location.search);
        if (ok && params.get('autostart') === '1') {
          const stRes = await fetch('/api/state', { cache: 'no-store' });
          if (stRes.ok) {
            const stJson = (await stRes.json()) as { state?: NovaSwarmState };
            if (stJson.state && !stJson.state.settings.onboardingCompleted) {
              await fetch('/api/onboarding/autostart', { method: 'POST' }).catch(() => {});
              ok = await tryFetchState();
            }
          }
        }
      } catch {
        // ignore
      }

      if (!ok && !cancelled && attempt < 6) {
        retryTimer = setTimeout(() => {
          void init(attempt + 1);
        }, 1200);
      }
    };

    void init();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [tryFetchState]);

  useEffect(() => {
    if (authLocked || !state) return;
    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws/events`);
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as {
            type?: string;
            payload?: { title?: string; startAt?: string; text?: string };
          };
          if (parsed.type === 'reminder:alert' && parsed.payload?.title) {
            const msg = `Emlékeztető: ${parsed.payload.title}`;
            setReminderBanner(msg);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('NovaSwarm Emlékeztető', { body: parsed.payload.title });
            }
          }
          if (parsed.type === 'scratchpad:sync' && typeof parsed.payload?.text === 'string') {
            setScratchpadText(parsed.payload.text);
          }
        } catch {
          // ignore
        }
        void fetchState();
      };
      ws.onerror = () => {
        // Ignore transient WebSocket errors
      };
    } catch {
      // Ignore WebSocket construction failure
    }
    const poll = setInterval(() => {
      void fetchState();
    }, 10000);
    return () => {
      ws?.close();
      clearInterval(poll);
    };
  }, [fetchState, authLocked, state]);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authPassword.trim() || authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setAuthError(data.error || 'Sikertelen belépés');
        return;
      }
      setAuthPassword('');
      setAuthLocked(false);
      await fetchState();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Hálózati hiba');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleOperatorLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthLocked(true);
    setState(null);
  };

  const handleQuickAction = async (actionId: string) => {
    if (actionId === 'run_dream') {
      await fetch('/api/dreaming/run', { method: 'POST' });
    } else if (actionId === 'run_audit') {
      await fetch('/api/supervisor/audit', { method: 'POST' });
    } else if (actionId === 'check_ota') {
      await fetch('/api/system/ota');
    } else if (actionId === 'create_backup') {
      await fetch('/api/system/backup', { method: 'POST' });
    } else if (actionId === 'warm_ollama') {
      await fetch('/api/providers/ollama/warm', { method: 'POST' });
    } else if (actionId === 'unload_ollama') {
      await fetch('/api/providers/ollama/unload', { method: 'POST' });
    } else if (actionId === 'run_doctor') {
      await fetch('/api/system/doctor', { method: 'POST' });
    }
    await fetchState();
  };

  if (authLocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <form
          onSubmit={handleOperatorLogin}
          className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-2.5 text-slate-900">
            <Lock className="h-5 w-5" />
            <h1 className="text-base font-bold">NovaSwarm LAN Operátori Zár</h1>
          </div>
          <p className="text-xs text-slate-600">
            {authSetupRequired
              ? 'Első indítás: még nincs beállítva operátori jelszó. Nyisd meg a vezérlőpultot helyi (localhost) címről a kezdő jelszó megadásához.'
              : 'Add meg a beállított operátori jelszót a vezérlőpult feloldásához.'}
          </p>
          {authError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {authError}
            </div>
          )}
          <input
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            placeholder="Operátori jelszó..."
            aria-label="Operator password"
            autoFocus
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <button
            type="submit"
            disabled={authSubmitting || !authPassword.trim()}
            className="w-full py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {authSubmitting ? 'Ellenőrzés...' : 'Feloldás'}
          </button>
        </form>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-sm text-slate-600 px-6">
        <div>NovaSwarm betöltése...</div>
        {loadError && (
          <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
            <span>Kapcsolódás a szerverhez: {loadError}</span>
            <button
              type="button"
              onClick={() => void fetchState()}
              className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              Újrapróbálás
            </button>
          </div>
        )}
      </div>
    );
  }

  const lang = state.settings.language;

  if (!state.settings.onboardingCompleted) {
    const hasEnvGemini = state.settings.providerKeys.gemini.some(
      (k) => k.id === 'env-gemini-default'
    );
    return (
      <OnboardingWizard
        initialLanguage={lang}
        hasServerEnvGemini={hasEnvGemini}
        onComplete={fetchState}
      />
    );
  }

  const isDarkTheme = state.settings.themeMode === 'dark' || state.settings.themeMode === 'high_contrast';
  const hintTheme: 'dark' | 'light' = isDarkTheme ? 'dark' : 'light';

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{ id: TabId; label: string; icon: React.ReactNode; hint: string }>;
  }> = [
    {
      groupLabel: 'Napi munka',
      items: [
        {
          id: 'overview',
          label: tr(lang, 'navOverview'),
          icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
          hint: 'Egy helyen mutatja a gép terhelését, a mai AI-költést, az aktív teendőket, az időjárást és a gyors keresőt.',
        },
        {
          id: 'swarm',
          label: tr(lang, 'navSwarm'),
          icon: <MessageSquare className="h-4 w-4 shrink-0" />,
          hint: 'Itt tudsz beszélgetni a digitális segítőiddel, feladatot adni nekik és követni a táblán, mi készült el.',
        },
        {
          id: 'workbench',
          label: tr(lang, 'navWorkbench'),
          icon: <Wrench className="h-4 w-4 shrink-0" />,
          hint: 'Speciális műhely eszközök: kód-összehasonlító, API/adatbázis tesztelő, nyelvtanulás, kutatás és diagramok.',
        },
        {
          id: 'terminal',
          label: tr(lang, 'navTerminal'),
          icon: <TerminalIcon className="h-4 w-4 shrink-0" />,
          hint: 'Valódi Linux parancssor közvetlenül a böngészőben. Biztonsági okból csak akkor aktív, ha engedélyezed a Beállításokban.',
        },
      ],
    },
    {
      groupLabel: 'Tudás & AI',
      items: [
        {
          id: 'agents',
          label: tr(lang, 'navAgents'),
          icon: <Bot className="h-4 w-4 shrink-0" />,
          hint: 'Itt hozhatsz létre új AI munkatársakat különböző szerepkörökre (pl. fejlesztő, rendszergazda), és szabályozhatod a jogaikat.',
        },
        {
          id: 'memory',
          label: tr(lang, 'navMemory'),
          icon: <Brain className="h-4 w-4 shrink-0" />,
          hint: 'Minden megjegyzett tudás rólad és a projektjeidről, plusz a saját jegyzet-tudástárad és az éjszakai összefoglalók.',
        },
        {
          id: 'models',
          label: tr(lang, 'navModels'),
          icon: <Cpu className="h-4 w-4 shrink-0" />,
          hint: 'AI kulcsok kezelése (Gemini, OpenAI, helyi Ollama), havi költségbecslés, virtuális kulcsok és tartalék modell-láncok.',
        },
        {
          id: 'mcp',
          label: tr(lang, 'navMcp'),
          icon: <Plug className="h-4 w-4 shrink-0" />,
          hint: 'Külső bővítmények (MCP), saját mini-skillek, Telegram/Discord összekapcsolás, böngészős kutatás és párosítás.',
        },
      ],
    },
    {
      groupLabel: 'Mindennapok & Otthon',
      items: [
        {
          id: 'ecosystem',
          label: tr(lang, 'navEcosystem'),
          icon: <Layers className="h-4 w-4 shrink-0" />,
          hint: 'Napi szokások, e-mail, naptár, okosotthon, költségkövető, okmányszéf, árfigyelő, receptötletek és automatizmusok.',
        },
      ],
    },
    {
      groupLabel: 'Rendszer',
      items: [
        {
          id: 'system',
          label: tr(lang, 'navSystem'),
          icon: <Activity className="h-4 w-4 shrink-0" />,
          hint: 'Biztonsági mentések, teljes gép-költöztetés másik gépre SSH-n, frissítések, szerver-diagnosztika és jóváhagyások.',
        },
        {
          id: 'settings',
          label: tr(lang, 'navSettings'),
          icon: <SettingsIcon className="h-4 w-4 shrink-0" />,
          hint: 'Nyelv, világos/sötét téma, jelszózár, Telegram engedélylista, költséghatárok, önállósági szint és vészleállító.',
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const activeNavLabel = allNavItems.find((n) => n.id === activeTab)?.label || '';

  return (
    <div dir={getLanguageDir(lang)} className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto flex-1">
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {tr(lang, 'appName')}
            </span>
            <button
              type="button"
              aria-label="Navigáció bezárása"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-1 text-slate-500 dark:text-slate-400"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-3 pt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex-1 flex items-center justify-between px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-1.5">
                <Command className="h-3.5 w-3.5" />
                Gyorskereső...
              </span>
              <span className="font-mono text-[10px] text-slate-400">Ctrl+K</span>
            </button>
            <InfoHint
              theme={hintTheme}
              align="right"
              label="Gyorskereső (Ctrl+K)"
              description="Bárhonnan megnyitható ugrómenü: egyetlen gombnyomással válthatsz oldalt, vagy indíthatsz gyors műveletet."
            />
          </div>

          <nav className="p-3 space-y-4" aria-label="Fő navigáció">
            {navGroups.map((group) => (
              <div key={group.groupLabel} className="space-y-1">
                <div className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.groupLabel}
                </div>
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors text-left ${
                        activeTab === item.id
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </button>
                    <InfoHint theme={hintTheme} align="right" label={item.label} description={item.hint} />
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* Compact Status Footer */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Shield className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300 shrink-0" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {tr(lang, 'supervisorPanelTitle')}
              </span>
              <InfoHint
                theme={hintTheme}
                align="right"
                label="Rendszerfelügyelő"
                description="A háttérben figyeli, hogy az adatok, a memória és a beépített védelmek rendben vannak-e."
              />
            </div>
            <span
              className={`text-[11px] font-semibold shrink-0 ${
                state.supervisor.status === 'nominal'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : state.supervisor.status === 'warning'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {state.supervisor.status === 'nominal'
                ? tr(lang, 'supervisorNominal')
                : state.supervisor.status === 'warning'
                ? tr(lang, 'supervisorWarning')
                : tr(lang, 'supervisorAlert')}
            </span>
          </div>

          {hardware && (
            <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 flex justify-between">
              <span>CPU {hardware.cpuLoadPercent}%</span>
              <span>RAM {hardware.ramPercent}%</span>
              <span>{hardware.temperatureCelsius !== null ? `${hardware.temperatureCelsius}°C` : 'Linux'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
              await fetch('/api/supervisor/audit', { method: 'POST' });
              await fetchState();
            }}
            className="w-full px-2.5 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
          >
            Gyors állapot-ellenőrzés
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
              <span className="hidden sm:inline">{tr(lang, 'appName')} / </span>
              {activeNavLabel}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            <span>
              {state.settings.fullAutonomousMode
                ? '100% Autonóm'
                : state.settings.hostPermissionsGranted
                ? tr(lang, 'hostPermGranted')
                : tr(lang, 'hostPermRestricted')}
            </span>
            <span aria-hidden="true">·</span>
            <span className={`font-mono tabular-nums ${state.settings.privacyMaskEnabled ? 'blur-sm select-none' : ''}`}>
              ${state.settings.dailySpendUsd.toFixed(3)} / ${state.settings.dailyCostLimitUsd.toFixed(2)}
            </span>
            {state.settings.killSwitchActive && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-red-700 font-semibold">KILL SWITCH AKTÍV</span>
              </>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              title="Téma váltása (Világos / Sötét)"
              aria-label="Toggle theme mode"
              onClick={async () => {
                const next = state.settings.themeMode === 'dark' ? 'light' : 'dark';
                await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ themeMode: next }),
                });
                await fetchState();
              }}
              className="p-1.5 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              {state.settings.themeMode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              title="Kávézó Mód (Összegek elmosása)"
              aria-label="Toggle privacy mask"
              onClick={async () => {
                await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ privacyMaskEnabled: !state.settings.privacyMaskEnabled }),
                });
                await fetchState();
              }}
              className={`p-1.5 border rounded-lg shrink-0 ${
                state.settings.privacyMaskEnabled
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {state.settings.privacyMaskEnabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <div className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg shrink-0" title="LAN Ping késleltetés">
              <Wifi className="h-3 w-3" />
              <span>{lanPingMs !== null ? `${lanPingMs}ms` : 'LAN'}</span>
            </div>
            <button
              type="button"
              title="Gyors Jegyzetfiók (Alt+N)"
              aria-label="Toggle scratchpad drawer"
              onClick={() => setScratchpadOpen((v) => !v)}
              className={`p-1.5 border rounded-lg shrink-0 ${
                scratchpadOpen
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Billentyűparancsok (?)"
              aria-label="Keyboard shortcuts"
              onClick={() => setShortcutsOpen(true)}
              className="hidden sm:inline-flex p-1.5 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <div className="hidden sm:block">
              <PWAControls />
            </div>
            {state.settings.webAuthEnabled && (
              <button
                type="button"
                onClick={() => void handleOperatorLogout()}
                title="LAN Zár / Kijelentkezés"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Zárolás</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <span className="hidden sm:inline">{tr(lang, 'approvalsPending')}: </span>
              <span className="sm:hidden">Jóváhagyás: </span>
              {state.approvals.filter((a) => a.status === 'pending').length}
            </button>
          </div>
        </header>

        {state.settings.webAuthEnabled && !state.settings.webAuthHasPassword && !passwordBannerDismissed && (
          <div className="bg-sky-50 dark:bg-sky-950/50 border-b border-sky-200 dark:border-sky-800 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-900 dark:text-sky-100">
            <span className="inline-flex items-center gap-2 font-medium">
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              Ajánlott beállítás: adj meg egy belépési jelszót, hogy hálózatról se férhessen hozzá idegen a vezérlőpulthoz.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-sky-700 text-white rounded hover:bg-sky-800"
              >
                Jelszó beállítása
              </button>
              <button
                type="button"
                aria-label="Értesítés bezárása"
                onClick={() => setPasswordBannerDismissed(true)}
                className="text-sky-700 dark:text-sky-300 hover:opacity-80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {reminderBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-900">
            <span className="inline-flex items-center gap-2 font-medium">
              <Bell className="h-3.5 w-3.5" />
              {reminderBanner}
            </span>
            <button type="button" onClick={() => setReminderBanner(null)} className="text-amber-700 hover:text-amber-950">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <main
          className={`flex-1 overflow-y-auto ${
            state.settings.compactUiMode ? 'p-3 sm:p-4 pb-16 lg:pb-4' : 'p-6 pb-20 lg:pb-6'
          }`}
        >
          <Suspense fallback={<div className="p-8 text-xs text-slate-500 font-mono">Nézet betöltése...</div>}>
            {activeTab === 'overview' && (
              <OverviewDashboard
                state={state}
                hardware={hardware}
                onNavigate={(tab) => setActiveTab(tab as TabId)}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'swarm' && (
              <SwarmChatView
                language={lang}
                agents={state.agents}
                threads={state.threads}
                messages={state.messages}
                kanban={state.kanban}
                ideas={state.ideas}
                promptTemplates={state.promptTemplates || []}
                artifacts={state.artifacts || []}
                settings={state.settings}
                externalDraft={externalDraft}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'workbench' && (
              <WorkbenchView state={state} onRefreshState={fetchState} />
            )}
            {activeTab === 'agents' && (
              <OrgAgentsView
                language={lang}
                agents={state.agents}
                mcpServers={state.mcpServers}
                kanban={state.kanban}
                federationPeers={state.federationPeers}
                federationEnabled={state.settings.federationEnabled}
                agentBenchmarks={state.agentBenchmarks || []}
                nightShiftRuns={state.nightShiftRuns || []}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'memory' && (
              <MemoryDreamingView
                language={lang}
                memories={state.memories}
                dreamJournal={state.dreamJournal}
                dreamSkillDrafts={state.dreamSkillDrafts || []}
                reflexionSuggestions={state.reflexionSuggestions || []}
                settings={state.settings}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'models' && (
              <ModelsRouterView
                language={lang}
                settings={state.settings}
                discoveredModels={state.discoveredModels}
                quotas={state.quotas}
                virtualKeys={state.virtualKeys}
                gatewayAnalytics={state.gatewayAnalytics}
                cacheSize={cacheSize}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'mcp' && (
              <McpSkillsView
                language={lang}
                mcpServers={state.mcpServers}
                skills={state.skills}
                channelConnectors={state.channelConnectors}
                pairingRequests={state.pairingRequests}
                agents={state.agents}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'ecosystem' && (
              <EcosystemView state={state} onRefreshState={fetchState} />
            )}
            {activeTab === 'terminal' && (
              <TerminalView
                language={lang}
                hostPermissionsGranted={state.settings.hostPermissionsGranted}
                sessions={terminalSessions}
                onRefreshState={fetchState}
                onOpenSettings={() => setActiveTab('settings')}
                onSendToSwarm={(draftText) => {
                  setExternalDraft({ text: draftText, nonce: Date.now() });
                  setActiveTab('swarm');
                }}
              />
            )}
            {activeTab === 'system' && (
              <SystemOpsView
                language={lang}
                hardware={hardware}
                approvals={state.approvals}
                cronTasks={state.cronTasks}
                backups={state.backups}
                auditLogs={state.auditLogs}
                uptimeTargets={state.uptimeTargets}
                sslTargets={state.sslTargets || []}
                sshProfiles={state.sshProfiles || []}
                clusterNodes={state.clusterNodes || []}
                settings={state.settings}
                state={state}
                sandboxBackend={sandboxBackend}
                sandboxCapabilities={sandboxCapabilities}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                language={lang}
                settings={state.settings}
                sandboxCapabilities={sandboxCapabilities}
                onRefreshState={fetchState}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Compact Mobile Bottom Nav Bar */}
      <nav
        aria-label="Mobil gyorsnavigáció"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-1 flex items-center justify-around"
      >
        {(
          [
            { id: 'overview', label: 'Főoldal', icon: <LayoutDashboard className="h-4 w-4" /> },
            { id: 'swarm', label: 'Chat', icon: <MessageSquare className="h-4 w-4" /> },
            { id: 'workbench', label: 'Munkapad', icon: <Wrench className="h-4 w-4" /> },
            { id: 'ecosystem', label: 'Életvitel', icon: <Layers className="h-4 w-4" /> },
            { id: 'system', label: 'Rendszer', icon: <Activity className="h-4 w-4" /> },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[10px] font-medium rounded whitespace-nowrap shrink-0 ${
              activeTab === item.id ? 'text-slate-900 font-semibold' : 'text-slate-500'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        agents={state.agents}
        templates={state.promptTemplates || []}
        memories={state.memories}
        kanban={state.kanban}
        onNavigate={(tab) => setActiveTab(tab as TabId)}
        onApplyTemplate={(body) => setExternalDraft({ text: body, nonce: Date.now() })}
        onQuickAction={(actionId) => void handleQuickAction(actionId)}
      />

      {scratchpadOpen && (
        <aside
          aria-label="Jegyzetfiók (Scratchpad Drawer)"
          className="fixed bottom-16 right-4 z-40 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-amber-500" />
              Gyors Jegyzetfiók (Alt+N)
            </h2>
            <button
              type="button"
              aria-label="Jegyzetfiók bezárása"
              onClick={() => setScratchpadOpen(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            rows={6}
            value={scratchpadText}
            onChange={(e) => setScratchpadText(e.target.value)}
            placeholder="Gyors jegyzetek, prompt vázlatok, parancsok (automatikusan mentve)..."
            aria-label="Jegyzetfiók tartalma"
            className="w-full p-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setScratchpadText('')}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Törlés
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/v7/scratchpad', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: scratchpadText }),
                  });
                  await fetchState();
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                LAN Szinkron
              </button>
              <button
                type="button"
                disabled={!scratchpadText.trim()}
                onClick={() => {
                  setExternalDraft({ text: scratchpadText.trim(), nonce: Date.now() });
                  setActiveTab('swarm');
                  setScratchpadOpen(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="h-3 w-3" />
                Küldés Raj Chatbe
              </button>
            </div>
          </div>
        </aside>
      )}

      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Billentyűparancsok</h2>
              <button type="button" onClick={() => setShortcutsOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>Ctrl+K / Cmd+K</span><span>Gyorskereső</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>Alt+N</span><span>Gyors Jegyzetfiók</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>?</span><span>Súgóablak</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → o</span><span>Áttekintő</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → c</span><span>Csapat Chat &amp; Feladatok</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → w</span><span>Munkapad &amp; Eszközök</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → a</span><span>Ágensek &amp; Csapat</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → m</span><span>Memória &amp; Jegyzetek</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → r</span><span>Rendszer &amp; Költöztetés</span></div>
              <div className="flex justify-between py-1"><span>g → s</span><span>Beállítások</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
