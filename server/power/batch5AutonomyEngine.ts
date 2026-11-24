import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import type { DynamicToolDef, ProactiveRuleEvent, VisualWatchItem } from '../../shared/types';
import { sendWakeOnLanPacket } from '../infra/networkAndCluster';
import { addPersistentMemory } from '../memory/vectorStore';
import { fetchOpenMeteoWeather } from '../power/universalSuite';
import { invokeWithFailover } from '../providers/router';
import { validateSafeOutboundUrl } from '../security/egressAndCrypto';
import { assertHostPermission } from '../security/permissionGate';
import { appendAuditLog, getState, updateState } from '../state/store';
import { collectHardwareMetrics } from '../system/ops';
import { runHeadlessBrowserAction } from '../web/searchAndBrowser';

function hasBin(name: string): string | null {
  try {
    const out = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// ============================================================================
// 1. Voice Reply Synthesis (espeak-ng WAV -> ffmpeg Opus .ogg for Telegram sendVoice)
// ============================================================================

export function synthesizeTelegramVoiceOgg(text: string): {
  ok: boolean;
  oggBuffer?: Buffer;
  mimeType: string;
  error?: string;
} {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' kódblokk ')
    .replace(/[*_`#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  if (!clean) return { ok: false, mimeType: 'audio/ogg', error: 'Üres szöveg.' };

  const espeak = hasBin('espeak-ng') || hasBin('espeak');
  const ffmpeg = hasBin('ffmpeg');
  if (!espeak || !ffmpeg) {
    return {
      ok: false,
      mimeType: 'audio/ogg',
      error: !espeak
        ? 'espeak-ng bináris nem található a gazdagépen.'
        : 'ffmpeg bináris nem található az opus hangkódoláshoz.',
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-tts-'));
  const wavPath = path.join(tmpDir, 'reply.wav');
  const oggPath = path.join(tmpDir, 'reply.ogg');
  try {
    execFileSync(espeak, ['-v', 'hu', '-s', '155', '-w', wavPath, clean], {
      timeout: 8000,
      stdio: 'ignore',
    });
    execFileSync(
      ffmpeg,
      ['-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on', oggPath],
      { timeout: 10000, stdio: 'ignore' }
    );
    if (!fs.existsSync(oggPath)) {
      return { ok: false, mimeType: 'audio/ogg', error: 'Ogg kimenet nem jött létre.' };
    }
    return { ok: true, oggBuffer: fs.readFileSync(oggPath), mimeType: 'audio/ogg' };
  } catch (err) {
    return {
      ok: false,
      mimeType: 'audio/ogg',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function speakHostSpeakerAnnouncement(text: string): { ok: boolean; detail: string } {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) return { ok: false, detail: 'Üres szöveg.' };
  const espeak = hasBin('espeak-ng') || hasBin('espeak');
  if (!espeak) {
    return { ok: false, detail: 'espeak-ng nincs telepítve a hangszóró kimenethez.' };
  }
  try {
    assertHostPermission('speaker_tts');
    execFileSync(espeak, ['-v', 'hu', clean], { timeout: 10000, stdio: 'ignore' });
    appendAuditLog({
      type: 'action',
      sourceAgentId: 'speaker-tts',
      sourceAgentName: 'LAN Hangszóró TTS',
      message: `Hangos bemondás: "${clean.slice(0, 80)}"`,
      verifiedExecution: true,
    });
    return { ok: true, detail: `Elhangzott a gazdagép hangszóróján: "${clean.slice(0, 60)}"` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// 2. Smart Telegram Photo Auto-Classifier (Receipt / Warranty / Error)
// ============================================================================

export function routeTelegramPhotoIntent(input: {
  caption: string;
  aiReplyText: string;
}): {
  category: 'receipt' | 'warranty_doc' | 'error_diag' | 'general';
  autoSavedNote: string | null;
} {
  const combined = `${input.caption}\n${input.aiReplyText}`;
  if (/(blokk|nyugta|számla|összesen|fizetendő|ft\b|eur\b|usd\b|receipt|invoice)/i.test(combined)) {
    const numMatch = combined.match(/(\d[\d\s.,]{1,10})\s*(ft|huf|eur|€|\$|usd)/i);
    const amount = numMatch ? Number(numMatch[1].replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0;
    const currency = numMatch?.[2]?.toUpperCase().replace('FT', 'HUF').replace('€', 'EUR').replace('$', 'USD') || 'HUF';
    if (amount > 0) {
      updateState((s) => {
        s.expenses.unshift({
          id: `exp-${crypto.randomUUID().slice(0, 8)}`,
          date: new Date().toISOString().slice(0, 10),
          merchant: input.caption.slice(0, 40) || 'Telegram Fotó Blokk',
          category: 'Egyéb / Fotózott Blokk',
          amount,
          currency,
          source: 'receipt_ocr',
          notes: input.aiReplyText.slice(0, 160),
        });
      });
      return {
        category: 'receipt',
        autoSavedNote: `Automatikusan rögzítve a Kiadások közé: ${amount} ${currency}`,
      };
    }
  }

  if (/(garancia|jótállás|szerződés|okmány|személyi|útlevél|lejár|warranty)/i.test(combined)) {
    const expiryMatch = combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const expiresAt = expiryMatch?.[1] || new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    updateState((s) => {
      s.documentSafe.unshift({
        id: `doc-${crypto.randomUUID().slice(0, 8)}`,
        title: input.caption.slice(0, 60) || 'Telegram Fotózott Okmány',
        category: 'warranty',
        expiresAt,
        notes: input.aiReplyText.slice(0, 180),
        createdAt: new Date().toISOString(),
      });
    });
    return {
      category: 'warranty_doc',
      autoSavedNote: `Automatikusan mentve az Okmány/Garancia Széfbe (lejárat: ${expiresAt})`,
    };
  }

  if (/(hiba|error|exception|traceback|panic|failed|stack|segfault)/i.test(combined)) {
    addPersistentMemory({
      content: `Fotózott hibaképernyő elemzés: ${input.caption} -> ${input.aiReplyText.slice(0, 240)}`,
      entity: 'Hibadiagnosztika',
      tags: ['error', 'screenshot', 'telegram'],
      links: [],
      importanceScore: 0.78,
      tier: 'warm',
    });
    return {
      category: 'error_diag',
      autoSavedNote: 'Hibaelemzés mentve a tartós memóriába.',
    };
  }

  return { category: 'general', autoSavedNote: null };
}

// ============================================================================
// 3. Headless Screenshot & Visual Page Change Detector
// ============================================================================

export async function captureWebScreenshotOrDom(rawUrl: string): Promise<{
  ok: boolean;
  url: string;
  screenshotBase64?: string;
  title?: string;
  textPreview?: string;
  browserBinary: string | null;
  error?: string;
}> {
  const url = rawUrl.trim();
  const check = validateSafeOutboundUrl(url);
  if (!check.safe) {
    return { ok: false, url, browserBinary: null, error: check.reason || 'Tiltott URL.' };
  }

  const shot = await runHeadlessBrowserAction({ action: 'screenshot', url });
  if (shot.ok && shot.screenshotBase64) {
    return {
      ok: true,
      url,
      screenshotBase64: shot.screenshotBase64,
      browserBinary: shot.browserBinary,
    };
  }

  // Fallback to DOM fetch preview when Chromium binary isn't installed
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const plain = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
    return {
      ok: true,
      url,
      title: titleMatch?.[1]?.trim() || url,
      textPreview: plain,
      browserBinary: shot.browserBinary,
      error: shot.error,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      browserBinary: shot.browserBinary,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function addVisualWatchItem(input: { name: string; url: string }): VisualWatchItem {
  const url = input.url.trim();
  const check = validateSafeOutboundUrl(url);
  if (!check.safe) throw new Error(check.reason || 'Érvénytelen URL.');
  const item: VisualWatchItem = {
    id: `vw-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim() || url,
    url,
    changeCount: 0,
    lastStatusNote: 'Újonnan felvéve — első ellenőrzésre vár.',
  };
  updateState((s) => {
    s.visualWatchItems = s.visualWatchItems || [];
    s.visualWatchItems.unshift(item);
  });
  return item;
}

export async function runVisualWatchCheck(targetId?: string): Promise<{
  checked: number;
  changedItems: VisualWatchItem[];
  items: VisualWatchItem[];
}> {
  const list = getState().visualWatchItems || [];
  const targets = targetId ? list.filter((i) => i.id === targetId) : list;
  const changedItems: VisualWatchItem[] = [];

  for (const item of targets) {
    const cap = await captureWebScreenshotOrDom(item.url);
    const shotHash = cap.screenshotBase64
      ? crypto.createHash('sha256').update(cap.screenshotBase64).digest('hex')
      : undefined;
    const domHash = cap.textPreview
      ? crypto.createHash('sha256').update(cap.textPreview).digest('hex')
      : undefined;

    let changed = false;
    updateState((s) => {
      const ref = (s.visualWatchItems || []).find((x) => x.id === item.id);
      if (!ref) return;
      const hadBaseline = Boolean(ref.lastScreenshotHash || ref.lastDomHash);
      if (hadBaseline && ((shotHash && ref.lastScreenshotHash && shotHash !== ref.lastScreenshotHash) || (domHash && ref.lastDomHash && domHash !== ref.lastDomHash))) {
        changed = true;
        ref.changeCount += 1;
        ref.lastChangedAt = new Date().toISOString();
        ref.lastStatusNote = 'VÁLTOZÁS ÉSZLELVE!';
        changedItems.push({ ...ref });
      } else {
        ref.lastStatusNote = cap.ok ? 'Változatlan' : cap.error || 'Hiba';
      }
      if (shotHash) ref.lastScreenshotHash = shotHash;
      if (domHash) ref.lastDomHash = domHash;
      if (cap.screenshotBase64) ref.lastCapturedBase64 = cap.screenshotBase64;
      ref.lastCheckedAt = new Date().toISOString();
    });

    if (changed) {
      appendAuditLog({
        type: 'uptime',
        sourceAgentId: 'visual-watch',
        sourceAgentName: 'Vizuális Oldalfigyelő',
        message: `Változás észlelve: ${item.name} (${item.url})`,
        verifiedExecution: true,
      });
    }
  }

  return {
    checked: targets.length,
    changedItems,
    items: getState().visualWatchItems || [],
  };
}

// ============================================================================
// 4. Physical World — Camera, GPIO & Thermal Fan, CUPS Printer
// ============================================================================

export function captureCameraSnapshot(devicePath = '/dev/video0'): {
  ok: boolean;
  toolUsed: string | null;
  imageBase64?: string;
  mimeType: string;
  error?: string;
} {
  assertHostPermission('camera:capture');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-cam-'));
  const outPath = path.join(tmpDir, 'cam.jpg');
  try {
    const rpicam = hasBin('rpicam-still') || hasBin('libcamera-still');
    if (rpicam) {
      execFileSync(rpicam, ['-n', '-t', '300', '-o', outPath], { timeout: 8000, stdio: 'ignore' });
      if (fs.existsSync(outPath)) {
        return { ok: true, toolUsed: path.basename(rpicam), imageBase64: fs.readFileSync(outPath).toString('base64'), mimeType: 'image/jpeg' };
      }
    }
    const fswebcam = hasBin('fswebcam');
    if (fswebcam && fs.existsSync(devicePath)) {
      execFileSync(fswebcam, ['-d', devicePath, '-r', '1280x720', '--no-banner', outPath], { timeout: 8000, stdio: 'ignore' });
      if (fs.existsSync(outPath)) {
        return { ok: true, toolUsed: 'fswebcam', imageBase64: fs.readFileSync(outPath).toString('base64'), mimeType: 'image/jpeg' };
      }
    }
    const ffmpeg = hasBin('ffmpeg');
    if (ffmpeg && fs.existsSync(devicePath)) {
      execFileSync(ffmpeg, ['-y', '-f', 'video4linux2', '-i', devicePath, '-frames:v', '1', outPath], { timeout: 8000, stdio: 'ignore' });
      if (fs.existsSync(outPath)) {
        return { ok: true, toolUsed: 'ffmpeg', imageBase64: fs.readFileSync(outPath).toString('base64'), mimeType: 'image/jpeg' };
      }
    }
    return {
      ok: false,
      toolUsed: null,
      mimeType: 'image/jpeg',
      error: `Nem található csatlakoztatott kamera (${devicePath}) vagy rpicam-still/fswebcam eszköz.`,
    };
  } catch (err) {
    return {
      ok: false,
      toolUsed: null,
      mimeType: 'image/jpeg',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function validateGpioPin(pin: number): number {
  const n = Number(pin);
  if (!Number.isInteger(n) || n < 0 || n > 53) {
    throw new Error('Érvénytelen GPIO tüske sorszám (0..53 közötti egész szám engedélyezett).');
  }
  return n;
}

export function readOrWriteGpioPin(
  action: 'read' | 'set',
  pinInput: number,
  value?: 0 | 1
): { ok: boolean; pin: number; value?: number; backend: string; message: string } {
  assertHostPermission(`gpio:${action}:${pinInput}`);
  const pin = validateGpioPin(pinInput);
  if (action === 'set' && value !== 0 && value !== 1) {
    throw new Error('GPIO beállításhoz csak 0 vagy 1 érték engedélyezett.');
  }

  try {
    if (action === 'read') {
      const gpioget = hasBin('gpioget');
      if (gpioget) {
        const out = execFileSync(gpioget, ['gpiochip0', String(pin)], {
          encoding: 'utf8',
          timeout: 2500,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const v = Number(out) === 1 ? 1 : 0;
        return { ok: true, pin, value: v, backend: 'libgpiod', message: `GPIO ${pin} állapota: ${v}` };
      }
      const sysPath = `/sys/class/gpio/gpio${pin}/value`;
      if (fs.existsSync(sysPath)) {
        const v = Number(fs.readFileSync(sysPath, 'utf8').trim()) === 1 ? 1 : 0;
        return { ok: true, pin, value: v, backend: 'sysfs', message: `GPIO ${pin} állapota: ${v}` };
      }
      return { ok: false, pin, backend: 'unavailable', message: `GPIO ${pin} nem olvasható (nincs gpioget / sysfs gpiochip).` };
    } else {
      const gpioset = hasBin('gpioset');
      if (gpioset) {
        execFileSync(gpioset, ['gpiochip0', `${pin}=${value}`], { timeout: 2500, stdio: 'ignore' });
        appendAuditLog({
          type: 'action',
          sourceAgentId: 'gpio-controller',
          sourceAgentName: 'GPIO Vezérlő',
          message: `GPIO ${pin} -> ${value} (libgpiod)`,
          verifiedExecution: true,
        });
        return { ok: true, pin, value, backend: 'libgpiod', message: `GPIO ${pin} beállítva: ${value}` };
      }
      const sysPath = `/sys/class/gpio/gpio${pin}/value`;
      if (fs.existsSync(sysPath)) {
        fs.writeFileSync(sysPath, String(value), 'utf8');
        return { ok: true, pin, value, backend: 'sysfs', message: `GPIO ${pin} beállítva: ${value}` };
      }
      return { ok: false, pin, value, backend: 'unavailable', message: `GPIO ${pin} nem vezérelhető ezen a gazdagépen.` };
    }
  } catch (err) {
    return {
      ok: false,
      pin,
      value,
      backend: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function evaluateThermalGpioFan(): { checked: boolean; actionTaken?: string } {
  const s = getState();
  const pin = s.settings.gpioFanPin;
  if (typeof pin !== 'number' || pin < 0 || pin > 53) return { checked: false };
  const hw = collectHardwareMetrics();
  if (hw.temperatureCelsius === null) return { checked: true };
  const threshold = s.settings.gpioFanTempThresholdC ?? 65;
  const desired: 0 | 1 = hw.temperatureCelsius >= threshold ? 1 : 0;
  const res = readOrWriteGpioPin('set', pin, desired);
  return {
    checked: true,
    actionTaken: `Termikus ventilátor GPIO ${pin} -> ${desired} (${hw.temperatureCelsius}°C vs ${threshold}°C): ${res.message}`,
  };
}

export function printDocumentViaCups(input: {
  textContent?: string;
  filePath?: string;
  printerName?: string;
}): { ok: boolean; message: string } {
  assertHostPermission('cups:print');
  const lp = hasBin('lp');
  if (!lp) {
    return { ok: false, message: 'CUPS "lp" nyomtató parancs nem található (telepítés: sudo apt install cups).' };
  }
  const args: string[] = [];
  if (input.printerName?.trim()) {
    const safePrinter = input.printerName.trim();
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(safePrinter)) {
      throw new Error('Érvénytelen nyomtató név.');
    }
    args.push('-d', safePrinter);
  }
  if (input.filePath?.trim()) {
    const cwdReal = fs.realpathSync(process.cwd());
    const candidate = path.resolve(cwdReal, input.filePath.trim());
    if (!fs.existsSync(candidate)) {
      throw new Error('A megadott nyomtatandó fájl nem található a munkakönyvtárban.');
    }
    const resolved = fs.realpathSync(candidate);
    const cwdPrefix = cwdReal.endsWith(path.sep) ? cwdReal : `${cwdReal}${path.sep}`;
    const base = path.basename(resolved);
    if (
      !resolved.startsWith(cwdPrefix) ||
      base.startsWith('.env') ||
      base.startsWith('.secrets') ||
      base.startsWith('.state.json')
    ) {
      throw new Error('A megadott nyomtatandó fájl nem engedélyezett.');
    }
    args.push('--', resolved);
    const out = execFileSync(lp, args, { encoding: 'utf8', timeout: 8000 }).trim();
    return { ok: true, message: out || 'Nyomtatási feladat elküldve a CUPS sornak.' };
  }
  const text = (input.textContent || '').trim();
  if (!text) throw new Error('Nyomtatandó szöveg vagy fájlútvonal kötelező.');
  const out = execFileSync(lp, args, { input: `${text}\n`, encoding: 'utf8', timeout: 8000 }).trim();
  return { ok: true, message: out || 'Szöveg elküldve a nyomtató sornak.' };
}

// ============================================================================
// 5. Proactive "Second Self": Morning/Evening Brief, Inbox Triage, Self-Healing, Self-Testing Tools
// ============================================================================

export async function buildProactiveBrief(period: 'morning' | 'evening'): Promise<{
  title: string;
  text: string;
  event: ProactiveRuleEvent;
}> {
  const s = getState();
  const hw = collectHardwareMetrics();
  const openKanban = s.kanban.filter((c) => !c.archived && c.status !== 'done');
  const urgentCards = openKanban.filter((c) => c.priority === 'urgent' || c.priority === 'high');
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEvents = s.calendarEvents.filter((e) => e.startAt.startsWith(todayStr));
  const upDown = s.uptimeTargets.filter((u) => u.status === 'down');
  const expiringDocs = s.documentSafe.filter((d) => {
    const days = Math.ceil((Date.parse(d.expiresAt) - Date.now()) / 86_400_000);
    return Number.isFinite(days) && days >= 0 && days <= 30;
  });

  let weatherLine = 'Időjárás: offline';
  try {
    const w = await fetchOpenMeteoWeather(s.settings.weatherLocation || 'Budapest');
    if (w.ok) {
      weatherLine = `Időjárás (${w.location}): ${w.temperatureC}°C, ${w.condition} (${w.dailyMinC}–${w.dailyMaxC}°C)`;
    }
  } catch {
    // ignore offline weather
  }

  const title = period === 'morning' ? 'Reggeli Főnöki Összefoglaló' : 'Esti Záró Összefoglaló';
  const lines = [
    `${title} — ${s.settings.instanceName}`,
    weatherLine,
    `• Gazdagép: CPU ${hw.cpuLoadPercent}% · RAM ${hw.ramUsedMb}/${hw.ramTotalMb} MB (${hw.ramPercent}%)`,
    `• Nyitott Kanban: ${openKanban.length} db (${urgentCards.length} sürgős/magas)`,
    `• Mai naptár események: ${todayEvents.length} db${todayEvents.length ? ` (${todayEvents.map((e) => e.title).slice(0, 3).join(', ')})` : ''}`,
    `• Lejáró okmány/garancia (<30 nap): ${expiringDocs.length} db`,
    `• Napi AI költés: $${s.settings.dailySpendUsd.toFixed(4)} / $${s.settings.dailyCostLimitUsd.toFixed(2)}`,
    upDown.length > 0 ? `• FIGYELEM leállt szolgáltatások: ${upDown.map((u) => u.name).join(', ')}` : '• Uptime célok: rendben',
  ];

  if (period === 'evening') {
    const doneToday = s.kanban.filter((c) => c.status === 'done' && c.updatedAt.startsWith(todayStr)).length;
    lines.push(`• Ma lezárt feladatok: ${doneToday} db · XP Szint: ${s.userXp.level}`);
  }

  const text = lines.join('\n');
  const event: ProactiveRuleEvent = {
    id: `pe-${crypto.randomUUID().slice(0, 8)}`,
    kind: period === 'morning' ? 'morning_brief' : 'evening_brief',
    title,
    summary: text.slice(0, 260),
    notifiedTelegram: false,
    createdAt: new Date().toISOString(),
  };

  updateState((draft) => {
    draft.proactiveEvents = draft.proactiveEvents || [];
    draft.proactiveEvents.unshift(event);
    draft.proactiveEvents = draft.proactiveEvents.slice(0, 60);
  });

  return { title, text, event };
}

export function runEmailInboxTriage(): {
  scannedEmails: number;
  packagesAdded: number;
  expensesAdded: number;
  urgentAlerts: string[];
} {
  const s = getState();
  const emails = s.emailConfig.recentEmails || [];
  let packagesAdded = 0;
  let expensesAdded = 0;
  const urgentAlerts: string[] = [];

  for (const em of emails) {
    const text = `${em.subject} ${em.snippet}`;
    // 1. Package tracking codes (GLS / DPD / Foxpost / DHL / MPL)
    const trackMatch = text.match(/\b((?:GLS|DPD|FOX|MPL|DHL)[-A-Z0-9]{5,18})\b/i);
    if (trackMatch) {
      const code = trackMatch[1].toUpperCase();
      if (!s.packages.some((p) => p.trackingNumber === code)) {
        updateState((draft) => {
          draft.packages.unshift({
            id: `pkg-${crypto.randomUUID().slice(0, 8)}`,
            title: em.subject.slice(0, 60) || 'Bejövő csomag',
            carrier: code.slice(0, 3),
            trackingNumber: code,
            status: 'in_transit',
            notes: `Emailből felismerve (${em.from})`,
            updatedAt: new Date().toISOString(),
          });
        });
        packagesAdded += 1;
      }
    }

    // 2. Invoice / Receipt amounts
    if (/(számla|invoice|fizetve|nyugta|receipt|átutalás)/i.test(text)) {
      const amtMatch = text.match(/(\d[\d\s.,]{1,10})\s*(ft|huf|eur|€|\$|usd)/i);
      if (amtMatch) {
        const amount = Number(amtMatch[1].replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        const currency = amtMatch[2].toUpperCase().replace('FT', 'HUF').replace('€', 'EUR').replace('$', 'USD');
        const noteTag = `email:${em.uid}`;
        if (amount > 0 && !s.expenses.some((ex) => ex.notes?.includes(noteTag))) {
          updateState((draft) => {
            draft.expenses.unshift({
              id: `exp-${crypto.randomUUID().slice(0, 8)}`,
              date: new Date().toISOString().slice(0, 10),
              merchant: em.from.slice(0, 40) || 'Email Számla',
              category: 'Email Számla',
              amount,
              currency,
              source: 'manual',
              notes: `${em.subject.slice(0, 80)} [${noteTag}]`,
            });
          });
          expensesAdded += 1;
        }
      }
    }

    // 3. Urgent flags
    if (/(sürgős|urgent|lejárt|sikertelen fizetés|kritikus|figyelmeztetés|riasztás)/i.test(text)) {
      urgentAlerts.push(`${em.subject} (${em.from})`);
    }
  }

  const summary = `Email Triage (${emails.length} levél): +${packagesAdded} csomag, +${expensesAdded} kiadás, ${urgentAlerts.length} sürgős`;
  updateState((draft) => {
    draft.proactiveEvents = draft.proactiveEvents || [];
    draft.proactiveEvents.unshift({
      id: `pe-${crypto.randomUUID().slice(0, 8)}`,
      kind: 'inbox_triage',
      title: 'Email Inbox Automatikus Triage',
      summary,
      notifiedTelegram: urgentAlerts.length > 0,
      createdAt: new Date().toISOString(),
    });
    draft.proactiveEvents = draft.proactiveEvents.slice(0, 60);
  });

  return {
    scannedEmails: emails.length,
    packagesAdded,
    expensesAdded,
    urgentAlerts,
  };
}

export async function runSelfHealingDaemonTick(): Promise<{
  checkedAt: string;
  healedActions: string[];
  failedServices: string[];
}> {
  const s = getState();
  const healedActions: string[] = [];
  const failedServices: string[] = [];

  // 1. Check systemd failed units (non-blocking)
  try {
    const out = execFileSync('systemctl', ['--failed', '--no-legend', '--plain'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) {
      for (const line of out.split('\n').slice(0, 5)) {
        const unit = line.trim().split(/\s+/)[0];
        if (unit) failedServices.push(unit);
      }
    }
  } catch {
    // non-systemd host
  }

  // 2. Wake-on-LAN auto-poke offline cluster nodes if matching MAC is saved
  for (const node of s.clusterNodes) {
    if (node.status === 'offline') {
      const wol = s.wolDevices.find((w) => w.name.toLowerCase().includes(node.name.toLowerCase()));
      if (wol) {
        try {
          const sent = await sendWakeOnLanPacket(wol.mac, wol.broadcastIp);
          if (sent.ok) {
            healedActions.push(`WoL ébresztő küldve (${node.name} / ${wol.mac})`);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // 3. Evaluate thermal fan if configured
  const fan = evaluateThermalGpioFan();
  if (fan.actionTaken) {
    healedActions.push(fan.actionTaken);
  }

  if (healedActions.length > 0 || failedServices.length > 0) {
    updateState((draft) => {
      draft.proactiveEvents = draft.proactiveEvents || [];
      draft.proactiveEvents.unshift({
        id: `pe-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'self_heal',
        title: 'Öngyógyító Démon Futás',
        summary: `Javítások: ${healedActions.length} · Hibás systemd: ${failedServices.join(', ') || '0'}`,
        notifiedTelegram: failedServices.length > 0,
        createdAt: new Date().toISOString(),
      });
      draft.proactiveEvents = draft.proactiveEvents.slice(0, 60);
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    healedActions,
    failedServices,
  };
}

/**
 * Batch 5: Self-Testing & Self-Repairing Dynamic Tool Builder
 */
export async function createAndSelfTestDynamicTool(input: {
  name: string;
  description: string;
  kind: DynamicToolDef['kind'];
  targetOrCode: string;
  testInput?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  repaired: boolean;
  attempts: number;
  testOutput: string;
  tool: DynamicToolDef;
}> {
  const name = input.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!name) throw new Error('Érvényes eszköz név kötelező.');
  let codeOrTarget = (input.targetOrCode || '').trim();
  if (!codeOrTarget) throw new Error('URL vagy JS kód kötelező.');

  let attempts = 1;
  let repaired = false;
  let testOutput = '';
  let passed = false;

  if (input.kind === 'sandbox_js') {
    const tryExecuteJs = (code: string) => {
      const ctx = vm.createContext({
        input: input.testInput || { sample: 42 },
        Math,
        JSON,
        Date,
        result: undefined as unknown,
      });
      const wrapped = `(function() { ${code} })()`;
      return vm.runInContext(wrapped, ctx, { timeout: 600 });
    };

    try {
      const res = tryExecuteJs(codeOrTarget);
      if (res === undefined && !/\breturn\b/.test(codeOrTarget)) {
        throw new Error('Hiányzó return utasítás (undefined eredmény).');
      }
      passed = true;
      testOutput = typeof res === 'string' ? res : JSON.stringify(res ?? 'OK');
    } catch (err) {
      const firstErr = err instanceof Error ? err.message : String(err);
      attempts = 2;
      // Deterministic repair pass (e.g. implicit return or trailing syntax fix)
      let candidate = codeOrTarget;
      if (!/\breturn\b/.test(candidate)) {
        candidate = `return (${candidate});`;
      }
      try {
        const res2 = tryExecuteJs(candidate);
        codeOrTarget = candidate;
        repaired = true;
        passed = true;
        testOutput = typeof res2 === 'string' ? res2 : JSON.stringify(res2 ?? 'OK (auto-repaired)');
      } catch {
        // AI repair attempt if provider is configured
        try {
          const ai = await invokeWithFailover({
            prompt: `Javítsd ki ezt a rövid JS függvénytörzset úgy, hogy fusson hibamentesen és return értékkel térjen vissza. Csak a nyers JS kódot add vissza!\nHiba: ${firstErr}\nKód:\n${codeOrTarget}`,
            complexity: 'simple',
          });
          const cleaned = ai.text.replace(/```[a-z]*\n?|```/gi, '').trim();
          const res3 = tryExecuteJs(cleaned);
          codeOrTarget = cleaned;
          repaired = true;
          passed = true;
          testOutput = typeof res3 === 'string' ? res3 : JSON.stringify(res3 ?? 'OK (AI repaired)');
        } catch (err2) {
          testOutput = `Teszt sikertelen: ${err2 instanceof Error ? err2.message : firstErr}`;
        }
      }
    }
  } else {
    const check = validateSafeOutboundUrl(codeOrTarget);
    passed = check.safe;
    testOutput = check.safe ? `URL validálva: ${codeOrTarget}` : check.reason || 'Tiltott URL.';
  }

  if (!passed) {
    throw new Error(`Az eszköz önellenőrző füsttesztje elbukott: ${testOutput}`);
  }

  const tool: DynamicToolDef = {
    id: `tool-${crypto.randomUUID().slice(0, 8)}`,
    name,
    description: input.description.trim() || `Önellenőrzött ${input.kind} eszköz`,
    kind: input.kind,
    targetOrCode: codeOrTarget,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.dynamicTools = s.dynamicTools.filter((t) => t.name !== name);
    s.dynamicTools.unshift(tool);
  });

  appendAuditLog({
    type: 'skill',
    sourceAgentId: 'tool-selftest',
    sourceAgentName: 'Önellenőrző Eszközgyár',
    message: `Dinamikus eszköz mentve füstteszttel (${tool.name}, repaired=${repaired}): ${testOutput.slice(0, 100)}`,
    verifiedExecution: true,
  });

  return { ok: true, repaired, attempts, testOutput, tool };
}
