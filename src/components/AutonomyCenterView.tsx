import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Lock,
  Network,
  OctagonAlert,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  Undo2,
  Unlock,
} from 'lucide-react';
import type {
  AutonomousGoalCycle,
  AutonomyDecisionRecord,
  CircuitBreakerTaskRecord,
  DeviceAdapterActionRecord,
  LanDeviceInventoryItem,
  PendingDeviceCredentialPrompt,
  SecuritySnapshot,
  WeeklySelfEvaluationReport,
  WorldModelEdge,
  WorldModelNode,
} from '../../shared/types';
import { useLocale } from '../locales/translations';

interface TotalAutonomyStatusResponse {
  totalAutonomyEnabled: boolean;
  fullAutonomyProfileEnabled: boolean;
  lockdownActive: boolean;
  lockdownReason: string | null;
  lockdownFilePresent: boolean;
  lockdownFilePath: string;
  guarantees: {
    appendOnlyAudit: {
      active: boolean;
      chainValid: boolean;
      entriesCount: number;
      dailyAnchorActive: boolean;
      lastAnchorDate: string | null;
    };
    emergencyLockdown: {
      active: boolean;
      lockedDown: boolean;
      channels: string[];
    };
    securityRestore: {
      active: boolean;
      snapshotsCount: number;
      latestSnapshotAt: string | null;
      autoWatchdogRollback: boolean;
    };
  };
  cloudBudget: {
    enabled: boolean;
    spendUsd: number;
    limitUsd: number;
    fallbackToOllama: boolean;
    ratioPct: number;
  };
  circuitBreakers: CircuitBreakerTaskRecord[];
  recentDecisions: AutonomyDecisionRecord[];
  snapshots: SecuritySnapshot[];
  exceptionQueueCount: number;
  worldModelNodes: WorldModelNode[];
  worldModelEdges: WorldModelEdge[];
  weeklyEvaluations: WeeklySelfEvaluationReport[];
  goalCycles: AutonomousGoalCycle[];
}

interface NetworkDevicesResponse {
  devices: LanDeviceInventoryItem[];
  pendingPrompts: PendingDeviceCredentialPrompt[];
  actionHistory: DeviceAdapterActionRecord[];
}

interface Props {
  onRefreshState: () => Promise<void>;
}

const ADAPTER_LABELS: Record<string, string> = {
  ssh: 'SSH',
  http_rest: 'HTTP/REST',
  mqtt: 'MQTT',
  home_assistant: 'Home Assistant',
  snmp: 'SNMP',
  openwrt_unifi: 'OpenWrt / UniFi',
  proxmox: 'Proxmox VE',
  synology_nas: 'Synology NAS',
  shelly_tasmota: 'Shelly / Tasmota',
  philips_hue: 'Philips Hue',
  ipp_printer: 'IPP',
  wol: 'Wake-on-LAN',
};

function isSecretFieldName(field: string): boolean {
  return /(pass|secret|token|key|community|pin)/i.test(field);
}

export const AutonomyCenterView: React.FC<Props> = ({ onRefreshState }) => {
  const { t, tx, intlLocale } = useLocale();
  const [statusData, setStatusData] = useState<TotalAutonomyStatusResponse | null>(null);
  const [networkData, setNetworkData] = useState<NetworkDevicesResponse>({
    devices: [],
    pendingPrompts: [],
    actionHistory: [],
  });
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Lockdown / Unlock
  const [lockReason, setLockReason] = useState('');
  const [unlockPw, setUnlockPw] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Goal Cycle & Benchmark
  const [goalInput, setGoalInput] = useState('');

  // LAN Discovery & Device Control
  const [scanTargetsInput, setScanTargetsInput] = useState('');
  const [promptCredInputs, setPromptCredInputs] = useState<Record<string, Record<string, string>>>({});
  const [deviceActionName, setDeviceActionName] = useState<Record<string, string>>({});
  const [deviceActionParams, setDeviceActionParams] = useState<Record<string, string>>({});
  const [deviceControlLog, setDeviceControlLog] = useState<string | null>(null);

  // Decision Log filter
  const [decQuery, setDecQuery] = useState('');
  const [decCategory, setDecCategory] = useState('');
  const [decHighImpact, setDecHighImpact] = useState(false);
  const [filteredDecisions, setFilteredDecisions] = useState<AutonomyDecisionRecord[] | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [stRes, netRes] = await Promise.all([
        fetch('/api/total-autonomy/status', { cache: 'no-store' }),
        fetch('/api/network/devices', { cache: 'no-store' }),
      ]);
      if (stRes.ok) {
        const stJson = (await stRes.json()) as TotalAutonomyStatusResponse;
        setStatusData(stJson);
      }
      if (netRes.ok) {
        const netJson = (await netRes.json()) as NetworkDevicesResponse;
        setNetworkData(netJson);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const searchDecisions = useCallback(async () => {
    const qs = new URLSearchParams();
    if (decQuery.trim()) qs.set('q', decQuery.trim());
    if (decCategory) qs.set('category', decCategory);
    if (decHighImpact) qs.set('highImpact', '1');
    const r = await fetch(`/api/total-autonomy/decisions?${qs.toString()}`, { cache: 'no-store' });
    if (r.ok) {
      const data = (await r.json()) as { decisions?: AutonomyDecisionRecord[] };
      setFilteredDecisions(data.decisions || []);
    }
  }, [decQuery, decCategory, decHighImpact]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchDecisions();
    }, 180);
    return () => clearTimeout(timer);
  }, [searchDecisions]);

  const categoryLabels: Record<string, string> = {
    '': tx('Összes kategória'),
    security_admin: tx('Biztonság / Admin'),
    code_selfmod: tx('Önfejlesztés / Kód'),
    device_control: tx('LAN Eszközvezérlés'),
    goal_loop: tx('Önálló Célciklus'),
    budget_failover: tx('Költség -> Ollama'),
    watchdog: tx('Biztonsági Watchdog'),
    circuit_breaker: tx('Megszakító (Circuit Breaker)'),
  };

  const handleLockdown = async () => {
    setBusyAction('lockdown');
    setBannerMsg(null);
    try {
      const res = await fetch('/api/total-autonomy/lockdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: lockReason.trim() || tx('Web UI Vészleállítás') }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; lockfilePath?: string };
      if (!res.ok) {
        setBannerMsg({ ok: false, text: body.error || `HTTP ${res.status}` });
      } else {
        setLockReason('');
        setBannerMsg({
          ok: true,
          text: tx(
            'Vészleállítás (LOCKDOWN) aktiválva ({0}). Minden autonóm végrehajtás és mutáló API hívás zárolva.',
            body.lockfilePath || 'LOCKDOWN'
          ),
        });
        await Promise.all([loadAll(), onRefreshState()]);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('unlock');
    setBannerMsg(null);
    try {
      const res = await fetch('/api/total-autonomy/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: unlockPw }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setBannerMsg({ ok: false, text: body.error || tx('Feloldás sikertelen (HTTP {0})', res.status) });
      } else {
        setUnlockPw('');
        setBannerMsg({ ok: true, text: tx('Vészleállítás feloldva a tulajdonos jelszavával.') });
        await Promise.all([loadAll(), onRefreshState()]);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleWatchdog = async () => {
    setBusyAction('watchdog');
    try {
      const res = await fetch('/api/total-autonomy/watchdog/run', { method: 'POST' });
      const data = (await res.json()) as { healthy?: boolean; rolledBack?: boolean; message?: string };
      setBannerMsg({
        ok: Boolean(data.healthy),
        text: data.message || (data.healthy ? tx('Biztonsági Watchdog rendben.') : tx('Watchdog hibát észlelt.')),
      });
      await Promise.all([loadAll(), onRefreshState()]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestoreSnapshot = async (stepsBack: number) => {
    setBusyAction(`restore-${stepsBack}`);
    try {
      const res = await fetch('/api/total-autonomy/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepsBack }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      setBannerMsg({
        ok: Boolean(res.ok && data.ok),
        text: data.message || data.error || tx('Visszaállítás lefutott.'),
      });
      await Promise.all([loadAll(), onRefreshState()]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiscover = async () => {
    setBusyAction('discover');
    setBannerMsg(null);
    try {
      const targets = scanTargetsInput
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch('/api/network/devices/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: targets.length > 0 ? targets : undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        discoveredCount?: number;
        newDevicesCount?: number;
        devices?: LanDeviceInventoryItem[];
        error?: string;
      };
      if (!res.ok) {
        setBannerMsg({ ok: false, text: data.error || tx('LAN felderítési hiba (HTTP {0})', res.status) });
      } else {
        setBannerMsg({
          ok: true,
          text: tx(
            'LAN felderítés kész: {0} eszköz vizsgálva, {1} eszköz az inventoryban ({2} új ismeretlen).',
            data.discoveredCount ?? 0,
            data.devices?.length ?? 0,
            data.newDevicesCount ?? 0
          ),
        });
        await Promise.all([loadAll(), onRefreshState()]);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSavePromptCreds = async (prompt: PendingDeviceCredentialPrompt) => {
    const fields = promptCredInputs[prompt.id] || {};
    setBusyAction(`cred-${prompt.id}`);
    try {
      const res = await fetch(`/api/network/devices/${encodeURIComponent(prompt.deviceId)}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: fields }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      setBannerMsg({
        ok: Boolean(res.ok && body.ok),
        text: body.message || body.error || tx('Hitelesítő adatok elmentve a titkosított széfbe.'),
      });
      setPromptCredInputs((prev) => {
        const copy = { ...prev };
        delete copy[prompt.id];
        return copy;
      });
      await Promise.all([loadAll(), onRefreshState()]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeviceControl = async (
    device: LanDeviceInventoryItem,
    mode: 'status' | 'read' | 'act',
    dryRun = false
  ) => {
    setBusyAction(`dev-${device.id}-${mode}`);
    setDeviceControlLog(null);
    try {
      let parsedParams: Record<string, unknown> = {};
      const rawParams = (deviceActionParams[device.id] || '').trim();
      if (rawParams) {
        try {
          parsedParams = JSON.parse(rawParams) as Record<string, unknown>;
        } catch {
          parsedParams = { command: rawParams, value: rawParams };
        }
      }
      const res = await fetch(`/api/network/devices/${encodeURIComponent(device.id)}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          action: deviceActionName[device.id]?.trim() || (mode === 'status' ? 'status' : mode === 'read' ? 'read' : 'toggle'),
          params: parsedParams,
          dryRun,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        summary?: string;
        error?: string;
        needsCredentials?: boolean;
        data?: unknown;
      };
      setDeviceControlLog(
        `[${device.ip} · ${device.adapterType}] ${data.message || data.summary || data.error || JSON.stringify(data.data || {})}`
      );
      await Promise.all([loadAll(), onRefreshState()]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleUndoDeviceAction = async (actionId: string) => {
    setBusyAction(`undo-${actionId}`);
    try {
      const res = await fetch(`/api/network/actions/${encodeURIComponent(actionId)}/undo`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; summary?: string; error?: string };
      setBannerMsg({
        ok: Boolean(res.ok && data.ok),
        text: data.message || data.summary || data.error || tx('Visszavonás lefutott.'),
      });
      await Promise.all([loadAll(), onRefreshState()]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleGoalCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;
    setBusyAction('goal-cycle');
    try {
      const res = await fetch('/api/total-autonomy/goal-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goalInput.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { cycle?: AutonomousGoalCycle; error?: string };
      if (!res.ok) {
        setBannerMsg({ ok: false, text: data.error || tx('Célciklus hiba.') });
      } else {
        setGoalInput('');
        setBannerMsg({
          ok: Boolean(data.cycle?.verifiedSuccess),
          text: tx(
            'Célciklus ({0}): {1}',
            String(data.cycle?.phase ?? ''),
            data.cycle?.verifierOutput || data.cycle?.goal || 'OK'
          ),
        });
        await Promise.all([loadAll(), onRefreshState(), searchDecisions()]);
      }
    } finally {
      setBusyAction(null);
    }
  };

  if (loading || !statusData) {
    return (
      <div className="p-6 text-xs text-slate-500 dark:text-slate-400 font-mono">
        {t('autonomyLoading')}
      </div>
    );
  }

  const decisionsToRender = filteredDecisions ?? statusData.recentDecisions;
  const latestBench = statusData.weeklyEvaluations[0];

  return (
    <div className="space-y-6">
      {/* Header + Emergency LOCKDOWN Strip */}
      <div
        className={`rounded-xl border p-5 flex flex-wrap items-center justify-between gap-4 ${
          statusData.lockdownActive
            ? 'bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-800'
            : statusData.totalAutonomyEnabled
            ? 'bg-white dark:bg-slate-900 border-red-300 dark:border-red-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <ShieldAlert
              className={`h-5 w-5 shrink-0 ${
                statusData.lockdownActive || statusData.totalAutonomyEnabled
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t('autonomyHeaderTitle')}
            </h2>
            <span
              className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                statusData.lockdownActive
                  ? 'bg-red-700 text-white border-red-800'
                  : statusData.totalAutonomyEnabled
                  ? 'bg-red-600 text-white border-red-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {statusData.lockdownActive
                ? t('autonomyModeLockdown')
                : statusData.totalAutonomyEnabled
                ? t('autonomyModeTotal')
                : t('autonomyModeSupervised')}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {t('autonomyHeaderSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('autonomyRefresh')}
          </button>
          {!statusData.lockdownActive && (
            <>
              <input
                type="text"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder={t('autonomyLockReasonPlaceholder')}
                className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={busyAction === 'lockdown'}
                onClick={() => void handleLockdown()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <OctagonAlert className="h-4 w-4" />
                {busyAction === 'lockdown' ? t('autonomyLocking') : t('autonomyLockBtn')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Unlock form when LOCKDOWN is active */}
      {statusData.lockdownActive && (
        <form
          onSubmit={handleUnlock}
          className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-0.5 text-xs text-red-900 dark:text-red-200">
            <div className="font-bold flex items-center gap-1.5">
              <Lock className="h-4 w-4 shrink-0" />
              {t('autonomyUnderLockdown')} — {statusData.lockdownReason || 'LOCKDOWN'}
            </div>
            <div className="font-mono text-[11px] opacity-90">
              Lockfile: {statusData.lockdownFilePath} · {statusData.lockdownFilePresent ? 'ON' : tx('memória-zár')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={unlockPw}
              onChange={(e) => setUnlockPw(e.target.value)}
              placeholder={t('autonomyUnlockPlaceholder')}
              className="px-3 py-1.5 text-xs border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-slate-900"
            />
            <button
              type="submit"
              disabled={busyAction === 'unlock'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Unlock className="h-3.5 w-3.5" />
              {busyAction === 'unlock' ? t('autonomyUnlocking') : t('autonomyUnlockBtn')}
            </button>
          </div>
        </form>
      )}

      {bannerMsg && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            bannerMsg.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          {bannerMsg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>{bannerMsg.text}</span>
        </div>
      )}

      {/* 3 Inviolable Guarantees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t('autonomyGuarantee1Title')}
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {t('autonomyGuarantee1Entries', statusData.guarantees.appendOnlyAudit.entriesCount)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
            {tx('Hash-lánc:')}{' '}
            {statusData.guarantees.appendOnlyAudit.chainValid
              ? t('autonomyGuarantee1Valid')
              : t('autonomyGuarantee1Broken')}{' '}
            · Telegram anchor: {statusData.guarantees.appendOnlyAudit.lastAnchorDate || tx('ütemezve')}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t('autonomyGuarantee2Title')}
            </span>
            <Lock className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {statusData.lockdownActive ? t('autonomyGuarantee2Locked') : t('autonomyGuarantee2Ready')}
          </div>
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
            Telegram /stop · CLI lockdown · Web UI · Lockfile
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t('autonomyGuarantee3Title')}
            </span>
            <button
              type="button"
              disabled={busyAction === 'watchdog'}
              onClick={() => void handleWatchdog()}
              className="px-2 py-0.5 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {busyAction === 'watchdog' ? '...' : t('autonomyGuarantee3WatchdogBtn')}
            </button>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {t('autonomyGuarantee3Snapshots', statusData.guarantees.securityRestore.snapshotsCount)}
          </div>
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
            {tx('Watchdog automata rollback')}:{' '}
            {statusData.guarantees.securityRestore.autoWatchdogRollback ? 'ON' : 'OFF'} ·{' '}
            {statusData.exceptionQueueCount}
          </div>
        </div>
      </div>

      {/* Cloud Failover Budget + Circuit Breaker + Autonomous Goal Loop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              {t('autonomyCloudBudgetTitle')}
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
              ${statusData.cloudBudget.spendUsd.toFixed(3)} / ${statusData.cloudBudget.limitUsd.toFixed(2)}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  statusData.cloudBudget.ratioPct >= 95
                    ? 'bg-red-600'
                    : statusData.cloudBudget.ratioPct >= 75
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, statusData.cloudBudget.ratioPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {t('autonomyFallbackOllama')}:{' '}
              <strong>{statusData.cloudBudget.fallbackToOllama ? 'ON' : 'OFF'}</strong>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('autonomyActiveCircuitBreakers')} ({statusData.circuitBreakers.length})
            </div>
            {statusData.circuitBreakers.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('autonomyNoCircuitBreakers')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {statusData.circuitBreakers.map((cb) => (
                  <div
                    key={cb.taskKey}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{cb.taskKey}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {cb.state.toUpperCase()} · err={cb.consecutiveFailures} · rollback={cb.rollbacksCount}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch('/api/total-autonomy/circuit-breaker/reset', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ taskKey: cb.taskKey }),
                        });
                        await Promise.all([loadAll(), onRefreshState()]);
                      }}
                      className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-600 rounded hover:bg-white dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                    >
                      {t('autonomyResetBtn')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Autonomous Goal Cycle & Weekly Benchmark */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Target className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              {t('autonomyGoalCycleTitle')}
            </h3>
            <button
              type="button"
              disabled={busyAction === 'benchmark'}
              onClick={async () => {
                setBusyAction('benchmark');
                try {
                  await fetch('/api/total-autonomy/benchmark/run', { method: 'POST' });
                  await Promise.all([loadAll(), onRefreshState()]);
                } finally {
                  setBusyAction(null);
                }
              }}
              className="px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {busyAction === 'benchmark' ? t('autonomyRunningBenchmark') : t('autonomyRunBenchmarkBtn')}
            </button>
          </div>

          <form onSubmit={handleGoalCycle} className="flex gap-2">
            <input
              type="text"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder={t('autonomyGoalPlaceholder')}
              className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={busyAction === 'goal-cycle' || !goalInput.trim() || statusData.lockdownActive}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              {busyAction === 'goal-cycle' ? t('autonomyRunningBenchmark') : t('autonomyGoalCycleBtn')}
            </button>
          </form>

          {latestBench && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs space-y-2">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span>{tx('Legutóbbi Heti Önértékelés')}</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                  {latestBench.successRatePct}% · {latestBench.verifiedTasks} ✓ · {latestBench.failedOrRolledBackTasks} ✕ · ${(latestBench.totalSpendUsd ?? 0).toFixed(4)} (${latestBench.avgCostPerTaskUsd.toFixed(4)})
                </span>
              </div>
              <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                {latestBench.recommendations.map((rec, i) => (
                  <div key={i}>• {rec}</div>
                ))}
              </div>
              {latestBench.autoGeneratedGoals && latestBench.autoGeneratedGoals.length > 0 && (
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[11px] text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{tx('Automatikusan generált fejlesztési célok (Kanban):')} </span>
                  {latestBench.autoGeneratedGoals.join(' · ')}
                </div>
              )}
              {latestBench.solvedItems && latestBench.solvedItems.length > 0 && (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  <span className="font-semibold">{tx('Összesítve')} ✓: </span>
                  {latestBench.solvedItems.slice(0, 3).join(' | ')}
                </div>
              )}
              {latestBench.failedItems && latestBench.failedItems.length > 0 && (
                <div className="text-[11px] text-red-700 dark:text-red-400">
                  <span className="font-semibold">{tx('Sikertelen / Visszaállított:')} </span>
                  {latestBench.failedItems.slice(0, 3).join(' | ')}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {statusData.goalCycles.slice(0, 6).map((gc) => (
              <div
                key={gc.id}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{gc.goal}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {gc.verifierOutput || gc.plannerNotes || gc.phase}
                  </div>
                </div>
                <span
                  className={`font-mono text-[11px] font-semibold shrink-0 ${
                    gc.verifiedSuccess ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {gc.verifiedSuccess ? 'VERIFIED' : gc.phase.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* LAN Discovery & 12-Adapter Device Control */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Network className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              {t('autonomyLanDiscoveryTitle')}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('autonomyLanDiscoveryDesc')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={scanTargetsInput}
              onChange={(e) => setScanTargetsInput(e.target.value)}
              placeholder={tx('Opc. cél IP-k (pl. 192.168.1.1, 192.168.1.50)')}
              className="w-full sm:w-80 px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
            <button
              type="button"
              disabled={busyAction === 'discover' || statusData.lockdownActive}
              onClick={() => void handleDiscover()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'discover' ? 'animate-spin' : ''}`} />
              {busyAction === 'discover' ? t('autonomyLanScanning') : t('autonomyLanScanBtn')}
            </button>
          </div>
        </div>

        {/* Missing Device Credentials Prompts */}
        {networkData.pendingPrompts.length > 0 && (
          <div className="space-y-2.5">
            {networkData.pendingPrompts.map((prompt) => {
              const fields = promptCredInputs[prompt.id] || {};
              return (
                <div
                  key={prompt.id}
                  className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                      <KeyRound className="h-4 w-4 shrink-0" />
                      {prompt.message} ({prompt.ip} · {ADAPTER_LABELS[prompt.adapterType] || prompt.adapterType})
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/network/prompts/${encodeURIComponent(prompt.id)}/dismiss`, { method: 'POST' });
                        await loadAll();
                      }}
                      className="text-[11px] text-amber-800 dark:text-amber-300 hover:underline"
                    >
                      {tx('Mellőzés')}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {prompt.requiredFields.map((field) => (
                      <input
                        key={field}
                        type={isSecretFieldName(field) ? 'password' : 'text'}
                        value={fields[field] || ''}
                        onChange={(e) =>
                          setPromptCredInputs((prev) => ({
                            ...prev,
                            [prompt.id]: { ...(prev[prompt.id] || {}), [field]: e.target.value },
                          }))
                        }
                        placeholder={field}
                        className="px-2.5 py-1.5 text-xs font-mono border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-900"
                      />
                    ))}
                    <button
                      type="button"
                      disabled={busyAction === `cred-${prompt.id}`}
                      onClick={() => void handleSavePromptCreds(prompt)}
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-800 text-white rounded hover:bg-amber-900 whitespace-nowrap shrink-0"
                    >
                      {tx('Mentés Széfbe')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deviceControlLog && (
          <pre className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono whitespace-pre-wrap">
            {deviceControlLog}
          </pre>
        )}

        {/* Inventory Grid */}
        {networkData.devices.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 py-2">
            {tx('Még nincs felderített helyi eszköz. Indíts LAN felderítést, vagy adj meg belső IP-címet.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {networkData.devices.map((dev) => (
              <div
                key={dev.id}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {dev.hostname || dev.ip} · <span className="font-mono">{dev.ip}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                      {dev.vendor} ({dev.mac}) · {ADAPTER_LABELS[dev.adapterType] || dev.adapterType}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold shrink-0 ${
                      dev.status === 'online'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : dev.status === 'needs_credentials'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {dev.status === 'online'
                      ? 'ONLINE'
                      : dev.status === 'needs_credentials'
                      ? tx('HITELESÍTÉS KELL')
                      : dev.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <input
                    type="text"
                    value={deviceActionName[dev.id] || ''}
                    onChange={(e) => setDeviceActionName((p) => ({ ...p, [dev.id]: e.target.value }))}
                    placeholder={tx('Művelet (pl. toggle, status)')}
                    className="w-32 px-2 py-1 text-[11px] font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                  />
                  <input
                    type="text"
                    value={deviceActionParams[dev.id] || ''}
                    onChange={(e) => setDeviceActionParams((p) => ({ ...p, [dev.id]: e.target.value }))}
                    placeholder={tx('Params JSON (opc.)')}
                    className="flex-1 min-w-28 px-2 py-1 text-[11px] font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleDeviceControl(dev, 'status')}
                    className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {tx('Állapot')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeviceControl(dev, 'read')}
                    className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {tx('Olvasás')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeviceControl(dev, 'act', true)}
                    className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Dry-Run
                  </button>
                  <button
                    type="button"
                    disabled={statusData.lockdownActive}
                    onClick={() => void handleDeviceControl(dev, 'act', false)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {tx('Végrehajtás')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Device Action History with 1-Click Undo */}
        {networkData.actionHistory.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {tx('Legutóbbi Eszközműveletek & Visszavonás')}
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {networkData.actionHistory.slice(0, 12).map((act) => (
                <div
                  key={act.id}
                  className="p-2 rounded border border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-semibold">{act.adapterType}</span> ·{' '}
                    <span className="font-mono">{act.action}</span>{' '}
                    {act.dryRun ? '(dry-run) ' : ''}
                    — <span className="text-slate-600 dark:text-slate-400">{act.resultSummary}</span>
                  </div>
                  {!act.dryRun && !act.undone && act.ok && act.priorState && (
                    <button
                      type="button"
                      disabled={busyAction === `undo-${act.id}`}
                      onClick={() => void handleUndoDeviceAction(act.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <Undo2 className="h-3 w-3" />
                      {tx('Visszavonás')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Security Snapshots & World Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <RotateCcw className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            {t('autonomySnapshotsTitle')} ({statusData.snapshots.length})
          </h3>
          {statusData.snapshots.length === 0 ? (
            <div className="text-xs text-slate-500">{tx('Még nincs mentett biztonsági pillanatkép.')}</div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {statusData.snapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{snap.reason}</div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      #{idx + 1} · {snap.actor} · {new Date(snap.createdAt).toLocaleString(intlLocale)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === `restore-${idx + 1}`}
                    onClick={() => void handleRestoreSnapshot(idx + 1)}
                    className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {tx('Visszaállítás')} ({idx + 1})
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              {t('autonomyWorldModelTitle')} ({statusData.worldModelNodes.length})
            </h3>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/total-autonomy/world-model/refresh', { method: 'POST' });
                await loadAll();
              }}
              className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {t('autonomyRefresh')}
            </button>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {statusData.worldModelNodes.slice(0, 25).map((node) => (
              <div
                key={node.id}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[11px] text-slate-500">[{node.kind}]</span>{' '}
                  <span className="font-medium">{node.label}</span>
                  {node.detail && <div className="text-[11px] text-slate-500 truncate">{node.detail}</div>}
                </div>
                <span
                  className={`font-mono text-[11px] font-semibold shrink-0 ${
                    node.status === 'critical'
                      ? 'text-red-700 dark:text-red-400'
                      : node.status === 'warning'
                      ? 'text-amber-700 dark:text-amber-400'
                      : node.status === 'offline'
                      ? 'text-slate-500'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {node.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Searchable Autonomy Decision Log */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Search className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            {t('autonomyDecisionLogTitle')} ({decisionsToRender.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={decQuery}
              onChange={(e) => setDecQuery(e.target.value)}
              placeholder={tx('Keresés döntésben, indoklásban...')}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
            <select
              value={decCategory}
              onChange={(e) => setDecCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            >
              {Object.entries(categoryLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={decHighImpact}
                onChange={(e) => setDecHighImpact(e.target.checked)}
              />
              <span>{tx('Csak nagy hatású')}</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {decisionsToRender.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">{tx('Nincs a szűrőnek megfelelő döntési bejegyzés.')}</div>
          ) : (
            decisionsToRender.map((dec) => (
              <div
                key={dec.id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-[11px] text-slate-500 me-1.5">[{dec.category}]</span>
                    {dec.decision}
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {dec.outcome.toUpperCase()} · {new Date(dec.createdAt).toLocaleString(intlLocale)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {tx('Indoklás:')} {dec.rationale}
                  {dec.rejectedAlternatives.length > 0 && (
                    <span> · [{dec.rejectedAlternatives.join(', ')}]</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
