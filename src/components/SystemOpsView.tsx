import React, { useEffect, useState } from 'react';
import {
  Activity,
  Box,
  Check,
  Clock,
  Cpu,
  Download,
  HardDrive,
  HeartPulse,
  History,
  Lock,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Stethoscope,
  Terminal,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type {
  ApprovalRequest,
  AuditLogEntry,
  BackupPoint,
  CronTask,
  HardwareMetrics,
  LanguageCode,
  OtaVersionStatus,
  Settings,
  SshHostProfile,
  SslWatchTarget,
  UptimeTarget,
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  hardware: HardwareMetrics | null;
  approvals: ApprovalRequest[];
  cronTasks: CronTask[];
  backups: BackupPoint[];
  auditLogs: AuditLogEntry[];
  uptimeTargets: UptimeTarget[];
  sslTargets: SslWatchTarget[];
  sshProfiles: SshHostProfile[];
  settings: Settings;
  sandboxBackend?: string;
  onRefreshState: () => Promise<void>;
}

export const SystemOpsView: React.FC<Props> = ({
  language,
  hardware,
  approvals,
  cronTasks,
  backups,
  auditLogs,
  uptimeTargets,
  sslTargets,
  sshProfiles,
  settings,
  sandboxBackend,
  onRefreshState,
}) => {
  const [subTab, setSubTab] = useState<'ops' | 'selfmod' | 'infra' | 'diagnostics'>('ops');

  const [ota, setOta] = useState<OtaVersionStatus | null>(null);
  const [otaDiff, setOtaDiff] = useState<string | null>(null);
  const [otaApplyMsg, setOtaApplyMsg] = useState<string | null>(null);
  const [docs, setDocs] = useState<string>('');
  const [gitHistory, setGitHistory] = useState<Array<{ hash: string; date: string; message: string }>>([]);
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null);
  const [proofResult, setProofResult] = useState<string | null>(null);

  // Cron & Telegram
  const [cronName, setCronName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 8 * * *');
  const [cronPrompt, setCronPrompt] = useState('');
  const [selfModPath, setSelfModPath] = useState('src/components/CustomNote.txt');
  const [selfModContent, setSelfModContent] = useState('NovaSwarm self-modification test');
  const [selfModMsg, setSelfModMsg] = useState<string | null>(null);
  const [tgCmd, setTgCmd] = useState('/statusz');
  const [tgReply, setTgReply] = useState<string | null>(null);

  // Heartbeat, Uptime & SSL
  const [hbRunning, setHbRunning] = useState(false);
  const [hbResult, setHbResult] = useState<string | null>(null);
  const [upName, setUpName] = useState('');
  const [upUrl, setUpUrl] = useState('');
  const [upExpect, setUpExpect] = useState('');
  const [upChecking, setUpChecking] = useState(false);
  const [sslHost, setSslHost] = useState('');
  const [sslPort, setSslPort] = useState(443);

  // Infra (Ú9-Ú15)
  const [dockerData, setDockerData] = useState<{
    available: boolean;
    containers: Array<{ id: string; name: string; image: string; status: string; state: string }>;
    error?: string;
  } | null>(null);
  const [dockerLogs, setDockerLogs] = useState<string | null>(null);
  const [systemdData, setSystemdData] = useState<{
    available: boolean;
    units: Array<{ unit: string; active: string; sub: string; description: string }>;
    error?: string;
  } | null>(null);
  const [systemdAnalysis, setSystemdAnalysis] = useState<string | null>(null);
  const [lanData, setLanData] = useState<{ devices: Array<{ ip: string; mac: string; iface: string }>; source: string } | null>(null);
  const [vpnData, setVpnData] = useState<{ tailscale?: { status: string; details: string }; wireguard?: { status: string; details: string } } | null>(null);
  const [diskData, setDiskData] = useState<{ filesystems: Array<{ filesystem: string; size: string; used: string; avail: string; usePercent: string; mount: string }> } | null>(null);
  const [rsyncTarget, setRsyncTarget] = useState(settings.backupRsyncTarget || '');
  const [infraMsg, setInfraMsg] = useState<string | null>(null);

  // SSH Fleet (Ú15)
  const [sshName, setSshName] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('pi');
  const [sshCmd, setSshCmd] = useState('uptime && df -h');
  const [sshOut, setSshOut] = useState<string | null>(null);

  // Diagnostics & Safe .env Editor (M25, M26)
  const [diagData, setDiagData] = useState<{
    nodeVersion: string;
    platform: string;
    arch: string;
    checks: Array<{ name: string; ok: boolean; details: string }>;
  } | null>(null);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [envMsg, setEnvMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/system/docs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { documentation?: string } | null) => {
        if (d?.documentation) setDocs(d.documentation);
      })
      .catch(() => {});
    void fetch('/api/selfmod/history')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { commits?: typeof gitHistory } | null) => {
        if (d?.commits) setGitHistory(d.commits);
      })
      .catch(() => {});
  }, []);

  const loadInfra = async () => {
    const [dk, sd, lan, vpn, dsk] = await Promise.all([
      fetch('/api/infra/docker').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/systemd').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/lan').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/vpn').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/disks').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (dk) setDockerData(dk);
    if (sd) setSystemdData(sd);
    if (lan) setLanData(lan);
    if (vpn) setVpnData(vpn);
    if (dsk) setDiskData(dsk);
  };

  const loadDiagAndEnv = async () => {
    const [dg, ev] = await Promise.all([
      fetch('/api/system/diagnostics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/system/env').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (dg) setDiagData(dg);
    if (ev?.vars) setEnvVars(ev.vars);
  };

  useEffect(() => {
    if (subTab === 'infra') void loadInfra();
    if (subTab === 'diagnostics') void loadDiagAndEnv();
  }, [subTab]);

  const handleResolveApproval = async (id: string, decision: 'approved' | 'rejected') => {
    await fetch(`/api/approvals/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    await onRefreshState();
  };

  const handleCreateBackup = async () => {
    await fetch('/api/system/backup', { method: 'POST' });
    await onRefreshState();
  };

  const handleRestoreBackup = async (id: string) => {
    await fetch(`/api/system/restore/${id}`, { method: 'POST' });
    await onRefreshState();
  };

  const handleCheckOta = async () => {
    const res = await fetch('/api/system/ota');
    setOta((await res.json()) as OtaVersionStatus);
  };

  const handleFetchOtaDiff = async () => {
    const res = await fetch('/api/system/ota/diff');
    const data = (await res.json()) as { available: boolean; diffText: string; summary: string };
    setOtaDiff(`${data.summary}\n${data.diffText}`.trim());
  };

  const handleApplyOta = async () => {
    setOtaApplyMsg('Frissítés folyamatban...');
    const res = await fetch('/api/system/ota/apply', { method: 'POST' });
    const data = (await res.json()) as { ok: boolean; message: string };
    setOtaApplyMsg(data.message);
    await handleCheckOta();
    await onRefreshState();
  };

  const handleOsUpgrade = async () => {
    await fetch('/api/system/os-upgrade', { method: 'POST' });
    await onRefreshState();
  };

  const handleDestructiveProof = async () => {
    const res = await fetch('/api/supervisor/destructive-proof', { method: 'POST' });
    const data = (await res.json()) as {
      proofPassed: boolean;
      sentinelStillExists: boolean;
      sandboxResult: { isolationMode: string };
    };
    setProofResult(
      `Destruktív sandbox bizonyíték: ${data.proofPassed ? 'SIKERES' : 'SIKERTELEN'} | Mód: ${data.sandboxResult.isolationMode} | Őrszem fájl érintetlen: ${data.sentinelStillExists}`
    );
    await onRefreshState();
  };

  const handleSelfMod = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/selfmod/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPath: selfModPath,
        newContent: selfModContent,
        commitMessage: `selfmod: update ${selfModPath}`,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    setSelfModMsg(data.message || data.error || 'Done');
    await onRefreshState();
  };

  const handleInspectCommit = async (hash: string) => {
    const res = await fetch(`/api/selfmod/diff/${hash}`);
    const data = (await res.json()) as { diff?: string };
    setSelectedDiff(data.diff || 'Nincs elérhető diff.');
  };

  const handleRollbackCommit = async (hash: string) => {
    const res = await fetch('/api/selfmod/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    setSelfModMsg(data.message || data.error || 'Rollback kész.');
    await onRefreshState();
  };

  const handleAddCron = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cronName.trim() || !cronPrompt.trim()) return;
    await fetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cronName, cronExpression: cronExpr, prompt: cronPrompt }),
    });
    setCronName('');
    setCronPrompt('');
    await onRefreshState();
  };

  const handleTelegramCmd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/telegram/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: tgCmd }),
    });
    const data = (await res.json()) as { reply?: string; error?: string };
    setTgReply(data.reply || data.error || '');
    await onRefreshState();
  };

  const handleRunHeartbeat = async () => {
    setHbRunning(true);
    setHbResult(null);
    try {
      const res = await fetch('/api/heartbeat/run', { method: 'POST' });
      const data = (await res.json()) as { summary: string };
      setHbResult(data.summary);
      await onRefreshState();
    } finally {
      setHbRunning(false);
    }
  };

  const handleAddUptimeTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upName.trim() || !upUrl.trim()) return;
    await fetch('/api/uptime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: upName.trim(),
        url: upUrl.trim(),
        expectedText: upExpect.trim() || undefined,
      }),
    });
    setUpName('');
    setUpUrl('');
    setUpExpect('');
    await onRefreshState();
  };

  const handleRunUptimeChecks = async () => {
    setUpChecking(true);
    try {
      await fetch('/api/uptime/run', { method: 'POST' });
      await onRefreshState();
    } finally {
      setUpChecking(false);
    }
  };

  const handleAddSsl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sslHost.trim()) return;
    await fetch('/api/infra/ssl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: sslHost.trim(), port: sslPort }),
    });
    setSslHost('');
    await onRefreshState();
  };

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              { id: 'ops', label: 'Felügyelet, Uptime, SSL & Mentés' },
              { id: 'selfmod', label: 'Önfejlesztés, Git Diff & OTA' },
              { id: 'infra', label: 'Infra: Docker · Systemd · SSH · LAN/VPN' },
              { id: 'diagnostics', label: 'Diagnosztika · .env · Cron · Audit Export' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Hardware Telemetry */}
      {hardware && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-600" />
              Valós Idejű Hardver Monitor ({hardware.cpuModel})
            </h2>
            {hardware.throttledReason && (
              <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                {hardware.throttledReason}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-1">
            <div>
              <div className="text-xs text-slate-500">CPU Terhelés</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {hardware.cpuLoadPercent}% · {hardware.cpuCores} mag
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">RAM Memória</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {hardware.ramUsedMb} / {hardware.ramTotalMb} MB
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tárhely</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {hardware.diskUsedGb} / {hardware.diskTotalGb} GB
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Hőmérséklet</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {hardware.temperatureCelsius !== null ? `${hardware.temperatureCelsius}°C` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Akkumulátor</div>
              <div className="text-lg font-mono font-semibold tabular-nums">
                {hardware.batteryPercent !== null
                  ? `${hardware.batteryPercent}% (${hardware.isCharging ? 'AC' : 'Akku'})`
                  : 'Asztali / AC'}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'ops' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-slate-700" />
                  Autonóm Heartbeat
                </h3>
                <button
                  type="button"
                  disabled={hbRunning}
                  onClick={() => void handleRunHeartbeat()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Heartbeat Futtatása
                </button>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  Állapot:{' '}
                  <span className="font-mono font-semibold">
                    {settings.heartbeatEnabled ? `Aktív (${settings.heartbeatIntervalMinutes} perc)` : 'Kikapcsolva'}
                  </span>
                </div>
                {settings.lastHeartbeatAt && (
                  <div className="font-mono tabular-nums text-[11px] text-slate-500">
                    Utolsó: {new Date(settings.lastHeartbeatAt).toLocaleString()}
                  </div>
                )}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800">
                  {hbResult || settings.lastHeartbeatSummary || 'Még nem futott heartbeat ciklus.'}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-slate-700" />
                  Two-Strikes Uptime & SSL Figyelő
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/infra/ssl/check', { method: 'POST' });
                      await onRefreshState();
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    SSL Ellenőrzés
                  </button>
                  <button
                    type="button"
                    disabled={upChecking}
                    onClick={() => void handleRunUptimeChecks()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Uptime Fut
                  </button>
                </div>
              </div>

              <form onSubmit={handleAddUptimeTarget} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  value={upName}
                  onChange={(e) => setUpName(e.target.value)}
                  placeholder="Szolgáltatás neve"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="url"
                  value={upUrl}
                  onChange={(e) => setUpUrl(e.target.value)}
                  placeholder="http://localhost:3000/v1/models"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="text"
                  value={upExpect}
                  onChange={(e) => setUpExpect(e.target.value)}
                  placeholder="Elvárt szöveg (opc.)"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Uptime
                </button>
              </form>

              <form onSubmit={handleAddSsl} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  value={sslHost}
                  onChange={(e) => setSslHost(e.target.value)}
                  placeholder="SSL Domain (pl. github.com)"
                  className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
                <input
                  type="number"
                  value={sslPort}
                  onChange={(e) => setSslPort(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  + SSL Figyelés
                </button>
              </form>

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                {uptimeTargets.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs p-2 bg-slate-50 border border-slate-200 rounded"
                  >
                    <div className="min-w-0">
                      <span className={`font-mono font-bold uppercase mr-2 ${u.status === 'up' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {u.status}
                      </span>
                      <span className="font-semibold text-slate-900">{u.name}</span>{' '}
                      <span className="font-mono text-slate-500">{u.url}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] text-slate-600">
                      <span>{u.lastLatencyMs !== null ? `${u.lastLatencyMs}ms` : '-'}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/uptime/${u.id}`, { method: 'DELETE' });
                          await onRefreshState();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {sslTargets.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs p-2 bg-slate-50 border border-slate-200 rounded"
                  >
                    <div className="font-mono">
                      <span className="font-semibold text-slate-900">SSL {s.host}:{s.port}</span>
                      {s.issuer ? ` · ${s.issuer}` : ''}
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums text-[11px]">
                      <span className={(s.daysRemaining ?? 99) < 14 ? 'text-amber-700 font-semibold' : 'text-emerald-700'}>
                        {s.daysRemaining !== undefined && s.daysRemaining !== null ? `${s.daysRemaining} nap` : s.lastError || 'Ellenőrzés...'}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/infra/ssl/${s.id}`, { method: 'DELETE' });
                          await onRefreshState();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending Destructive Approvals + Backups */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  {tr(language, 'approvalsPending')} ({pendingApprovals.length})
                </h3>
                <button
                  type="button"
                  onClick={() => void handleOsUpgrade()}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  {tr(language, 'osUpgrade')}
                </button>
              </div>
              {pendingApprovals.length === 0 ? (
                <p className="text-xs text-slate-500">Nincs függőben lévő visszafordíthatatlan művelet.</p>
              ) : (
                <div className="space-y-2.5">
                  {pendingApprovals.map((app) => (
                    <div key={app.id} className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
                      <div className="text-sm font-semibold text-slate-900">{app.title}</div>
                      <div className="text-xs font-mono text-slate-700">{app.commandOrTarget}</div>
                      {app.impactSummary && <div className="text-xs text-amber-900">{app.impactSummary}</div>}
                      {app.expiresAt && (
                        <div className="text-[11px] font-mono text-slate-500">
                          Lejárat: {new Date(app.expiresAt).toLocaleTimeString()}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleResolveApproval(app.id, 'approved')}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-emerald-700 text-white rounded"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {tr(language, 'approve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResolveApproval(app.id, 'rejected')}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-red-700 text-white rounded"
                        >
                          <X className="h-3.5 w-3.5" />
                          {tr(language, 'reject')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                  <HardDrive className="h-4 w-4 text-slate-500" />
                  Biztonsági Mentések & Visszaállítás
                </h3>
                <button
                  type="button"
                  onClick={() => void handleCreateBackup()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
                >
                  <Download className="h-3.5 w-3.5" />
                  {tr(language, 'createBackup')}
                </button>
              </div>
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div>
                      <div className="font-mono text-slate-800">{b.fileName}</div>
                      <div className="text-slate-500">
                        {b.destination === 'local_and_drive' ? 'Lokális + Google Drive' : 'Lokális'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreBackup(b.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded hover:bg-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Visszaállítás
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {subTab === 'selfmod' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-700" />
                Önfejlesztés, Sandbox Bizonyíték, Git Diff & 1-Kattintásos Rollback
              </h3>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                Aktív Linux Sandbox: <span className="font-semibold text-slate-800">{sandboxBackend || 'isolated_tmpfs_subprocess'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleDestructiveProof()}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Sandbox Destruktív Teszt
              </button>
              <button
                type="button"
                onClick={() => void handleCheckOta()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {tr(language, 'checkOta')}
              </button>
            </div>
          </div>

          {proofResult && (
            <div className="p-2.5 bg-slate-900 text-slate-100 rounded text-xs font-mono">
              {proofResult}
            </div>
          )}

          {ota && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
              <div className="font-mono">
                Helyi: {ota.currentVersion} {ota.localCommit ? `(${ota.localCommit})` : ''} · Távoli ({ota.source}):{' '}
                {ota.latestVersion ?? 'N/A'} · Lemaradás: {ota.commitsBehind ?? 0} commit ·{' '}
                <span className={ota.updateAvailable ? 'font-bold text-amber-800' : 'font-bold text-emerald-700'}>
                  {ota.updateAvailable ? 'FRISSÍTÉS ELÉRHETŐ' : 'Naprakész'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleFetchOtaDiff()}
                  className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 bg-white rounded hover:bg-slate-100"
                >
                  Git Diff Előnézet
                </button>
                <button
                  type="button"
                  onClick={() => void handleApplyOta()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                >
                  <Download className="h-3 w-3" />
                  Frissítés Alkalmazása (GitHub OTA)
                </button>
              </div>
              {otaApplyMsg && <div className="font-mono text-[11px] text-slate-800">{otaApplyMsg}</div>}
              {otaDiff && (
                <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-40 overflow-auto whitespace-pre-wrap">
                  {otaDiff}
                </pre>
              )}
            </div>
          )}

          <form onSubmit={handleSelfMod} className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700">
              Védett Önmódosítás (Tiltott zóna & Git-Rollback védelemmel)
            </div>
            <input
              type="text"
              value={selfModPath}
              onChange={(e) => setSelfModPath(e.target.value)}
              placeholder="Relatív fájlútvonal (pl. .env tiltva lesz)"
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <textarea
              rows={2}
              value={selfModContent}
              onChange={(e) => setSelfModContent(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded">
              Módosítás Alkalmazása (Commit + Verify)
            </button>
            {selfModMsg && <div className="text-xs font-mono text-slate-700">{selfModMsg}</div>}
          </form>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <History className="h-3.5 w-3.5" />
              Git Előzmények (Diff & Rollback)
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {gitHistory.map((c) => (
                <div key={c.hash} className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono p-2 bg-slate-50 border border-slate-200 rounded">
                  <span className="truncate text-slate-700">
                    {c.hash.slice(0, 7)} · {c.message}
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleInspectCommit(c.hash)}
                      className="px-2 py-0.5 border border-slate-300 bg-white rounded hover:bg-slate-100"
                    >
                      Diff
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRollbackCommit(c.hash)}
                      className="px-2 py-0.5 bg-red-700 text-white rounded hover:bg-red-800"
                    >
                      Rollback
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {selectedDiff && (
              <pre className="p-3 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-56 overflow-auto whitespace-pre-wrap">
                {selectedDiff}
              </pre>
            )}
          </div>
        </div>
      )}

      {subTab === 'infra' && (
        <div className="space-y-6">
          {infraMsg && <div className="p-2.5 bg-slate-900 text-white rounded-lg text-xs font-mono">{infraMsg}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Docker (Ú9) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Box className="h-4 w-4 text-slate-700" />
                  Docker Konténerek
                </h3>
                <button
                  type="button"
                  onClick={() => void loadInfra()}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                >
                  Frissítés
                </button>
              </div>
              {!dockerData ? (
                <p className="text-xs text-slate-500">Betöltés...</p>
              ) : !dockerData.available ? (
                <p className="text-xs text-slate-500 font-mono">{dockerData.error || 'Docker CLI nem érhető el ezen a gépen.'}</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {dockerData.containers.map((c) => (
                    <div key={c.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {c.image} · {c.state} ({c.status})
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(['start', 'stop', 'restart'] as const).map((act) => (
                          <button
                            key={act}
                            type="button"
                            onClick={async () => {
                              const r = await fetch(`/api/infra/docker/${c.id}/${act}`, { method: 'POST' });
                              const d = (await r.json()) as { message?: string; error?: string };
                              setInfraMsg(d.message || d.error || act);
                              await loadInfra();
                            }}
                            className="px-2 py-0.5 border border-slate-300 bg-white rounded capitalize"
                          >
                            {act}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await fetch(`/api/infra/docker/${c.id}/logs`);
                            const d = (await r.json()) as { logs?: string };
                            setDockerLogs(d.logs || 'Nincs log.');
                          }}
                          className="px-2 py-0.5 bg-slate-900 text-white rounded"
                        >
                          Log
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {dockerLogs && (
                <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-40 overflow-auto whitespace-pre-wrap">
                  {dockerLogs}
                </pre>
              )}
            </div>

            {/* Systemd & Journalctl AI Analyzer (Ú10) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-700" />
                Systemd Egységek & Journalctl AI Elemző
              </h3>
              {!systemdData ? (
                <p className="text-xs text-slate-500">Betöltés...</p>
              ) : !systemdData.available ? (
                <p className="text-xs text-slate-500 font-mono">{systemdData.error || 'Systemctl nem érhető el.'}</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {systemdData.units.slice(0, 20).map((u) => (
                    <div key={u.unit} className="p-2 bg-slate-50 border border-slate-200 rounded text-xs flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-semibold text-slate-900 truncate">
                          {u.unit} ({u.active}/{u.sub})
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{u.description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setSystemdAnalysis(`Elemzés (${u.unit})...`);
                          const r = await fetch(`/api/infra/systemd/${encodeURIComponent(u.unit)}/analyze`, { method: 'POST' });
                          const d = (await r.json()) as { analysis?: string; logs?: string };
                          setSystemdAnalysis(d.analysis || d.logs || 'Kész.');
                        }}
                        className="px-2 py-0.5 text-[11px] bg-slate-900 text-white rounded shrink-0"
                      >
                        AI Elemzés
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {systemdAnalysis && (
                <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {systemdAnalysis}
                </pre>
              )}
            </div>
          </div>

          {/* LAN, VPN, Disks & Rsync (Ú11, Ú12, Ú14) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Network className="h-4 w-4 text-slate-700" />
                Helyi Hálózat (LAN ARP/Szomszédok)
              </h3>
              <div className="text-[11px] font-mono text-slate-500">Forrás: {lanData?.source || '-'}</div>
              <div className="space-y-1 max-h-44 overflow-y-auto font-mono text-[11px]">
                {(lanData?.devices || []).map((d, i) => (
                  <div key={i} className="p-1.5 bg-slate-50 border border-slate-200 rounded">
                    {d.ip} · {d.mac} · {d.iface}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Wifi className="h-4 w-4 text-slate-700" />
                VPN Állapot (Tailscale & WireGuard)
              </h3>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] space-y-1">
                <div>Tailscale: {vpnData?.tailscale?.status || 'n/a'}</div>
                {vpnData?.tailscale?.details && <div className="text-slate-600">{vpnData.tailscale.details}</div>}
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] space-y-1">
                <div>WireGuard: {vpnData?.wireguard?.status || 'n/a'}</div>
                {vpnData?.wireguard?.details && <div className="text-slate-600">{vpnData.wireguard.details}</div>}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-slate-700" />
                Lemezek (df) & Rsync Külső Mentés
              </h3>
              <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[11px]">
                {(diskData?.filesystems || []).map((f, i) => (
                  <div key={i} className="flex justify-between p-1 bg-slate-50 border border-slate-200 rounded">
                    <span className="truncate">{f.mount}</span>
                    <span>{f.used}/{f.size} ({f.usePercent})</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 pt-2">
                <input
                  type="text"
                  value={rsyncTarget}
                  onChange={(e) => setRsyncTarget(e.target.value)}
                  placeholder="/mnt/nas/novaswarm-backup"
                  className="flex-1 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/infra/rsync', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ targetDir: rsyncTarget }),
                    });
                    const d = (await r.json()) as { output?: string; error?: string };
                    setInfraMsg(d.output || d.error || 'Rsync lefutott.');
                  }}
                  className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium"
                >
                  Rsync
                </button>
              </div>
            </div>
          </div>

          {/* SSH Fleet (Ú15) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-slate-700" />
              SSH Flotta Profilok & Távoli Parancsfuttatás
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sshName.trim() || !sshHost.trim()) return;
                await fetch('/api/infra/ssh', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: sshName, host: sshHost, port: sshPort, username: sshUser }),
                });
                setSshName('');
                setSshHost('');
                await onRefreshState();
              }}
              className="grid grid-cols-1 sm:grid-cols-5 gap-2"
            >
              <input type="text" value={sshName} onChange={(e) => setSshName(e.target.value)} placeholder="Profil neve (pl. NAS)" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="text" value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="192.168.1.50" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <input type="text" value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="Felhasználó" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <input type="number" value={sshPort} onChange={(e) => setSshPort(Number(e.target.value))} className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">+ SSH Profil</button>
            </form>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-slate-500">Távoli parancs:</span>
              <input type="text" value={sshCmd} onChange={(e) => setSshCmd(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sshProfiles.map((p) => (
                <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-xs">
                  <div className="font-mono">
                    <span className="font-semibold text-slate-900">{p.name}</span> · {p.username}@{p.host}:{p.port}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await fetch(`/api/infra/ssh/${p.id}/exec`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ command: sshCmd }),
                        });
                        const d = (await r.json()) as { output?: string; error?: string };
                        setSshOut(d.output || d.error || 'Kész.');
                        await onRefreshState();
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white rounded"
                    >
                      <Play className="h-3 w-3" /> Fut
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/infra/ssh/${p.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {sshOut && <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-40 overflow-auto whitespace-pre-wrap">{sshOut}</pre>}
          </div>
        </div>
      )}

      {subTab === 'diagnostics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* M25 Diagnostics */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-slate-700" />
                  Gazdagép Öndiagnosztika
                </h3>
                <button
                  type="button"
                  onClick={() => void loadDiagAndEnv()}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                >
                  Újraellenőrzés
                </button>
              </div>
              {diagData ? (
                <div className="space-y-1.5 text-xs">
                  <div className="font-mono text-slate-500">
                    Node {diagData.nodeVersion} · {diagData.platform}/{diagData.arch}
                  </div>
                  {diagData.checks.map((chk, idx) => (
                    <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between gap-2 font-mono">
                      <span className={chk.ok ? 'text-emerald-800 font-semibold' : 'text-amber-800 font-semibold'}>
                        [{chk.ok ? 'OK' : 'WARN'}] {chk.name}
                      </span>
                      <span className="text-slate-600 truncate">{chk.details}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Ellenőrzés futtatása...</p>
              )}
            </div>

            {/* M26 Safe .env Config Editor */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Biztonságos `.env` Konfig (Titkok maszkázva)</h3>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/system/env', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ vars: envVars }),
                    });
                    if (r.ok) setEnvMsg('.env változók mentve.');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-slate-900 text-white rounded"
                >
                  <Save className="h-3.5 w-3.5" />
                  .env Mentése
                </button>
              </div>
              {envMsg && <div className="text-xs font-mono text-emerald-700">{envMsg}</div>}
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {Object.entries(envVars).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-5 gap-2 items-center text-xs">
                    <span className="col-span-2 font-mono font-semibold text-slate-700 truncate">{k}</span>
                    <input
                      type="text"
                      value={v}
                      onChange={(e) => setEnvVars((prev) => ({ ...prev, [k]: e.target.value }))}
                      className="col-span-3 px-2 py-1 font-mono border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cron, Telegram, Self Docs & Audit Export */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-600" />
                Cron Időzített Ágens Feladatok
              </h3>
              <form onSubmit={handleAddCron} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={cronName} onChange={(e) => setCronName(e.target.value)} placeholder="Feladat neve" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
                  <input type="text" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="0 8 * * *" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
                </div>
                <input type="text" value={cronPrompt} onChange={(e) => setCronPrompt(e.target.value)} placeholder="Ágens prompt..." className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
                <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">Cron Feladat Mentése</button>
              </form>
              <div className="space-y-1.5">
                {cronTasks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 border border-slate-200 rounded">
                    <div>
                      <span className="font-semibold">{c.name}</span> · <span className="font-mono">{c.cronExpression}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/cron/${c.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Telegram Parancs Paritás</div>
                <form onSubmit={handleTelegramCmd} className="flex gap-2">
                  <input type="text" value={tgCmd} onChange={(e) => setTgCmd(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
                  <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">Futtatás</button>
                </form>
                {tgReply && <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono whitespace-pre-wrap">{tgReply}</pre>}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h3 className="text-base font-semibold text-slate-900">Beépített Önismereti Dokumentáció</h3>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans max-h-40 overflow-y-auto">{docs}</pre>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    Audit Napló ({auditLogs.length})
                  </h3>
                  <div className="flex gap-2">
                    <a
                      href="/api/audit/export?format=csv"
                      download="novaswarm-audit.csv"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                    >
                      <Download className="h-3 w-3" />
                      CSV Export
                    </a>
                    <a
                      href="/api/audit/export?format=json"
                      download="novaswarm-audit.json"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                    >
                      <Download className="h-3 w-3" />
                      JSON Export
                    </a>
                  </div>
                </div>
                <div className="max-h-[240px] overflow-y-auto space-y-1.5">
                  {auditLogs.slice(-30).reverse().map((log) => (
                    <div key={log.id} className="text-xs p-2 bg-slate-50 border border-slate-200 rounded flex justify-between gap-3">
                      <div>
                        <span className="font-mono font-semibold text-slate-700">[{log.type}]</span>{' '}
                        <span className="font-medium text-slate-900">{log.sourceAgentName}:</span>{' '}
                        <span className="text-slate-700">{log.message}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
