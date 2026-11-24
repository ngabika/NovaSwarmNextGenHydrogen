import { execFile, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  AutonomyRule,
  AutonomyRuleActionKind,
  AutonomyRuleTriggerKind,
  CountdownTimerItem,
  CurrencyRatesSnapshot,
  DailyTop3State,
  DecisionLogEntry,
  DropShareToken,
  FixedExpenseItem,
  FuelLogRecord,
  HostedMiniApp,
  LanPortScanResult,
  LentItemRecord,
  MediaBacklogItem,
  MedicationReminder,
  OperatingModeId,
  QuoteDeckItem,
  SavingsGoalItem,
  SmartReminder,
  TripPlanItem,
  WebhookReplayRecord,
} from '../../shared/types';
import { createAutonomyRule, createSmartReminder } from './batch6ApexEngine';
import { appendAuditLog, getState, updateState } from '../state/store';

const execFileAsync = promisify(execFile);

/* ============================================================================
 * 1. Operating Modes (Ú346) & Shared Scratchpad (Ú356)
 * ============================================================================ */

export const OPERATING_MODE_META: Record<
  OperatingModeId,
  { label: string; description: string; heartbeatMinutes: number; silentNight: boolean }
> = {
  normal: {
    label: 'Normál Üzemmód',
    description: 'Kiegyensúlyozott napi működés, szabványos heartbeat és Telegram értesítések.',
    heartbeatMinutes: 15,
    silentNight: false,
  },
  focus: {
    label: 'Mély Fókusz',
    description: 'Csendes értesítések, ritkább heartbeat, zavartalan munka.',
    heartbeatMinutes: 45,
    silentNight: true,
  },
  travel: {
    label: 'Utazás / Távoli',
    description: 'Tömör válaszok, aktív Telegram értesítés, energiatakarékos ütemezés.',
    heartbeatMinutes: 30,
    silentNight: false,
  },
  emergency: {
    label: 'Vészhelyzeti Figyelő',
    description: 'Gyakori (5 perces) heartbeat, teljes riasztási készültség.',
    heartbeatMinutes: 5,
    silentNight: false,
  },
  chill: {
    label: 'Pihenő / Hétvége',
    description: 'Alacsony prioritású háttérfeladatok, nyugodt éjszakai csend.',
    heartbeatMinutes: 60,
    silentNight: true,
  },
};

export function setOperatingMode(mode: OperatingModeId) {
  const meta = OPERATING_MODE_META[mode] || OPERATING_MODE_META.normal;
  updateState((s) => {
    s.settings.operatingMode = mode;
    s.settings.heartbeatIntervalMinutes = meta.heartbeatMinutes;
    s.settings.telegramSilentNight = meta.silentNight;
  });
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'mode-switch',
    sourceAgentName: 'Üzemmód Váltó',
    message: `Üzemmód átállítva: ${meta.label} (${mode})`,
    verifiedExecution: true,
  });
  return { mode, meta };
}

export function updateSharedScratchpad(text: string): { text: string; updatedAt: string } {
  const clean = String(text ?? '').slice(0, 32000);
  updateState((s) => {
    s.sharedScratchpad = clean;
  });
  return { text: clean, updatedAt: new Date().toISOString() };
}

/* ============================================================================
 * 2. Natural Hungarian Automation & Reminder Parser (Ú275) + Multi-Timers (Ú282)
 * ============================================================================ */

export function parseCountdownDurationSec(expr: string): { durationSec: number; label: string } {
  const clean = expr.trim();
  const match = clean.match(/^(\d+)\s*(s|mp|másodperc|m|p|perc|h|óra|ora)\b\s*(.*)$/i);
  if (!match) {
    throw new Error('Érvénytelen időzítő formátum. Példa: "10p tészta" vagy "45mp tea".');
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const label = (match[3] || '').trim() || `Időzítő (${match[1]}${unit})`;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Az időzítő értéke pozitív szám kell legyen.');
  }
  let mult = 1;
  if (unit.startsWith('m') && unit !== 'mp' && unit !== 'másodperc') {
    mult = 60;
  } else if (unit === 'p' || unit === 'perc') {
    mult = 60;
  } else if (unit === 'h' || unit === 'óra' || unit === 'ora') {
    mult = 3600;
  }
  return { durationSec: Math.min(86400 * 7, value * mult), label };
}

export function createCountdownTimer(exprOrLabel: string, durationSecOverride?: number): CountdownTimerItem {
  let durationSec = durationSecOverride ?? 0;
  let label = exprOrLabel.trim();
  if (!durationSec || durationSec <= 0) {
    const parsed = parseCountdownDurationSec(exprOrLabel);
    durationSec = parsed.durationSec;
    label = parsed.label;
  }
  const now = Date.now();
  const timer: CountdownTimerItem = {
    id: `tmr-${crypto.randomUUID().slice(0, 8)}`,
    label: label || 'Visszaszámláló',
    durationSec,
    endsAt: new Date(now + durationSec * 1000).toISOString(),
    completed: false,
    createdAt: new Date(now).toISOString(),
  };
  updateState((s) => {
    s.countdownTimers = [timer, ...(s.countdownTimers || [])].slice(0, 40);
  });
  return timer;
}

export function processDueCountdownTimers(nowMs = Date.now()): {
  completedCount: number;
  completedTimers: CountdownTimerItem[];
} {
  const state = getState();
  const due = (state.countdownTimers || []).filter((t) => !t.completed && Date.parse(t.endsAt) <= nowMs);
  if (due.length === 0) return { completedCount: 0, completedTimers: [] };

  const completedAt = new Date(nowMs).toISOString();
  const dueIds = new Set(due.map((d) => d.id));
  updateState((s) => {
    s.countdownTimers = (s.countdownTimers || []).map((t) =>
      dueIds.has(t.id) ? { ...t, completed: true, completedAt } : t
    );
  });
  for (const t of due) {
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'countdown-timer',
      sourceAgentName: 'Időzítő',
      message: `Lejárt időzítő: ${t.label} (${t.durationSec}s)`,
      verifiedExecution: true,
    });
  }
  return { completedCount: due.length, completedTimers: due.map((t) => ({ ...t, completed: true, completedAt })) };
}

export function parseHungarianNaturalAutomation(input: string): {
  kind: 'rule' | 'reminder' | 'timer';
  summary: string;
  rule?: AutonomyRule;
  reminder?: SmartReminder;
  timer?: CountdownTimerItem;
} {
  const raw = input.trim();
  if (!raw) throw new Error('Üres magyar utasítás.');
  const lower = raw.toLowerCase();

  // Case 1: Condition -> Action ("ha a ram 85% felett akkor tisztítás")
  if (lower.startsWith('ha ') || lower.includes(' felett ') || lower.includes('ha a ')) {
    let triggerKind: AutonomyRuleTriggerKind = 'ram_above';
    if (lower.includes('cpu') || lower.includes('processzor')) triggerKind = 'cpu_above';
    else if (lower.includes('hő') || lower.includes('ho') || lower.includes('fok') || lower.includes('temp'))
      triggerKind = 'temp_above';
    else if (lower.includes('lemez') || lower.includes('tárhely') || lower.includes('disk')) triggerKind = 'disk_above';
    else if (lower.includes('leáll') || lower.includes('uptime')) triggerKind = 'uptime_down';
    else if (lower.includes('mac') || lower.includes('behatol') || lower.includes('eszköz'))
      triggerKind = 'new_lan_mac';

    const numMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
    const thresholdValue = numMatch ? Number(numMatch[1].replace(',', '.')) : 85;

    let actionKind: AutonomyRuleActionKind = 'telegram_notify';
    let actionTarget = raw;
    if (lower.includes('tiszt') || lower.includes('takar') || lower.includes('ram')) {
      actionKind = 'ram_cleanup';
      actionTarget = 'Automatikus RAM tisztítás';
    } else if (lower.includes('docker') || lower.includes('konténer')) {
      actionKind = 'docker_heal';
      actionTarget = 'Docker konténer újraindítás';
    } else if (lower.includes('beszél') || lower.includes('hang') || lower.includes('mondd')) {
      actionKind = 'speak_tts';
      actionTarget = `Figyelem: ${raw}`;
    } else if (lower.includes('gpio')) {
      const pinMatch = raw.match(/gpio\s*(\d+)/i);
      actionKind = 'gpio_set';
      actionTarget = `${pinMatch?.[1] || '17'}:1`;
    } else if (lower.includes('telegram') || lower.includes('riaszt') || lower.includes('üzen') || lower.includes('értesít')) {
      actionKind = 'telegram_notify';
      actionTarget = `Automatikus riasztás: ${raw}`;
    }

    const rule = createAutonomyRule({
      name: raw.slice(0, 70),
      triggerKind,
      thresholdValue,
      actionKind,
      actionTarget,
      cooldownMinutes: 10,
    });
    return {
      kind: 'rule',
      summary: `Új autonóm szabály létrehozva: ${triggerKind} >= ${thresholdValue} -> ${actionKind}`,
      rule,
    };
  }

  // Case 2: Countdown timer keyword
  const timerMatch = raw.match(/^(\d+)\s*(s|mp|másodperc|m|p|perc|h|óra|ora)\s*(?:múlva\s*)?(.*)$/i);
  if (timerMatch) {
    const num = Number(timerMatch[1]);
    const unitRaw = timerMatch[2].toLowerCase();
    const msg = (timerMatch[3] || '').trim() || 'Időzített értesítés';
    const isSeconds = unitRaw === 's' || unitRaw === 'mp' || unitRaw === 'másodperc';
    if (isSeconds || lower.includes('időzítő') || lower.includes('stopper')) {
      const timer = createCountdownTimer(`${num}${isSeconds ? 'mp' : unitRaw.startsWith('h') || unitRaw.startsWith('ó') ? 'h' : 'p'} ${msg}`);
      return {
        kind: 'timer',
        summary: `Visszaszámláló indítva: ${timer.label} (${timer.durationSec} mp)`,
        timer,
      };
    }
    const unitToken = unitRaw.startsWith('h') || unitRaw.startsWith('ó') ? 'h' : 'm';
    const reminder = createSmartReminder({ timeExpr: `${num}${unitToken}`, message: msg, channel: 'both' });
    return {
      kind: 'reminder',
      summary: `Emlékeztető rögzítve (${num}${unitToken}): ${reminder.message}`,
      reminder,
    };
  }

  // Case 3: Exact HH:MM reminder ("08:30 standup")
  const clockMatch = raw.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
  if (clockMatch) {
    const reminder = createSmartReminder({
      timeExpr: clockMatch[1],
      message: clockMatch[2].trim(),
      channel: 'both',
    });
    return {
      kind: 'reminder',
      summary: `Időzített emlékeztető (${clockMatch[1]}): ${reminder.message}`,
      reminder,
    };
  }

  throw new Error('Nem sikerült értelmezni a természetes magyar parancsot. Próbáld: "ha a ram 85% felett akkor tisztítás" vagy "15 perc múlva öntözés".');
}

/* ============================================================================
 * 3. Pure-TS ISO Reed-Solomon QR Code SVG Generator (Ú284)
 * ============================================================================ */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Array<number>(data.length + ecLen).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  alignCenters: number[];
}

// EC Level M specs (1 block for v1..v3, plenty for LAN URLs & WiFi QR payloads up to 64 bytes)
const QR_SPECS_M: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 16, ecCodewords: 10, alignCenters: [] },
  { version: 2, size: 25, dataCodewords: 28, ecCodewords: 16, alignCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 44, ecCodewords: 26, alignCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 64, ecCodewords: 36, alignCenters: [6, 26] },
];

export function encodeQrMatrix(payload: string): { matrix: number[][]; version: number; size: number } {
  const bytes = Array.from(Buffer.from(payload, 'utf8')).slice(0, 62);
  const neededDataBytes = bytes.length + 2; // 4-bit mode + 8-bit len + 4-bit terminator = 16 bits
  const spec =
    QR_SPECS_M.find((s) => s.dataCodewords >= neededDataBytes) || QR_SPECS_M[QR_SPECS_M.length - 1];
  const maxBytes = spec.dataCodewords - 2;
  const trimmed = bytes.slice(0, maxBytes);

  // Build bitstream: mode 0100 (byte), length 8 bits, data bytes, terminator
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(trimmed.length, 8);
  for (const b of trimmed) pushBits(b, 8);
  const totalDataBits = spec.dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < totalDataBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  let padToggle = 0;
  while (bits.length < totalDataBits) {
    pushBits(padToggle % 2 === 0 ? 0xec : 0x11, 8);
    padToggle++;
  }

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | bits[i + j];
    dataCodewords.push(val);
  }
  const ecCodewords = rsComputeEc(dataCodewords, spec.ecCodewords);
  const allBytes = [...dataCodewords, ...ecCodewords];
  const allBits: number[] = [];
  for (const b of allBytes) {
    for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);
  }
  // Remainder bits for v2..v4 = 7 zero bits
  if (spec.version >= 2) {
    for (let i = 0; i < 7; i++) allBits.push(0);
  }

  const N = spec.size;
  const grid: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(-1));
  const reserved: boolean[][] = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));

  const setFixed = (r: number, c: number, val: number) => {
    if (r >= 0 && r < N && c >= 0 && c < N) {
      grid[r][c] = val;
      reserved[r][c] = true;
    }
  };

  const placeFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const inBorder = r === -1 || r === 7 || c === -1 || c === 7;
        const isDark =
          !inBorder &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFixed(rr, cc, isDark ? 1 : 0);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Alignment patterns for v2+
  if (spec.alignCenters.length > 0) {
    for (const rCenter of spec.alignCenters) {
      for (const cCenter of spec.alignCenters) {
        if (reserved[rCenter]?.[cCenter]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setFixed(rCenter + dr, cCenter + dc, isDark ? 1 : 0);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < N - 8; i++) {
    if (!reserved[6][i]) setFixed(6, i, i % 2 === 0 ? 1 : 0);
    if (!reserved[i][6]) setFixed(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module
  setFixed(N - 8, 8, 1);

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][N - 1 - i] = true;
    if (i < 7) reserved[N - 1 - i][8] = true;
  }

  // Zigzag placement + mask 0: (r + c) % 2 === 0
  let bitIdx = 0;
  let goingUp = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < N; step++) {
      const r = goingUp ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (reserved[r][c]) continue;
        const rawBit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
        const maskedBit = (r + c) % 2 === 0 ? rawBit ^ 1 : rawBit;
        grid[r][c] = maskedBit;
      }
    }
    goingUp = !goingUp;
  }

  // Format information for EC Level M (00) + Mask 0 (000) -> 5-bit 00000 -> BCH + mask 0x5412 = 0x5412
  //Wait: EC M is 00, mask 0 is 000 -> 15-bit BCH(00000) XOR 101010000010010 = 101010000010010 (0x5412)
  const formatBits = 0x5412;
  const fmtAt = (idx: number) => (formatBits >> idx) & 1;
  // Place format around top-left finder & other finders
  const tlRows = [8, 8, 8, 8, 8, 8, 8, 8, 7, 5, 4, 3, 2, 1, 0];
  const tlCols = [0, 1, 2, 3, 4, 5, 7, 8, 8, 8, 8, 8, 8, 8, 8];
  for (let i = 0; i < 15; i++) {
    const bit = fmtAt(14 - i);
    grid[tlRows[i]][tlCols[i]] = bit;
    if (i < 7) {
      grid[N - 1 - i][8] = bit;
    } else {
      grid[8][N - 15 + i] = bit;
    }
  }

  return { matrix: grid, version: spec.version, size: N };
}

export function generateQrSvg(
  input: string,
  options?: { sizePx?: number; wifiSsid?: string; wifiPassword?: string; wifiAuth?: 'WPA' | 'WEP' | 'nopass' }
): { payload: string; svg: string; version: number; modules: number } {
  const payload = options?.wifiSsid?.trim()
    ? `WIFI:T:${options.wifiAuth || 'WPA'};S:${options.wifiSsid.trim()};P:${options.wifiPassword || ''};;`
    : input.trim();
  if (!payload) throw new Error('QR kód tartalom vagy Wi-Fi SSID megadása kötelező.');

  const { matrix, version, size } = encodeQrMatrix(payload);
  const quiet = 2;
  const total = size + quiet * 2;
  const sizePx = Math.max(120, Math.min(480, options?.sizePx || 220));
  const rects: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" role="img" aria-label="QR kód"><rect width="${total}" height="${total}" fill="#ffffff"/><g fill="#0f172a">${rects.join('')}</g></svg>`;
  return { payload, svg, version, modules: size };
}

/* ============================================================================
 * 4. Homelab, Networking, Replay, Drop Share & Audit (Ú301, Ú305, Ú307, Ú310, Ú314, Ú316)
 * ============================================================================ */

const PORT_SERVICE_NAMES: Record<number, string> = {
  22: 'SSH',
  80: 'HTTP',
  443: 'HTTPS',
  1883: 'MQTT',
  3000: 'NovaSwarm UI',
  5432: 'PostgreSQL',
  8080: 'HTTP-Alt',
  8123: 'Home Assistant',
  11434: 'Ollama API',
};

function probeTcpPort(host: string, port: number, timeoutMs = 450): Promise<{ port: number; open: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (open: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ port, open, latencyMs: Math.max(1, Date.now() - start) });
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

export async function scanLanOpenPorts(
  hostInput: string,
  ports: number[] = [22, 80, 443, 1883, 3000, 5432, 8080, 8123, 11434]
): Promise<LanPortScanResult> {
  const host = hostInput.trim() || '127.0.0.1';
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new Error('Érvénytelen gazdagép név vagy IP-cím.');
  }
  const isPrivateOrLocalHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '127.0.0.1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!isPrivateOrLocalHost) {
    throw new Error('Port-térképezés csak helyi LAN / privát / .local / loopback célpontokra engedélyezett.');
  }
  const cleanPorts = ports.filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535).slice(0, 24);
  const probes = await Promise.all(cleanPorts.map((p) => probeTcpPort(host, p)));
  const openPorts = probes
    .filter((p) => p.open)
    .map((p) => ({
      port: p.port,
      service: PORT_SERVICE_NAMES[p.port] || `TCP/${p.port}`,
      latencyMs: p.latencyMs,
    }));

  const result: LanPortScanResult = {
    id: `pscan-${crypto.randomUUID().slice(0, 8)}`,
    host,
    openPorts,
    scannedAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.lanPortScans = [result, ...(s.lanPortScans || [])].slice(0, 20);
  });
  return result;
}

export function detectJournalAnomalies(linesCount = 120): {
  source: string;
  linesInspected: number;
  anomalyCount: number;
  counts: { oom: number; error: number; failed: number; kernelOrThermal: number };
  samples: string[];
} {
  let raw = '';
  let source = 'journalctl';
  try {
    raw = execFileSync('journalctl', ['-n', String(Math.min(400, Math.max(20, linesCount))), '--no-pager', '-o', 'short-iso'], {
      encoding: 'utf8',
      timeout: 3000,
    });
  } catch {
    try {
      if (fs.existsSync('/var/log/syslog')) {
        source = '/var/log/syslog';
        raw = fs.readFileSync('/var/log/syslog', 'utf8').split('\n').slice(-linesCount).join('\n');
      } else {
        source = 'node_runtime_audit';
        const audits = getState().auditLogs.slice(-linesCount);
        raw = audits.map((a) => `${a.timestamp} [${a.type}] ${a.sourceAgentName}: ${a.message}`).join('\n');
      }
    } catch {
      source = 'node_runtime_fallback';
      raw = '';
    }
  }

  const lines = raw.split('\n').filter(Boolean);
  let oom = 0;
  let error = 0;
  let failed = 0;
  let kernelOrThermal = 0;
  const samples: string[] = [];

  for (const line of lines) {
    const l = line.toLowerCase();
    let hit = false;
    if (l.includes('out of memory') || l.includes('oom-killer') || l.includes('killed process')) {
      oom++;
      hit = true;
    }
    if (l.includes('error') || l.includes('hiba') || l.includes('segfault')) {
      error++;
      hit = true;
    }
    if (l.includes('failed') || l.includes('sikertelen')) {
      failed++;
      hit = true;
    }
    if (l.includes('under-voltage') || l.includes('throttled') || l.includes('panic')) {
      kernelOrThermal++;
      hit = true;
    }
    if (hit && samples.length < 15) {
      samples.push(line.slice(0, 220));
    }
  }

  return {
    source,
    linesInspected: lines.length,
    anomalyCount: oom + error + failed + kernelOrThermal,
    counts: { oom, error, failed, kernelOrThermal },
    samples,
  };
}

export function recordWebhookDelivery(input: {
  slug: string;
  headers?: Record<string, string>;
  bodyPayload: unknown;
  statusOk: boolean;
}): WebhookReplayRecord {
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers || {})) {
    const lk = k.toLowerCase();
    if (lk.includes('secret') || lk.includes('authorization')) continue;
    safeHeaders[k] = String(v).slice(0, 200);
  }
  const bodyJson =
    typeof input.bodyPayload === 'string'
      ? input.bodyPayload.slice(0, 4000)
      : JSON.stringify(input.bodyPayload ?? {}, null, 2).slice(0, 4000);
  const rec: WebhookReplayRecord = {
    id: `whr-${crypto.randomUUID().slice(0, 8)}`,
    slug: input.slug,
    headers: safeHeaders,
    bodyJson,
    statusOk: input.statusOk,
    replayCount: 0,
    receivedAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.webhookHistory = [rec, ...(s.webhookHistory || [])].slice(0, 50);
  });
  return rec;
}

export async function replayRecordedWebhook(
  id: string,
  dispatchFn: (slug: string, payload: unknown) => Promise<{ ok: boolean; reply?: string; error?: string }>
): Promise<{ record: WebhookReplayRecord; result: { ok: boolean; reply?: string; error?: string } }> {
  const found = (getState().webhookHistory || []).find((w) => w.id === id);
  if (!found) throw new Error('Webhook előzmény nem található.');
  let parsedBody: unknown = found.bodyJson;
  try {
    parsedBody = JSON.parse(found.bodyJson);
  } catch {
    // keep raw string
  }
  const result = await dispatchFn(found.slug, parsedBody);
  const now = new Date().toISOString();
  let updated = found;
  updateState((s) => {
    const ref = (s.webhookHistory || []).find((w) => w.id === id);
    if (ref) {
      ref.replayCount += 1;
      ref.lastReplayedAt = now;
      ref.statusOk = result.ok;
      updated = ref;
    }
  });
  return { record: updated, result };
}

export async function runNpmAuditCheck(): Promise<{
  ok: boolean;
  totalVulnerabilities: number;
  severity: { info: number; low: number; moderate: number; high: number; critical: number };
  summary: string;
}> {
  try {
    let stdout = '';
    try {
      const res = await execFileAsync('npm', ['audit', '--json'], { timeout: 10000 });
      stdout = res.stdout;
    } catch (err) {
      const execErr = err as { stdout?: string; message?: string };
      if (execErr.stdout && execErr.stdout.trim().startsWith('{')) {
        stdout = execErr.stdout;
      } else {
        return {
          ok: false,
          totalVulnerabilities: 0,
          severity: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
          summary: `npm audit nem érhető el offline környezetben: ${execErr.message || 'hiba'}`,
        };
      }
    }
    const parsed = JSON.parse(stdout) as {
      metadata?: {
        vulnerabilities?: {
          info?: number;
          low?: number;
          moderate?: number;
          high?: number;
          critical?: number;
          total?: number;
        };
      };
    };
    const v = parsed.metadata?.vulnerabilities || {};
    const severity = {
      info: v.info || 0,
      low: v.low || 0,
      moderate: v.moderate || 0,
      high: v.high || 0,
      critical: v.critical || 0,
    };
    const total = v.total ?? severity.info + severity.low + severity.moderate + severity.high + severity.critical;
    return {
      ok: true,
      totalVulnerabilities: total,
      severity,
      summary:
        total === 0
          ? '0 ismert sebezhetőség az npm csomagokban.'
          : `${total} találat (kritikus: ${severity.critical}, magas: ${severity.high}, közepes: ${severity.moderate}).`,
    };
  } catch (err) {
    return {
      ok: false,
      totalVulnerabilities: 0,
      severity: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      summary: `Audit elemzés hiba: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function resolveLanDropFilePath(rawFileName: string): { filePath: string; safeName: string } | null {
  const safeName = path.basename(rawFileName.trim());
  if (!safeName || safeName === '.' || safeName === '..') return null;
  const candidateDirs = [
    path.resolve(process.cwd(), 'backups', 'lan-drop'),
    path.resolve(process.cwd(), 'lan-drop'),
  ];
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const realDir = fs.realpathSync(dir);
      const target = path.resolve(realDir, safeName);
      if (!fs.existsSync(target)) continue;
      const realTarget = fs.realpathSync(target);
      if (realTarget.startsWith(realDir + path.sep) && fs.statSync(realTarget).isFile()) {
        return { filePath: realTarget, safeName };
      }
    } catch {
      // try next candidate dir
    }
  }
  return null;
}

export function createDropShareToken(fileName: string, ttlMinutes = 60, maxDownloads = 5): DropShareToken {
  const resolved = resolveLanDropFilePath(fileName);
  if (!resolved) {
    throw new Error(`Fájl nem található a lan-drop mappában: ${path.basename(fileName.trim())}`);
  }
  const mins = Math.max(1, Math.min(10080, Math.round(ttlMinutes || 60)));
  const token: DropShareToken = {
    token: crypto.randomBytes(24).toString('base64url'),
    fileName: resolved.safeName,
    expiresAt: new Date(Date.now() + mins * 60_000).toISOString(),
    downloads: 0,
    maxDownloads: Math.max(1, Math.min(100, Math.round(maxDownloads || 5))),
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.dropShareTokens = [token, ...(s.dropShareTokens || [])].slice(0, 40);
  });
  return token;
}

export function consumeDropShareToken(tokenStr: string): {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  reason?: string;
} {
  let outcome: { ok: boolean; filePath?: string; fileName?: string; reason?: string } = {
    ok: false,
    reason: 'Ismeretlen vagy törölt letöltési token.',
  };

  updateState((s) => {
    const ref = (s.dropShareTokens || []).find((t) => t.token === tokenStr);
    if (!ref) {
      outcome = { ok: false, reason: 'Ismeretlen vagy törölt letöltési token.' };
      return;
    }
    if (Date.now() > Date.parse(ref.expiresAt)) {
      outcome = { ok: false, reason: 'A letöltési link érvényességi ideje lejárt.' };
      return;
    }
    if (ref.downloads >= ref.maxDownloads) {
      outcome = { ok: false, reason: 'Elérte a maximális letöltési limitet.' };
      return;
    }
    const resolved = resolveLanDropFilePath(ref.fileName);
    if (!resolved) {
      outcome = { ok: false, reason: 'A megosztott fájl már nem létezik a lemezen.' };
      return;
    }
    ref.downloads += 1;
    outcome = { ok: true, filePath: resolved.filePath, fileName: resolved.safeName };
  });

  return outcome;
}

export async function broadcastLanDiscoveryPing(port = 41234): Promise<{
  sentBroadcast: boolean;
  localInterfaces: string[];
  knownPeers: Array<{ name: string; url: string; status: string }>;
  note: string;
}> {
  const ifaces: string[] = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const e of entries || []) {
      if (e.family === 'IPv4' && !e.internal) ifaces.push(e.address);
    }
  }

  let sentBroadcast = false;
  await new Promise<void>((resolve) => {
    try {
      const sock = dgram.createSocket('udp4');
      sock.on('error', () => {
        try {
          sock.close();
        } catch {
          // ignore
        }
        resolve();
      });
      sock.bind(0, () => {
        try {
          sock.setBroadcast(true);
          const msg = Buffer.from(
            JSON.stringify({
              service: 'novaswarm',
              instance: getState().settings.instanceName,
              port: Number(process.env.PORT || 3000),
              ts: Date.now(),
            })
          );
          sock.send(msg, 0, msg.length, port, '255.255.255.255', (err) => {
            sentBroadcast = !err;
            try {
              sock.close();
            } catch {
              // ignore
            }
            resolve();
          });
        } catch {
          try {
            sock.close();
          } catch {
            // ignore
          }
          resolve();
        }
      });
    } catch {
      resolve();
    }
  });

  const s = getState();
  const knownPeers = [
    ...s.federationPeers.map((p) => ({ name: p.name, url: p.baseUrl, status: p.status })),
    ...s.clusterNodes.map((n) => ({ name: n.name, url: n.url, status: n.status })),
  ];

  return {
    sentBroadcast,
    localInterfaces: ifaces,
    knownPeers,
    note: sentBroadcast
      ? `UDP discovery ping elküldve a 255.255.255.255:${port} LAN címre.`
      : 'UDP broadcast korlátozott ebben a hálózati névtérben; helyi interfészek kilistázva.',
  };
}

/* ============================================================================
 * 5. Live Currency Exchange Rates (Ú326)
 * ============================================================================ */

export async function fetchExchangeRates(fetchImpl: typeof fetch = fetch): Promise<{
  snapshot: CurrencyRatesSnapshot;
  eurToHuf: number;
  usdToHuf: number;
  alertTriggered: boolean;
}> {
  let snapshot: CurrencyRatesSnapshot | null = null;
  try {
    const res = await fetchImpl('https://api.frankfurter.app/latest?from=EUR&to=HUF,USD,GBP,CHF', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = (await res.json()) as { base?: string; date?: string; rates?: Record<string, number> };
      if (json.rates?.HUF) {
        snapshot = {
          base: json.base || 'EUR',
          date: json.date || new Date().toISOString().slice(0, 10),
          rates: json.rates,
          fetchedAt: new Date().toISOString(),
          source: 'frankfurter.app (ECB)',
        };
      }
    }
  } catch {
    // fallback below
  }

  if (!snapshot) {
    const prev = getState().currencyRates;
    snapshot = prev || {
      base: 'EUR',
      date: new Date().toISOString().slice(0, 10),
      rates: { HUF: 406.5, USD: 1.07, GBP: 0.84, CHF: 0.94 },
      fetchedAt: new Date().toISOString(),
      source: 'offline_cache_fallback',
    };
  }

  updateState((s) => {
    s.currencyRates = snapshot;
  });

  const eurToHuf = Number((snapshot.rates.HUF || 406.5).toFixed(2));
  const usdToHuf = Number(((snapshot.rates.HUF || 406.5) / (snapshot.rates.USD || 1.07)).toFixed(2));
  const threshold = getState().settings.currencyAlertThresholdHuf || 0;
  const alertTriggered = threshold > 0 && eurToHuf >= threshold;

  return { snapshot, eurToHuf, usdToHuf, alertTriggered };
}

/* ============================================================================
 * 6. Knowledge, Diff, Mindmap, Slides, Regex/Cron, CSV Playground, Decision/Quote (Ú261–Ú280)
 * ============================================================================ */

export function compareTextDocuments(textA: string, textB: string) {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const lines: Array<{ type: 'same' | 'del' | 'add'; lineA?: number; lineB?: number; text: string }> = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  let i = 0;
  let j = 0;
  while (i < linesA.length || j < linesB.length) {
    if (i < linesA.length && j < linesB.length && linesA[i] === linesB[j]) {
      lines.push({ type: 'same', lineA: i + 1, lineB: j + 1, text: linesA[i] });
      unchanged++;
      i++;
      j++;
    } else if (j < linesB.length && (i >= linesA.length || linesA[i + 1] === linesB[j] === false)) {
      if (i < linesA.length && !linesB.slice(j, j + 5).includes(linesA[i])) {
        lines.push({ type: 'del', lineA: i + 1, text: linesA[i] });
        removed++;
        i++;
      }
      if (j < linesB.length && (i >= linesA.length || linesA[i] !== linesB[j])) {
        lines.push({ type: 'add', lineB: j + 1, text: linesB[j] });
        added++;
        j++;
      }
    } else if (i < linesA.length) {
      lines.push({ type: 'del', lineA: i + 1, text: linesA[i] });
      removed++;
      i++;
    }
  }
  return { added, removed, unchanged, lines: lines.slice(0, 400) };
}

export function buildMermaidMindmap(topic: string, rawBullets: string): string {
  const root = topic.trim().replace(/[()[\]]/g, '') || 'Témakör';
  const rows = rawBullets
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out = ['mindmap', `  root((${root}))`];
  for (const r of rows) {
    const clean = r.replace(/^[-*•]\s*/, '').trim();
    if (r.startsWith('  ') || r.startsWith('\t')) {
      out.push(`      ${clean}`);
    } else {
      out.push(`    ${clean}`);
    }
  }
  if (rows.length === 0) {
    out.push('    Főág 1', '      Alpont A', '    Főág 2');
  }
  return out.join('\n');
}

export function buildSlideDeckHtml(
  title: string,
  slidesSource: string,
  publishMiniApp = false
): { html: string; slideCount: number; miniApp?: HostedMiniApp } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rawSlides = slidesSource
    .split(/\n---+\n|\n## /)
    .map((s) => s.trim())
    .filter(Boolean);
  const sections = rawSlides.length > 0 ? rawSlides : [title, '1. Pont\n- Részlet A\n- Részlet B'];

  const slidesHtml = sections
    .map((sec, idx) => {
      const parts = sec.split('\n').filter(Boolean);
      const heading = esc(parts[0]?.replace(/^#+\s*/, '') || `Dia ${idx + 1}`);
      const bullets = parts
        .slice(1)
        .map((p) => `<li>${esc(p.replace(/^[-*•]\s*/, ''))}</li>`)
        .join('');
      return `<section class="slide${idx === 0 ? ' active' : ''}" data-idx="${idx}"><h2>${heading}</h2>${bullets ? `<ul>${bullets}</ul>` : ''}</section>`;
    })
    .join('\n');

  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh}.deck{max-width:860px;width:90%;padding:48px;background:#1e293b;border-radius:16px;border:1px solid #334155}.slide{display:none}.slide.active{display:block}h2{font-size:2rem;margin:0 0 20px}ul{font-size:1.2rem;line-height:1.8}.nav{margin-top:32px;display:flex;justify-content:space-between;align-items:center;font-size:.9rem;color:#94a3b8}button{background:#f8fafc;color:#0f172a;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600}</style></head><body><div class="deck">${slidesHtml}<div class="nav"><button onclick="go(-1)">Előző</button><span id="ctr">1 / ${sections.length}</span><button onclick="go(1)">Következő</button></div></div><script>let cur=0;const slides=[...document.querySelectorAll('.slide')];function go(d){slides[cur].classList.remove('active');cur=(cur+d+slides.length)%slides.length;slides[cur].classList.add('active');document.getElementById('ctr').textContent=(cur+1)+' / '+slides.length}window.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1)})</script></body></html>`;

  let miniApp: HostedMiniApp | undefined;
  if (publishMiniApp) {
    const slug = `slides-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${crypto.randomUUID().slice(0, 4)}`;
    miniApp = {
      id: `app-${crypto.randomUUID().slice(0, 8)}`,
      slug,
      title: `Prezentáció: ${title}`,
      description: `${sections.length} diás standalone bemutató`,
      htmlContent: html,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateState((s) => {
      s.hostedMiniApps = [miniApp!, ...(s.hostedMiniApps || [])].slice(0, 30);
    });
  }
  return { html, slideCount: sections.length, miniApp };
}

export function explainRegexAndCron(kind: 'regex' | 'cron', pattern: string, testText = '') {
  const clean = pattern.trim();
  if (!clean) throw new Error('Minta megadása kötelező.');
  if (kind === 'regex') {
    const rx = new RegExp(clean, 'gm');
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(testText)) !== null && matches.length < 30) {
      matches.push(m[0]);
      if (m.index === rx.lastIndex) rx.lastIndex++;
    }
    const hints: string[] = [];
    if (clean.includes('\\d')) hints.push('\\d = számjegy [0-9]');
    if (clean.includes('\\w')) hints.push('\\w = betű/szám/aláhúzás');
    if (clean.includes('^')) hints.push('^ = sor/szöveg eleje');
    if (clean.includes('$')) hints.push('$ = sor/szöveg vége');
    if (clean.includes('+')) hints.push('+ = 1 vagy több ismétlődés');
    if (clean.includes('*')) hints.push('* = 0 vagy több ismétlődés');
    return {
      kind: 'regex' as const,
      valid: true,
      explanation: hints.length > 0 ? hints.join(' · ') : 'Érvényes reguláris kifejezés.',
      matches,
    };
  }

  const parts = clean.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('A Cron kifejezésnek pontosan 5 mezőből kell állnia (perc óra nap hónap hét_napja).');
  }
  const [min, hour, dom, mon, dow] = parts;
  const desc = [
    min === '*' ? 'minden percben' : min.startsWith('*/') ? `minden ${min.slice(2)}. percben` : `${min}. percben`,
    hour === '*' ? 'minden órában' : hour.startsWith('*/') ? `minden ${hour.slice(2)}. órában` : `${hour}:xx órakor`,
    dom === '*' ? 'minden nap' : `hónap ${dom}. napján`,
    mon === '*' ? 'minden hónapban' : `${mon}. hónapban`,
    dow === '*' ? '' : `hét ${dow}. napján`,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    kind: 'cron' as const,
    valid: true,
    explanation: `Ütemezés magyarul: ${desc}.`,
    matches: [min, hour, dom, mon, dow],
  };
}

export function analyzeTabularData(rawInput: string) {
  const clean = rawInput.trim();
  if (!clean) throw new Error('CSV vagy JSON tömb adat megadása kötelező.');
  let rows: Array<Record<string, string | number>> = [];
  if (clean.startsWith('[') || clean.startsWith('{')) {
    const parsed = JSON.parse(clean);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error('Legalább fejléc és 1 adatsor szükséges CSV módban.');
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
    for (const line of lines.slice(1)) {
      const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
      const obj: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        const val = cells[i] ?? '';
        const num = Number(val);
        obj[h] = val !== '' && Number.isFinite(num) ? num : val;
      });
      rows.push(obj);
    }
  }
  if (rows.length === 0) throw new Error('Nincs elemezhető sor.');
  const columns = Object.keys(rows[0]);
  const numericStats = columns
    .map((col) => {
      const nums = rows.map((r) => Number(r[col])).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return null;
      const sum = nums.reduce((a, b) => a + b, 0);
      return {
        column: col,
        count: nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        avg: Number((sum / nums.length).toFixed(2)),
        sum: Number(sum.toFixed(2)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return { rowCount: rows.length, columns, numericStats, previewRows: rows.slice(0, 12) };
}

export function renderPromptVariables(template: string, variables: Record<string, string>) {
  const foundKeys = Array.from(new Set(Array.from(template.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)).map((m) => m[1])));
  const missing: string[] = [];
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_all, key: string) => {
    if (variables[key] === undefined || variables[key] === '') {
      missing.push(key);
      return `{{${key}}}`;
    }
    return String(variables[key]);
  });
  return { rendered, foundKeys, missing };
}

export function addDecisionLog(input: {
  title: string;
  choiceMade: string;
  alternatives?: string;
  expectedOutcome?: string;
  reviewDays?: number;
}): DecisionLogEntry {
  if (!input.title?.trim() || !input.choiceMade?.trim()) {
    throw new Error('Döntés címe és választott megoldás kötelező.');
  }
  const days = Math.max(1, Math.min(365, Number(input.reviewDays || 30)));
  const entry: DecisionLogEntry = {
    id: `dec-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title.trim(),
    choiceMade: input.choiceMade.trim(),
    alternatives: (input.alternatives || '').trim(),
    expectedOutcome: (input.expectedOutcome || '').trim(),
    reviewDate: new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10),
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.decisionLogs = [entry, ...(s.decisionLogs || [])].slice(0, 100);
  });
  return entry;
}

export function updateDecisionStatus(id: string, status: DecisionLogEntry['status']) {
  updateState((s) => {
    s.decisionLogs = (s.decisionLogs || []).map((d) => (d.id === id ? { ...d, status } : d));
  });
}

export function addQuoteItem(input: { quote: string; author: string; source?: string }): QuoteDeckItem {
  if (!input.quote?.trim()) throw new Error('Idézet szövege kötelező.');
  const item: QuoteDeckItem = {
    id: `qt-${crypto.randomUUID().slice(0, 8)}`,
    quote: input.quote.trim(),
    author: (input.author || 'Ismeretlen').trim(),
    source: input.source?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.quoteDeck = [item, ...(s.quoteDeck || [])].slice(0, 200);
  });
  return item;
}

/* ============================================================================
 * 7. Personal OS, Health, Trip, Lent, Fuel, Savings & Official Letters (Ú292, Ú327–Ú343)
 * ============================================================================ */

export function addMedication(input: { name: string; dosage: string; timeOfDay: string }): MedicationReminder {
  if (!input.name?.trim()) throw new Error('Gyógyszer/vitamin neve kötelező.');
  const item: MedicationReminder = {
    id: `med-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    dosage: (input.dosage || '1 db').trim(),
    timeOfDay: (input.timeOfDay || '08:00').trim(),
    takenDates: [],
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.medicationReminders = [item, ...(s.medicationReminders || [])];
  });
  return item;
}

export function toggleMedicationToday(id: string, dateStr = new Date().toISOString().slice(0, 10)) {
  let updated: MedicationReminder | null = null;
  updateState((s) => {
    s.medicationReminders = (s.medicationReminders || []).map((m) => {
      if (m.id !== id) return m;
      const exists = m.takenDates.includes(dateStr);
      const next = exists ? m.takenDates.filter((d) => d !== dateStr) : [...m.takenDates, dateStr];
      updated = { ...m, takenDates: next };
      return updated;
    });
  });
  return updated;
}

export function addFixedExpense(input: { name: string; amount: number; currency?: string; dueDay?: number }): FixedExpenseItem {
  if (!input.name?.trim() || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) {
    throw new Error('Érvényes név és pozitív összeg kötelező.');
  }
  const item: FixedExpenseItem = {
    id: `fix-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    amount: Number(input.amount),
    currency: input.currency || getState().settings.defaultCurrency || 'HUF',
    dueDay: Math.max(1, Math.min(31, Math.round(input.dueDay || 10))),
    paidThisMonth: false,
  };
  updateState((s) => {
    s.fixedExpenses = [item, ...(s.fixedExpenses || [])];
  });
  return item;
}

export function toggleFixedExpensePaid(id: string) {
  updateState((s) => {
    s.fixedExpenses = (s.fixedExpenses || []).map((f) =>
      f.id === id ? { ...f, paidThisMonth: !f.paidThisMonth } : f
    );
  });
  return computeMonthlyFixedSummary();
}

export function computeMonthlyFixedSummary() {
  const items = getState().fixedExpenses || [];
  let totalAmount = 0;
  let paidAmount = 0;
  for (const item of items) {
    totalAmount += item.amount;
    if (item.paidThisMonth) paidAmount += item.amount;
  }
  return {
    count: items.length,
    totalAmount,
    paidAmount,
    remainingAmount: Math.max(0, totalAmount - paidAmount),
  };
}

export function createTripPlan(input: {
  destination: string;
  startDate: string;
  endDate: string;
  notes?: string;
  packingItems?: string[];
}): TripPlanItem {
  if (!input.destination?.trim()) throw new Error('Úticél megadása kötelező.');
  const defaultPack = ['Útlevél / Személyi', 'Töltő & Powerbank', 'Fehérnemű & Zokni', 'Alap gyógyszercsomag'];
  const list = (input.packingItems && input.packingItems.length > 0 ? input.packingItems : defaultPack)
    .filter((t) => t.trim())
    .map((t) => ({ id: crypto.randomUUID().slice(0, 6), text: t.trim(), packed: false }));
  const item: TripPlanItem = {
    id: `trp-${crypto.randomUUID().slice(0, 8)}`,
    destination: input.destination.trim(),
    startDate: input.startDate || new Date().toISOString().slice(0, 10),
    endDate: input.endDate || new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    notes: (input.notes || '').trim(),
    packingList: list,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.tripPlans = [item, ...(s.tripPlans || [])];
  });
  return item;
}

export function toggleTripPackingItem(tripId: string, itemId: string) {
  updateState((s) => {
    s.tripPlans = (s.tripPlans || []).map((t) =>
      t.id === tripId
        ? {
            ...t,
            packingList: t.packingList.map((p) => (p.id === itemId ? { ...p, packed: !p.packed } : p)),
          }
        : t
    );
  });
}

export function addLentItem(input: { itemName: string; personName: string; dueReturnAt?: string }): LentItemRecord {
  if (!input.itemName?.trim() || !input.personName?.trim()) {
    throw new Error('Tárgy neve és személy neve kötelező.');
  }
  const item: LentItemRecord = {
    id: `lnt-${crypto.randomUUID().slice(0, 8)}`,
    itemName: input.itemName.trim(),
    personName: input.personName.trim(),
    lentAt: new Date().toISOString().slice(0, 10),
    dueReturnAt: input.dueReturnAt?.trim() || undefined,
    returned: false,
  };
  updateState((s) => {
    s.lentItems = [item, ...(s.lentItems || [])];
  });
  return item;
}

export function markLentItemReturned(id: string) {
  updateState((s) => {
    s.lentItems = (s.lentItems || []).map((x) =>
      x.id === id ? { ...x, returned: !x.returned, returnedAt: !x.returned ? new Date().toISOString().slice(0, 10) : undefined } : x
    );
  });
}

export function addFuelLog(input: {
  distanceKm: number;
  liters: number;
  totalCost: number;
  date?: string;
  note?: string;
}): FuelLogRecord {
  const dist = Number(input.distanceKm);
  const lit = Number(input.liters);
  const cost = Number(input.totalCost || 0);
  if (!Number.isFinite(dist) || dist <= 0 || !Number.isFinite(lit) || lit <= 0) {
    throw new Error('A megtett km és a tankolt liter pozitív szám kell legyen.');
  }
  const rec: FuelLogRecord = {
    id: `fuel-${crypto.randomUUID().slice(0, 8)}`,
    date: input.date || new Date().toISOString().slice(0, 10),
    distanceKm: dist,
    liters: lit,
    totalCost: cost,
    consumptionPer100Km: Number(((lit / dist) * 100).toFixed(2)),
    costPerKm: cost > 0 ? Number((cost / dist).toFixed(2)) : 0,
    note: input.note?.trim() || undefined,
  };
  updateState((s) => {
    s.fuelLogs = [rec, ...(s.fuelLogs || [])].slice(0, 100);
  });
  return rec;
}

export function addMediaBacklogItem(input: {
  title: string;
  kind?: MediaBacklogItem['kind'];
  note?: string;
}): MediaBacklogItem {
  if (!input.title?.trim()) throw new Error('Cím megadása kötelező.');
  const item: MediaBacklogItem = {
    id: `medb-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title.trim(),
    kind: input.kind || 'book',
    status: 'queued',
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.mediaBacklog = [item, ...(s.mediaBacklog || [])];
  });
  return item;
}

export function updateMediaBacklogStatus(id: string, status: MediaBacklogItem['status'], rating?: number) {
  updateState((s) => {
    s.mediaBacklog = (s.mediaBacklog || []).map((m) =>
      m.id === id ? { ...m, status, ...(rating !== undefined ? { rating } : {}) } : m
    );
  });
}

export function addSavingsGoal(input: { title: string; targetAmount: number; currency?: string; deadline?: string }): SavingsGoalItem {
  if (!input.title?.trim() || !Number.isFinite(Number(input.targetAmount)) || Number(input.targetAmount) <= 0) {
    throw new Error('Cél neve és pozitív célösszeg kötelező.');
  }
  const item: SavingsGoalItem = {
    id: `sav-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title.trim(),
    targetAmount: Number(input.targetAmount),
    currentAmount: 0,
    currency: input.currency || getState().settings.defaultCurrency || 'HUF',
    deadline: input.deadline?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.savingsGoals = [item, ...(s.savingsGoals || [])];
  });
  return item;
}

export function contributeSavingsGoal(id: string, deltaAmount: number) {
  updateState((s) => {
    s.savingsGoals = (s.savingsGoals || []).map((g) =>
      g.id === id ? { ...g, currentAmount: Math.max(0, g.currentAmount + Number(deltaAmount || 0)) } : g
    );
  });
}

export function setDailyTop3(texts: string[], date = new Date().toISOString().slice(0, 10)): DailyTop3State {
  const clean = texts.map((t) => t.trim()).filter(Boolean).slice(0, 3);
  const top3: DailyTop3State = {
    date,
    items: clean.map((t) => ({ id: crypto.randomUUID().slice(0, 6), text: t, done: false })),
  };
  updateState((s) => {
    s.dailyTop3 = top3;
  });
  return top3;
}

export function toggleDailyTop3Item(itemId: string): DailyTop3State | null {
  let out: DailyTop3State | null = null;
  updateState((s) => {
    if (!s.dailyTop3) return;
    s.dailyTop3 = {
      ...s.dailyTop3,
      items: s.dailyTop3.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
    };
    out = s.dailyTop3;
  });
  return out;
}

export function generateHungarianOfficialLetter(input: {
  kind: 'felmondas' | 'reklamacio' | 'kerelem' | 'meghatalmazas';
  senderName: string;
  recipientName: string;
  subject: string;
  keyPoints: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const sender = input.senderName.trim() || '[Feladó Neve]';
  const recipient = input.recipientName.trim() || '[Címzett / Szolgáltató Neve]';
  const subject = input.subject.trim() || 'Hivatalos beadvány';
  const points = input.keyPoints.trim() || 'Kérem az ügy kivizsgálását és írásbeli visszajelzésüket.';

  const introByKind: Record<typeof input.kind, string> = {
    felmondas: `Ezúton értesítem Önöket, hogy az alábbi szerződést/szolgáltatást rendes felmondással, a jogszabályi és szerződéses határidők betartásával megszüntetem.`,
    reklamacio: `Ezúton hivatalos panaszt és minőségi kifogást nyújtok be az alábbi ügyben, kérve a hiba haladéktalan orvoslását vagy a megfelelő jóváírást.`,
    kerelem: `Tisztelettel fordulok Önökhöz az alábbi kérelem elbírálása és az ügyintézés megindítása érdekében.`,
    meghatalmazas: `Alulírott ${sender} ezúton meghatalmazom a megnevezett képviselőt, hogy nevemben és helyettem az alábbi ügyben teljes jogkörrel eljárjon.`,
  };

  return [
    `Címzett: ${recipient}`,
    `Tárgy: ${subject}`,
    `Kelt: ${today}`,
    '',
    'Tisztelt Hölgyem / Uram!',
    '',
    introByKind[input.kind] || introByKind.kerelem,
    '',
    'Részletek és indoklás:',
    points,
    '',
    'Kérem szíves írásbeli visszajelzésüket a jogszabályi határidőn belül.',
    '',
    'Tisztelettel,',
    sender,
  ].join('\n');
}

export function buildYearInReviewSummary() {
  const s = getState();
  const doneCards = s.kanban.filter((c) => c.status === 'done').length;
  const avgConsumption =
    (s.fuelLogs || []).length > 0
      ? Number(
          (
            (s.fuelLogs || []).reduce((acc, f) => acc + f.consumptionPer100Km, 0) /
            (s.fuelLogs || []).length
          ).toFixed(2)
        )
      : null;

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      xpLevel: s.userXp.level,
      totalXp: s.userXp.xp,
      streakDays: s.userXp.streakDays,
      memoriesCount: s.memories.length,
      completedKanban: doneCards,
      missionsCount: s.missions.length,
      auditEntries: s.auditLogs.length,
      fuelLogsCount: (s.fuelLogs || []).length,
      avgFuelConsumptionL100km: avgConsumption,
    },
    highlightsMarkdown: [
      `# Éves Összefoglaló — ${s.settings.instanceName}`,
      `- Szint: **${s.userXp.level}** (${s.userXp.xp} XP · ${s.userXp.streakDays} napos széria)`,
      `- Elvégzett Kanban feladatok: **${doneCards}** db · Küldetések: **${s.missions.length}** db`,
      `- Rögzített tartós memóriák: **${s.memories.length}** db`,
      avgConsumption !== null ? `- Átlagos autó fogyasztás: **${avgConsumption} l/100km**` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/* ============================================================================
 * 8. Shadow Pattern Miner (Ú357), Retro (Ú358), Scaffold (Ú359) & Git Changelog (Ú360)
 * ============================================================================ */

export function analyzeShadowPatterns(): {
  suggestions: Array<{ pattern: string; count: number; recommendedAction: string; suggestedMacroSlug: string }>;
  scannedEvents: number;
} {
  const s = getState();
  const counts = new Map<string, number>();

  for (const log of s.auditLogs.slice(-250)) {
    const key = log.message.trim().slice(0, 48).toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const msg of s.messages.filter((m) => m.senderType === 'user').slice(-100)) {
    const firstWords = msg.content.trim().split(/\s+/).slice(0, 4).join(' ').toLowerCase();
    if (firstWords.length >= 5) {
      counts.set(firstWords, (counts.get(firstWords) || 0) + 1);
    }
  }

  const repeated = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pattern, count]) => ({
      pattern,
      count,
      recommendedAction:
        pattern.includes('ram') || pattern.includes('doctor') || pattern.includes('kórkép')
          ? 'Automatikus "takaritas" makró időzítése'
          : '1-kattintásos Gyors Makró létrehozása',
      suggestedMacroSlug: `auto-${pattern.replace(/[^a-z0-9]+/g, '-').slice(0, 14)}`,
    }));

  return {
    suggestions: repeated,
    scannedEvents: s.auditLogs.length + s.messages.length,
  };
}

export function generateWeeklyRetrospective() {
  const s = getState();
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recentAudit = s.auditLogs.filter((a) => Date.parse(a.timestamp) >= weekAgo);
  const errors = recentAudit.filter((a) => a.verifiedExecution === false || a.message.toLowerCase().includes('hiba'));
  const doneKanban = s.kanban.filter((c) => c.status === 'done' && Date.parse(c.updatedAt) >= weekAgo);
  const recentMissions = s.missions.filter((m) => Date.parse(m.createdAt) >= weekAgo);

  const summaryMarkdown = [
    `## Heti Raj Retrospektív (${new Date().toISOString().slice(0, 10)})`,
    `- Befejezett Kanban kártyák (7 nap): **${doneKanban.length}** db`,
    `- Autonóm küldetések: **${recentMissions.length}** db`,
    `- Audit események: **${recentAudit.length}** (ebből hiba/figyelmeztetés: **${errors.length}**)`,
    `- Aktív tanulási / döntési naplók: **${(s.decisionLogs || []).length}** db`,
    errors.length > 0
      ? `### Javasolt következő lépés\n- Vizsgáld felül a legutóbbi hibát: "${errors[errors.length - 1].message.slice(0, 100)}"`
      : '### Következő lépés\n- A rendszer az elmúlt 7 napban hibamentesen futott; fókuszálhatsz új funkciókra.',
  ].join('\n');

  return {
    doneKanbanCount: doneKanban.length,
    missionsCount: recentMissions.length,
    errorsCount: errors.length,
    summaryMarkdown,
  };
}

export function buildProjectScaffold(
  kind: 'node-ts' | 'react-vite' | 'python-fastapi' | 'esp32',
  projectName: string
): { kind: string; projectName: string; files: Array<{ path: string; content: string }> } {
  const slug = projectName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') || 'nova-project';
  if (kind === 'python-fastapi') {
    return {
      kind,
      projectName: slug,
      files: [
        { path: 'requirements.txt', content: 'fastapi>=0.115.0\nuvicorn>=0.30.0\n' },
        {
          path: 'main.py',
          content: `from fastapi import FastAPI\n\napp = FastAPI(title="${slug}")\n\n@app.get("/health")\ndef health():\n    return {"ok": True, "service": "${slug}"}\n`,
        },
      ],
    };
  }
  if (kind === 'esp32') {
    return {
      kind,
      projectName: slug,
      files: [
        {
          path: 'src/main.cpp',
          content: `#include <Arduino.h>\nvoid setup() { Serial.begin(115200); pinMode(2, OUTPUT); }\nvoid loop() { digitalWrite(2, HIGH); delay(500); digitalWrite(2, LOW); delay(500); }\n`,
        },
        { path: 'platformio.ini', content: `[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino\n` },
      ],
    };
  }
  if (kind === 'react-vite') {
    return {
      kind,
      projectName: slug,
      files: [
        {
          path: 'package.json',
          content: JSON.stringify({ name: slug, private: true, scripts: { dev: 'vite', build: 'vite build' } }, null, 2),
        },
        {
          path: 'src/App.tsx',
          content: `export default function App() {\n  return <main style={{ padding: 24 }}><h1>${slug}</h1></main>;\n}\n`,
        },
      ],
    };
  }
  return {
    kind: 'node-ts',
    projectName: slug,
    files: [
      {
        path: 'package.json',
        content: JSON.stringify({ name: slug, type: 'module', scripts: { dev: 'tsx src/index.ts' } }, null, 2),
      },
      {
        path: 'src/index.ts',
        content: `console.log('${slug} running on Node.js + TypeScript');\n`,
      },
    ],
  };
}

export function generateGitChangelog(limit = 25): {
  commits: Array<{ hash: string; date: string; message: string; category: string }>;
  markdown: string;
} {
  let raw = '';
  try {
    raw = execFileSync(
      'git',
      ['log', `-n`, String(Math.min(100, Math.max(1, limit))), '--pretty=format:%h|%ad|%s', '--date=short'],
      { encoding: 'utf8', timeout: 3000 }
    );
  } catch {
    raw = '';
  }

  const commits = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...rest] = line.split('|');
      const message = rest.join('|');
      const low = message.toLowerCase();
      const category = low.startsWith('feat') || low.includes('új')
        ? 'Újdonságok'
        : low.startsWith('fix') || low.includes('javít')
        ? 'Hibajavítások'
        : 'Egyéb módosítások';
      return { hash, date, message, category };
    });

  const mdLines = [`# Változásnapló (${new Date().toISOString().slice(0, 10)})`];
  for (const cat of ['Újdonságok', 'Hibajavítások', 'Egyéb módosítások']) {
    const items = commits.filter((c) => c.category === cat);
    if (items.length === 0) continue;
    mdLines.push(`\n## ${cat}`);
    for (const it of items) {
      mdLines.push(`- \`${it.hash}\` (${it.date}) ${it.message}`);
    }
  }
  if (commits.length === 0) {
    mdLines.push('\n- Nincs elérhető git commit előzmény ebben a környezetben.');
  }
  return { commits, markdown: mdLines.join('\n') };
}
