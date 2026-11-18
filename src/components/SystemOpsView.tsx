import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Cpu,
  Download,
  HardDrive,
  History,
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
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  hardware: HardwareMetrics | null;
  approvals: ApprovalRequest[];
  cronTasks: CronTask[];
  backups: BackupPoint[];
  auditLogs: AuditLogEntry[];
  onRefreshState: () => Promise<void>;
}

export const SystemOpsView: React.FC<Props> = ({
  language,
  hardware,
  approvals,
  cronTasks,
  backups,
  auditLogs,
  onRefreshState,
}) => {
  const [ota, setOta] = useState<OtaVersionStatus | null>(null);
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

  useEffect(() => {
    void fetch('/api/system/docs')
      .then((r) => r.json())
      .then((d: { documentation: string }) => setDocs(d.documentation || ''));
    void fetch('/api/selfmod/history')
      .then((r) => r.json())
      .then((d: { commits: typeof gitHistory }) => setGitHistory(d.commits || []));
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
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-slate-700" />
              Önfejlesztés, Sandbox & OTA Frissítés
            </h3>
            <div className="flex gap-2">
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
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="font-mono">
                Helyi verzió: {ota.currentVersion} · Távoli ({ota.source}): {ota.latestVersion ?? 'N/A'} · Frissítés: {ota.updateAvailable ? 'ELÉRHETŐ' : 'Naprakész'}
              </div>
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
              Telegram Parancs Paritás (/statusz, /kanban, /memoria, /modell, /keres, /naplo, /update)
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
