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
  ssh: 'SSH (Linux/szerver)',
  http_rest: 'HTTP/REST',
  mqtt: 'MQTT',
  home_assistant: 'Home Assistant',
  snmp: 'SNMP (csak olvasás)',
  openwrt_unifi: 'OpenWrt / UniFi',
  proxmox: 'Proxmox VE',
  synology_nas: 'Synology NAS',
  shelly_tasmota: 'Shelly / Tasmota',
  philips_hue: 'Philips Hue',
  ipp_printer: 'IPP Nyomtató',
  wol: 'Wake-on-LAN',
};

const CATEGORY_LABELS: Record<string, string> = {
  '': 'Összes kategória',
  security_admin: 'Biztonság / Admin',
  code_selfmod: 'Önfejlesztés / Kód',
  device_control: 'LAN Eszközvezérlés',
  goal_loop: 'Önálló Célciklus',
  budget_failover: 'Költség -> Ollama',
  watchdog: 'Security Watchdog',
  circuit_breaker: 'Circuit Breaker',
};

function isSecretFieldName(field: string): boolean {
  return /(pass|secret|token|key|community|pin)/i.test(field);
}

export const AutonomyCenterView: React.FC<Props> = ({ onRefreshState }) => {
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

  const handleLockdown = async () => {
    setBusyAction('lockdown');
    setBannerMsg(null);
    try {
      const res = await fetch('/api/total-autonomy/lockdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: lockReason.trim() || 'Web UI Vészleállítás' }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; lockfilePath?: string };
      if (!res.ok) {
        setBannerMsg({ ok: false, text: body.error || `Hiba (HTTP ${res.status})` });
      } else {
        setLockReason('');
        setBannerMsg({
          ok: true,
          text: `Vészleállítás (LOCKDOWN) aktiválva (${body.lockfilePath || 'LOCKDOWN'}). Minden autonóm végrehajtás és mutáló API hívás zárolva.`,
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
        setBannerMsg({ ok: false, text: body.error || `Feloldás sikertelen (HTTP ${res.status})` });
      } else {
        setUnlockPw('');
        setBannerMsg({ ok: true, text: 'Vészleállítás feloldva a tulajdonos jelszavával.' });
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
        text: data.message || (data.healthy ? 'Biztonsági Watchdog rendben.' : 'Watchdog hibát észlelt.'),
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
        text: data.message || data.error || 'Visszaállítás lefutott.',
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
        setBannerMsg({ ok: false, text: data.error || `LAN felderítési hiba (HTTP ${res.status})` });
      } else {
        setBannerMsg({
          ok: true,
          text: `LAN felderítés kész: ${data.discoveredCount ?? 0} eszköz vizsgálva, ${data.devices?.length ?? 0} eszköz az inventoryban (${data.newDevicesCount ?? 0} új ismeretlen).`,
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
        text: body.message || body.error || 'Hitelesítő adatok elmentve a titkosított széfbe.',
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
        text: data.message || data.summary || data.error || 'Visszavonás lefutott.',
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
        setBannerMsg({ ok: false, text: data.error || 'Célciklus hiba.' });
      } else {
        setGoalInput('');
        setBannerMsg({
          ok: Boolean(data.cycle?.verifiedSuccess),
          text: `Célciklus (${data.cycle?.phase}): ${data.cycle?.verifierOutput || data.cycle?.goal || 'kész'}`,
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
        Autonómia központ betöltése...
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
              Autonómia Központ &amp; LAN Vezérlő
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
                ? 'LOCKDOWN AKTÍV'
                : statusData.totalAutonomyEnabled
                ? 'TOTÁLIS AUTONÓMIA'
                : 'FELÜGYELT MÓD'}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Három sérthetetlen garancia: Append-only Audit + Napi Anchor · Többcsatornás Vészleállítás · Automatikus Visszaállítási Pontok + Watchdog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Frissítés
          </button>
          {!statusData.lockdownActive && (
            <>
              <input
                type="text"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Vészleállítás oka (opc.)"
                className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={busyAction === 'lockdown'}
                onClick={() => void handleLockdown()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <OctagonAlert className="h-4 w-4" />
                {busyAction === 'lockdown' ? 'Zárolás...' : 'Vészleállítás (LOCKDOWN)'}
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
              Rendszer Vészleállítás Alatt — {statusData.lockdownReason || 'LOCKDOWN aktív'}
            </div>
            <div className="font-mono text-[11px] opacity-90">
              Lockfile: {statusData.lockdownFilePath} ({statusData.lockdownFilePresent ? 'jelen van' : 'memória-zár'}) · Feloldás kizárólag a tulajdonos hitelesített jelszavával lehetséges.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={unlockPw}
              onChange={(e) => setUnlockPw(e.target.value)}
              placeholder="Operátori jelszó a feloldáshoz..."
              className="px-3 py-1.5 text-xs border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-slate-900"
            />
            <button
              type="submit"
              disabled={busyAction === 'unlock'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Unlock className="h-3.5 w-3.5" />
              {busyAction === 'unlock' ? 'Feloldás...' : 'LOCKDOWN Feloldása'}
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
              1. Append-only Audit &amp; Anchor
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {statusData.guarantees.appendOnlyAudit.entriesCount} bejegyzés
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
            Hash-lánc: {statusData.guarantees.appendOnlyAudit.chainValid ? 'ÉP' : 'SÉRÜLT'} · Napi Telegram anchor:{' '}
            {statusData.guarantees.appendOnlyAudit.lastAnchorDate || 'ütemezve'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              2. Vészleállítás (4 csatorna)
            </span>
            <Lock className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {statusData.lockdownActive ? 'ZÁROLVA' : 'KÉSZENLÉT'}
          </div>
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
            Telegram /stop · CLI lockdown · Web UI · Lockfile
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              3. Pillanatképek &amp; Watchdog
            </span>
            <button
              type="button"
              disabled={busyAction === 'watchdog'}
              onClick={() => void handleWatchdog()}
              className="px-2 py-0.5 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {busyAction === 'watchdog' ? 'Fut...' : 'Watchdog Próba'}
            </button>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {statusData.guarantees.securityRestore.snapshotsCount} pont
          </div>
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
            Automata rollback: {statusData.guarantees.securityRestore.autoWatchdogRollback ? 'BE' : 'KI'} · Kivételek sorban:{' '}
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
              Napi Felhő Keret &amp; Circuit Breaker
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
              Limit elérésekor automata átállás helyi Ollamára:{' '}
              <strong>{statusData.cloudBudget.fallbackToOllama ? 'BEKAPCSOLVA' : 'KI'}</strong>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Aktív Circuit Breakerek ({statusData.circuitBreakers.length})
            </div>
            {statusData.circuitBreakers.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Nincs lekapcsolt (open) feladat-áramkör.
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
                        Állapot: {cb.state.toUpperCase()} · Hibák: {cb.consecutiveFailures} · Rollback: {cb.rollbacksCount}
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
                      Nullázás
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
              Önálló Cél-végrehajtó Ciklus &amp; Heti Önértékelés
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
              {busyAction === 'benchmark' ? 'Értékelés...' : 'Heti Benchmark Futtatása'}
            </button>
          </div>

          <form onSubmit={handleGoalCycle} className="flex gap-2">
            <input
              type="text"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Cél megadása (cél -> terv -> végrehajtás -> verifikáció -> reflexió)..."
              className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={busyAction === 'goal-cycle' || !goalInput.trim() || statusData.lockdownActive}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              {busyAction === 'goal-cycle' ? 'Fut...' : 'Célciklus'}
            </button>
          </form>

          {latestBench && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>Legutóbbi Önértékelés</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  Sikerarány: {latestBench.successRatePct}% · Átlag költség: ${latestBench.avgCostPerTaskUsd.toFixed(4)}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {latestBench.recommendations[0] || 'Minden mutató névleges.'}
              </div>
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
              Helyi Hálózati Felderítés (RFC1918) &amp; 12-Adapteres Eszközvezérlő
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Kizárólag privát LAN IP-címekre korlátozva. Eszközjelszót soha nem találgat — hiányzó belépésnél kártyát hoz létre.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={scanTargetsInput}
              onChange={(e) => setScanTargetsInput(e.target.value)}
              placeholder="Opc. cél IP-k (pl. 192.168.1.1, 192.168.1.50)"
              className="w-full sm:w-80 px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
            <button
              type="button"
              disabled={busyAction === 'discover' || statusData.lockdownActive}
              onClick={() => void handleDiscover()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'discover' ? 'animate-spin' : ''}`} />
              {busyAction === 'discover' ? 'Szkennelés...' : 'LAN Felderítés Indítása'}
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
                      Mellőzés
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
                      Mentés Széfbe
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
            Még nincs felderített helyi eszköz. Indíts LAN felderítést, vagy adj meg belső IP-címet.
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
                      ? 'HITELESÍTÉS KELL'
                      : dev.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <input
                    type="text"
                    value={deviceActionName[dev.id] || ''}
                    onChange={(e) => setDeviceActionName((p) => ({ ...p, [dev.id]: e.target.value }))}
                    placeholder="Művelet (pl. toggle, status)"
                    className="w-32 px-2 py-1 text-[11px] font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                  />
                  <input
                    type="text"
                    value={deviceActionParams[dev.id] || ''}
                    onChange={(e) => setDeviceActionParams((p) => ({ ...p, [dev.id]: e.target.value }))}
                    placeholder='Params JSON (opc.)'
                    className="flex-1 min-w-28 px-2 py-1 text-[11px] font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleDeviceControl(dev, 'status')}
                    className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Állapot
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeviceControl(dev, 'read')}
                    className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Olvasás
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
                    Végrehajtás
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
              Legutóbbi Eszközműveletek &amp; Visszavonás
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
                      Undo
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
            Biztonsági Visszaállítási Pontok ({statusData.snapshots.length})
          </h3>
          {statusData.snapshots.length === 0 ? (
            <div className="text-xs text-slate-500">Még nincs mentett biztonsági pillanatkép.</div>
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
                      #{idx + 1} · {snap.actor} · {new Date(snap.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === `restore-${idx + 1}`}
                    onClick={() => void handleRestoreSnapshot(idx + 1)}
                    className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Visszaállítás ({idx + 1})
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
              Belső Világmodell ({statusData.worldModelNodes.length} elem)
            </h3>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/total-autonomy/world-model/refresh', { method: 'POST' });
                await loadAll();
              }}
              className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Frissítés
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
            Kereshető Autonóm Döntési Napló ({decisionsToRender.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={decQuery}
              onChange={(e) => setDecQuery(e.target.value)}
              placeholder="Keresés döntésben, indoklásban..."
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
            <select
              value={decCategory}
              onChange={(e) => setDecCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
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
              <span>Csak nagy hatású</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {decisionsToRender.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">Nincs a szűrőnek megfelelő döntési bejegyzés.</div>
          ) : (
            decisionsToRender.map((dec) => (
              <div
                key={dec.id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-[11px] text-slate-500 mr-1.5">[{dec.category}]</span>
                    {dec.decision}
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {dec.outcome.toUpperCase()} · {new Date(dec.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  Indoklás: {dec.rationale}
                  {dec.rejectedAlternatives.length > 0 && (
                    <span> · Elvetve: {dec.rejectedAlternatives.join(', ')}</span>
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
