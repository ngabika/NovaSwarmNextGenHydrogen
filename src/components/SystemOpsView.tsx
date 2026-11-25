import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  Activity,
  Box,
  Check,
  Clock,
  Cpu,
  Download,
  FileCode2,
  Flame,
  HardDrive,
  HeartPulse,
  History,
  KeyRound,
  Lock,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Shield,
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
  ClusterNode,
  CronTask,
  HardwareMetrics,
  LanguageCode,
  NovaSwarmState,
  OtaVersionStatus,
  PhoenixAutonomyStatus,
  SandboxCapabilities,
  Settings,
  SshHostProfile,
  SslWatchTarget,
  SudoCheckStatus,
  UptimeTarget,
} from '../../shared/types';
import { tr } from '../locales/translations';
import { InfoHint } from './InfoHint';

const Batch3InfraClusterPanel = lazy(() =>
  import('./Batch3InfraClusterPanel').then((m) => ({ default: m.Batch3InfraClusterPanel }))
);
const Batch4HardwareNetPanel = lazy(() =>
  import('./Batch4HardwareNetPanel').then((m) => ({ default: m.Batch4HardwareNetPanel }))
);
const Batch5MigrationAndAutoPanel = lazy(() =>
  import('./Batch5MigrationAndAutoPanel').then((m) => ({ default: m.Batch5MigrationAndAutoPanel }))
);
const Batch6ApexLabPanel = lazy(() =>
  import('./Batch6ApexLabPanel').then((m) => ({ default: m.Batch6ApexLabPanel }))
);
const Batch7UniverseLabPanel = lazy(() =>
  import('./Batch7UniverseLabPanel').then((m) => ({ default: m.Batch7UniverseLabPanel }))
);
const Batch8SingularityPanel = lazy(() =>
  import('./Batch8SingularityPanel').then((m) => ({ default: m.Batch8SingularityPanel }))
);
const AutonomyCenterView = lazy(() =>
  import('./AutonomyCenterView').then((m) => ({ default: m.AutonomyCenterView }))
);

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
  clusterNodes?: ClusterNode[];
  settings: Settings;
  state?: NovaSwarmState;
  sandboxBackend?: string;
  sandboxCapabilities?: SandboxCapabilities | null;
  sudoStatus?: SudoCheckStatus | null;
  phoenixAutonomy?: PhoenixAutonomyStatus | null;
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
  clusterNodes = [],
  settings,
  state,
  sandboxBackend,
  sandboxCapabilities,
  sudoStatus,
  phoenixAutonomy,
  onRefreshState,
}) => {
  const [subTab, setSubTab] = useState<'ops' | 'autonomy_center' | 'selfmod' | 'infra' | 'pi_hw_b4' | 'b5_migrate' | 'b6_apex' | 'b7_universe' | 'b8_omni' | 'diagnostics'>('ops');
  const [sudoLocal, setSudoLocal] = useState<SudoCheckStatus | null>(sudoStatus ?? null);
  const [sudoChecking, setSudoChecking] = useState(false);
  const [phoenixSaving, setPhoenixSaving] = useState(false);

  useEffect(() => {
    if (sudoStatus) setSudoLocal(sudoStatus);
  }, [sudoStatus]);

  const [ota, setOta] = useState<OtaVersionStatus | null>(null);
  const [otaDiff, setOtaDiff] = useState<string | null>(null);
  const [otaApplyMsg, setOtaApplyMsg] = useState<string | null>(null);
  const [otaCommits, setOtaCommits] = useState<Array<{ hash: string; shortHash: string; date: string; message: string }>>([]);
  const [docs, setDocs] = useState<string>('');
  const [gitHistory, setGitHistory] = useState<Array<{ hash: string; date: string; message: string }>>([]);
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null);
  const [proofResult, setProofResult] = useState<string | null>(null);

  // Cron & Telegram & Scoped Diff (M33)
  const [cronName, setCronName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 8 * * *');
  const [cronPrompt, setCronPrompt] = useState('');
  const [selfModPath, setSelfModPath] = useState('src/components/CustomNote.txt');
  const [selfModContent, setSelfModContent] = useState('NovaSwarm self-modification test');
  const [diffPath, setDiffPath] = useState('');
  const [diffSearch, setDiffSearch] = useState('');
  const [diffReplace, setDiffReplace] = useState('');
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

  // Infra (Ú9-Ú15, Ú37-Ú42, Ú57, M55, M56)
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
  const [systemdDetails, setSystemdDetails] = useState<{ unit: string; memoryMb: number | null; restarts: number | null; dependencies: string[]; raw: string } | null>(null);
  const [lanData, setLanData] = useState<{
    devices: Array<{ ip: string; mac: string; iface: string; state?: string }>;
    method: string;
  } | null>(null);
  const [vpnData, setVpnData] = useState<{
    tailscale?: { installed: boolean; running: boolean; ip?: string; dnsName?: string; peers: number; rawError?: string };
    wireguard?: { installed: boolean; active: boolean; output?: string };
  } | null>(null);
  const [diskData, setDiskData] = useState<{
    dfOutput: string;
    blockDevices: Array<{ name: string; size: string; mountpoint: string | null; smartHealth?: string }>;
  } | null>(null);
  const [rsyncTarget, setRsyncTarget] = useState(settings.backupRsyncTarget || '');
  const [infraMsg, setInfraMsg] = useState<string | null>(null);

  // SuperAdmin Linux tools state
  const [fwData, setFwData] = useState<{ portsOutput: string; firewallOutput: string; firewallTool: string } | null>(null);
  const [fwRule, setFwRule] = useState('allow 3000/tcp');
  const [hwSensors, setHwSensors] = useState<{ thermalZones: Array<{ name: string; tempC: number }>; piVcgencmd: { available: boolean; temp?: string; throttled?: string }; gpio: { available: boolean; output: string }; i2c: { available: boolean; buses: string } } | null>(null);
  const [netTarget, setNetTarget] = useState('1.1.1.1');
  const [netResult, setNetResult] = useState<{ target: string; dnsAddresses: string[]; pingOutput: string; tracerouteOutput: string; publicIp?: string } | null>(null);
  const [linuxCron, setLinuxCron] = useState<{ userCrontab: string; systemdTimers: string } | null>(null);
  const [vaultPath, setVaultPath] = useState('');
  const [vaultPass, setVaultPass] = useState('');
  const [vaultResult, setVaultResult] = useState<string | null>(null);
  const [proxyData, setProxyData] = useState<{ nginxAvailable: boolean; caddyAvailable: boolean; nginxTestOutput: string; sites: string[] } | null>(null);
  const [proxyKind, setProxyKind] = useState<'caddy' | 'nginx'>('caddy');
  const [proxyDomain, setProxyDomain] = useState('novaswarm.local');
  const [proxyPort, setProxyPort] = useState(3000);
  const [proxyTplOut, setProxyTplOut] = useState('');
  const [composeStack, setComposeStack] = useState<'searxng' | 'mosquitto' | 'ntfy' | 'uptime_kuma' | 'postgres'>('searxng');
  const [composeYaml, setComposeYaml] = useState('');

  // SSH Fleet (Ú15, M55)
  const [sshName, setSshName] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('pi');
  const [sshCmd, setSshCmd] = useState('uptime && df -h');
  const [sshOut, setSshOut] = useState<string | null>(null);

  // Diagnostics, Hardening, Doctor & Password Checker (M25, M26, M54, B3, Ú53)
  const [diagData, setDiagData] = useState<{
    checkedAt: string;
    checks: Array<{ name: string; ok: boolean; detail: string }>;
  } | null>(null);
  const [hardeningData, setHardeningData] = useState<{
    score: number;
    grade: string;
    checks: Array<{ id: string; label: string; ok: boolean; points: number; hint: string }>;
  } | null>(null);
  const [doctorData, setDoctorData] = useState<{
    checkedAt: string;
    healedActions: string[];
    warnings: string[];
    uptimeSummary: string;
  } | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwResult, setPwResult] = useState<{
    length: number;
    entropyBits: number;
    strengthLabel: string;
    breached: boolean;
    breachCount: number;
    hibpChecked: boolean;
    hibpError?: string;
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
    void fetch('/api/system/ota/commits')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { commits?: typeof otaCommits } | null) => {
        if (d?.commits) setOtaCommits(d.commits);
      })
      .catch(() => {});
  }, []);

  const loadInfra = async () => {
    const [dk, sd, lan, vpn, dsk, fw, hw, cr, px] = await Promise.all([
      fetch('/api/infra/docker').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/systemd').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/lan').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/vpn').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/disks').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/firewall').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/hardware').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/cron').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/infra/proxy').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (dk) setDockerData(dk);
    if (sd) setSystemdData(sd);
    if (lan) setLanData(lan);
    if (vpn) setVpnData(vpn);
    if (dsk) setDiskData(dsk);
    if (fw) setFwData(fw);
    if (hw) setHwSensors(hw);
    if (cr) setLinuxCron(cr);
    if (px) setProxyData(px);
  };

  const loadDiagAndEnv = async () => {
    const [dg, ev, hd] = await Promise.all([
      fetch('/api/system/diagnostics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/system/env').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/system/hardening').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (dg) setDiagData(dg);
    if (ev?.vars) setEnvVars(ev.vars);
    if (hd) setHardeningData(hd);
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
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-lg">
          {(
            [
              { id: 'ops', label: 'Üzemeltetés & Mentés', hint: 'Jóváhagyásra váró műveletek, uptime és SSL figyelés, valamint teljes biztonsági mentések és visszaállítás.' },
              { id: 'autonomy_center', label: 'Autonómia központ', hint: 'Totális autonómia garanciák, LOCKDOWN vészleállító, biztonsági visszaállítási pontok, LAN felderítés és döntési napló.' },
              { id: 'selfmod', label: 'Önfejlesztés & Frissítés', hint: 'A program önmódosító előzményei és hivatalos GitHub frissítések ellenőrzése vagy telepítése.' },
              { id: 'infra', label: 'Szerver & Konténerek', hint: 'Docker konténerek, Linux szolgáltatások (systemd), helyi eszközök, VPN és távoli SSH gépek kezelése.' },
              { id: 'pi_hw_b4', label: 'Hardver & Fájlok', hint: 'Hőmérséklet, Raspberry Pi szenzorok, behatolás-szűrő, okosmérő, fájlböngésző és saját állapotdobozok.' },
              { id: 'b5_migrate', label: 'Költöztető & Önhangolás', hint: 'Egygombos átköltöztetés másik Linux gépre SSH-n keresztül, és hardverhez igazított teljesítmény-optimalizálás.' },
              { id: 'b6_apex', label: 'Hálózat & Tartalék', hint: 'Haladó hálózati eszközök, tartalék csomópontok és megbízhatósági ellenőrzések.' },
              { id: 'b7_universe', label: 'Életvitel & Automaták', hint: 'Napi rutinokat segítő gyors automaták, árfolyam- és üzemmód-vezérlők.' },
              { id: 'b8_omni', label: 'Tudás & Tervező Stúdió', hint: 'Személyiségek (personák), ténybank, döntési mátrixok, célfák és további segédeszközök.' },
              { id: 'diagnostics', label: 'Diagnosztika & Naplók', hint: 'Biztonsági pontszám, környezeti változók, ütemezett feladatok, hibakereső és aláírt auditnapló export.' },
            ] as const
          ).map((t) => (
            <div key={t.id} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
              <InfoHint theme="light" label={t.label} description={t.hint} />
            </div>
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
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-slate-700" />
                  Sudo (NOPASSWD) Jogosultság
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                      sudoLocal?.hasNopasswd
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-red-50 border-red-300 text-red-800'
                    }`}
                  >
                    {sudoLocal ? (sudoLocal.hasNopasswd ? 'RENDBEN' : 'HIÁNYZIK') : 'Ellenőrzés...'}
                  </span>
                  <button
                    type="button"
                    disabled={sudoChecking}
                    onClick={async () => {
                      setSudoChecking(true);
                      try {
                        const r = await fetch('/api/system/sudo-check', { method: 'POST' });
                        if (r.ok) {
                          const data = (await r.json()) as { status?: SudoCheckStatus };
                          if (data.status) setSudoLocal(data.status);
                        }
                        await onRefreshState();
                      } finally {
                        setSudoChecking(false);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Újraellenőrzés
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-700">
                {sudoLocal?.message || 'Jelszó nélküli sudo (sudo -n true) állapot ellenőrzése...'}
              </p>
              {sudoLocal && !sudoLocal.hasNopasswd && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-800">
                    Manuális beállítás (a rendszer soha nem ír sudoers fájlt automatikusan):
                  </div>
                  <pre className="p-2 rounded bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                    {`${sudoLocal.visudoCommand}\n${sudoLocal.sudoersLine}`}
                  </pre>
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-slate-700" />
                  Phoenix Pillanatkép Őrszem
                </h3>
                <button
                  type="button"
                  disabled={phoenixSaving}
                  onClick={async () => {
                    setPhoenixSaving(true);
                    try {
                      await fetch('/api/v3/phoenix/snapshot', { method: 'POST' });
                      await onRefreshState();
                    } finally {
                      setPhoenixSaving(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {phoenixSaving ? 'Készítés...' : 'Phoenix Pillanatkép Készítése'}
                </button>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  Legutóbbi pillanatkép:{' '}
                  <span className="font-mono font-semibold">
                    {phoenixAutonomy?.lastSnapshotAt
                      ? `${new Date(phoenixAutonomy.lastSnapshotAt).toLocaleString()} (${phoenixAutonomy.ageHours ?? 0} órája)`
                      : 'Még nincs rögzített Phoenix mentés'}
                  </span>
                </div>
                {phoenixAutonomy?.staleWarning && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-medium">
                    {phoenixAutonomy.warningMessage}
                  </div>
                )}
              </div>
            </div>
          </div>

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
              <div className="text-[11px] font-mono text-slate-600 mt-1 space-y-0.5">
                <div>
                  Supervisor dry-run mód:{' '}
                  <span className="font-semibold text-slate-900">
                    {sandboxCapabilities?.supervisorBackend || sandboxBackend || 'isolated_tmpfs_subprocess'}
                  </span>
                </div>
                <div>
                  Szigorú JS Sandbox (<code>sandbox_js</code>):{' '}
                  <span
                    className={`font-semibold ${
                      sandboxCapabilities?.jsSandboxAvailable ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {sandboxCapabilities
                      ? sandboxCapabilities.jsSandboxAvailable
                        ? `${sandboxCapabilities.jsSandboxBackend} (aktív)`
                        : 'unavailable — letiltva (Docker vagy bwrap szükséges)'
                      : 'ellenőrzés...'}
                  </span>
                  {' · '}
                  Node <code>--permission</code>:{' '}
                  <span
                    className={`font-semibold ${
                      sandboxCapabilities?.nodePermissionSupported ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {sandboxCapabilities
                      ? sandboxCapabilities.nodePermissionSupported
                        ? `${sandboxCapabilities.nodePermissionFlag} (Node ${sandboxCapabilities.nodeVersion})`
                        : `nem támogatott (Node ${sandboxCapabilities.nodeVersion})`
                      : '—'}
                  </span>
                </div>
                {sandboxCapabilities?.warning && (
                  <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 font-sans">
                    {sandboxCapabilities.warning}
                  </div>
                )}
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
                {' · '}
                <span className={ota.signatureVerificationActive ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                  {ota.signatureVerificationActive ? 'GPG-ellenőrzés aktív' : 'Aláíratlan csatorna'}
                </span>
              </div>
              {ota.signatureWarning && (
                <div className="p-2 rounded border border-amber-300 bg-amber-50 text-amber-900 text-[11px]">
                  {ota.signatureWarning}
                </div>
              )}
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

          {otaCommits.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
              <div className="font-semibold text-slate-800">Frissítési Verzió-előzmények &amp; Visszaállás</div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {otaCommits.map((c) => (
                  <div key={c.hash} className="flex items-center justify-between gap-2 font-mono text-[11px] bg-white border border-slate-200 px-2.5 py-1.5 rounded">
                    <span className="truncate">{c.shortHash} · {c.date.slice(0, 10)} · {c.message}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await fetch('/api/system/ota/rollback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ hash: c.hash }),
                        });
                        const d = (await r.json()) as { message?: string; error?: string };
                        setOtaApplyMsg(d.message || d.error || 'Visszaállítva.');
                        await onRefreshState();
                      }}
                      className="px-2 py-0.5 bg-slate-900 text-white rounded shrink-0 whitespace-nowrap"
                    >
                      Visszaállás
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <form onSubmit={handleSelfMod} className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                Védett Teljes Fájl Önmódosítás (Tiltott zóna & Git-Rollback védelemmel)
              </div>
              <input
                type="text"
                value={selfModPath}
                onChange={(e) => setSelfModPath(e.target.value)}
                placeholder="Relatív fájlútvonal (pl. .env tiltva lesz)"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <textarea
                rows={3}
                value={selfModContent}
                onChange={(e) => setSelfModContent(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded">
                Módosítás Alkalmazása (Commit + Verify)
              </button>
            </form>

            {/* M33 Scoped Search-and-Replace Patch */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!diffPath.trim() || !diffSearch) return;
                const r = await fetch('/api/selfmod/apply-diff', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    targetPath: diffPath.trim(),
                    search: diffSearch,
                    replace: diffReplace,
                    commitMessage: `patch(selfmod): ${diffPath.trim()}`,
                  }),
                });
                const d = (await r.json()) as { message?: string; error?: string };
                setSelfModMsg(d.message || d.error || 'Patch alkalmazva.');
                await onRefreshState();
              }}
              className="space-y-2"
            >
              <div className="text-xs font-semibold text-slate-700">
                Célzott Diff Patch Önmódosítás (Search & Replace — M33)
              </div>
              <input
                type="text"
                value={diffPath}
                onChange={(e) => setDiffPath(e.target.value)}
                placeholder="Célfájl (pl. src/locales/translations.ts)"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <div className="grid grid-cols-2 gap-2">
                <textarea
                  rows={3}
                  value={diffSearch}
                  onChange={(e) => setDiffSearch(e.target.value)}
                  placeholder="Keresendő pontos blokk..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
                <textarea
                  rows={3}
                  value={diffReplace}
                  onChange={(e) => setDiffReplace(e.target.value)}
                  placeholder="Új kódblokk..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
              </div>
              <button type="submit" className="px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white rounded hover:bg-slate-50">
                Scoped Patch Alkalmazása
              </button>
            </form>
          </div>
          {selfModMsg && <div className="text-xs font-mono text-slate-700">{selfModMsg}</div>}

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
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await fetch(`/api/infra/systemd/${encodeURIComponent(u.unit)}/details`);
                            const d = await r.json();
                            setSystemdDetails(d);
                          }}
                          className="px-2 py-0.5 text-[11px] border border-slate-300 bg-white rounded hover:bg-slate-100"
                        >
                          Részletek
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setSystemdAnalysis(`Elemzés (${u.unit})...`);
                            const r = await fetch(`/api/infra/systemd/${encodeURIComponent(u.unit)}/analyze`, { method: 'POST' });
                            const d = (await r.json()) as { aiAnalysis?: string; logs?: string };
                            setSystemdAnalysis(d.aiAnalysis || d.logs || 'Kész.');
                          }}
                          className="px-2 py-0.5 text-[11px] bg-slate-900 text-white rounded"
                        >
                          AI Elemzés
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {systemdDetails && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-1 font-mono">
                  <div className="font-semibold text-slate-900">
                    {systemdDetails.unit} · RAM: {systemdDetails.memoryMb !== null ? `${systemdDetails.memoryMb} MB` : 'n/a'} · Újraindítások: {systemdDetails.restarts ?? 'n/a'}
                  </div>
                  {systemdDetails.dependencies.length > 0 && (
                    <div className="text-[11px] text-slate-600 max-h-24 overflow-y-auto">
                      Függőségek: {systemdDetails.dependencies.join(', ')}
                    </div>
                  )}
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
              <div className="text-[11px] font-mono text-slate-500">Forrás: {lanData?.method || '-'}</div>
              <div className="space-y-1 max-h-44 overflow-y-auto font-mono text-[11px]">
                {(lanData?.devices || []).map((d, i) => (
                  <div key={i} className="p-1.5 bg-slate-50 border border-slate-200 rounded">
                    {d.ip} · {d.mac} · {d.iface} {d.state ? `(${d.state})` : ''}
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
                <div>
                  Tailscale:{' '}
                  {vpnData?.tailscale
                    ? vpnData.tailscale.installed
                      ? vpnData.tailscale.running
                        ? `Fut (${vpnData.tailscale.ip || 'IP n/a'}, ${vpnData.tailscale.peers} peer)`
                        : 'Telepítve (nem fut)'
                      : 'Nincs telepítve'
                    : 'Betöltés...'}
                </div>
                {vpnData?.tailscale?.rawError && (
                  <div className="text-slate-600">{vpnData.tailscale.rawError}</div>
                )}
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] space-y-1">
                <div>
                  WireGuard:{' '}
                  {vpnData?.wireguard
                    ? vpnData.wireguard.installed
                      ? vpnData.wireguard.active
                        ? 'Aktív'
                        : 'Telepítve (inaktív)'
                      : 'Nincs telepítve'
                    : 'Betöltés...'}
                </div>
                {vpnData?.wireguard?.output && (
                  <div className="text-slate-600 truncate">{vpnData.wireguard.output}</div>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-slate-700" />
                Lemezek (df / SMART) & Rsync Mentés
              </h3>
              <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[11px]">
                {(diskData?.blockDevices || []).map((b, i) => (
                  <div key={i} className="flex justify-between gap-2 p-1 bg-slate-50 border border-slate-200 rounded">
                    <span className="truncate">/dev/{b.name} {b.mountpoint ? `(${b.mountpoint})` : ''}</span>
                    <span className="shrink-0">{b.size} {b.smartHealth ? `· ${b.smartHealth}` : ''}</span>
                  </div>
                ))}
                {diskData?.dfOutput && (
                  <pre className="p-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] overflow-x-auto">
                    {diskData.dfOutput}
                  </pre>
                )}
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

          {/* SSH Fleet (Ú15, M55 Bulk) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-700" />
                SSH Flotta Profilok & Párhuzamos Távoli Parancsfuttatás
              </h3>
              {sshProfiles.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/infra/ssh/bulk', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ profileIds: [], command: sshCmd }),
                    });
                    const d = (await r.json()) as {
                      results?: Array<{ name: string; host: string; ok: boolean; durationMs: number; output: string }>;
                      error?: string;
                    };
                    if (d.results) {
                      setSshOut(
                        d.results
                          .map((res) => `=== ${res.name} (${res.host}) [${res.ok ? 'OK' : 'ERR'} ${res.durationMs}ms] ===\n${res.output}`)
                          .join('\n\n')
                      );
                    } else {
                      setSshOut(d.error || 'Hiba.');
                    }
                    await onRefreshState();
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
                >
                  Futtatás az Összesen ({sshProfiles.length})
                </button>
              )}
            </div>
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

          {/* SuperAdmin Linux Suite: Firewall (Ú37), Hardware/GPIO (Ú38), Network Diag (Ú39), Cron/Timers (Ú40) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-slate-700" />
                Tűzfal (UFW/nft) & Nyitott Portok (`ss`)
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await fetch('/api/infra/firewall/rule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rule: fwRule }),
                  });
                  const d = (await r.json()) as { command?: string; error?: string };
                  setInfraMsg(d.command ? `Jóváhagyási sorba téve: ${d.command}` : d.error || 'Hiba');
                  await onRefreshState();
                }}
                className="flex gap-2"
              >
                <input type="text" value={fwRule} onChange={(e) => setFwRule(e.target.value)} placeholder="allow 3000/tcp" className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
                <button type="submit" className="px-3 py-1.5 bg-slate-900 text-white rounded whitespace-nowrap shrink-0">UFW Szabály Javaslata</button>
              </form>
              {fwData && (
                <div className="space-y-2">
                  <div className="font-mono text-slate-600">Aktív tűzfal: {fwData.firewallTool}</div>
                  <pre className="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono max-h-32 overflow-auto">{fwData.firewallOutput}</pre>
                  <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[10px] font-mono max-h-32 overflow-auto">{fwData.portsOutput}</pre>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-slate-700" />
                Hardver Szenzorok, Raspberry Pi GPIO & I2C
              </h3>
              {hwSensors ? (
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex flex-wrap gap-2">
                    {hwSensors.thermalZones.map((tz, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums">
                        {tz.name}: {tz.tempC}°C
                      </span>
                    ))}
                  </div>
                  {hwSensors.piVcgencmd.available && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                      Pi vcgencmd: {hwSensors.piVcgencmd.temp} · {hwSensors.piVcgencmd.throttled}
                    </div>
                  )}
                  <pre className="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] max-h-28 overflow-auto">
                    GPIO: {hwSensors.gpio.output}{'\n'}I2C: {hwSensors.i2c.buses}
                  </pre>
                </div>
              ) : (
                <p className="text-slate-500">Szenzoradatok betöltése...</p>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Network className="h-4 w-4 text-slate-700" />
                Hálózati Diagnosztika (DNS · Ping · Traceroute · Publikus IP)
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await fetch('/api/infra/network', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetHost: netTarget }),
                  });
                  if (r.ok) setNetResult(await r.json());
                }}
                className="flex gap-2"
              >
                <input type="text" value={netTarget} onChange={(e) => setNetTarget(e.target.value)} placeholder="1.1.1.1 vagy github.com" className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
                <button type="submit" className="px-3 py-1.5 bg-slate-900 text-white rounded whitespace-nowrap shrink-0">Diagnosztika</button>
              </form>
              {netResult && (
                <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[10px] font-mono max-h-44 overflow-auto whitespace-pre-wrap">
                  {`Cél: ${netResult.target} | Publikus IP: ${netResult.publicIp || 'n/a'}\nDNS: ${netResult.dnsAddresses.join(', ')}\n\n${netResult.pingOutput}\n\n${netResult.tracerouteOutput}`}
                </pre>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-700" />
                Gazdagép Linux Crontab & Systemd Timerek
              </h3>
              {linuxCron ? (
                <div className="space-y-2">
                  <pre className="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono max-h-24 overflow-auto">{linuxCron.userCrontab}</pre>
                  <pre className="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono max-h-28 overflow-auto">{linuxCron.systemdTimers}</pre>
                </div>
              ) : (
                <p className="text-slate-500">Betöltés...</p>
              )}
            </div>
          </div>

          {/* File Vault (Ú41), Reverse Proxy (Ú42), Docker Compose (Ú57) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="h-4 w-4 text-slate-700" />
                AES-256-GCM Fájl Széf (`.nsenc`)
              </h3>
              <input type="text" value={vaultPath} onChange={(e) => setVaultPath(e.target.value)} placeholder="Relatív fájlútvonal (pl. README.md)" className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="password" value={vaultPass} onChange={(e) => setVaultPass(e.target.value)} placeholder="Titkosítási jelszó (min. 4 kar.)" className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/infra/vault/encrypt', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ relPath: vaultPath, passphrase: vaultPass }),
                    });
                    const d = (await r.json()) as { outputPath?: string; bytes?: number; error?: string };
                    setVaultResult(d.outputPath ? `Titkosítva: ${d.outputPath} (${d.bytes} B)` : d.error || 'Hiba');
                  }}
                  className="flex-1 px-2.5 py-1.5 bg-slate-900 text-white rounded font-medium"
                >
                  Titkosítás
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/infra/vault/decrypt', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ relEncPath: vaultPath, passphrase: vaultPass }),
                    });
                    const d = (await r.json()) as { outputPath?: string; bytes?: number; error?: string };
                    setVaultResult(d.outputPath ? `Visszafejtve: ${d.outputPath} (${d.bytes} B)` : d.error || 'Hiba');
                  }}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Visszafejtés
                </button>
              </div>
              {vaultResult && <div className="font-mono text-[11px] text-slate-700">{vaultResult}</div>}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Server className="h-4 w-4 text-slate-700" />
                Reverse Proxy (Nginx / Caddy)
              </h3>
              {proxyData && (
                <div className="font-mono text-[11px] text-slate-600">
                  Nginx: {proxyData.nginxAvailable ? 'OK' : 'nincs'} · Caddy: {proxyData.caddyAvailable ? 'OK' : 'nincs'} · Oldalak: {proxyData.sites.length}
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                <select value={proxyKind} onChange={(e) => setProxyKind(e.target.value as 'caddy' | 'nginx')} className="px-2 py-1.5 border border-slate-300 rounded bg-white">
                  <option value="caddy">Caddy</option>
                  <option value="nginx">Nginx</option>
                </select>
                <input type="text" value={proxyDomain} onChange={(e) => setProxyDomain(e.target.value)} className="px-2 py-1.5 font-mono border border-slate-300 rounded" />
                <input type="number" value={proxyPort} onChange={(e) => setProxyPort(Number(e.target.value))} className="px-2 py-1.5 font-mono border border-slate-300 rounded" />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/infra/proxy/template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind: proxyKind, domain: proxyDomain, upstreamPort: proxyPort }),
                  });
                  const d = (await r.json()) as { template?: string };
                  setProxyTplOut(d.template || '');
                }}
                className="w-full px-3 py-1.5 bg-slate-900 text-white rounded font-medium"
              >
                Konfig Sablon Generálása
              </button>
              {proxyTplOut && <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[10px] font-mono max-h-32 overflow-auto">{proxyTplOut}</pre>}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <FileCode2 className="h-4 w-4 text-slate-700" />
                <span>Docker Compose Sablon Generátor</span>
                <InfoHint
                  label="Docker Compose generátor"
                  text="Kész konfigurációs fájlokat állít elő népszerű otthoni szerver programok (pl. kereső, MQTT, adatbázis) gyors indításához."
                />
              </h3>
              <div className="flex gap-2">
                <select value={composeStack} onChange={(e) => setComposeStack(e.target.value as typeof composeStack)} className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  <option value="searxng">SearXNG (Privát Kereső)</option>
                  <option value="mosquitto">Mosquitto (MQTT Broker)</option>
                  <option value="ntfy">ntfy (Push Értesítő)</option>
                  <option value="uptime_kuma">Uptime Kuma</option>
                  <option value="postgres">PostgreSQL 16</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/infra/docker/compose', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ stack: composeStack }),
                    });
                    const d = (await r.json()) as { yaml?: string };
                    setComposeYaml(d.yaml || '');
                  }}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium whitespace-nowrap shrink-0"
                >
                  YAML Készítése
                </button>
              </div>
              {composeYaml && <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[10px] font-mono max-h-36 overflow-auto">{composeYaml}</pre>}
            </div>
          </div>

          <Suspense fallback={<div className="p-4 text-xs text-slate-500">Cluster & Hálózati modul betöltése...</div>}>
            <Batch3InfraClusterPanel clusterNodes={clusterNodes} onRefreshState={onRefreshState} />
          </Suspense>
        </div>
      )}

      {subTab === 'diagnostics' && (
        <div className="space-y-6">
          {/* M54 Security Hardening, B3 Swarm Auto-Doctor, Ú53 Password HIBP */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-slate-700" />
                  Biztonsági Keményítési Pontszám
                </h3>
                {hardeningData && (
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {hardeningData.score}% ({hardeningData.grade})
                  </span>
                )}
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {(hardeningData?.checks || []).map((c) => (
                  <div key={c.id} className="p-2 bg-slate-50 border border-slate-200 rounded">
                    <div className="flex justify-between gap-2 font-medium">
                      <span className={c.ok ? 'text-emerald-800' : 'text-amber-800'}>
                        [{c.ok ? 'OK' : 'HIÁNY'}] {c.label}
                      </span>
                      <span className="font-mono tabular-nums shrink-0">{c.ok ? c.points : 0}/{c.points}p</span>
                    </div>
                    {!c.ok && <div className="text-[11px] text-slate-500 mt-0.5">{c.hint}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <HeartPulse className="h-4 w-4 text-slate-700" />
                  <span>Rendszer Gyorsjavító &amp; Öngyógyítás</span>
                  <InfoHint
                    label="Rendszer gyorsjavító"
                    text="Egy kattintással ellenőrzi az adatbázist, a kulcsok állapotát és elhárítja a kisebb elakadásokat."
                  />
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/system/doctor', { method: 'POST' });
                    if (r.ok) {
                      setDoctorData(await r.json());
                      await onRefreshState();
                    }
                  }}
                  className="px-3 py-1 bg-slate-900 text-white rounded font-medium whitespace-nowrap shrink-0"
                >
                  Doktor Futtatása
                </button>
              </div>
              {doctorData ? (
                <div className="space-y-2">
                  <div className="font-mono text-slate-600">{doctorData.uptimeSummary}</div>
                  {doctorData.healedActions.map((a, i) => (
                    <div key={i} className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-900">{a}</div>
                  ))}
                  {doctorData.warnings.map((w, i) => (
                    <div key={i} className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900">{w}</div>
                  ))}
                  {doctorData.healedActions.length === 0 && doctorData.warnings.length === 0 && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-700">Minden alrendszer egészséges.</div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500">Indítsd el a Raj Auto-Doktort az API kulcs cooldown-ok, memória salience és uptime célok azonnali javításához.</p>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-slate-700" />
                Jelszó Entrópia & HIBP k-Anonymity Ellenőrző
              </h3>
              <p className="text-[11px] text-slate-500">Csak a SHA-1 hash első 5 karaktere hagyja el a gépet; nyílt szövegű jelszó soha nem kerül továbbításra.</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!pwInput) return;
                  const r = await fetch('/api/security/password-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwInput }),
                  });
                  if (r.ok) setPwResult(await r.json());
                }}
                className="flex gap-2"
              >
                <input type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)} placeholder="Tesztelendő jelszó..." className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded" />
                <button type="submit" className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium whitespace-nowrap shrink-0">Ellenőrzés</button>
              </form>
              {pwResult && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded space-y-1 font-mono text-[11px] tabular-nums">
                  <div>Hossz: {pwResult.length} kar. · Entrópia: {pwResult.entropyBits} bit ({pwResult.strengthLabel})</div>
                  <div className={pwResult.breached ? 'text-red-700 font-semibold' : 'text-emerald-800 font-semibold'}>
                    {pwResult.hibpChecked
                      ? pwResult.breached
                        ? `VESZÉLY: ${pwResult.breachCount} adatszivárgásban szerepelt!`
                        : 'Nem szerepel az ismert adatszivárgásokban (HIBP OK).'
                      : `HIBP offline (${pwResult.hibpError || 'nincs hálózat'})`}
                  </div>
                </div>
              )}
            </div>
          </div>

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
                    Ellenőrizve: {new Date(diagData.checkedAt).toLocaleTimeString()}
                  </div>
                  {(diagData.checks || []).map((chk, idx) => (
                    <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between gap-2 font-mono">
                      <span className={chk.ok ? 'text-emerald-800 font-semibold' : 'text-amber-800 font-semibold'}>
                        [{chk.ok ? 'OK' : 'WARN'}] {chk.name}
                      </span>
                      <span className="text-slate-600 truncate">{chk.detail}</span>
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
                <h3 className="text-base font-semibold text-slate-900">Biztonságos .env Konfig (Titkok maszkázva)</h3>
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
      {subTab === 'pi_hw_b4' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Hardver &amp; Fájlok betöltése...</div>}>
          <Batch4HardwareNetPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
      {subTab === 'b5_migrate' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Költöztető &amp; Optimalizáló betöltése...</div>}>
          <Batch5MigrationAndAutoPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
      {subTab === 'b6_apex' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Labor &amp; Hálózat betöltése...</div>}>
          <Batch6ApexLabPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
      {subTab === 'b7_universe' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Eszköztár &amp; Készségek betöltése...</div>}>
          <Batch7UniverseLabPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
      {subTab === 'b8_omni' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Képesség Stúdió betöltése...</div>}>
          <Batch8SingularityPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
      {subTab === 'autonomy_center' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Autonómia központ betöltése...</div>}>
          <AutonomyCenterView onRefreshState={onRefreshState} />
        </Suspense>
      )}
    </div>
  );
};
