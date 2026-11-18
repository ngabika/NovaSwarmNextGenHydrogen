import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Brain,
  Cpu,
  Menu,
  MessageSquare,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';
import type { HardwareMetrics, NovaSwarmState } from '../shared/types';
import { McpSkillsView } from './components/McpSkillsView';
import { MemoryDreamingView } from './components/MemoryDreamingView';
import { ModelsRouterView } from './components/ModelsRouterView';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OrgAgentsView } from './components/OrgAgentsView';
import { SettingsView } from './components/SettingsView';
import { SwarmChatView } from './components/SwarmChatView';
import { SystemOpsView } from './components/SystemOpsView';
import { TerminalView, type TerminalSessionSummary } from './components/TerminalView';
import { getLanguageDir, tr } from './locales/translations';

type TabId =
  | 'swarm'
  | 'agents'
  | 'memory'
  | 'models'
  | 'mcp'
  | 'terminal'
  | 'system'
  | 'settings';

export default function App() {
  const [state, setState] = useState<NovaSwarmState | null>(null);
  const [hardware, setHardware] = useState<HardwareMetrics | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('swarm');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const fetchState = useCallback(async () => {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const data = (await res.json()) as {
      state: NovaSwarmState;
      hardware: HardwareMetrics;
      terminalSessions: TerminalSessionSummary[];
    };
    setState(data.state);
    setHardware(data.hardware);
    setTerminalSessions(data.terminalSessions || []);
  }, []);

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        await fetch('/api/onboarding/autostart', { method: 'POST' });
      }
      await fetchState();
    };
    void init();
  }, [fetchState]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/events`);
    ws.onmessage = () => {
      void fetchState();
    };
    const poll = setInterval(() => {
      void fetchState();
    }, 10000);
    return () => {
      ws.close();
      clearInterval(poll);
    };
  }, [fetchState]);

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        NovaSwarm betöltése...
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
    { id: 'swarm', label: tr(lang, 'navSwarm'), icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'agents', label: tr(lang, 'navAgents'), icon: <Bot className="h-4 w-4" /> },
    { id: 'memory', label: tr(lang, 'navMemory'), icon: <Brain className="h-4 w-4" /> },
    { id: 'models', label: tr(lang, 'navModels'), icon: <Cpu className="h-4 w-4" /> },
    { id: 'mcp', label: tr(lang, 'navMcp'), icon: <Plug className="h-4 w-4" /> },
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
        <div>
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

          <nav className="p-3 space-y-1" aria-label="Main Navigation">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
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
        </div>

        {/* Permanent Always-Visible Supervisor/Auditor Panel (Section 10.3) */}
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
        {/* Clean 3-zone Top Bar */}
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

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {tr(lang, 'approvalsPending')}: {state.approvals.filter((a) => a.status === 'pending').length}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'swarm' && (
            <SwarmChatView
              language={lang}
              agents={state.agents}
              threads={state.threads}
              messages={state.messages}
              kanban={state.kanban}
              ttsEnabled={state.settings.ttsEnabled}
              onRefreshState={fetchState}
            />
          )}
          {activeTab === 'agents' && (
            <OrgAgentsView language={lang} agents={state.agents} onRefreshState={fetchState} />
          )}
          {activeTab === 'memory' && (
            <MemoryDreamingView
              language={lang}
              memories={state.memories}
              dreamJournal={state.dreamJournal}
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
              onRefreshState={fetchState}
            />
          )}
          {activeTab === 'mcp' && (
            <McpSkillsView
              language={lang}
              mcpServers={state.mcpServers}
              skills={state.skills}
              onRefreshState={fetchState}
            />
          )}
          {activeTab === 'terminal' && (
            <TerminalView
              language={lang}
              hostPermissionsGranted={state.settings.hostPermissionsGranted}
              sessions={terminalSessions}
              onRefreshState={fetchState}
              onOpenSettings={() => setActiveTab('settings')}
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
              onRefreshState={fetchState}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView language={lang} settings={state.settings} onRefreshState={fetchState} />
          )}
        </main>
      </div>
    </div>
  );
}
