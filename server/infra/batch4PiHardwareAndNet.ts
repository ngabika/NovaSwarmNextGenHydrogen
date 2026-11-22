import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  CustomDashboardWidget,
  KnownLanMac,
  PostMortemReport,
} from '../../shared/types';
import { invokeWithFailover } from '../providers/router';
import { assertHostPermission } from '../security/permissionGate';
import { appendAuditLog, getState, updateState } from '../state/store';
import { scanLanArpTable } from './networkAndCluster';

function tryRunBin(cmd: string, args: string[], timeout = 2500): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ============================================================================
// Ú161, Ú163, Ú164, Ú165, M207, M208: Raspberry Pi & Linux Deep Hardware Telemetry
// ============================================================================

export interface PiHardwareDeepStatus {
  hostname: string;
  arch: string;
  uptimeHours: number;
  loadAvg1m: number;
  loadThrottleActive: boolean;
  cpuThreshold: number;
  zramPresent: boolean;
  swapTotalMb: number;
  swapFreeMb: number;
  memAvailableMb: number;
  gpioChips: string[];
  i2cBuses: string[];
  thermalZones: Array<{ name: string; tempC: number }>;
  powerSupplies: Array<{ name: string; status: string; capacity?: number }>;
  blockDevices: Array<{ name: string; size: string; mountpoint?: string; model?: string }>;
  bluetoothDevices: string[];
  ffmpegAvailable: boolean;
  whisperAvailable: boolean;
  cupsPrinters: string[];
  collectedAt: string;
}

export function collectPiHardwareDeepStatus(): PiHardwareDeepStatus {
  const s = getState();
  const loadAvg1m = Number((os.loadavg()[0] || 0).toFixed(2));
  const cpuThreshold = s.settings.cpuLoadThrottleThreshold ?? Math.max(2, os.cpus().length * 1.25);

  let memAvailableMb = Math.round(os.freemem() / 1048576);
  let swapTotalMb = 0;
  let swapFreeMb = 0;
  try {
    if (fs.existsSync('/proc/meminfo')) {
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
      const avail = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/i);
      const swT = meminfo.match(/SwapTotal:\s+(\d+)\s+kB/i);
      const swF = meminfo.match(/SwapFree:\s+(\d+)\s+kB/i);
      if (avail) memAvailableMb = Math.round(Number(avail[1]) / 1024);
      if (swT) swapTotalMb = Math.round(Number(swT[1]) / 1024);
      if (swF) swapFreeMb = Math.round(Number(swF[1]) / 1024);
    }
  } catch {
    // ignore
  }

  let zramPresent = false;
  try {
    zramPresent = fs.existsSync('/sys/block') && fs.readdirSync('/sys/block').some((b) => b.startsWith('zram'));
  } catch {
    zramPresent = false;
  }

  const gpioChips: string[] = [];
  try {
    if (fs.existsSync('/sys/class/gpio')) {
      for (const f of fs.readdirSync('/sys/class/gpio')) {
        if (f.startsWith('gpiochip')) gpioChips.push(f);
      }
    }
  } catch {
    // ignore
  }

  const i2cBuses: string[] = [];
  try {
    if (fs.existsSync('/dev')) {
      for (const f of fs.readdirSync('/dev')) {
        if (f.startsWith('i2c-')) i2cBuses.push(f);
      }
    }
  } catch {
    // ignore
  }

  const thermalZones: Array<{ name: string; tempC: number }> = [];
  try {
    if (fs.existsSync('/sys/class/thermal')) {
      for (const z of fs.readdirSync('/sys/class/thermal')) {
        if (!z.startsWith('thermal_zone')) continue;
        const tRaw = fs.readFileSync(path.join('/sys/class/thermal', z, 'temp'), 'utf8').trim();
        const typePath = path.join('/sys/class/thermal', z, 'type');
        const name = fs.existsSync(typePath) ? fs.readFileSync(typePath, 'utf8').trim() : z;
        const val = Number(tRaw);
        if (Number.isFinite(val)) {
          thermalZones.push({ name, tempC: Number((val > 1000 ? val / 1000 : val).toFixed(1)) });
        }
      }
    }
  } catch {
    // ignore
  }

  const powerSupplies: Array<{ name: string; status: string; capacity?: number }> = [];
  try {
    if (fs.existsSync('/sys/class/power_supply')) {
      for (const ps of fs.readdirSync('/sys/class/power_supply')) {
        const stPath = path.join('/sys/class/power_supply', ps, 'status');
        const capPath = path.join('/sys/class/power_supply', ps, 'capacity');
        const status = fs.existsSync(stPath) ? fs.readFileSync(stPath, 'utf8').trim() : 'ismeretlen';
        const cap = fs.existsSync(capPath) ? Number(fs.readFileSync(capPath, 'utf8').trim()) : undefined;
        powerSupplies.push({ name: ps, status, capacity: Number.isFinite(cap) ? cap : undefined });
      }
    }
  } catch {
    // ignore
  }

  const blockDevices: Array<{ name: string; size: string; mountpoint?: string; model?: string }> = [];
  const lsblkOut = tryRunBin('lsblk', ['-J', '-o', 'NAME,SIZE,MOUNTPOINT,MODEL']);
  if (lsblkOut) {
    try {
      const parsed = JSON.parse(lsblkOut) as {
        blockdevices?: Array<{ name: string; size: string; mountpoint?: string | null; model?: string | null }>;
      };
      for (const b of parsed.blockdevices || []) {
        blockDevices.push({
          name: b.name,
          size: b.size,
          mountpoint: b.mountpoint || undefined,
          model: b.model?.trim() || undefined,
        });
      }
    } catch {
      // ignore
    }
  }

  const btOut = tryRunBin('bluetoothctl', ['devices']);
  const bluetoothDevices = btOut ? btOut.split('\n').filter(Boolean).slice(0, 12) : [];

  const ffmpegAvailable = Boolean(tryRunBin('which', ['ffmpeg']));
  const whisperAvailable = Boolean(tryRunBin('which', ['whisper-cli']) || tryRunBin('which', ['whisper']));
  const lpOut = tryRunBin('lpstat', ['-p']);
  const cupsPrinters = lpOut ? lpOut.split('\n').filter(Boolean).slice(0, 8) : [];

  return {
    hostname: os.hostname(),
    arch: `${os.platform()}/${os.arch()}`,
    uptimeHours: Number((os.uptime() / 3600).toFixed(1)),
    loadAvg1m,
    loadThrottleActive: loadAvg1m >= cpuThreshold,
    cpuThreshold,
    zramPresent,
    swapTotalMb,
    swapFreeMb,
    memAvailableMb,
    gpioChips,
    i2cBuses,
    thermalZones,
    powerSupplies,
    blockDevices,
    bluetoothDevices,
    ffmpegAvailable,
    whisperAvailable,
    cupsPrinters,
    collectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Ú167: Smart Meter / Shelly EM Energy Analyzer
// ============================================================================

export async function querySmartMeterEnergy(
  endpointUrl: string,
  pricePerKwh = 38,
  fetchImpl: typeof fetch = fetch
): Promise<{
  ok: boolean;
  watts: number;
  estimatedDailyKwh: number;
  estimatedDailyCost: number;
  rawSummary: string;
}> {
  if (!/^https?:\/\//i.test(endpointUrl)) {
    throw new Error('Érvényes Shelly / Smart Meter HTTP URL szükséges.');
  }
  const res = await fetchImpl(endpointUrl, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const emeters = Array.isArray(data.emeters) ? (data.emeters as Array<{ power?: number }>) : [];
  const watts =
    typeof data.power === 'number'
      ? data.power
      : typeof data.total_power === 'number'
      ? data.total_power
      : emeters.reduce((sum, e) => sum + (Number(e.power) || 0), 0);
  const estimatedDailyKwh = Number(((watts * 24) / 1000).toFixed(2));
  const estimatedDailyCost = Number((estimatedDailyKwh * pricePerKwh).toFixed(1));
  return {
    ok: true,
    watts: Number(watts.toFixed(1)),
    estimatedDailyKwh,
    estimatedDailyCost,
    rawSummary: `Aktuális teljesítmény: ${watts.toFixed(1)} W · Napi becslés: ${estimatedDailyKwh} kWh (~${estimatedDailyCost} Ft/nap)`,
  };
}

// ============================================================================
// Ú194: Unknown LAN Device Intruder Detector (MAC Baseline)
// ============================================================================

export function detectLanIntruders(markCurrentAsKnown = false): {
  totalSeen: number;
  knownCount: number;
  unknownDevices: Array<{ ip: string; mac: string; iface: string }>;
  source: string;
} {
  const arp = scanLanArpTable();
  const validDevices = arp.devices.filter(
    (d) => d.mac && d.mac !== '<incomplete>' && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(d.mac)
  );
  const now = new Date().toISOString();

  if (markCurrentAsKnown) {
    updateState((s) => {
      for (const d of validDevices) {
        const norm = d.mac.toLowerCase();
        const existing = s.knownLanMacs.find((k) => k.mac === norm);
        if (existing) {
          existing.ip = d.ip;
          existing.lastSeenAt = now;
        } else {
          s.knownLanMacs.push({
            mac: norm,
            label: `Eszköz (${d.ip})`,
            ip: d.ip,
            firstSeenAt: now,
            lastSeenAt: now,
          });
        }
      }
    });
  }

  const knownSet = new Set(getState().knownLanMacs.map((k: KnownLanMac) => k.mac.toLowerCase()));
  const unknownDevices = validDevices
    .filter((d) => !knownSet.has(d.mac.toLowerCase()))
    .map((d) => ({ ip: d.ip, mac: d.mac, iface: d.iface }));

  return {
    totalSeen: validDevices.length,
    knownCount: knownSet.size,
    unknownDevices,
    source: arp.source,
  };
}

// ============================================================================
// Ú199: Two-Panel Web File Commander (Host Permission Gated)
// ============================================================================

export function resolveSafeCommanderPath(requestedPath?: string): string {
  const base = process.cwd();
  if (!requestedPath?.trim()) return base;
  const resolved = path.isAbsolute(requestedPath)
    ? path.normalize(requestedPath)
    : path.resolve(base, requestedPath);
  return resolved;
}

export function listHostDirectory(dirPath?: string): {
  currentPath: string;
  parentPath: string;
  entries: Array<{ name: string; path: string; isDir: boolean; sizeBytes: number; mtime: string }>;
} {
  assertHostPermission(`file_commander:list(${dirPath || '.'})`);
  const currentPath = resolveSafeCommanderPath(dirPath);
  const stat = fs.statSync(currentPath);
  if (!stat.isDirectory()) throw new Error('A megadott útvonal nem könyvtár.');

  const entries = fs
    .readdirSync(currentPath, { withFileTypes: true })
    .slice(0, 200)
    .map((ent) => {
      const full = path.join(currentPath, ent.name);
      let sizeBytes = 0;
      let mtime = '';
      try {
        const st = fs.statSync(full);
        sizeBytes = st.size;
        mtime = st.mtime.toISOString();
      } catch {
        // ignore permission quirks
      }
      return {
        name: ent.name,
        path: full,
        isDir: ent.isDirectory(),
        sizeBytes,
        mtime,
      };
    })
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));

  return {
    currentPath,
    parentPath: path.dirname(currentPath),
    entries,
  };
}

export function readHostTextFile(filePath: string): { path: string; content: string; sizeBytes: number } {
  assertHostPermission(`file_commander:read(${filePath})`);
  const resolved = resolveSafeCommanderPath(filePath);
  const st = fs.statSync(resolved);
  if (st.isDirectory()) throw new Error('Könyvtár tartalma nem nyitható meg szövegként.');
  if (st.size > 512 * 1024) throw new Error('A fájl túl nagy előnézethez (>512 KB).');
  return {
    path: resolved,
    content: fs.readFileSync(resolved, 'utf8'),
    sizeBytes: st.size,
  };
}

export function writeHostTextFile(filePath: string, content: string): { path: string; sizeBytes: number } {
  assertHostPermission(`file_commander:write(${filePath})`);
  const resolved = resolveSafeCommanderPath(filePath);
  const base = path.basename(resolved);
  if (['.secrets.vault.json', '.env', 'id_rsa', 'id_ed25519'].includes(base)) {
    throw new Error('Védett kulcs/titok fájl nem szerkeszthető a fájlkezelőből.');
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  return { path: resolved, sizeBytes: Buffer.byteLength(content, 'utf8') };
}

// ============================================================================
// Ú188: LAN Drop Instant Local File Transfer
// ============================================================================

function getLanDropDir(): string {
  const dir = path.join(process.cwd(), 'backups', 'lan-drop');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveLanDropFile(fileName: string, contentBase64: string): {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
} {
  const safeName = `${Date.now()}-${path.basename(fileName || 'fajl.bin').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const buf = Buffer.from(contentBase64, 'base64');
  if (buf.length > 15 * 1024 * 1024) {
    throw new Error('LAN Drop maximális fájlméret: 15 MB.');
  }
  fs.writeFileSync(path.join(getLanDropDir(), safeName), buf);
  return {
    id: safeName,
    fileName: safeName,
    sizeBytes: buf.length,
    createdAt: new Date().toISOString(),
  };
}

export function listLanDropFiles(): Array<{ name: string; sizeBytes: number; createdAt: string }> {
  const dir = getLanDropDir();
  return fs
    .readdirSync(dir)
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLanDropFilePath(name: string): string | null {
  const safe = path.basename(name);
  const target = path.join(getLanDropDir(), safe);
  return fs.existsSync(target) ? target : null;
}

// ============================================================================
// Ú251: Bash Copilot (Hungarian Natural Language -> Command + Execute)
// ============================================================================

const BASH_COPILOT_RULES: Array<{ match: RegExp; cmd: string; explanation: string }> = [
  {
    match: /(lemez|tárhely|hely|foglaltság|df)/i,
    cmd: 'df -hT',
    explanation: 'Listázza a fájlrendszerek tárhely-kihasználtságát emberi formátumban.',
  },
  {
    match: /(memória|ram|swap)/i,
    cmd: 'free -h',
    explanation: 'Megjeleníti a fizikai RAM és a swap memóriahasználatot.',
  },
  {
    match: /(port|figyel|hallgatóz|hálózat|socket)/i,
    cmd: 'ss -tulpn',
    explanation: 'Kilistázza a nyitott TCP/UDP portokat és a hozzájuk tartozó folyamatokat.',
  },
  {
    match: /(folyamat|cpu|terhelés|top)/i,
    cmd: 'ps aux --sort=-%cpu | head -n 15',
    explanation: 'Megmutatja a 15 legtöbb CPU-t fogyasztó folyamatot.',
  },
  {
    match: /(hőmérséklet|hőfok|temp)/i,
    cmd: 'cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null || echo "N/A"',
    explanation: 'Kiolvassa a CPU/alaplap hőmérséklet-érzékelőit (millicelsius).',
  },
];

export async function runBashCopilot(
  intent: string,
  execute = false
): Promise<{ command: string; explanation: string; executed: boolean; output: string }> {
  const rule = BASH_COPILOT_RULES.find((r) => r.match.test(intent));
  let command = rule?.cmd || '';
  let explanation = rule?.explanation || '';

  if (!command) {
    try {
      const res = await invokeWithFailover({
        prompt: `Írj egyetlen biztonságos, pontos Linux bash parancsot erre a magyar kérésre, majd egy sorban magyarázd el! Formátum:\nCMD: <parancs>\nMAGYARAZAT: <rövid magyarázat>\nKérés: ${intent}`,
        complexity: 'simple',
      });
      const cmdMatch = res.text.match(/CMD:\s*(.+)/i);
      const expMatch = res.text.match(/MAGYARAZAT:\s*(.+)/i);
      command = (cmdMatch?.[1] || 'uname -a && uptime').replace(/`/g, '').trim();
      explanation = (expMatch?.[1] || 'AI által javasolt Linux parancs').trim();
    } catch {
      command = 'uname -a && uptime && df -h /';
      explanation = 'Alapértelmezett Linux rendszeráttekintés.';
    }
  }

  let output = '';
  let executed = false;
  if (execute) {
    assertHostPermission(`bash_copilot:${command}`);
    try {
      output = execFileSync('sh', ['-c', command], {
        encoding: 'utf8',
        timeout: 8000,
      }).trim();
      executed = true;
    } catch (err) {
      output = err instanceof Error ? err.message : String(err);
    }
    appendAuditLog({
      type: 'terminal',
      sourceAgentId: 'bash-copilot',
      sourceAgentName: 'Bash Copilot',
      message: `Bash Copilot futtatás: ${command}`,
      verifiedExecution: executed,
    });
  }

  return { command, explanation, executed, output };
}

// ============================================================================
// Ú252: System Package Update Checker
// ============================================================================

export function checkSystemPackageUpdates(): {
  aptAvailable: boolean;
  aptUpgradableCount: number;
  aptPackages: string[];
  npmOutdatedSummary: string;
} {
  const aptOut = tryRunBin('apt', ['list', '--upgradable'], 5000);
  const aptPackages = aptOut
    ? aptOut
        .split('\n')
        .filter((l) => l && !l.startsWith('Listing'))
        .slice(0, 30)
    : [];
  const npmOut = tryRunBin('npm', ['outdated', '--depth=0'], 4000);
  return {
    aptAvailable: Boolean(aptOut !== null),
    aptUpgradableCount: aptPackages.length,
    aptPackages,
    npmOutdatedSummary: npmOut || 'Minden közvetlen npm függőség naprakész (vagy offline).',
  };
}

// ============================================================================
// Ú253: Automatic Post-Mortem Analyzer
// ============================================================================

export function generatePostMortemReport(): PostMortemReport {
  const logs = getState().auditLogs.slice(-120);
  const errorLogs = logs.filter(
    (l) => l.verifiedExecution === false || /hiba|failed|error|crash|elutasítva|blokkolt/i.test(l.message)
  );

  const remediationSteps: string[] = [];
  let rootCause = 'Nem történt kritikus rendszerhiba a legutóbbi 120 naplóbejegyzésben.';

  if (errorLogs.length > 0) {
    const sample = errorLogs.slice(-5).map((e) => e.message).join(' | ');
    if (/429|quota|rate limit/i.test(sample)) {
      rootCause = 'Külső AI provider kvóta / sebességkorlát (HTTP 429) telítődés.';
      remediationSteps.push('Kapcsold be a többkulcsos rotációt vagy a lokális Ollama tartalékot.');
    } else if (/ECONNREFUSED|timeout|ETIMEDOUT/i.test(sample)) {
      rootCause = 'Hálózati vagy külső végpont elérhetetlenség (ECONNREFUSED / timeout).';
      remediationSteps.push('Ellenőrizd a LAN / internet kapcsolatot és az Ollama/HA URL-eket.');
    } else {
      rootCause = `Észlelt végrehajtási hibák (${errorLogs.length} db): ${errorLogs[errorLogs.length - 1].message.slice(0, 140)}`;
      remediationSteps.push('Futtasd a Raj Auto-Doktort vagy ellenőrizd a részletes audit naplót.');
    }
  } else {
    remediationSteps.push('A rendszer egészséges — nincs szükség hibaelhárításra.');
  }

  const report: PostMortemReport = {
    id: `pm-${crypto.randomUUID().slice(0, 8)}`,
    title: `Post-Mortem Elemzés (${new Date().toLocaleDateString('hu-HU')})`,
    rootCause,
    affectedEntries: errorLogs.length,
    remediationSteps,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.postMortems.unshift(report);
    s.postMortems = s.postMortems.slice(0, 20);
  });
  return report;
}

// ============================================================================
// Ú258: Custom Dynamic Overview Widget Creator & Evaluator
// ============================================================================

export function addCustomDashboardWidget(input: {
  title: string;
  kind: CustomDashboardWidget['kind'];
  source: string;
}): CustomDashboardWidget {
  if (!input.title?.trim() || !input.source?.trim()) {
    throw new Error('Widget neve és adatforrása (URL vagy parancs) kötelező.');
  }
  const widget: CustomDashboardWidget = {
    id: `cw-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title.trim(),
    kind: input.kind,
    source: input.source.trim(),
    lastValue: 'Várakozás frissítésre...',
    lastUpdatedAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.customWidgets.unshift(widget);
  });
  return widget;
}

export async function evaluateCustomWidgets(): Promise<CustomDashboardWidget[]> {
  const widgets = getState().customWidgets;
  for (const w of widgets) {
    let val = w.lastValue || 'N/A';
    try {
      if (w.kind === 'http_json') {
        const res = await fetch(w.source, { signal: AbortSignal.timeout(3000) });
        const txt = await res.text();
        val = txt.slice(0, 140);
      } else {
        assertHostPermission(`custom_widget:${w.source}`);
        val = execFileSync('sh', ['-c', w.source], { encoding: 'utf8', timeout: 3000 }).trim().slice(0, 140);
      }
    } catch (err) {
      val = `Hiba: ${err instanceof Error ? err.message : String(err)}`.slice(0, 100);
    }
    updateState((s) => {
      const ref = s.customWidgets.find((x) => x.id === w.id);
      if (ref) {
        ref.lastValue = val;
        ref.lastUpdatedAt = new Date().toISOString();
      }
    });
  }
  return getState().customWidgets;
}
