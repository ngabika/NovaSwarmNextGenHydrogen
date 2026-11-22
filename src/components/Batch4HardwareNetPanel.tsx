import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  FolderOpen,
  LayoutGrid,
  Save,
  ShieldAlert,
  Terminal,
  UploadCloud,
  Zap,
} from 'lucide-react';
import type { NovaSwarmState } from '../../shared/types';

interface Props {
  state?: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

export const Batch4HardwareNetPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  // Pi Deep Hardware (Ú161–Ú165, M207–M208)
  const [deepHw, setDeepHw] = useState<{
    hostname: string;
    arch: string;
    loadAvg1m: number;
    loadThrottleActive: boolean;
    zramPresent: boolean;
    memAvailableMb: number;
    swapFreeMb: number;
    swapTotalMb: number;
    gpioChips: string[];
    i2cBuses: string[];
    thermalZones: Array<{ name: string; tempC: number }>;
    blockDevices: Array<{ name: string; size: string; mountpoint?: string }>;
    ffmpegAvailable: boolean;
    whisperAvailable: boolean;
  } | null>(null);

  // LAN Intruder Detector (Ú194) & Smart Meter (Ú167)
  const [intruderRes, setIntruderRes] = useState<{
    totalSeen: number;
    knownCount: number;
    unknownDevices: Array<{ ip: string; mac: string; iface: string }>;
  } | null>(null);
  const [meterUrl, setMeterUrl] = useState('http://192.168.1.50/status');
  const [meterOut, setMeterOut] = useState<string | null>(null);

  // Two-Panel File Commander (Ú199)
  const [dirPath, setDirPath] = useState('.');
  const [dirEntries, setDirEntries] = useState<Array<{ name: string; path: string; isDir: boolean; sizeBytes: number }>>([]);
  const [parentPath, setParentPath] = useState('');
  const [editPath, setEditPath] = useState('');
  const [editContent, setEditContent] = useState('');
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  // LAN Drop (Ú188)
  const [dropFiles, setDropFiles] = useState<Array<{ name: string; sizeBytes: number }>>([]);

  // Bash Copilot (Ú251) & Post-Mortem (Ú253)
  const [bashIntent, setBashIntent] = useState('');
  const [bashRes, setBashRes] = useState<{ command: string; explanation: string; output: string } | null>(null);
  const [pmText, setPmText] = useState<string | null>(null);

  // Custom Widget (Ú258)
  const [wTitle, setWTitle] = useState('');
  const [wKind, setWKind] = useState<'shell_cmd' | 'http_json'>('shell_cmd');
  const [wSource, setWSource] = useState('uptime -p');

  const loadDir = async (targetPath: string) => {
    const r = await fetch(`/api/v4/files/list?path=${encodeURIComponent(targetPath)}`);
    const d = (await r.json()) as {
      currentPath?: string;
      parentPath?: string;
      entries?: typeof dirEntries;
      error?: string;
    };
    if (!r.ok) {
      setFileMsg(d.error || 'Hiba');
      return;
    }
    setDirPath(d.currentPath || targetPath);
    setParentPath(d.parentPath || '');
    setDirEntries(d.entries || []);
  };

  useEffect(() => {
    void fetch('/api/v4/pi/deep-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setDeepHw(d);
      })
      .catch(() => {});
    void fetch('/api/v4/landrop')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { files?: Array<{ name: string; sizeBytes: number }> } | null) => {
        if (d?.files) setDropFiles(d.files);
      })
      .catch(() => {});
    void loadDir('.').catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pi Deep Hardware Telemetry */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-600" />
              Pi Hardver, GPIO/I2C, ZRAM & Szenzorok (Ú161, M207)
            </h3>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/pi/deep-status');
                setDeepHw(await r.json());
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              Mély Diagnosztika
            </button>
          </div>
          {deepHw && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1 font-mono">
              <div>{deepHw.hostname} ({deepHw.arch}) · Load 1m: {deepHw.loadAvg1m} {deepHw.loadThrottleActive ? '[THROTTLE]' : ''}</div>
              <div>Szabad RAM: {deepHw.memAvailableMb} MB · ZRAM: {deepHw.zramPresent ? 'AKTÍV' : 'Nem'} · Swap: {deepHw.swapFreeMb}/{deepHw.swapTotalMb} MB</div>
              <div>GPIO: {deepHw.gpioChips.length} · I2C: {deepHw.i2cBuses.length} · FFmpeg: {deepHw.ffmpegAvailable ? 'OK' : '-'} · Whisper: {deepHw.whisperAvailable ? 'OK' : '-'}</div>
              <div>Hőfokok: {deepHw.thermalZones.map((t) => `${t.name}=${t.tempC}°C`).join(' | ') || 'N/A'}</div>
              <div>Lemezek: {deepHw.blockDevices.map((b) => `${b.name}(${b.size})`).join(', ') || 'N/A'}</div>
            </div>
          )}
        </section>

        {/* LAN MAC Intruder Detector & Smart Meter */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            LAN Behatolás-Szűrő (Ú194) & Okosmérő (Ú167)
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/network/intruders', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ markKnown: false }),
                });
                setIntruderRes(await r.json());
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              Ismeretlen MAC Keresés
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/network/intruders', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ markKnown: true }),
                });
                setIntruderRes(await r.json());
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              Jelenlegi Eszközök Rögzítése
            </button>
          </div>
          {intruderRes && (
            <div className="text-xs font-mono text-slate-700 dark:text-slate-300">
              Látott: {intruderRes.totalSeen} · Ismert: {intruderRes.knownCount} · Ismeretlen: {intruderRes.unknownDevices.length}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <input
              type="url"
              value={meterUrl}
              onChange={(e) => setMeterUrl(e.target.value)}
              placeholder="Shelly / P1 JSON URL"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/energy/smart-meter', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: meterUrl, pricePerKwh: 38 }),
                });
                const d = (await r.json()) as { rawSummary?: string; error?: string };
                setMeterOut(d.rawSummary || d.error || 'Kész');
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <Zap className="h-3.5 w-3.5" />
              Mérés
            </button>
          </div>
          {meterOut && <div className="text-xs text-slate-600 dark:text-slate-300">{meterOut}</div>}
        </section>

        {/* Bash Copilot + Post-Mortem */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Bash Copilot (Ú251) & Post-Mortem (Ú253)
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={bashIntent}
              onChange={(e) => setBashIntent(e.target.value)}
              placeholder="Írd le magyarul (pl. mennyi szabad tárhely van?)"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/bash-copilot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ intent: bashIntent, execute: true }),
                });
                setBashRes(await r.json());
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              Futtat
            </button>
          </div>
          {bashRes && (
            <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] overflow-x-auto max-h-36">
              $ {bashRes.command}
              {'\n'}# {bashRes.explanation}
              {'\n\n'}
              {bashRes.output || '(üres)'}
            </pre>
          )}
          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/system/post-mortem', { method: 'POST' });
                const d = (await r.json()) as { report?: { rootCause: string; remediationSteps: string[] } };
                if (d.report) setPmText(`${d.report.rootCause}\nJavaslat: ${d.report.remediationSteps.join(' | ')}`);
                await onRefreshState();
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Post-Mortem Hiba-Elemzés
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v4/sqlite/maintenance', { method: 'POST' });
                setPmText('SQLite WAL Checkpoint + VACUUM sikeresen lefutott.');
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <Activity className="h-3.5 w-3.5" />
              SQLite VACUUM
            </button>
          </div>
          {pmText && <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{pmText}</div>}
        </section>

        {/* Custom Dynamic Overview Widget Creator (Ú258) & LAN Drop (Ú188) */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-blue-600" />
            Egyedi Főoldali Widget (Ú258) & LAN Drop (Ú188)
          </h3>
          <div className="flex flex-wrap sm:flex-nowrap gap-2">
            <input
              type="text"
              value={wTitle}
              onChange={(e) => setWTitle(e.target.value)}
              placeholder="Widget neve"
              className="w-full sm:w-32 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <select
              aria-label="Widget típusa"
              value={wKind}
              onChange={(e) => setWKind(e.target.value as 'shell_cmd' | 'http_json')}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg shrink-0"
            >
              <option value="shell_cmd">Linux Parancs</option>
              <option value="http_json">HTTP JSON</option>
            </select>
            <input
              type="text"
              value={wSource}
              onChange={(e) => setWSource(e.target.value)}
              placeholder="uptime -p vagy http://..."
              className="flex-1 min-w-[120px] px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                if (!wTitle.trim()) return;
                await fetch('/api/v4/widgets/custom', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: wTitle, kind: wKind, source: wSource }),
                });
                setWTitle('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
            >
              Hozzáad
            </button>
          </div>
          {(state?.customWidgets || []).length > 0 && (
            <div className="text-xs space-y-1">
              {(state?.customWidgets || []).map((w) => (
                <div key={w.id} className="flex justify-between px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded">
                  <span><b>{w.title}:</b> {w.lastValue}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/v4/widgets/custom/${w.id}`, { method: 'DELETE' });
                      await onRefreshState();
                    }}
                    className="text-red-600"
                  >
                    Törlés
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="inline-flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5" /> LAN Drop Fájlcserélő</span>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/v4/landrop');
                  const d = (await r.json()) as { files?: typeof dropFiles };
                  setDropFiles(d.files || []);
                }}
                className="text-blue-700 underline"
              >
                Lista Frissítése
              </button>
            </div>
            <input
              type="file"
              aria-label="LAN Drop fájl feltöltése"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  const b64 = String(reader.result || '').split(',')[1] || '';
                  await fetch('/api/v4/landrop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileName: file.name, contentBase64: b64 }),
                  });
                  const r = await fetch('/api/v4/landrop');
                  const d = (await r.json()) as { files?: typeof dropFiles };
                  setDropFiles(d.files || []);
                };
                reader.readAsDataURL(file);
              }}
              className="text-xs"
            />
            {dropFiles.map((f) => (
              <div key={f.name} className="text-xs flex justify-between">
                <a href={`/api/v4/landrop/${encodeURIComponent(f.name)}`} className="text-blue-700 underline font-mono">
                  {f.name} ({Math.round(f.sizeBytes / 1024)} KB)
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Ú199: Two-Panel Web File Commander */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-amber-600" />
            Webes Fájlkezelő & Szerkesztő (Ú199)
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={() => void loadDir(dirPath)}
              className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              Listázás
            </button>
            {parentPath && (
              <button
                type="button"
                onClick={() => void loadDir(parentPath)}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
              >
                .. Fel
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {dirEntries.map((ent) => (
              <div key={ent.path} className="px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800">
                <button
                  type="button"
                  onClick={async () => {
                    if (ent.isDir) {
                      await loadDir(ent.path);
                    } else {
                      const r = await fetch(`/api/v4/files/read?path=${encodeURIComponent(ent.path)}`);
                      const d = (await r.json()) as { path?: string; content?: string; error?: string };
                      if (!r.ok) setFileMsg(d.error || 'Hiba');
                      else {
                        setEditPath(d.path || ent.path);
                        setEditContent(d.content || '');
                        setFileMsg(null);
                      }
                    }
                  }}
                  className="text-left font-mono truncate flex-1"
                >
                  {ent.isDir ? `📁 ${ent.name}` : `📄 ${ent.name}`}
                </button>
                <span className="text-[11px] text-slate-400 ml-2">{ent.isDir ? 'DIR' : `${ent.sizeBytes} B`}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="truncate">{editPath || 'Válassz egy szöveges fájlt balról...'}</span>
              {editPath && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v4/files/write', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ path: editPath, content: editContent }),
                    });
                    setFileMsg(r.ok ? 'Fájl elmentve.' : 'Mentési hiba.');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded"
                >
                  <Save className="h-3 w-3" />
                  Mentés
                </button>
              )}
            </div>
            <textarea
              rows={8}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full p-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
            {fileMsg && <div className="text-xs text-emerald-700 dark:text-emerald-400">{fileMsg}</div>}
          </div>
        </div>
      </section>
    </div>
  );
};
