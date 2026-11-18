import React, { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Cpu,
  Download,
  HardDrive,
  HeartPulse,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
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
  settings,
  sandboxBackend,
  onRefreshState,
}) => {
  const [ota, setOta] = useState<OtaVersionStatus | null>(null);
  const [otaDiff, setOtaDiff] = useState<string | null>(null);
  const [otaApplyMsg, setOtaApplyMsg] = useState<string | null>(null);
  const [docs, setDocs] = useState<string>('');
  const [gitHistory, setGitHistory] = useState<Array<{ hash: string; date: string; message: string }>>([]);
  const [proofResult, setProofResult] = useState<string | null>(null);

  // Cron form
  const [cronName, setCronName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 8 * * *');
  const [cronPrompt, setCronPrompt] = useState('');

  // Guarded Self-Modification form
  const [selfModPath, setSelfModPath] = useState('src/components/CustomNote.txt');
  const [selfModContent, setSelfModContent] = useState('NovaSwarm self-modification test');
  const [selfModMsg, setSelfModMsg] = useState<string | null>(null);

  // Telegram parity command tester
  const [tgCmd, setTgCmd] = useState('/statusz');
  const [tgReply, setTgReply] = useState<string | null>(null);

  // Heartbeat & Two-Strikes Uptime Monitor
  const [hbRunning, setHbRunning] = useState(false);
  const [hbResult, setHbResult] = useState<string | null>(null);
  const [upName, setUpName] = useState('');
  const [upUrl, setUpUrl] = useState('');
  const [upExpect, setUpExpect] = useState('');
  const [upChecking, setUpChecking] = useState(false);

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
    const data = (await res.json()) as { ok: boolean; message: string; newCommit?: string };
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
      sandboxResult: { isolationMode: string; exitCode: number };
    };
    setProofResult(
      `Destruktív sandbox bizonyíték: ${data.proofPassed ? 'SIKERES' : 'SIKERTELEN'} | Mód: ${data.sandboxResult.isolationMode} | Valós őrszem fájl érintetlen: ${data.sentinelStillExists}`
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

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="space-y-6">
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

      {/* OpenClaw Autonomous Heartbeat & Marveen Two-Strikes Uptime Monitor */}
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
                {settings.heartbeatEnabled ? `Aktív (${settings.heartbeatIntervalMinutes} percenként)` : 'Kikapcsolva'}
              </span>
            </div>
            {settings.lastHeartbeatAt && (
              <div className="font-mono tabular-nums text-[11px] text-slate-500">
                Utolsó ellenőrzés: {new Date(settings.lastHeartbeatAt).toLocaleString()}
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
              Two-Strikes Uptime Monitor (2 hiba = leállás)
            </h3>
            <button
              type="button"
              disabled={upChecking}
              onClick={() => void handleRunUptimeChecks()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Ellenőrzés Futtatása
            </button>
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
              Célpont felvétel
            </button>
          </form>

          <div className="space-y-2 max-h-[190px] overflow-y-auto">
            {uptimeTargets.length === 0 ? (
              <p className="text-xs text-slate-500">Nincs felvett uptime célpont.</p>
            ) : (
              uptimeTargets.map((u) => {
                const uptimePct =
                  u.totalChecks > 0 ? Math.round((u.upChecks / u.totalChecks) * 100) : 100;
                const statusClass =
                  u.status === 'up'
                    ? 'text-emerald-700'
                    : u.status === 'degraded'
                    ? 'text-amber-700'
                    : u.status === 'down'
                    ? 'text-red-700'
                    : 'text-slate-500';
                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded"
                  >
                    <div className="min-w-0">
                      <span className={`font-mono font-bold uppercase mr-2 ${statusClass}`}>{u.status}</span>
                      <span className="font-semibold text-slate-900">{u.name}</span>{' '}
                      <span className="font-mono text-slate-500">{u.url}</span>
                      {u.lastError && <div className="text-[11px] font-mono text-red-700">{u.lastError}</div>}
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] text-slate-600">
                      <span>{u.lastLatencyMs !== null ? `${u.lastLatencyMs}ms` : '-'}</span>
                      <span>{uptimePct}% ({u.upChecks}/{u.totalChecks})</span>
                      <button
                        type="button"
                        aria-label={`Delete uptime target ${u.name}`}
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
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pending Destructive Approvals + Backups / OS Upgrade / OTA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {tr(language, 'approvalsPending')} ({pendingApprovals.length})
            </h3>
            <button
              type="button"
              onClick={handleOsUpgrade}
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolveApproval(app.id, 'approved')}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-emerald-700 text-white rounded"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {tr(language, 'approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveApproval(app.id, 'rejected')}
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

          {/* Backups & Restore */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-slate-500" />
                Biztonsági Mentések & Visszaállítás
              </h3>
              <button
                type="button"
                onClick={handleCreateBackup}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                <Download className="h-3.5 w-3.5" />
                {tr(language, 'createBackup')}
              </button>
            </div>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-xs p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <div>
                    <div className="font-mono text-slate-800">{b.fileName}</div>
                    <div className="text-slate-500">
                      {b.destination === 'local_and_drive'
                        ? 'Lokális + Google Drive'
                        : 'Kizárólag lokális (Google Drive nincs bekötve)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(b.id)}
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

        {/* Supervisor Destructive Proof, Self-Mod Guard & OTA */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-700" />
                Önfejlesztés, Sandbox & OTA Frissítés
              </h3>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                Aktív Linux Sandbox: <span className="font-semibold text-slate-800">{sandboxBackend || 'isolated_tmpfs_subprocess'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDestructiveProof}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Sandbox Destruktív Teszt
              </button>
              <button
                type="button"
                onClick={handleCheckOta}
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
                {ota.latestVersion ?? 'N/A'} · Lemaradás: {ota.commitsBehind ?? 0} commit · Állapot:{' '}
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
                {ota.releaseUrl && (
                  <a
                    href={ota.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 text-[11px] font-mono text-slate-600 underline"
                  >
                    GitHub megnyitása
                  </a>
                )}
              </div>
              {otaApplyMsg && <div className="font-mono text-[11px] text-slate-800">{otaApplyMsg}</div>}
              {otaDiff && (
                <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-40 overflow-auto whitespace-pre-wrap">
                  {otaDiff}
                </pre>
              )}
              {ota.error && <div className="text-amber-800">{ota.error}</div>}
            </div>
          )}

          <form onSubmit={handleSelfMod} className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700">
              Védett Önmódosítás (Tiltott zóna & Git-Rollback tesztelése)
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
              Módosítás Alkalmazása (Commit + Verify + Rollback)
            </button>
            {selfModMsg && <div className="text-xs font-mono text-slate-700">{selfModMsg}</div>}
          </form>

          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <History className="h-3.5 w-3.5" />
              Git Előzmények
            </div>
            <div className="max-h-[110px] overflow-y-auto space-y-1">
              {gitHistory.map((c) => (
                <div key={c.hash} className="text-[11px] font-mono text-slate-600 truncate">
                  {c.hash.slice(0, 7)} · {c.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cron Scheduler & Telegram Command Parity + Self Docs + Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-600" />
            Cron Időzített Ágens Feladatok
          </h3>
          <form onSubmit={handleAddCron} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={cronName}
                onChange={(e) => setCronName(e.target.value)}
                placeholder="Feladat neve"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
              <input
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 8 * * *"
                className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
            <input
              type="text"
              value={cronPrompt}
              onChange={(e) => setCronPrompt(e.target.value)}
              placeholder="Ágens prompt..."
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">
              Cron Feladat Mentése
            </button>
          </form>

          <div className="space-y-1.5">
            {cronTasks.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 border border-slate-200 rounded">
                <div>
                  <span className="font-semibold">{c.name}</span> · <span className="font-mono">{c.cronExpression}</span>
                </div>
                <button
                  type="button"
                  aria-label={`Delete cron ${c.name}`}
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
            <div className="text-xs font-semibold text-slate-700">
              Telegram Parancs Paritás (/statusz, /kanban, /otlet, /pairing, /memoria, /modell, /keres, /naplo)
            </div>
            <form onSubmit={handleTelegramCmd} className="flex gap-2">
              <input
                type="text"
                value={tgCmd}
                onChange={(e) => setTgCmd(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">
                Futtatás
              </button>
            </form>
            {tgReply && (
              <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono whitespace-pre-wrap">
                {tgReply}
              </pre>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <h3 className="text-base font-semibold text-slate-900">Beépített Önismereti Dokumentáció</h3>
            <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{docs}</pre>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">
              Audit Napló ({auditLogs.length})
            </h3>
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
  );
};
