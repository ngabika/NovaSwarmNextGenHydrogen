import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Brain,
  Command,
  Cpu,
  Download,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  Terminal as TerminalIcon,
  Wrench,
  X,
} from 'lucide-react';
import type { HardwareMetrics, NovaSwarmState, OtaVersionStatus } from '../shared/types';
import { CommandPalette } from './components/CommandPalette';
import { EcosystemView } from './components/EcosystemView';
import { McpSkillsView } from './components/McpSkillsView';
import { MemoryDreamingView } from './components/MemoryDreamingView';
import { ModelsRouterView } from './components/ModelsRouterView';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OrgAgentsView } from './components/OrgAgentsView';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PWAControls } from './components/PWAControls';
import { SettingsView } from './components/SettingsView';
import { SwarmChatView } from './components/SwarmChatView';
import { SystemOpsView } from './components/SystemOpsView';
import { TerminalView, type TerminalSessionSummary } from './components/TerminalView';
import { WorkbenchView } from './components/WorkbenchView';
import { getLanguageDir, tr } from './locales/translations';

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
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [externalDraft, setExternalDraft] = useState<{ text: string; nonce: number } | null>(null);
  const [reminderBanner, setReminderBanner] = useState<string | null>(null);

  // LAN Operator Auth Gate
  const [authLocked, setAuthLocked] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Sidebar Menu GitHub OTA Status & Actions
  const [otaStatus, setOtaStatus] = useState<OtaVersionStatus | null>(null);
  const [otaBusy, setOtaBusy] = useState(false);
  const [otaActionMsg, setOtaActionMsg] = useState<string | null>(null);

  const tryFetchState = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/state');
      if (res.status === 401) {
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
      };
      setAuthLocked(false);
      setState(data.state);
      setHardware(data.hardware);
      setTerminalSessions(data.terminalSessions || []);
      setCacheSize(data.cacheSize ?? 0);
      if (data.sandboxBackend) setSandboxBackend(data.sandboxBackend);
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

  const checkOta = useCallback(async () => {
    setOtaBusy(true);
    try {
      const res = await fetch('/api/system/ota');
      if (res.ok) {
        setOtaStatus((await res.json()) as OtaVersionStatus);
      }
    } catch {
      // ignore offline OTA probe error
    } finally {
      setOtaBusy(false);
    }
  }, []);

  const handleMenuApplyOta = async () => {
    setOtaBusy(true);
    setOtaActionMsg(null);
    try {
      const res = await fetch('/api/system/ota/apply', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setOtaActionMsg(data.message || (data.ok ? 'Frissítve.' : 'Frissítés sikertelen.'));
      await checkOta();
      await fetchState();
    } catch (err) {
      setOtaActionMsg(err instanceof Error ? err.message : 'Hálózati hiba');
    } finally {
      setOtaBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async (attempt = 0) => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1') {
          await fetch('/api/onboarding/autostart', { method: 'POST' }).catch(() => {});
        }
      } catch {
        // ignore
      }

      const ok = await tryFetchState();
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
    if (state && !otaStatus) {
      void checkOta();
    }
  }, [state, otaStatus, checkOta]);

  useEffect(() => {
    if (authLocked) return;
    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws/events`);
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as { type?: string; payload?: { title?: string; startAt?: string } };
          if (parsed.type === 'reminder:alert' && parsed.payload?.title) {
            const msg = `Emlékeztető: ${parsed.payload.title}`;
            setReminderBanner(msg);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('NovaSwarm Emlékeztető', { body: parsed.payload.title });
            }
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
  }, [fetchState, authLocked]);

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
      await checkOta();
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
            Add meg a beállított operátori jelszót a vezérlőpult feloldásához.
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

  const navItems: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: tr(lang, 'navOverview'), icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'swarm', label: tr(lang, 'navSwarm'), icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'workbench', label: tr(lang, 'navWorkbench'), icon: <Wrench className="h-4 w-4" /> },
    { id: 'agents', label: tr(lang, 'navAgents'), icon: <Bot className="h-4 w-4" /> },
    { id: 'memory', label: tr(lang, 'navMemory'), icon: <Brain className="h-4 w-4" /> },
    { id: 'models', label: tr(lang, 'navModels'), icon: <Cpu className="h-4 w-4" /> },
    { id: 'mcp', label: tr(lang, 'navMcp'), icon: <Plug className="h-4 w-4" /> },
    { id: 'ecosystem', label: tr(lang, 'navEcosystem'), icon: <Layers className="h-4 w-4" /> },
    { id: 'terminal', label: tr(lang, 'navTerminal'), icon: <TerminalIcon className="h-4 w-4" /> },
    { id: 'system', label: tr(lang, 'navSystem'), icon: <Activity className="h-4 w-4" /> },
    { id: 'settings', label: tr(lang, 'navSettings'), icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || '';

  return (
    <div dir={getLanguageDir(lang)} className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto">
          <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              {tr(lang, 'appName')}
            </span>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-1 text-slate-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-1.5">
                <Command className="h-3.5 w-3.5" />
                Parancspaletta...
              </span>
              <span className="font-mono text-[10px] text-slate-400">Ctrl+K</span>
            </button>
          </div>

          <nav className="p-3 space-y-1" aria-label="Main Navigation">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Menu-level GitHub OTA Auto-Update Control */}
          <div className="mx-3 mt-2 p-3 border border-slate-200 rounded-lg bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold text-slate-900 truncate">
                GitHub Frissítés (OTA)
              </span>
              <span
                className={`text-[10px] font-mono font-semibold ${
                  otaStatus?.updateAvailable ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {otaStatus
                  ? otaStatus.updateAvailable
                    ? 'ÚJ VERZIÓ'
                    : 'Naprakész'
                  : 'Várakozik'}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 truncate">
              {state.settings.otaRepoSlug || 'ngabika/NovaSwarmNextGenHydrogen'}
            </div>
            <div className="text-[10px] font-mono text-slate-600 flex items-center justify-between">
              <span>
                Helyi: {otaStatus?.localCommit || otaStatus?.currentVersion || '1.0.0'}
              </span>
              <span>
                Auto: {state.settings.autoUpdateEnabled ? 'BE' : 'KI'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={otaBusy}
                onClick={() => void checkOta()}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-300 bg-white rounded hover:bg-slate-100 text-slate-800 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Ellenőrzés
              </button>
              <button
                type="button"
                disabled={otaBusy}
                onClick={() => void handleMenuApplyOta()}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
              >
                <Download className="h-3 w-3" />
                Frissítés
              </button>
            </div>
            {otaActionMsg && (
              <div className="text-[10px] font-mono text-slate-700 leading-snug break-words">
                {otaActionMsg}
              </div>
            )}
          </div>
        </div>

        {/* Permanent Always-Visible Supervisor/Auditor Panel */}
        <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/70">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-slate-700" />
                {tr(lang, 'supervisorPanelTitle')}
              </span>
              <span
                className={`text-[11px] font-semibold ${
                  state.supervisor.status === 'nominal'
                    ? 'text-emerald-700'
                    : state.supervisor.status === 'warning'
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}
              >
                {state.supervisor.status === 'nominal'
                  ? tr(lang, 'supervisorNominal')
                  : state.supervisor.status === 'warning'
                  ? tr(lang, 'supervisorWarning')
                  : tr(lang, 'supervisorAlert')}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">{state.supervisor.lastSummary}</p>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums space-y-0.5">
              <div>
                {tr(lang, 'supervisorDiscrepancies')}: {state.supervisor.discrepanciesFound} · {tr(lang, 'supervisorSandboxTests')}: {state.supervisor.sandboxTestsPassed}
              </div>
              {state.supervisor.lastAuditAt && (
                <div>
                  {tr(lang, 'supervisorLastCheck')}: {new Date(state.supervisor.lastAuditAt).toLocaleTimeString()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/supervisor/audit', { method: 'POST' });
                await fetchState();
              }}
              className="w-full mt-1 px-2.5 py-1 text-[11px] font-medium border border-slate-300 bg-white rounded hover:bg-slate-100 text-slate-800"
            >
              {tr(lang, 'supervisorRunAudit')}
            </button>
          </div>

          {hardware && (
            <div className="pt-2 border-t border-slate-200 text-[11px] font-mono tabular-nums text-slate-600 flex justify-between">
              <span>CPU {hardware.cpuLoadPercent}%</span>
              <span>RAM {hardware.ramPercent}%</span>
              <span>{hardware.temperatureCelsius !== null ? `${hardware.temperatureCelsius}°C` : 'Linux'}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-600"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap truncate">
              {tr(lang, 'appName')} / {activeNavLabel}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 whitespace-nowrap">
            <span>
              {state.settings.hostPermissionsGranted
                ? tr(lang, 'hostPermGranted')
                : tr(lang, 'hostPermRestricted')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              ${state.settings.dailySpendUsd.toFixed(3)} / ${state.settings.dailyCostLimitUsd.toFixed(2)}
            </span>
            {state.settings.killSwitchActive && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-red-700 font-semibold">KILL SWITCH AKTÍV</span>
              </>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <PWAControls />
            {state.settings.webAuthEnabled && (
              <button
                type="button"
                onClick={() => void handleOperatorLogout()}
                title="LAN Zár / Kijelentkezés"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                Zárolás
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {tr(lang, 'approvalsPending')}: {state.approvals.filter((a) => a.status === 'pending').length}
            </button>
          </div>
        </header>

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

        <main className="flex-1 p-6 pb-20 lg:pb-6 overflow-y-auto">
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
              settings={state.settings}
              sandboxBackend={sandboxBackend}
              onRefreshState={fetchState}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView language={lang} settings={state.settings} onRefreshState={fetchState} />
          )}
        </main>
      </div>

      {/* M60: Mobile Sticky Bottom Nav Bar (compact <= 56px = 6.6% of 844px mobile viewport) */}
      <nav
        aria-label="Mobile Quick Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 h-14 bg-white border-t border-slate-200 px-1 flex items-center justify-around"
      >
        {(
          [
            { id: 'overview', label: 'Főoldal', icon: <LayoutDashboard className="h-4 w-4" /> },
            { id: 'swarm', label: 'Raj', icon: <MessageSquare className="h-4 w-4" /> },
            { id: 'workbench', label: 'Stúdió', icon: <Wrench className="h-4 w-4" /> },
            { id: 'ecosystem', label: 'Hub', icon: <Layers className="h-4 w-4" /> },
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
    </div>
  );
}
