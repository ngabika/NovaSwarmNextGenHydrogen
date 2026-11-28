import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
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
import type {
  HardwareMetrics,
  LanguageCode,
  NovaSwarmState,
  PhoenixAutonomyStatus,
  SandboxCapabilities,
  SudoCheckStatus,
} from '../shared/types';
import { CommandPalette } from './components/CommandPalette';
import { InfoHint } from './components/InfoHint';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PWAControls } from './components/PWAControls';
import { SwarmChatView } from './components/SwarmChatView';
import type { TerminalSessionSummary } from './components/TerminalView';
import {
  getLanguageDir,
  getSavedLanguage,
  isSupportedLanguage,
  LocaleProvider,
  saveLanguagePreference,
  SUPPORTED_LANGUAGES,
  tr,
  tx,
} from './locales/translations';

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
const AutonomyCenterView = lazy(() =>
  import('./components/AutonomyCenterView').then((m) => ({ default: m.AutonomyCenterView }))
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
  | 'autonomy'
  | 'settings';

export default function App() {
  const [state, setState] = useState<NovaSwarmState | null>(null);
  const [hardware, setHardware] = useState<HardwareMetrics | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [cacheSize, setCacheSize] = useState(0);
  const [sandboxBackend, setSandboxBackend] = useState<string>('isolated_tmpfs_subprocess');
  const [sandboxCapabilities, setSandboxCapabilities] = useState<SandboxCapabilities | null>(null);
  const [sudoStatus, setSudoStatus] = useState<SudoCheckStatus | null>(null);
  const [phoenixAutonomy, setPhoenixAutonomy] = useState<PhoenixAutonomyStatus | null>(null);
  const [creatingPhoenixSnap, setCreatingPhoenixSnap] = useState(false);
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

  // Active UI language (falls back to saved local preference while auth-locked)
  const [uiLang, setUiLang] = useState<LanguageCode>(() => getSavedLanguage('hu'));

  // LAN Operator Auth Gate
  const [authLocked, setAuthLocked] = useState(false);
  const [authSetupRequired, setAuthSetupRequired] = useState(false);
  const [authMissingPassword, setAuthMissingPassword] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [passwordBannerSnoozedUntil, setPasswordBannerSnoozedUntil] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('novaswarm_pw_banner_snooze_until');
      const parsed = raw ? Number(raw) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  });

  const activeLang: LanguageCode = isSupportedLanguage(state?.settings.language)
    ? state.settings.language
    : uiLang;

  useEffect(() => {
    saveLanguagePreference(activeLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = activeLang;
      document.documentElement.dir = getLanguageDir(activeLang);
    }
  }, [activeLang]);

  const navigateToPasswordSetup = useCallback(() => {
    setActiveTab('settings');
    setTimeout(() => {
      const el = document.getElementById('operator-password-input') || document.getElementById('lan-operator-password-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el instanceof HTMLInputElement) el.focus();
      }
    }, 120);
  }, []);

  const snoozePasswordBanner7Days = useCallback(() => {
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
    setPasswordBannerSnoozedUntil(until);
    try {
      localStorage.setItem('novaswarm_pw_banner_snooze_until', String(until));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const tryFetchState = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/state');
      if (res.status === 401) {
        const errBody = (await res.json().catch(() => ({}))) as { code?: string };
        setAuthSetupRequired(errBody.code === 'AUTH_SETUP_REQUIRED');
        setAuthMissingPassword(errBody.code === 'NO_PASSWORD_CONFIGURED');
        try {
          const stRes = await fetch('/api/auth/status');
          if (stRes.ok) {
            const st = (await stRes.json()) as { missingPasswordState?: boolean };
            if (st.missingPasswordState) setAuthMissingPassword(true);
          }
        } catch {
          // ignore status probe failure
        }
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
        sudoStatus?: SudoCheckStatus;
        phoenixAutonomy?: PhoenixAutonomyStatus;
      };
      setAuthLocked(false);
      setAuthSetupRequired(false);
      setAuthMissingPassword(false);
      setState(data.state);
      if (isSupportedLanguage(data.state?.settings?.language)) {
        setUiLang(data.state.settings.language);
      }
      setHardware(data.hardware);
      setTerminalSessions(data.terminalSessions || []);
      setCacheSize(data.cacheSize ?? 0);
      if (data.sandboxBackend) setSandboxBackend(data.sandboxBackend);
      if (data.sandboxCapabilities) setSandboxCapabilities(data.sandboxCapabilities);
      if (data.sudoStatus) setSudoStatus(data.sudoStatus);
      if (data.phoenixAutonomy) setPhoenixAutonomy(data.phoenixAutonomy);
      setLoadError(null);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : tr(uiLang, 'lockSaveErr'));
      return false;
    }
  }, [uiLang]);

  const fetchState = useCallback(async (): Promise<void> => {
    await tryFetchState();
  }, [tryFetchState]);

  const handleLanguageChange = useCallback(
    async (nextLang: LanguageCode) => {
      setUiLang(nextLang);
      saveLanguagePreference(nextLang);
      setState((prev) =>
        prev ? { ...prev, settings: { ...prev.settings, language: nextLang } } : prev
      );
      if (!authLocked && state) {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: nextLang }),
        }).catch(() => {});
        await fetchState();
      }
    },
    [authLocked, state, fetchState]
  );

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
          t: 'autonomy',
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
            const reminderLabel = tx(activeLang, 'Emlékeztető üzenet');
            const msg = `${reminderLabel}: ${parsed.payload.title}`;
            setReminderBanner(msg);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(`${tr(activeLang, 'appName')} · ${reminderLabel}`, {
                body: parsed.payload.title,
              });
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
  }, [fetchState, authLocked, state, activeLang]);

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
        setAuthError(data.error || tr(activeLang, 'lockInvalidErr'));
        return;
      }
      setAuthPassword('');
      setAuthLocked(false);
      await fetchState();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : tx(activeLang, 'Hálózati hiba'));
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

  const lang = activeLang;

  if (authLocked) {
    return (
      <LocaleProvider lang={lang} setLang={(next) => void handleLanguageChange(next)}>
        <div
          dir={getLanguageDir(lang)}
          className="min-h-screen bg-slate-50 flex items-center justify-center px-6"
        >
          <form
            onSubmit={handleOperatorLogin}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 text-slate-900">
              <div className="flex items-center gap-2.5 min-w-0">
                <Lock className="h-5 w-5 shrink-0" />
                <h1 className="text-base font-bold truncate">{tr(lang, 'lockTitle')}</h1>
              </div>
              <select
                aria-label={tr(lang, 'languageSwitchLabel')}
                value={lang}
                onChange={(e) => void handleLanguageChange(e.target.value as LanguageCode)}
                className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 shrink-0"
              >
                {SUPPORTED_LANGUAGES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.nativeName}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-600">
              {authMissingPassword
                ? tr(lang, 'lockHalfInstalledDesc')
                : authSetupRequired
                ? tr(lang, 'lockSetupDesc')
                : tr(lang, 'lockPasswordDesc')}
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
              placeholder={tr(lang, 'lockPasswordPlaceholder')}
              aria-label={tr(lang, 'lockPasswordPlaceholder')}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              disabled={authSubmitting || !authPassword.trim()}
              className="w-full py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {authSubmitting ? tr(lang, 'lockUnlockingBtn') : tr(lang, 'lockLoginBtn')}
            </button>
          </form>
        </div>
      </LocaleProvider>
    );
  }

  if (!state) {
    return (
      <LocaleProvider lang={lang} setLang={(next) => void handleLanguageChange(next)}>
        <div
          dir={getLanguageDir(lang)}
          className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-sm text-slate-600 px-6"
        >
          <div>{tr(lang, 'loadingAppTitle')}</div>
          {loadError && (
            <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
              <span>{tr(lang, 'loadingAppDesc', loadError)}</span>
              <button
                type="button"
                onClick={() => void fetchState()}
                className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                {tr(lang, 'retryBtn')}
              </button>
            </div>
          )}
        </div>
      </LocaleProvider>
    );
  }

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
      groupLabel: tr(lang, 'navGroupDaily'),
      items: [
        {
          id: 'overview',
          label: tr(lang, 'navOverview'),
          icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navOverviewHint'),
        },
        {
          id: 'swarm',
          label: tr(lang, 'navSwarm'),
          icon: <MessageSquare className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navSwarmHint'),
        },
        {
          id: 'workbench',
          label: tr(lang, 'navWorkbench'),
          icon: <Wrench className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navWorkbenchHint'),
        },
        {
          id: 'terminal',
          label: tr(lang, 'navTerminal'),
          icon: <TerminalIcon className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navTerminalHint'),
        },
      ],
    },
    {
      groupLabel: tr(lang, 'navGroupKnowledge'),
      items: [
        {
          id: 'agents',
          label: tr(lang, 'navAgents'),
          icon: <Bot className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navAgentsHint'),
        },
        {
          id: 'memory',
          label: tr(lang, 'navMemory'),
          icon: <Brain className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navMemoryHint'),
        },
        {
          id: 'models',
          label: tr(lang, 'navModels'),
          icon: <Cpu className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navModelsHint'),
        },
        {
          id: 'mcp',
          label: tr(lang, 'navMcp'),
          icon: <Plug className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navMcpHint'),
        },
      ],
    },
    {
      groupLabel: tr(lang, 'navGroupLife'),
      items: [
        {
          id: 'ecosystem',
          label: tr(lang, 'navEcosystem'),
          icon: <Layers className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navEcosystemHint'),
        },
      ],
    },
    {
      groupLabel: tr(lang, 'navGroupSystem'),
      items: [
        {
          id: 'system',
          label: tr(lang, 'navSystem'),
          icon: <Activity className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navSystemHint'),
        },
        {
          id: 'autonomy',
          label: tr(lang, 'navAutonomy'),
          icon: <Shield className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navAutonomyHint'),
        },
        {
          id: 'settings',
          label: tr(lang, 'navSettings'),
          icon: <SettingsIcon className="h-4 w-4 shrink-0" />,
          hint: tr(lang, 'navSettingsHint'),
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const activeNavLabel = allNavItems.find((n) => n.id === activeTab)?.label || '';

  return (
    <LocaleProvider lang={lang} setLang={(next) => void handleLanguageChange(next)}>
    <div dir={getLanguageDir(lang)} className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 ltr:left-0 rtl:right-0 z-30 w-64 bg-white dark:bg-slate-900 ltr:border-r rtl:border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full'
        }`}
      >
        <div className="overflow-y-auto flex-1">
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {tr(lang, 'appName')}
            </span>
            <button
              type="button"
              aria-label={tr(lang, 'closeNavAria')}
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
              <span className="inline-flex items-center gap-1.5 truncate">
                <Command className="h-3.5 w-3.5 shrink-0" />
                {tr(lang, 'quickSearch')}
              </span>
              <span className="font-mono text-[10px] text-slate-400 shrink-0">Ctrl+K</span>
            </button>
            <InfoHint
              theme={hintTheme}
              align="right"
              label={tr(lang, 'quickSearchHintTitle')}
              description={tr(lang, 'quickSearchHintDesc')}
            />
          </div>

          <nav className="p-3 space-y-4" aria-label={tr(lang, 'mainNavLabel')}>
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
                      className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors text-start ${
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
                label={tr(lang, 'supervisorPanelTitle')}
                description={tr(lang, 'supervisorPanelDesc')}
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
            {tr(lang, 'quickHealthCheck')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              aria-label={tr(lang, 'openNavAria')}
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
                ? tr(lang, 'hostPermAutonomous')
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
                <span className="text-red-700 font-semibold">{tr(lang, 'killSwitchActiveBadge')}</span>
              </>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1 sm:gap-1.5">
            <select
              aria-label={tr(lang, 'languageSwitchLabel')}
              title={tr(lang, 'languageSwitchLabel')}
              value={lang}
              onChange={(e) => void handleLanguageChange(e.target.value as LanguageCode)}
              className="px-1.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shrink-0"
            >
              {SUPPORTED_LANGUAGES.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.nativeName}
                </option>
              ))}
            </select>
            <button
              type="button"
              title={tr(lang, 'themeToggleTitle')}
              aria-label={tr(lang, 'themeToggleTitle')}
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
              title={tr(lang, 'privacyMaskTitle')}
              aria-label={tr(lang, 'privacyMaskTitle')}
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
            <div className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg shrink-0" title={tr(lang, 'lanPingTitle')}>
              <Wifi className="h-3 w-3" />
              <span>{lanPingMs !== null ? `${lanPingMs}ms` : 'LAN'}</span>
            </div>
            <button
              type="button"
              title={tr(lang, 'scratchpadBtnTitle')}
              aria-label={tr(lang, 'scratchpadBtnTitle')}
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
              title={tr(lang, 'shortcutsBtnTitle')}
              aria-label={tr(lang, 'shortcutsBtnTitle')}
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
                title={tr(lang, 'lockLogoutTitle')}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tr(lang, 'lockLogoutBtn')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <span className="hidden sm:inline">{tr(lang, 'approvalsPending')}: </span>
              <span className="sm:hidden">{tr(lang, 'approvalsPendingShort')}: </span>
              {state.approvals.filter((a) => a.status === 'pending').length}
            </button>
          </div>
        </header>

        {!state.settings.webAuthEnabled && Date.now() >= passwordBannerSnoozedUntil && (
          <div
            role="status"
            data-testid="passwordless-lan-banner"
            className="bg-amber-100 dark:bg-amber-950/70 border-b border-amber-300 dark:border-amber-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-100"
          >
            <span className="inline-flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4 shrink-0 text-amber-800 dark:text-amber-300" />
              {tr(lang, 'passwordlessBannerText')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={navigateToPasswordSetup}
                className="px-3 py-1 text-[11px] font-semibold bg-amber-900 text-white rounded hover:bg-amber-950 whitespace-nowrap"
              >
                {tr(lang, 'setPasswordBtn')}
              </button>
              <button
                type="button"
                aria-label={tr(lang, 'snooze7DaysAria')}
                onClick={snoozePasswordBanner7Days}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-amber-900 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 rounded"
              >
                <X className="h-3.5 w-3.5" />
                <span>{tr(lang, 'snooze7DaysBtn')}</span>
              </button>
            </div>
          </div>
        )}

        {state.settings.webAuthEnabled && !state.settings.webAuthHasPassword && (
          <div className="bg-red-50 dark:bg-red-950/60 border-b border-red-300 dark:border-red-800 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900 dark:text-red-100">
            <span className="inline-flex items-center gap-2 font-semibold">
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              {tr(lang, 'halfInstalledBannerText')}
            </span>
            <button
              type="button"
              onClick={navigateToPasswordSetup}
              className="px-2.5 py-1 text-[11px] font-semibold bg-red-700 text-white rounded hover:bg-red-800"
            >
              {tr(lang, 'setPasswordBtn')}
            </button>
          </div>
        )}

        {(state.settings.totalAutonomyEnabled || state.settings.fullAutonomyProfileEnabled || state.settings.lockdownActive) && (
          <div
            role="alert"
            className={`${
              state.settings.lockdownActive ? 'bg-red-800 border-red-950' : 'bg-red-600 border-red-800'
            } text-white border-b px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs`}
          >
            <span className="inline-flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {state.settings.lockdownActive
                ? tr(lang, 'lockdownBannerText')
                : state.settings.totalAutonomyEnabled
                ? tr(lang, 'totalAutonomyBannerText')
                : tr(lang, 'fullAutonomyBannerText')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {phoenixAutonomy?.staleWarning && !state.settings.lockdownActive && (
                <button
                  type="button"
                  disabled={creatingPhoenixSnap}
                  onClick={async () => {
                    setCreatingPhoenixSnap(true);
                    try {
                      await fetch('/api/v3/phoenix/snapshot', { method: 'POST' });
                      await fetchState();
                    } finally {
                      setCreatingPhoenixSnap(false);
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-amber-300 text-slate-950 rounded hover:bg-amber-200 disabled:opacity-60 whitespace-nowrap"
                >
                  {creatingPhoenixSnap ? tr(lang, 'phoenixSavingBtn') : tr(lang, 'phoenixSaveBtn')}
                </button>
              )}
              {!state.settings.lockdownActive && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/total-autonomy/lockdown', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ reason: tr(lang, 'bannerStopReason') }),
                    });
                    await fetchState();
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-red-950 text-white rounded hover:bg-black whitespace-nowrap"
                >
                  {tr(lang, 'emergencyStopBtn')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('autonomy')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white text-red-700 rounded hover:bg-red-50 whitespace-nowrap"
              >
                {tr(lang, 'autonomyCenterBtn')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-red-700/80 text-white border border-red-400 rounded hover:bg-red-700 whitespace-nowrap"
              >
                {tr(lang, 'settingsBtn')}
              </button>
            </div>
          </div>
        )}

        {!state.settings.fullAutonomyProfileEnabled && phoenixAutonomy?.staleWarning && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <span className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {phoenixAutonomy.warningMessage}
            </span>
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
          <Suspense fallback={<div className="p-8 text-xs text-slate-500 font-mono">{tr(lang, 'viewLoadingText')}</div>}>
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
                keyModelMatrix={state.keyModelMatrix || []}
                routedCallLogs={state.routedCallLogs || []}
                queuedLlmRequests={state.queuedLlmRequests || []}
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
                sudoStatus={sudoStatus}
                phoenixAutonomy={phoenixAutonomy}
                onRefreshState={fetchState}
              />
            )}
            {activeTab === 'autonomy' && (
              <AutonomyCenterView onRefreshState={fetchState} />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                language={lang}
                settings={state.settings}
                sandboxCapabilities={sandboxCapabilities}
                sudoStatus={sudoStatus}
                phoenixAutonomy={phoenixAutonomy}
                onRefreshState={fetchState}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Compact Mobile Bottom Nav Bar */}
      <nav
        aria-label={tr(lang, 'mobileNavAria')}
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-1 flex items-center justify-around"
      >
        {(
          [
            { id: 'overview', label: tr(lang, 'mobileHome'), icon: <LayoutDashboard className="h-4 w-4" /> },
            { id: 'swarm', label: 'Swarm', icon: <MessageSquare className="h-4 w-4" /> },
            { id: 'workbench', label: tr(lang, 'navWorkbench').split(' ')[0], icon: <Wrench className="h-4 w-4" /> },
            { id: 'ecosystem', label: tr(lang, 'mobileLife'), icon: <Layers className="h-4 w-4" /> },
            { id: 'system', label: tr(lang, 'navGroupSystem'), icon: <Activity className="h-4 w-4" /> },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[10px] font-medium rounded whitespace-nowrap shrink-0 ${
              activeTab === item.id ? 'text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500'
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
          aria-label={tr(lang, 'scratchpadDrawerTitle')}
          className="fixed bottom-16 ltr:right-4 rtl:left-4 z-40 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-amber-500" />
              {tr(lang, 'scratchpadBtnTitle')}
            </h2>
            <button
              type="button"
              aria-label={tr(lang, 'closeBtn')}
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
            placeholder={tr(lang, 'scratchpadPlaceholder')}
            aria-label={tr(lang, 'scratchpadAria')}
            className="w-full p-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setScratchpadText('')}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {tr(lang, 'scratchpadClearBtn')}
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
                LAN
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
                {tr(lang, 'send')}
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
              <h2 className="text-sm font-bold">{tr(lang, 'shortcutsModalTitle')}</h2>
              <button
                type="button"
                aria-label={tr(lang, 'closeBtn')}
                onClick={() => setShortcutsOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>Ctrl+K / Cmd+K</span><span>{tr(lang, 'shortcutQuickPalette')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>Alt+N</span><span>{tr(lang, 'shortcutScratchpad')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>?</span><span>{tr(lang, 'shortcutHelp')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>Esc</span><span>{tr(lang, 'shortcutEsc')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → o</span><span>{tr(lang, 'navOverview')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → c</span><span>{tr(lang, 'navSwarm')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → w</span><span>{tr(lang, 'navWorkbench')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → a</span><span>{tr(lang, 'navAgents')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → m</span><span>{tr(lang, 'navMemory')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → r</span><span>{tr(lang, 'navSystem')}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>g → t</span><span>{tr(lang, 'navAutonomy')}</span></div>
              <div className="flex justify-between py-1"><span>g → s</span><span>{tr(lang, 'navSettings')}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
    </LocaleProvider>
  );
}
