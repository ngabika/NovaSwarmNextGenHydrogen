import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  Cpu,
  Eye,
  Gauge,
  Globe,
  HardDrive,
  HeartPulse,
  MailCheck,
  Monitor,
  Play,
  Printer,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  Volume2,
  Wrench,
} from 'lucide-react';
import type {
  HardwareAdaptiveProfile,
  MigrationRunRecord,
  NovaSwarmState,
  VisualWatchItem,
} from '../../shared/types';

interface Props {
  state?: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

interface HardwareSnapshotResponse {
  profile: HardwareAdaptiveProfile;
  telemetryBuffer: {
    bufferedCount: number;
    lastFlushedCount: number;
    lastFlushAt: string | null;
  };
}

export const Batch5MigrationAndAutoPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  // 1. Hardware-Adaptive Profile
  const [hwProfile, setHwProfile] = useState<HardwareAdaptiveProfile | null>(
    state?.hardwareProfile ?? null
  );
  const [bufferInfo, setBufferInfo] = useState<{ bufferedCount: number; lastFlushAt: string | null } | null>(null);
  const [hwMsg, setHwMsg] = useState<string | null>(null);
  const [ramWdResult, setRamWdResult] = useState<string | null>(null);
  const [hybridPrompt, setHybridPrompt] = useState('Milyen idő lesz holnap Budapesten?');
  const [hybridOut, setHybridOut] = useState<{ target: string; provider: string; model: string; reason: string } | null>(null);

  // 2. 1-Shot SSH Migrator
  const [targetIp, setTargetIp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [targetAppPort, setTargetAppPort] = useState(3000);
  const [stopOldInstance, setStopOldInstance] = useState(true);
  const [migTesting, setMigTesting] = useState(false);
  const [migRunning, setMigRunning] = useState(false);
  const [migPreview, setMigPreview] = useState<{
    arch: string;
    cpuCores: number;
    ramTotalMb: number;
    gpuName: string;
    recommendedTier: string;
    recommendedModel: string;
  } | null>(null);
  const [migError, setMigError] = useState<string | null>(null);
  const [migRecord, setMigRecord] = useState<MigrationRunRecord | null>(
    state?.settings.lastMigrationRecord ?? null
  );

  // 3. Proactive Second Self & Self-Testing Tool
  const [briefOut, setBriefOut] = useState<string | null>(null);
  const [triageOut, setTriageOut] = useState<string | null>(null);
  const [healOut, setHealOut] = useState<string | null>(null);
  const [toolName, setToolName] = useState('calc_vat_hu');
  const [toolDesc, setToolDesc] = useState('27% ÁFA számító JS eszköz');
  const [toolCode, setToolCode] = useState('const net = Number(input.sample || 100); return { net, gross: Math.round(net * 1.27) };');
  const [toolMsg, setToolMsg] = useState<string | null>(null);

  // 4. Physical World & Headless Visual Watch
  const [shotUrl, setShotUrl] = useState('https://example.com');
  const [shotResult, setShotResult] = useState<{ url: string; screenshotBase64?: string; textPreview?: string; error?: string } | null>(null);
  const [watchName, setWatchName] = useState('');
  const [watchUrl, setWatchUrl] = useState('');
  const [camResult, setCamResult] = useState<{ ok: boolean; imageBase64?: string; toolUsed?: string | null; error?: string } | null>(null);
  const [gpioPin, setGpioPin] = useState(17);
  const [gpioOut, setGpioOut] = useState<string | null>(null);
  const [printText, setPrintText] = useState('NovaSwarm Rendszer Teszt Oldal');
  const [speakText, setSpeakText] = useState('NovaSwarm rendszer készenlétben áll.');
  const [deviceMsg, setDeviceMsg] = useState<string | null>(null);

  const loadHwProfile = async () => {
    try {
      const r = await fetch('/api/v5/hardware-profile');
      if (r.ok) {
        const d = (await r.json()) as HardwareSnapshotResponse;
        setHwProfile(d.profile);
        setBufferInfo(d.telemetryBuffer);
      }
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    void loadHwProfile();
  }, []);

  useEffect(() => {
    if (state?.hardwareProfile) setHwProfile(state.hardwareProfile);
    if (state?.settings.lastMigrationRecord) setMigRecord(state.settings.lastMigrationRecord);
  }, [state]);

  const handleApplyHwOpt = async () => {
    setHwMsg(null);
    const r = await fetch('/api/v5/hardware-profile/apply', { method: 'POST' });
    const d = (await r.json()) as { ok?: boolean; profile?: HardwareAdaptiveProfile; updatedSettingsFields?: string[]; error?: string };
    if (!r.ok) {
      setHwMsg(d.error || 'Hiba az optimalizáláskor');
      return;
    }
    if (d.profile) setHwProfile(d.profile);
    setHwMsg(`Hardver-adaptív optimalizálás alkalmazva (${d.updatedSettingsFields?.length || 0} paraméter frissítve).`);
    await onRefreshState();
  };

  const handleRunRamWatchdog = async () => {
    const r = await fetch('/api/v5/ram-watchdog/run', { method: 'POST' });
    if (r.ok) {
      const d = (await r.json()) as { ramPercent: number; thresholdPercent: number; triggered: boolean; actionsTaken: string[] };
      setRamWdResult(
        `RAM: ${d.ramPercent}% (küszöb: ${d.thresholdPercent}%) · ${d.triggered ? `VÉDELEM AKTÍV: ${d.actionsTaken.join(', ')}` : 'Rendben'}`
      );
      await loadHwProfile();
      await onRefreshState();
    }
  };

  const handleTestMigrationConnection = async () => {
    setMigTesting(true);
    setMigError(null);
    setMigPreview(null);
    try {
      const r = await fetch('/api/v5/migrate/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetIp, username, password, sshPort, targetAppPort, stopOldInstance }),
      });
      const d = (await r.json()) as { ok?: boolean; hardwarePreview?: typeof migPreview; error?: string };
      if (!r.ok || !d.ok) {
        setMigError(d.error || 'SSH kapcsolat sikertelen.');
      } else if (d.hardwarePreview) {
        setMigPreview(d.hardwarePreview);
      }
    } finally {
      setMigTesting(false);
    }
  };

  const handleStartMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    setMigRunning(true);
    setMigError(null);
    try {
      const r = await fetch('/api/v5/migrate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIp,
          username,
          password,
          sshPort,
          targetAppPort,
          stopOldInstance,
        }),
      });
      const d = (await r.json()) as { record?: MigrationRunRecord; error?: string };
      if (d.record) {
        setMigRecord(d.record);
        if (d.record.status === 'failed') setMigError(d.record.error || 'Költöztetés sikertelen.');
      } else if (d.error) {
        setMigError(d.error);
      }
      setPassword('');
      await onRefreshState();
    } catch (err) {
      setMigError(err instanceof Error ? err.message : 'Hálózati hiba vagy a régi gép sikeresen leállt az átállás után.');
    } finally {
      setMigRunning(false);
    }
  };

  const visualItems: VisualWatchItem[] = state?.visualWatchItems || [];
  const proactiveEvents = state?.proactiveEvents || [];

  return (
    <div className="space-y-6">
      {/* 1. One-Shot SSH Host Migration ("Költöztető") */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              1-Kattintásos SSH Költöztető (Átköltözés Új Gépre)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Csak a cél gép helyi IP-je, felhasználóneve és jelszava kell. Minden függőséget, állapotot, kulcsszéfet és memóriát átvisz SSH-n, az új gép hardverére optimalizálja a rendszert, majd leállítja a régi példányt.
            </p>
          </div>
        </div>

        <form onSubmit={handleStartMigration} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="mig-ip" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cél gép helyi IP / Host
              </label>
              <input
                id="mig-ip"
                type="text"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
                placeholder="192.168.1.150"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="mig-user" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                SSH Felhasználónév
              </label>
              <input
                id="mig-user"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ngabika"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="mig-pass" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                SSH Jelszó (nem kerül mentésre)
              </label>
              <input
                id="mig-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="mig-ssh-port" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                SSH Port
              </label>
              <input
                id="mig-ssh-port"
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="mig-app-port" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Új Web UI Port
              </label>
              <input
                id="mig-app-port"
                type="number"
                value={targetAppPort}
                onChange={(e) => setTargetAppPort(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={stopOldInstance}
              onChange={(e) => setStopOldInstance(e.target.checked)}
            />
            <span>Régi gép automatikus leállítása sikeres átállás után (onnantól kizárólag az új gépen fusson)</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={migTesting || migRunning}
              onClick={() => void handleTestMigrationConnection()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Server className="h-3.5 w-3.5" />
              {migTesting ? 'Tesztelés...' : 'Kapcsolat & Cél Hardver Teszt'}
            </button>
            <button
              type="submit"
              disabled={migRunning || migTesting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              {migRunning ? 'Költöztetés folyamatban...' : 'Költöztetés Indítása SSH-n'}
            </button>
          </div>
        </form>

        {migError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 font-mono">
            {migError}
          </div>
        )}

        {migPreview && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1 text-emerald-950">
            <div className="font-semibold">Cél gép elérhető & profilozva:</div>
            <div className="font-mono">
              Arch: {migPreview.arch} · CPU: {migPreview.cpuCores} mag · RAM: {migPreview.ramTotalMb} MB · GPU: {migPreview.gpuName}
            </div>
            <div className="font-mono">
              Automatikus optimalizálás az új gépen: {migPreview.recommendedTier} · Ajánlott modell: {migPreview.recommendedModel}
            </div>
          </div>
        )}

        {migRecord && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                Utolsó költöztetés: {migRecord.username}@{migRecord.targetIp} — {migRecord.stage}
              </span>
              <span
                className={`font-mono font-bold uppercase ${
                  migRecord.status === 'completed'
                    ? 'text-emerald-700'
                    : migRecord.status === 'failed'
                    ? 'text-red-700'
                    : 'text-amber-700'
                }`}
              >
                {migRecord.status}
              </span>
            </div>
            {migRecord.newUrl && (
              <div className="font-mono text-emerald-800 dark:text-emerald-300">
                Új példány elérhető: {migRecord.newUrl}
              </div>
            )}
            <pre className="p-2 bg-slate-900 text-slate-100 rounded text-[11px] font-mono max-h-36 overflow-auto whitespace-pre-wrap">
              {migRecord.logs.join('\n')}
            </pre>
          </div>
        )}
      </div>

      {/* 2. Hardware-Adaptive Optimization Engine & 2 GB Pi RAM/SD Guard */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              Hardver-Adaptív Optimalizáló Engine & Pi 2 GB Védelem
            </h3>
            <p className="text-xs text-slate-500">
              A gép CPU/RAM/Swap/Tárhely/GPU képességei alapján önállóan hangolja a modelleket, a párhuzamosságot, a RAM-őrszemet és az SD-kártya kímélő puffert.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleRunRamWatchdog()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              RAM/OOM Őrszem
            </button>
            <button
              type="button"
              onClick={() => void handleApplyHwOpt()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Hardver Újra-profilozás & Optimalizálás
            </button>
          </div>
        </div>

        {hwMsg && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900">
            {hwMsg}
          </div>
        )}
        {ramWdResult && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800">
            {ramWdResult}
          </div>
        )}

        {hwProfile && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500">Aktív Hardver Kategória</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{hwProfile.tierLabel}</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500">CPU / RAM / Arch</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {hwProfile.cpuCores} mag · {hwProfile.ramTotalMb} MB ({hwProfile.arch})
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500">Ajánlott Ollama & Ctx</div>
                <div className="font-mono font-semibold mt-0.5">
                  {hwProfile.recommendedOllamaModel} ({hwProfile.recommendedNumCtx})
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500">Heap / Párhuzamosság</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {hwProfile.recommendedHeapMb} MB · {hwProfile.recommendedConcurrency} szál
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500">SD-Kímélő Puffer</div>
                <div className="font-mono font-semibold mt-0.5">
                  {hwProfile.sdCardSparingRecommended ? 'AKTÍV' : 'Normál I/O'} ({bufferInfo?.bufferedCount ?? 0} minta)
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500">RAM Őrszem Küszöb</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {hwProfile.recommendedRamWatchdogPercent}%
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                Hibrid Lokális / Felhő Router Előnézet
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hybridPrompt}
                  onChange={(e) => setHybridPrompt(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v5/hybrid-route/preview', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ prompt: hybridPrompt, complexity: 'simple' }),
                    });
                    if (r.ok) setHybridOut(await r.json());
                  }}
                  className="px-2.5 py-1.5 bg-slate-900 text-white rounded whitespace-nowrap"
                >
                  Útvonal Teszt
                </button>
              </div>
              {hybridOut && (
                <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  Cél: {hybridOut.provider} ({hybridOut.model}) — {hybridOut.reason}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Proactive Second Self + Self-Testing Dynamic Tool Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            Proaktív "Második Én" & Öngyógyítás
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v5/proactive/brief', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ period: 'morning', sendTelegram: false }),
                });
                if (r.ok) {
                  const d = (await r.json()) as { text: string };
                  setBriefOut(d.text);
                  await onRefreshState();
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              Reggeli Brief Generálás
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v5/proactive/brief', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ period: 'evening', sendTelegram: false }),
                });
                if (r.ok) {
                  const d = (await r.json()) as { text: string };
                  setBriefOut(d.text);
                  await onRefreshState();
                }
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Esti Brief Generálás
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v5/proactive/inbox-triage', { method: 'POST' });
                if (r.ok) {
                  const d = (await r.json()) as { scannedEmails: number; packagesAdded: number; expensesAdded: number; urgentAlerts: string[] };
                  setTriageOut(`Email Triage (${d.scannedEmails} levél): +${d.packagesAdded} csomag, +${d.expensesAdded} kiadás, ${d.urgentAlerts.length} sürgős`);
                  await onRefreshState();
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50"
            >
              <MailCheck className="h-3.5 w-3.5" />
              Inbox Triage
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v5/proactive/self-heal', { method: 'POST' });
                if (r.ok) {
                  const d = (await r.json()) as { healedActions: string[]; failedServices: string[] };
                  setHealOut(`Öngyógyítás: ${d.healedActions.join(' | ') || 'minden rendben'} · Hibás unitok: ${d.failedServices.join(', ') || '0'}`);
                  await onRefreshState();
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50"
            >
              <HeartPulse className="h-3.5 w-3.5" />
              Öngyógyító Démon
            </button>
          </div>
          {briefOut && (
            <pre className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono whitespace-pre-wrap">
              {briefOut}
            </pre>
          )}
          {triageOut && <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{triageOut}</div>}
          {healOut && <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{healOut}</div>}

          <div className="space-y-1.5 max-h-40 overflow-y-auto pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-600">Legutóbbi Proaktív Események ({proactiveEvents.length})</div>
            {proactiveEvents.slice(0, 6).map((ev) => (
              <div key={ev.id} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-xs">
                <div className="font-semibold">{ev.title}</div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{ev.summary}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            Önellenőrző Dinamikus Eszközgyár (Auto-Test & Repair)
          </h3>
          <p className="text-xs text-slate-500">
            Minden új eszköz mentése előtt automatikusan sandbox füsttesztet futtat, és szintaktikai hiba esetén önállóan kijavítja a kódot.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="Eszköz név (pl. calc_vat_hu)"
              className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <input
              type="text"
              value={toolDesc}
              onChange={(e) => setToolDesc(e.target.value)}
              placeholder="Rövid leírás"
              className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
          </div>
          <textarea
            rows={3}
            value={toolCode}
            onChange={(e) => setToolCode(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <button
            type="button"
            onClick={async () => {
              setToolMsg(null);
              const r = await fetch('/api/v5/tools/selftest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: toolName,
                  description: toolDesc,
                  kind: 'sandbox_js',
                  targetOrCode: toolCode,
                }),
              });
              const d = (await r.json()) as { ok?: boolean; repaired?: boolean; testOutput?: string; error?: string };
              setToolMsg(
                d.ok
                  ? `Füstteszt SIKERES${d.repaired ? ' (önjavítva)' : ''}: ${d.testOutput}`
                  : `Hiba: ${d.error}`
              );
              await onRefreshState();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Önellenőrző Teszt & Mentés
          </button>
          {toolMsg && (
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono">
              {toolMsg}
            </div>
          )}
        </div>
      </div>

      {/* 4. Physical World & Headless Visual Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            Headless Screenshot & Vizuális Oldalváltozás-Figyelő
          </h3>
          <div className="flex gap-2 text-xs">
            <input
              type="url"
              value={shotUrl}
              onChange={(e) => setShotUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v5/screenshot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: shotUrl }),
                });
                if (r.ok) setShotResult(await r.json());
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded font-medium whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" />
              Capture
            </button>
          </div>
          {shotResult && (
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs space-y-2">
              {shotResult.screenshotBase64 ? (
                <img
                  src={`data:image/png;base64,${shotResult.screenshotBase64}`}
                  alt="Web Screenshot"
                  className="max-h-40 rounded border border-slate-300"
                />
              ) : (
                <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300 max-h-24 overflow-auto">
                  {shotResult.textPreview || shotResult.error}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={watchName}
                onChange={(e) => setWatchName(e.target.value)}
                placeholder="Figyelt oldal neve"
                className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
              />
              <input
                type="url"
                value={watchUrl}
                onChange={(e) => setWatchUrl(e.target.value)}
                placeholder="https://..."
                className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!watchUrl.trim()) return;
                  await fetch('/api/v5/visual-watch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: watchName, url: watchUrl }),
                  });
                  setWatchName('');
                  setWatchUrl('');
                  await onRefreshState();
                }}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50"
              >
                <Eye className="h-3.5 w-3.5" />
                + Vizuális Figyelő
              </button>
            </div>
            {visualItems.map((vw) => (
              <div key={vw.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{vw.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">
                    {vw.lastStatusNote} · változás: {vw.changeCount}x
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/v5/visual-watch/check', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: vw.id }),
                    });
                    await onRefreshState();
                  }}
                  className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] shrink-0"
                >
                  Ellenőrzés
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            Fizikai Világ: Kamera · GPIO · CUPS Nyomtató · Hangszóró TTS
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                USB / Pi Kamera (/cam)
              </div>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/v5/camera/capture', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sendTelegram: false }),
                  });
                  if (r.ok) setCamResult(await r.json());
                }}
                className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium"
              >
                Kamera Pillanatkép
              </button>
              {camResult && (
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  {camResult.ok ? `Kép elkészült (${camResult.toolUsed})` : camResult.error}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
              <div className="font-semibold">GPIO Tüske Vezérlő (0–53)</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={53}
                  value={gpioPin}
                  onChange={(e) => setGpioPin(Number(e.target.value))}
                  aria-label="GPIO Pin"
                  className="w-16 px-2 py-1 font-mono border border-slate-300 rounded bg-white dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v5/gpio/read', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ pin: gpioPin }),
                    });
                    const d = (await r.json()) as { message?: string; error?: string };
                    setGpioOut(d.message || d.error || '');
                  }}
                  className="px-2 py-1 border border-slate-300 rounded bg-white dark:bg-slate-900"
                >
                  Olvas
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v5/gpio/set', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ pin: gpioPin, value: 1 }),
                    });
                    const d = (await r.json()) as { message?: string; error?: string };
                    setGpioOut(d.message || d.error || '');
                  }}
                  className="px-2 py-1 bg-slate-900 text-white rounded"
                >
                  HIGH (1)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v5/gpio/set', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ pin: gpioPin, value: 0 }),
                    });
                    const d = (await r.json()) as { message?: string; error?: string };
                    setGpioOut(d.message || d.error || '');
                  }}
                  className="px-2 py-1 border border-slate-300 rounded"
                >
                  LOW (0)
                </button>
              </div>
              {gpioOut && <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">{gpioOut}</div>}
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex gap-2">
              <input
                type="text"
                value={printText}
                onChange={(e) => setPrintText(e.target.value)}
                aria-label="CUPS nyomtatandó szöveg"
                className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
              />
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/v5/print', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ textContent: printText }),
                  });
                  const d = (await r.json()) as { message?: string; error?: string };
                  setDeviceMsg(d.message || d.error || '');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
              >
                <Printer className="h-3.5 w-3.5" />
                Nyomtatás
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={speakText}
                onChange={(e) => setSpeakText(e.target.value)}
                aria-label="Hangszóró szöveg"
                className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
              />
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/v5/speak', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: speakText }),
                  });
                  const d = (await r.json()) as { detail?: string; error?: string };
                  setDeviceMsg(d.detail || d.error || '');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Hangos Bemondás
              </button>
            </div>
            {deviceMsg && (
              <div className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-[11px]">
                {deviceMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
