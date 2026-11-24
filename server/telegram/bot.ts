import crypto from 'node:crypto';
import type { ApprovalRequest } from '../../shared/types';
import {
  generateWeeklyTimeCapsule,
  handleUserTurn,
  resolveTargetAgent,
  runNightShiftCycle,
} from '../agents/engine';
import { resolvePairingRequest } from '../channels/connectors';
import { pingClusterNodes, scanLanArpTable, sendWakeOnLanPacket } from '../infra/networkAndCluster';
import { searchMemories } from '../memory/vectorStore';
import {
  addSharedListItem,
  fetchOpenMeteoWeather,
  getOrCreateDefaultSharedList,
  runAutonomousMission,
} from '../power/universalSuite';
import { invokeWithFailover } from '../providers/router';
import { activateKillSwitch, assertHostPermission, resolveApproval } from '../security/permissionGate';
import {
  collectPiHardwareDeepStatus,
  checkSystemPackageUpdates,
  detectLanIntruders,
  generatePostMortemReport,
  runBashCopilot,
} from '../infra/batch4PiHardwareAndNet';
import {
  checkExpiringDocuments,
  checkPriceWatchItem,
  getAutopilotSummary,
  runGlobalOmnisearch,
  runMultiAgentDebate,
  suggestRecipesFromPantry,
} from '../power/batch4OmniStudio';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendAuditLog,
  getAgentTelegramTokenSecret,
  getState,
  getTelegramTokenSecret,
  updateState,
  verifyAuditLogChain,
} from '../state/store';
import { collectHardwareMetrics, checkOtaUpdates } from '../system/ops';
import { saveLanDropFile } from '../infra/batch4PiHardwareAndNet';
import {
  applyHardwareAdaptiveOptimization,
  runRamOomWatchdogTick,
} from '../system/hardwareOptimizer';
import {
  buildProactiveBrief,
  captureCameraSnapshot,
  captureWebScreenshotOrDom,
  printDocumentViaCups,
  readOrWriteGpioPin,
  routeTelegramPhotoIntent,
  runEmailInboxTriage,
  runSelfHealingDaemonTick,
  speakHostSpeakerAnnouncement,
  synthesizeTelegramVoiceOgg,
} from '../power/batch5AutonomyEngine';
import {
  createSmartReminder,
  dispatchSwarmMeshTask,
  evaluateAutonomyRules,
  executeQuickMacro,
  runDockerWatchtowerHeal,
  runForensicSystemSnapshot,
  runLanSentinelAndSpeedtest,
  trustLanMacAddress,
} from '../power/batch6ApexEngine';
import {
  detectJournalAnomalies,
  fetchExchangeRates,
  OPERATING_MODE_META,
  parseHungarianNaturalAutomation,
  scanLanOpenPorts,
  setOperatingMode,
} from '../power/batch7UniverseEngine';
import {
  analyzeNumericSeries,
  convertUnitsAndTimezones,
  exportOmniExecutiveReportMarkdown,
  processMeetingNotes,
  runRedTeamCritique,
  sanitizeSensitiveText,
  searchOmniCapabilities,
  setActivePersona,
  setActiveUserContext,
  transformTextTone,
} from '../power/batch8SingularityEngine';
import type { OperatingModeId } from '../../shared/types';
import { addPersistentMemory } from '../memory/vectorStore';

let pollingActive = false;
const botOffsets = new Map<string, number>();
let commandsSyncedToken: string | null = null;

/** M304: Safe HTML escaping for Telegram HTML parse_mode */
export function escapeTelegramHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** M309: Send transient emoji reaction to acknowledge incoming Telegram messages */
async function setTelegramReaction(token: string, chatId: string | number, messageId: number, emoji = '👀'): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }],
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // non-fatal on older Telegram clients
  }
}

/** M183: Split long Telegram replies safely without breaking triple-backtick code fences */
export function splitTelegramMessageSafe(text: string, maxLen = 3900): string[] {
  const clean = text.trim();
  if (clean.length <= maxLen) return [clean];

  const chunks: string[] = [];
  let current = '';
  let insideFence = false;

  for (const line of clean.split('\n')) {
    const fenceToggles = (line.match(/```/g) || []).length % 2 === 1;
    if ((current + '\n' + line).length > maxLen && current.length > 0) {
      chunks.push(insideFence ? `${current}\n\`\`\`` : current);
      current = insideFence ? `\`\`\`\n${line}` : line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
    if (fenceToggles) insideFence = !insideFence;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** M182: Automatically register all Hungarian Telegram bot commands with BotFather API */
export async function syncTelegramBotCommands(token: string): Promise<void> {
  if (!token || commandsSyncedToken === token) return;
  commandsSyncedToken = token;
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'statusz', description: 'Rendszer állapot, hőmérséklet és költség' },
          { command: 'autopilot', description: 'Autopilot 24/7 főagy összefoglaló' },
          { command: 'mission', description: 'Autonóm küldetés indítása' },
          { command: 'nightshift', description: 'Éjszakai Műszak futtatása' },
          { command: 'top', description: 'CPU, RAM, ZRAM és szenzorok' },
          { command: 'search', description: 'Mindent-Kereső (Omnisearch)' },
          { command: 'bash', description: 'Bash Copilot (magyar -> parancs)' },
          { command: 'vita', description: 'Több-ágenses Pro/Kontra vita' },
          { command: 'behatolo', description: 'Ismeretlen LAN MAC eszközök' },
          { command: 'okmany', description: 'Lejáró garanciák és okmányok' },
          { command: 'arfigyelo', description: 'Webshop árfigyelő állapot' },
          { command: 'recept', description: 'Receptek a kamra készletből' },
          { command: 'xp', description: 'Saját RPG szint és széria' },
          { command: 'hiba', description: 'Automatikus Post-Mortem diagnosztika' },
          { command: 'frissites', description: 'Rendszer és csomagfrissítések' },
          { command: 'lista', description: 'Bevásárlólista / tétel hozzáadás' },
          { command: 'kanban', description: 'Aktív Kanban kártyák' },
          { command: 'screenshot', description: 'Weboldal képernyőkép (/screenshot url)' },
          { command: 'cam', description: 'USB/Pi kamera pillanatkép' },
          { command: 'gpio', description: 'GPIO tüske olvasás/vezérlés' },
          { command: 'brief', description: 'Reggeli/Esti főnöki összefoglaló' },
          { command: 'hwopt', description: 'Hardver-adaptív auto-optimalizálás' },
          { command: 'heal', description: 'Öngyógyító démon & RAM őrszem' },
          { command: 'korkep', description: 'Forenzikus gazdagép folyamat & OOM kórkép' },
          { command: 'emlekezteto', description: 'Időzített emlékeztető (/emlekezteto 15m szöveg)' },
          { command: 'makro', description: '1-kattintásos makró futtatása (/makro takaritas)' },
          { command: 'mesh', description: 'Swarm Mesh GPU/node feladatkiadás' },
          { command: 'dockerfix', description: 'Docker konténer Watchtower önjavítás' },
          { command: 'sebesseg', description: 'LAN őrszem & internet sebességmérés' },
          { command: 'arfolyam', description: 'Élő EUR/USD/HUF árfolyamok' },
          { command: 'mod', description: 'Üzemmód váltás (normal/focus/travel/emergency/chill)' },
          { command: 'lanmap', description: 'Hálózati nyitott portok vizsgálata' },
          { command: 'varlog', description: 'Rendszernapló anomália & OOM kiugrás' },
          { command: 'ha', description: 'Természetes magyar szabály vagy időzítő' },
          { command: 'omni', description: '200+ képességű Omni-katalógus keresése' },
          { command: 'persona', description: 'Aktív szakértő persona váltása' },
          { command: 'kontextus', description: 'Élethelyzet/kontextus profil váltása' },
          { command: 'redteam', description: 'Vakfolt és kockázatelemző kritika' },
          { command: 'szamol', description: 'Statisztika vagy mértékegység-átváltás' },
          { command: 'atalakit', description: 'Szöveg hangnem-átalakító (BLUF/hivatalos)' },
          { command: 'anonimizal', description: 'PII és API kulcs anonimizáló' },
          { command: 'teendok', description: 'Akciópontok kinyerése szövegből' },
          { command: 'v8riport', description: 'Omni vezetői Markdown riport' },
          { command: 'stop', description: 'Vészleállító (Kill-Switch)' },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // non-fatal
  }
}

/** M193: Flush queued offline Telegram messages when connectivity returns */
export async function flushTelegramOutbox(): Promise<number> {
  const s = getState();
  if (!s.settings.telegramEnabled || s.telegramOutbox.length === 0) return 0;
  const token = getTelegramTokenSecret();
  if (!token) return 0;

  let delivered = 0;
  const remaining = [...s.telegramOutbox];
  for (const item of [...s.telegramOutbox]) {
    const res = await sendTelegramMessage(item.text, {
      chatIdOverride: item.chatId,
      skipOutboxQueue: true,
    });
    if (res.sent) {
      delivered += 1;
      const idx = remaining.findIndex((x) => x.id === item.id);
      if (idx >= 0) remaining.splice(idx, 1);
    } else {
      const target = remaining.find((x) => x.id === item.id);
      if (target) {
        target.attempts += 1;
        target.lastError = res.reason;
      }
      break; // Network still unreachable
    }
  }
  if (delivered > 0 || remaining.length !== s.telegramOutbox.length) {
    updateState((draft) => {
      draft.telegramOutbox = remaining.slice(0, 50);
    });
  }
  return delivered;
}

export async function sendTelegramMessage(
  text: string,
  options?: {
    inlineButtons?: Array<Array<{ text: string; callback_data: string }>>;
    tokenOverride?: string;
    chatIdOverride?: string;
    silent?: boolean;
    skipOutboxQueue?: boolean;
  }
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const token = options?.tokenOverride || getTelegramTokenSecret();
  const chatId = options?.chatIdOverride || state.settings.telegramChatId?.trim();

  if (!token || !chatId || (!options?.tokenOverride && !state.settings.telegramEnabled)) {
    return { sent: false, reason: 'Telegram nincs konfigurálva (token vagy chat ID hiányzik)' };
  }

  const chunks = splitTelegramMessageSafe(text, 3900);
  const hour = new Date().getHours();
  const disableNotification =
    options?.silent ?? (Boolean(state.settings.telegramSilentNight) && (hour >= 23 || hour < 7));

  try {
    for (let i = 0; i < chunks.length; i++) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunks[i],
          disable_notification: disableNotification,
          reply_markup:
            i === chunks.length - 1 && options?.inlineButtons
              ? { inline_keyboard: options.inlineButtons }
              : undefined,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { sent: false, reason: `HTTP ${res.status}` };
      }
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (!options?.skipOutboxQueue) {
      updateState((s) => {
        s.telegramOutbox.push({
          id: `tgq-${crypto.randomUUID().slice(0, 8)}`,
          text: text.slice(0, 3900),
          chatId,
          attempts: 1,
          lastError: reason,
          createdAt: new Date().toISOString(),
        });
        s.telegramOutbox = s.telegramOutbox.slice(-50);
      });
    }
    return { sent: false, reason };
  }
}

export async function sendTelegramPhoto(
  imageBuffer: Buffer,
  caption = '',
  options?: { tokenOverride?: string; chatIdOverride?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const token = options?.tokenOverride || getTelegramTokenSecret();
  const chatId = options?.chatIdOverride || state.settings.telegramChatId?.trim();
  if (!token || !chatId) return { sent: false, reason: 'Telegram token vagy chat ID hiányzik.' };
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption.slice(0, 1000));
    form.append('photo', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'capture.png');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTelegramDocument(
  fileBuffer: Buffer,
  fileName: string,
  caption = '',
  options?: { tokenOverride?: string; chatIdOverride?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const token = options?.tokenOverride || getTelegramTokenSecret();
  const chatId = options?.chatIdOverride || state.settings.telegramChatId?.trim();
  if (!token || !chatId) return { sent: false, reason: 'Telegram token vagy chat ID hiányzik.' };
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption.slice(0, 1000));
    form.append('document', new Blob([new Uint8Array(fileBuffer)], { type: 'application/octet-stream' }), path.basename(fileName) || 'file.bin');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTelegramVoice(
  oggBuffer: Buffer,
  caption = '',
  options?: { tokenOverride?: string; chatIdOverride?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const token = options?.tokenOverride || getTelegramTokenSecret();
  const chatId = options?.chatIdOverride || state.settings.telegramChatId?.trim();
  if (!token || !chatId) return { sent: false, reason: 'Telegram token vagy chat ID hiányzik.' };
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption.slice(0, 1000));
    form.append('voice', new Blob([new Uint8Array(oggBuffer)], { type: 'audio/ogg' }), 'voice.ogg');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Processes an incoming Telegram command or message with 100% live-data parity
 * matching Web UI + supporting Per-Agent Dedicated Bot routing.
 */
export async function processTelegramInput(
  rawText: string,
  forcedAgentId?: string | null,
  replyQuote?: string
): Promise<string> {
  // Batch 7 Short Command Aliases (/s -> /statusz, /k -> /korkep, /m -> /makro, /e -> /emlekezteto)
  const aliased = rawText
    .trim()
    .replace(/^\/s\b/i, '/statusz')
    .replace(/^\/k\b/i, '/korkep')
    .replace(/^\/m(?=\s|$)/i, '/makro')
    .replace(/^\/e(?=\s|$)/i, '/emlekezteto');
  const text = aliased.trim();
  const state = getState();

  appendAuditLog({
    type: 'telegram',
    sourceAgentId: forcedAgentId || 'telegram-gateway',
    sourceAgentName: forcedAgentId
      ? state.agents.find((a) => a.id === forcedAgentId)?.name || 'Telegram Bot'
      : 'Telegram Gateway',
    message: `Bejövő Telegram üzenet: ${text.slice(0, 120)}`,
    verifiedExecution: true,
  });

  if (text === '/stop' || text === '/veszleallito') {
    activateKillSwitch('telegram');
    return 'VÉSZLEÁLLÍTÓ AKTIVÁLVA. Minden ágens-folyamat és MCP végrehajtás azonnal leállt.';
  }

  if (text === '/statusz' || text === '/status') {
    const hw = collectHardwareMetrics();
    const activeAgents = state.agents.filter((a) => a.active && !a.isSupervisor).length;
    return [
      `NovaSwarm Állapot:`,
      `- Aktív ágensek: ${activeAgents} (+1 Felügyelő: ${state.supervisor.status})`,
      `- Host jogosultság: ${state.settings.hostPermissionsGranted ? 'Engedélyezve' : 'Korlátozva'}`,
      `- Kill switch: ${state.settings.killSwitchActive ? 'AKTÍV' : 'Ki'}`,
      `- CPU: ${hw.cpuLoadPercent}% (${hw.cpuCores} mag) | RAM: ${hw.ramUsedMb}/${hw.ramTotalMb} MB (${hw.ramPercent}%)`,
      `- Hőmérséklet: ${hw.temperatureCelsius !== null ? `${hw.temperatureCelsius}°C` : 'N/A'} | Akku: ${hw.batteryPercent !== null ? `${hw.batteryPercent}%` : 'AC/N/A'}`,
      `- Napi költés: $${state.settings.dailySpendUsd.toFixed(4)} / $${state.settings.dailyCostLimitUsd.toFixed(2)}`,
      `- Heartbeat: ${state.settings.lastHeartbeatSummary || 'még nem futott'}`,
    ].join('\n');
  }

  if (text === '/kanban') {
    const visible = state.kanban.filter((c) => !c.archived);
    if (visible.length === 0) {
      return 'A Kanban tábla jelenleg üres.';
    }
    const lines = visible
      .slice(0, 15)
      .map((c) => `[${c.status.toUpperCase()} · ${c.priority || 'medium'}] ${c.title}`);
    return `Kanban kártyák (${visible.length} db):\n${lines.join('\n')}`;
  }

  if (text.startsWith('/otlet ')) {
    const title = text.replace(/^\/otlet\s+/i, '').trim();
    const now = new Date().toISOString();
    updateState((s) => {
      s.ideas.unshift({
        id: `idea-${crypto.randomUUID().slice(0, 6)}`,
        title,
        description: 'Telegramon rögzített ötlet',
        status: 'new',
        impact: 3,
        effort: 2,
        score: 1,
        comments: [],
        createdAt: now,
        updatedAt: now,
      });
    });
    return `Ötlet rögzítve az Ötletládába: "${title}" (Impact=3, Effort=2, Score=1)`;
  }

  if (text === '/memoria' || text === '/memory') {
    if (state.memories.length === 0) {
      return 'Még nincs rögzített tartós memória.';
    }
    const lines = state.memories
      .slice(0, 8)
      .map((m) => `• [${(m.tier || 'warm').toUpperCase()} | ${m.entity}] ${m.content.slice(0, 100)}`);
    return `Legutóbbi tartós memóriák (${state.memories.length} db összesen):\n${lines.join('\n')}`;
  }

  if (text === '/modell' || text === '/models') {
    const p = state.settings.primaryProvider;
    const s = state.settings.secondaryProvider;
    const quotaP = state.quotas[p];
    return [
      `Modell & Router Prioritás:`,
      `- Elsődleges: ${p} (kulcsok: ${state.settings.providerKeys[p].length})`,
      `- Másodlagos: ${s} (kulcsok: ${state.settings.providerKeys[s].length})`,
      `- Helyi Ollama: ${state.settings.ollamaModel} (${state.settings.ollamaUrl})`,
      `- AI Gateway kérések: ${state.gatewayAnalytics.totalProxyRequests} (Cache hit: ${state.gatewayAnalytics.cacheHits})`,
      `- Kvóta (${p}): ${quotaP.remainingRequests ?? 'N/A'} (${quotaP.isEstimated ? 'becsült érték' : 'valós fejléc'})`,
    ].join('\n');
  }

  if (text === '/naplo' || text === '/logs') {
    const recent = state.auditLogs.slice(-8).map((l) => `[${l.type}] ${l.sourceAgentName}: ${l.message}`);
    return recent.length > 0 ? recent.join('\n') : 'Az audit napló még üres.';
  }

  if (text.startsWith('/approve ') || text.startsWith('/elutasit ')) {
    const [cmd, idPrefix] = text.split(/\s+/);
    const match = state.approvals.find((a) => a.status === 'pending' && a.id.startsWith(idPrefix || ''));
    if (!match) return `Nem található függőben lévő jóváhagyás ezzel az azonosítóval: ${idPrefix}`;
    const decision = cmd === '/approve' ? 'approved' : 'rejected';
    resolveApproval(match.id, decision, 'telegram');
    return `Jóváhagyás (${match.title}) státusza frissítve: ${decision}.`;
  }

  if (text.startsWith('/pairing ')) {
    const [, action, code] = text.split(/\s+/);
    const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
    if (!decision || !code) return 'Használat: /pairing approve <KÓD> vagy /pairing reject <KÓD>';
    const resolved = resolvePairingRequest(code, decision);
    return resolved
      ? `Csatorna párosítás (${resolved.channel}/${resolved.code}) frissítve: ${decision}.`
      : `Nem található függőben lévő párosítási kód: ${code}`;
  }

  if (text === '/update') {
    const ota = await checkOtaUpdates();
    return `OTA Verzió: helyi=${ota.currentVersion}, távoli=${ota.latestVersion ?? 'ismeretlen'}, frissítés elérhető=${ota.updateAvailable ? 'IGEN' : 'NEM'}`;
  }

  /** Ú51: Bidirectional Shared List command (/lista & /lista <tétel>) */
  if (text === '/lista' || text.startsWith('/lista ')) {
    const item = text.replace(/^\/lista\s*/i, '').trim();
    if (!item) {
      const list = getOrCreateDefaultSharedList();
      if (list.items.length === 0) return `A közös lista (${list.name}) jelenleg üres. Írd be: /lista tej`;
      return `${list.name}:\n${list.items.slice(0, 20).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n')}`;
    }
    const list = addSharedListItem('Bevásárlólista', item, 'Telegram');
    return `Hozzáadva a közös listához (${list.name}): "${item}" (${list.items.length} tétel)`;
  }

  /** Ú59: Live Weather via /idojaras */
  if (text === '/idojaras' || text.startsWith('/idojaras ')) {
    const loc = text.replace(/^\/idojaras\s*/i, '').trim() || undefined;
    const w = await fetchOpenMeteoWeather(loc);
    return w.ok
      ? `Időjárás (${w.location}): ${w.temperatureC}°C · ${w.condition} · Szél: ${w.windKmh} km/h (Min/Max: ${w.dailyMinC}°C / ${w.dailyMaxC}°C)`
      : `Időjárás lekérdezés hiba: ${w.error}`;
  }

  /** B1: Autonomous Mission via /mission <goal> */
  if (text.startsWith('/mission ')) {
    const goal = text.replace(/^\/mission\s+/i, '').trim();
    const mission = await runAutonomousMission(goal, forcedAgentId);
    return `Autonóm küldetés (${mission.status}): ${mission.goal}\n${mission.steps.map((s) => `- [${s.status}] ${s.title}`).join('\n')}`;
  }

  /** Batch 3 Telegram Commands */
  if (text === '/nightshift' || text === '/ejszaka') {
    const run = await runNightShiftCycle();
    return `${run.reportSummary}\n${run.actionsTaken.join('\n')}`;
  }

  if (text.startsWith('/wol')) {
    const arg = text.replace(/^\/wol\s*/i, '').trim();
    const dev = arg
      ? state.wolDevices.find((d) => d.name.toLowerCase() === arg.toLowerCase() || d.mac.toLowerCase() === arg.toLowerCase())
      : state.wolDevices[0];
    const mac = dev?.mac || arg;
    if (!mac) return 'Használat: /wol <MAC-cím vagy eszköz név>';
    const res = await sendWakeOnLanPacket(mac, dev?.broadcastIp || '255.255.255.255');
    return res.message;
  }

  if (text === '/crm') {
    if (state.crmContacts.length === 0) return 'A CRM névjegyzék még üres.';
    return `Személyes CRM (${state.crmContacts.length} db):\n${state.crmContacts
      .slice(0, 12)
      .map((c) => `• ${c.name} (${c.relation})${c.email ? ` — ${c.email}` : ''}`)
      .join('\n')}`;
  }

  if (text === '/kapszula' || text === '/capsule') {
    const cap = generateWeeklyTimeCapsule();
    return cap.summaryMarkdown;
  }

  if (text === '/lan') {
    const arp = scanLanArpTable();
    if (arp.devices.length === 0) return `LAN ARP vizsgálat (${arp.source}): nincs rögzített szomszédos eszköz.`;
    return `LAN Eszközök (${arp.source}):\n${arp.devices
      .slice(0, 15)
      .map((d) => `• ${d.ip} [${d.mac}] (${d.iface}, ${d.state})`)
      .join('\n')}`;
  }

  if (text === '/audit') {
    const chain = verifyAuditLogChain();
    return `Audit Hash Lánc: ${chain.valid ? 'ÉP (Érvényes)' : 'SÉRÜLT'}\nEllenőrzött bejegyzések: ${chain.checkedEntries}${chain.brokenIds.length > 0 ? `\nEltérés ID: ${chain.brokenIds.join(', ')}` : ''}`;
  }

  if (text === '/cluster') {
    const nodes = await pingClusterNodes();
    if (nodes.length === 0) return 'Nincs konfigurált fürt csomópont.';
    return `Fürt állapot:\n${nodes.map((n) => `• ${n.name} (${n.role}): ${n.status} ${n.latencyMs ?? '-'}ms`).join('\n')}`;
  }

  if (text === '/openapi') {
    return 'OpenAPI 3.1 séma elérhető helyi hálózaton: GET /api/openapi.json';
  }

  /** Batch 4 Telegram Commands (M191, M194, Ú161, Ú194, Ú209, Ú210, Ú212, Ú226, Ú237, Ú251, Ú252, Ú253, Ú260) */
  if (text === '/help' || text === '/parancsok' || text === '/start') {
    return [
      'NovaSwarm Parancsok:',
      '/statusz · /autopilot · /top · /df · /hwopt',
      '/mission <cél> · /nightshift · /kapszula · /brief',
      '/kanban · /otlet <cél> · /lista [tétel]',
      '/search <kifejezés> · /vita <téma> · /inbox · /heal',
      '/screenshot <url> · /cam · /gpio read|set <pin> [0|1]',
      '/print <szöveg> · /getfile <útvonal> · /hang <szöveg>',
      '/bash <magyar kérés> · /hiba · /frissites',
      '/lan · /behatolo · /lanmap · /varlog · /wol <MAC>',
      '/arfolyam · /mod <mód> · /ha <magyar szabály/idő>',
      '/omni [szűrő] · /persona [név] · /kontextus [név]',
      '/redteam <ötlet> · /szamol <számok|érték unit->unit>',
      '/atalakit <szöveg> · /anonimizal <szöveg> · /teendok <jegyzet> · /v8riport',
      '/okmany · /arfigyelo · /recept · /xp · /stop',
    ].join('\n');
  }

  if (text === '/top' || text === '/df') {
    const deep = collectPiHardwareDeepStatus();
    const disks = deep.blockDevices.slice(0, 6).map((b) => `• ${b.name}: ${b.size}${b.mountpoint ? ` (${b.mountpoint})` : ''}`).join('\n');
    const temps = deep.thermalZones.slice(0, 4).map((t) => `${t.name}=${t.tempC}°C`).join(', ');
    return [
      `Rendszer Telemetria (${deep.hostname} · ${deep.arch}):`,
      `• Load 1m: ${deep.loadAvg1m} (küszöb: ${deep.cpuThreshold})${deep.loadThrottleActive ? ' [THROTTLED]' : ''}`,
      `• Szabad RAM: ${deep.memAvailableMb} MB | ZRAM: ${deep.zramPresent ? 'AKTÍV' : 'Nincs'} | Swap szabad: ${deep.swapFreeMb}/${deep.swapTotalMb} MB`,
      `• Hőfokok: ${temps || 'N/A'} | Uptime: ${deep.uptimeHours} óra`,
      `• GPIO chipek: ${deep.gpioChips.length} | I2C buszok: ${deep.i2cBuses.length}`,
      disks ? `Lemezek:\n${disks}` : '',
    ].filter(Boolean).join('\n');
  }

  if (text.startsWith('/search ')) {
    const q = text.replace(/^\/search\s+/i, '').trim();
    const res = runGlobalOmnisearch(q, 10);
    if (res.hits.length === 0) return `Omnisearch (${q}): nincs találat.`;
    return `Omnisearch "${q}" (${res.totalHits} találat):\n${res.hits.map((h) => `• [${h.source}] ${h.title}: ${h.snippet}`).join('\n')}`;
  }

  if (text === '/hiba' || text === '/postmortem') {
    const pm = generatePostMortemReport();
    return `${pm.title}\nOk: ${pm.rootCause}\nÉrintett naplók: ${pm.affectedEntries}\nJavaslat:\n${pm.remediationSteps.map((s) => `- ${s}`).join('\n')}`;
  }

  if (text.startsWith('/vita ')) {
    const topic = text.replace(/^\/vita\s+/i, '').trim();
    const run = await runMultiAgentDebate(topic);
    return `Vita (${run.topic}) — Győztes: ${run.winnerSide.toUpperCase()}\n\n${run.judgeVerdict}`;
  }

  if (text === '/xp') {
    const xp = state.userXp;
    return `RPG Profil:\n• Szint: ${xp.level} | XP: ${xp.xp}\n• Széria: ${xp.streakDays} nap\n• Jelvények: ${xp.badges.join(', ')}`;
  }

  if (text === '/okmany') {
    const exp = checkExpiringDocuments(45);
    if (exp.length === 0) return 'Nincs 45 napon belül lejáró garancia vagy okmány a széfben.';
    return `Közelgő lejáratok:\n${exp.map((d) => `• ${d.title} (${d.category}): ${d.daysLeft} nap (${d.expiresAt})`).join('\n')}`;
  }

  if (text === '/arfigyelo') {
    if (state.priceWatches.length === 0) return 'Nincs aktív webshop árfigyelő.';
    for (const pw of state.priceWatches.slice(0, 5)) {
      await checkPriceWatchItem(pw.id);
    }
    const fresh = getState().priceWatches;
    return `Árfigyelők (${fresh.length} db):\n${fresh.slice(0, 8).map((p) => `• ${p.name}: ${p.lastPrice ?? '?'} ${p.currency} (cél: ${p.targetPrice} ${p.currency})`).join('\n')}`;
  }

  if (text === '/recept') {
    const recs = suggestRecipesFromPantry().slice(0, 4);
    return `Receptek a kamra készletből:\n${recs.map((r) => `• ${r.name} (${r.matchPercent}% egyezés · ${r.calories} kcal · ${r.minutes} perc)${r.missingIngredients.length ? ` — Hiányzik: ${r.missingIngredients.join(', ')}` : ''}`).join('\n')}`;
  }

  if (text === '/behatolo') {
    const res = detectLanIntruders(false);
    return res.unknownDevices.length === 0
      ? `LAN Behatolás-szűrő OK: ${res.totalSeen} eszköz látott, 0 ismeretlen MAC.`
      : `FIGYELEM! ${res.unknownDevices.length} ismeretlen MAC a LAN-on:\n${res.unknownDevices.map((d) => `• ${d.ip} [${d.mac}] (${d.iface})`).join('\n')}`;
  }

  if (text === '/frissites') {
    const up = checkSystemPackageUpdates();
    return `Csomagfrissítések:\n• APT frissíthető csomagok: ${up.aptAvailable ? up.aptUpgradableCount : 'N/A'}\n${up.aptPackages.slice(0, 8).join('\n') || ''}\n• NPM: ${up.npmOutdatedSummary.slice(0, 300)}`;
  }

  if (text === '/autopilot') {
    const ap = getAutopilotSummary();
    return [
      `Autopilot 24/7 Főagy:`,
      `• Teljes Autonómia: ${ap.fullAutonomousMode ? 'AKTÍV' : 'Ki'} | Nulla Alap Biztonság: ${ap.zeroDefaultSecurity ? 'IGEN' : 'Egyéni'}`,
      `• Aktív ágensek: ${ap.activeAgents} | Nyitott Kanban: ${ap.openKanban} | Memóriák: ${ap.memoriesCount}`,
      `• Éjszakai Műszak kész feladatok: ${ap.completedNightTasks} | XP Szint: ${ap.xpLevel}`,
      `Következő tervek:\n${ap.nextAutonomousPlans.map((p) => `- ${p}`).join('\n')}`,
    ].join('\n');
  }

  if (text.startsWith('/bash ')) {
    const intent = text.replace(/^\/bash\s+/i, '').trim();
    const res = await runBashCopilot(intent, true);
    return `Bash Copilot:\n$ ${res.command}\n(${res.explanation})\n\n${res.output || '(üres kimenet)'}`;
  }

  /** Batch 5 Commands: Hardware Adaptive, Second Self, Browser, Physical & File Transfer */
  if (text === '/hwopt') {
    const out = applyHardwareAdaptiveOptimization(true);
    const wd = await runRamOomWatchdogTick();
    return `${out.profile.tierLabel}\n${out.profile.appliedNotes.join('\n')}\nRAM Őrszem: ${wd.ramPercent}% (küszöb ${wd.thresholdPercent}%)`;
  }

  if (text === '/brief') {
    const hour = new Date().getHours();
    const b = await buildProactiveBrief(hour >= 17 ? 'evening' : 'morning');
    return b.text;
  }

  if (text === '/inbox') {
    const t = runEmailInboxTriage();
    return `Email Triage (${t.scannedEmails} levél): +${t.packagesAdded} csomag · +${t.expensesAdded} kiadás · Sürgős: ${t.urgentAlerts.length}${t.urgentAlerts.length ? `\n${t.urgentAlerts.join('\n')}` : ''}`;
  }

  if (text === '/heal') {
    const h = await runSelfHealingDaemonTick();
    const wd = await runRamOomWatchdogTick();
    return `Öngyógyító Démon:\n• Javítások: ${h.healedActions.join(' | ') || 'nincs'}\n• Hibás systemd unit: ${h.failedServices.join(', ') || '0'}\n• RAM Őrszem: ${wd.ramPercent}% (${wd.triggered ? 'BEAVATKOZOTT' : 'rendben'})`;
  }

  if (text.startsWith('/screenshot ')) {
    const url = text.replace(/^\/screenshot\s+/i, '').trim();
    const cap = await captureWebScreenshotOrDom(url);
    if (!cap.ok) return `Screenshot hiba: ${cap.error}`;
    if (cap.screenshotBase64) {
      await sendTelegramPhoto(Buffer.from(cap.screenshotBase64, 'base64'), `Web Képernyőkép: ${cap.url}`);
      return `Képernyőkép elküldve: ${cap.url}`;
    }
    return `Oldal előnézet (${cap.title || cap.url}):\n${(cap.textPreview || '').slice(0, 1200)}`;
  }

  if (text === '/cam') {
    const snap = captureCameraSnapshot();
    if (snap.ok && snap.imageBase64) {
      await sendTelegramPhoto(Buffer.from(snap.imageBase64, 'base64'), `Kamera (${snap.toolUsed})`);
      return `Kamera pillanatkép elküldve (${snap.toolUsed}).`;
    }
    return `Kamera nem elérhető: ${snap.error}`;
  }

  if (text.startsWith('/gpio ')) {
    const parts = text.trim().split(/\s+/);
    const op = parts[1];
    const pin = Number(parts[2]);
    if (!Number.isInteger(pin) || pin < 0 || pin > 53) {
      return 'Érvénytelen GPIO lábszám (engedélyezett tartomány: 0..53).';
    }
    if (op === 'read') {
      const r = readOrWriteGpioPin('read', pin);
      return r.message;
    }
    if (op === 'set' && (parts[3] === '0' || parts[3] === '1')) {
      const val = parts[3] === '1' ? 1 : 0;
      const r = readOrWriteGpioPin('set', pin, val);
      return r.message;
    }
    return 'Használat: /gpio read <pin> vagy /gpio set <pin> <0|1>';
  }

  if (text.startsWith('/print ')) {
    const content = text.replace(/^\/print\s+/i, '').trim();
    if (!content) return 'Nyomtatandó szöveg megadása kötelező.';
    const pr = printDocumentViaCups({ textContent: content.slice(0, 8000) });
    return pr.message;
  }

  if (text.startsWith('/hang ')) {
    const phrase = text.replace(/^\/hang\s+/i, '').trim();
    const sp = speakHostSpeakerAnnouncement(phrase);
    return sp.detail;
  }

  if (text.startsWith('/getfile ')) {
    assertHostPermission('telegram:getfile');
    const rel = text.replace(/^\/getfile\s+/i, '').trim();
    const cwd = fs.realpathSync(process.cwd());
    const candidate = path.resolve(cwd, rel);
    if (!fs.existsSync(candidate)) {
      return `Fájl nem található: ${rel}`;
    }
    const resolved = fs.realpathSync(candidate);
    const prefix = cwd.endsWith(path.sep) ? cwd : `${cwd}${path.sep}`;
    const base = path.basename(resolved);
    const blockedSecret =
      base === '.env' ||
      base.startsWith('.env.') ||
      base.startsWith('.secrets') ||
      base.startsWith('.state.json') ||
      base.startsWith('novaswarm.sqlite') ||
      base.endsWith('.pem') ||
      base.endsWith('.key') ||
      base === 'id_rsa' ||
      base === 'id_ed25519' ||
      resolved.startsWith(path.join(cwd, 'backups') + path.sep);
    if (!resolved.startsWith(prefix) || blockedSecret || fs.statSync(resolved).isDirectory()) {
      return `Hozzáférés megtagadva (védett titokfájl, szimlink vagy munkakönyvtáron kívüli útvonal): ${rel}`;
    }
    const buf = fs.readFileSync(resolved);
    if (buf.length > 15 * 1024 * 1024) return 'A fájl meghaladja a 15 MB Telegram küldési korlátot.';
    const sent = await sendTelegramDocument(buf, path.basename(resolved), `Fájl: ${rel}`);
    return sent.sent ? `Fájl elküldve Telegramon: ${rel}` : `Küldés sikertelen: ${sent.reason}`;
  }

  if (text.startsWith('/emlekezteto ') || text.startsWith('/remind ')) {
    const rest = text.replace(/^\/(emlekezteto|remind)\s+/i, '').trim();
    const firstSpace = rest.search(/\s+/);
    if (firstSpace < 1) {
      return 'Használat: /emlekezteto 15m Üzenet szövege (vagy /emlekezteto 08:30 Standup)';
    }
    const timeExpr = rest.slice(0, firstSpace).trim();
    const message = rest.slice(firstSpace).trim();
    try {
      const rem = createSmartReminder({ timeExpr, message, channel: 'both' });
      return `⏰ Emlékeztető rögzítve (${new Date(rem.triggerAt).toLocaleString('hu-HU')}): "${rem.message}"`;
    } catch (err) {
      return `Emlékeztető hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text === '/makro' || text.startsWith('/makro ')) {
    const slug = text.replace(/^\/makro\s*/i, '').trim();
    if (!slug) {
      const list = (state.quickMacros || []).map((m) => `• /makro ${m.slug} — ${m.name}`).join('\n');
      return `Elérhető 1-kattintásos makrók:\n${list || '(nincs)'}`;
    }
    try {
      const out = await executeQuickMacro(slug);
      return `⚡ Makró kész (${out.macro.name}):\n${out.summary}`;
    } catch (err) {
      return `Makró hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text === '/korkep') {
    const rep = runForensicSystemSnapshot();
    return `🩺 Rendszer Kórkép:\n${rep.diagnosisSummary}\n• Top RAM: ${rep.topMemoryProcesses.slice(0, 3).join(' | ') || 'n/a'}\n• Javaslat: ${rep.recommendations.join(' | ')}`;
  }

  if (text === '/dockerfix') {
    const d = await runDockerWatchtowerHeal({ autoRestartExited: true });
    return `🐳 ${d.summary}`;
  }

  if (text === '/sebesseg') {
    const n = await runLanSentinelAndSpeedtest({ runSpeedtest: true, notifyUnknown: false });
    return `🌐 LAN & Sebességmérés:\n• Ping: ${n.record.pingMs ?? 'n/a'} ms | Letöltés: ${n.record.downloadMbps ?? 'n/a'} Mbps\n• LAN eszközök: ${n.record.lanDeviceCount} db (ismeretlen MAC: ${n.record.unknownMacCount})`;
  }

  if (text.startsWith('/trustmac ')) {
    const mac = text.replace(/^\/trustmac\s+/i, '').trim();
    try {
      const out = trustLanMacAddress(mac);
      return `✅ ${out.message}`;
    } catch (err) {
      return `MAC hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text.startsWith('/mesh ')) {
    const prompt = text.replace(/^\/mesh\s+/i, '').trim();
    const rec = await dispatchSwarmMeshTask({ prompt });
    return `🕸️ Mesh válasz (${rec.nodeName} · ${rec.latencyMs}ms · ${rec.status}):\n${rec.responsePreview}`;
  }

  if (text === '/szabaly') {
    const ev = await evaluateAutonomyRules();
    const activeCount = (state.autonomyRules || []).filter((r) => r.enabled).length;
    return `⚙️ Szabálymotor (${activeCount} aktív szabály): ${ev.triggered.length} aktiválódott most.${ev.triggered.length ? `\n${ev.triggered.map((t) => `• ${t.ruleName}: ${t.actionResult}`).join('\n')}` : ''}`;
  }

  /** Batch 7 Telegram Commands: /arfolyam, /mod, /lanmap, /varlog, /ha & Quick Callbacks */
  if (text === '/arfolyam') {
    const r = await fetchExchangeRates();
    return `💱 Élő Árfolyam (${r.snapshot.date} · ${r.snapshot.source}):\n• 1 EUR = ${r.eurToHuf} HUF\n• 1 USD = ${r.usdToHuf} HUF\n• EUR/GBP: ${r.snapshot.rates.GBP ?? '-'} · EUR/CHF: ${r.snapshot.rates.CHF ?? '-'}${r.alertTriggered ? '\n⚠️ Elérte a HUF riasztási küszöböt!' : ''}`;
  }

  if (text === '/mod' || text.startsWith('/mod ')) {
    const arg = text.replace(/^\/mod\s*/i, '').trim().toLowerCase() as OperatingModeId;
    if (!arg) {
      const cur = state.settings.operatingMode || 'normal';
      return `Aktív üzemmód: ${cur} (${OPERATING_MODE_META[cur]?.label})\nElérhető: normal, focus, travel, emergency, chill\nHasználat: /mod focus`;
    }
    if (!OPERATING_MODE_META[arg]) {
      return 'Ismeretlen üzemmód. Használd: /mod normal | focus | travel | emergency | chill';
    }
    const res = setOperatingMode(arg);
    return `🎛️ Üzemmód váltva: ${res.meta.label}\n${res.meta.description} (Heartbeat: ${res.meta.heartbeatMinutes} perc)`;
  }

  if (text === '/lanmap' || text.startsWith('/lanmap ')) {
    const host = text.replace(/^\/lanmap\s*/i, '').trim() || '127.0.0.1';
    try {
      const scan = await scanLanOpenPorts(host);
      if (scan.openPorts.length === 0) return `🔍 Portvizsgálat (${scan.host}): nincs nyitott vizsgált szolgáltatás.`;
      return `🔍 Nyitott portok (${scan.host}):\n${scan.openPorts.map((p) => `• ${p.port} (${p.service}) — ${p.latencyMs}ms`).join('\n')}`;
    } catch (err) {
      return `Portvizsgálat hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text === '/varlog') {
    const diag = detectJournalAnomalies(120);
    return `📜 Rendszernapló elemzés (${diag.source}, ${diag.linesInspected} sor):\n• OOM: ${diag.counts.oom} | Error: ${diag.counts.error} | Failed: ${diag.counts.failed} | Thermal/Kernel: ${diag.counts.kernelOrThermal}${diag.samples.length ? `\nMinták:\n${diag.samples.slice(0, 4).join('\n')}` : '\nTiszta napló.'}`;
  }

  if (text.startsWith('/ha ')) {
    const expr = text.replace(/^\/ha\s+/i, '').trim();
    try {
      const out = parseHungarianNaturalAutomation(expr);
      return `🤖 ${out.summary}`;
    } catch (err) {
      return `Természetes automatizálás hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** Batch 8 Omni-Agent & Singularity Engine Telegram Commands (Ú551–Ú560) */
  if (text === '/omni' || text.startsWith('/omni ')) {
    const q = text.replace(/^\/omni\s*/i, '').trim();
    const res = searchOmniCapabilities(q);
    return [
      `🧠 Omni-Ágens Képesség Katalógus (${res.totalCount} összesen, találat: ${res.items.length}):`,
      ...res.items.slice(0, 10).map((c) => `• [${c.code}] ${c.title} (${c.category})`),
    ].join('\n');
  }

  if (text === '/persona' || text.startsWith('/persona ')) {
    const arg = text.replace(/^\/persona\s*/i, '').trim();
    const personas = state.agentPersonas || [];
    if (!arg) {
      const cur = personas.find((p) => p.id === state.settings.activePersonaId);
      return `Aktív Persona: ${cur ? `${cur.name} (${cur.roleTitle})` : 'Alapértelmezett'}\nElérhető: ${personas.map((p) => p.name).join(', ')}`;
    }
    try {
      const p = setActivePersona(arg);
      return `🎭 Aktív persona váltva: ${p.name} (${p.roleTitle}) — ${p.tone}`;
    } catch (err) {
      return `Persona hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text === '/kontextus' || text.startsWith('/kontextus ')) {
    const arg = text.replace(/^\/kontextus\s*/i, '').trim();
    const contexts = state.userContextProfiles || [];
    if (!arg) {
      const cur = contexts.find((c) => c.id === state.settings.activeUserContextId);
      return `Aktív Kontextus: ${cur ? `${cur.name} (${cur.focusArea})` : 'Általános'}\nElérhető: ${contexts.map((c) => c.name).join(', ')}`;
    }
    try {
      const c = setActiveUserContext(arg);
      return `🧭 Kontextus profil váltva: ${c.name} — ${c.rules}`;
    } catch (err) {
      return `Kontextus hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text === '/matrix' || text.startsWith('/matrix ')) {
    const topic = text.replace(/^\/matrix\s*/i, '').trim() || 'Architektúra / Megoldás választás';
    return `📊 Döntési Mátrix indításához nyisd meg a Web UI-ban a Rendszer -> Omni-Ágens Stúdió (B8) -> Kognitív Tervező fület, vagy add meg a szempontokat chatben a(z) "${topic}" témához.`;
  }

  if (text.startsWith('/redteam ')) {
    const proposal = text.replace(/^\/redteam\s+/i, '').trim();
    try {
      const rt = runRedTeamCritique(proposal);
      return `🛡️ Red-Team Vakfolt Kritika (Kockázat: ${rt.riskScore}/100):\n• Vakfoltok:\n${rt.blindSpots.map((b) => `  - ${b}`).join('\n')}\n• Javaslatok:\n${rt.recommendations.map((r) => `  - ${r}`).join('\n')}`;
    } catch (err) {
      return `Red-Team hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text.startsWith('/szamol ')) {
    const expr = text.replace(/^\/szamol\s+/i, '').trim();
    const convMatch = expr.match(/^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z/]+)\s*(?:->|to|ba|be)\s*([a-zA-Z/]+)$/i);
    try {
      if (convMatch) {
        const val = Number(convMatch[1].replace(',', '.'));
        const out = convertUnitsAndTimezones(val, convMatch[2], convMatch[3]);
        return `🧮 Átváltás: ${out.formatted}\nVilágóra: ${out.worldClocks.slice(0, 3).map((w) => `${w.city} ${w.time}`).join(' · ')}`;
      }
      const st = analyzeNumericSeries(expr);
      return `📈 Statisztika (n=${st.count}): Átlag=${st.mean} · Medián=${st.median} · Szórás=${st.stdDev} · Min/Max=${st.min}/${st.max} · P95=${st.p95} · Anomáliák=${st.anomalies.length}`;
    } catch (err) {
      return `Számítási hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text.startsWith('/atalakit ')) {
    const body = text.replace(/^\/atalakit\s+/i, '').trim();
    try {
      const res = transformTextTone(body, 'bullet_executive');
      return `✍️ Vezetői (BLUF) átalakítás:\n${res.transformed}`;
    } catch (err) {
      return `Átalakítási hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text.startsWith('/anonimizal ')) {
    const body = text.replace(/^\/anonimizal\s+/i, '').trim();
    const res = sanitizeSensitiveText(body);
    return `🔒 Anonimizálva (${res.redactionsCount} maszkolás · ${res.categoriesFound.join(', ') || 'tiszta'}):\n${res.sanitized}`;
  }

  if (text.startsWith('/teendok ')) {
    const notes = text.replace(/^\/teendok\s+/i, '').trim();
    try {
      const mtg = processMeetingNotes('Telegram Jegyzet', notes);
      return `📝 ${mtg.summary}\n${mtg.actionItems.map((a) => `• ${a.text}${a.owner ? ` (@${a.owner})` : ''}`).join('\n')}`;
    } catch (err) {
      return `Teendő kinyerés hiba: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (text === '/v8riport') {
    const rep = exportOmniExecutiveReportMarkdown();
    return rep.markdown;
  }

  if (text === '/tts_last') {
    const lastReply = [...state.messages].reverse().find((m) => m.senderType === 'agent');
    if (!lastReply) return 'Nincs felolvasható korábbi válasz.';
    const sp = speakHostSpeakerAnnouncement(lastReply.content.slice(0, 320));
    return `🔊 Hangszóró: ${sp.detail}`;
  }

  if (text === '/pin_last') {
    const lastReply = [...state.messages].reverse().find((m) => m.senderType === 'agent');
    if (!lastReply) return 'Nincs rögzíthető korábbi válasz.';
    addPersistentMemory({
      content: lastReply.content.slice(0, 600),
      entity: 'Telegram Gyorsrögzítés',
      tags: ['telegram', 'pinned'],
      links: ['Telegram'],
      importanceScore: 0.9,
      tier: 'hot',
    });
    return '📌 Az utolsó válasz elmentve a tartós memóriába.';
  }

  if (text.startsWith('/keres ') || text.startsWith('/ask ')) {
    const query = text.replace(/^\/(keres|ask)\s+/i, '').trim();
    const memMatches = searchMemories(query, 4, { reinforce: true });
    const turn = await handleUserTurn({
      threadId: state.threads[0]?.id || 'thread-main',
      content: `${query}${memMatches.length ? `\n(Memória találatok: ${memMatches.map((m) => m.content).join(' | ')})` : ''}`,
      channel: 'telegram',
      targetAgentId: forcedAgentId,
    });
    return `[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}`;
  }

  const addressedAgent = forcedAgentId
    ? state.agents.find((a) => a.id === forcedAgentId) ?? null
    : resolveTargetAgent(text);
  const fullContent = replyQuote
    ? `[Válasz erre az előzményre: "${replyQuote.slice(0, 260)}"]\n${text}`
    : text;
  const turn = await handleUserTurn({
    threadId: state.threads[0]?.id || 'thread-main',
    content: fullContent,
    channel: 'telegram',
    targetAgentId: addressedAgent?.id ?? null,
  });

  return `[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}`;
}

async function downloadTelegramFileBase64(
  token: string,
  fileId: string,
  fallbackMime: string
): Promise<{ dataBase64: string; mimeType: string } | null> {
  try {
    const infoRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!infoRes.ok) return null;
    const infoJson = (await infoRes.json()) as { ok?: boolean; result?: { file_path?: string } };
    const filePath = infoJson.result?.file_path;
    if (!filePath) return null;

    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const mimeType =
      filePath.endsWith('.png')
        ? 'image/png'
        : filePath.endsWith('.webp')
        ? 'image/webp'
        : filePath.endsWith('.ogg') || filePath.endsWith('.oga')
        ? 'audio/ogg'
        : filePath.endsWith('.mp3')
        ? 'audio/mpeg'
        : fallbackMime;
    return { dataBase64: buf.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

export function buildTelegramStatusInlineKeyboard() {
  return [
    [
      { text: 'Állapot frissítése', callback_data: '/statusz' },
      { text: 'Kanban tábla', callback_data: '/kanban' },
    ],
    [
      { text: 'Éjszakai Műszak', callback_data: '/nightshift' },
      { text: 'Időkapszula', callback_data: '/kapszula' },
    ],
    [
      { text: 'Memória', callback_data: '/memoria' },
      { text: 'Vészleállító', callback_data: '/stop' },
    ],
  ];
}

export function buildApprovalInlineKeyboard(approvalId: string) {
  const shortId = approvalId.slice(0, 8);
  return [
    [
      { text: 'Jóváhagyás', callback_data: `/approve ${shortId}` },
      { text: 'Elutasítás', callback_data: `/elutasit ${shortId}` },
    ],
  ];
}

/** M49: Push destructive approval requests directly to Telegram with 1-tap inline buttons */
export async function notifyApprovalToTelegram(req: ApprovalRequest): Promise<{ sent: boolean; reason?: string }> {
  return sendTelegramMessage(
    `Jóváhagyás szükséges:\n• Művelet: ${req.title}\n• Célpont: ${req.commandOrTarget}\n• Kérte: ${req.requestedBy}\n• ID: ${req.id.slice(0, 8)}`,
    { inlineButtons: buildApprovalInlineKeyboard(req.id) }
  );
}

async function answerTelegramCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 180) }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // ignore transient error
  }
}

async function pollSingleBot(botKey: string, token: string, forcedAgentId?: string): Promise<void> {
  const offset = botOffsets.get(botKey) ?? 0;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offset + 1}&timeout=8`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      ok: boolean;
      result?: Array<{
        update_id: number;
        message?: {
          message_id?: number;
          chat: { id: number };
          text?: string;
          caption?: string;
          reply_to_message?: { text?: string; caption?: string };
          photo?: Array<{ file_id: string; width?: number; height?: number }>;
          voice?: { file_id: string; mime_type?: string };
          audio?: { file_id: string; mime_type?: string };
          document?: { file_id: string; file_name?: string; mime_type?: string };
        };
        callback_query?: { id: string; message?: { chat: { id: number } }; data?: string };
      }>;
    };
    for (const upd of data.result || []) {
      botOffsets.set(botKey, Math.max(botOffsets.get(botKey) ?? 0, upd.update_id));
      const chatId = upd.message?.chat?.id ?? upd.callback_query?.message?.chat?.id;
      const chatStr = chatId ? String(chatId) : undefined;
      if (!isTelegramChatAllowed(chatStr)) {
        continue;
      }

      // 1. Telegram Photo (Multimodal Vision + Receipt/Warranty/Error Auto-Classifier)
      if (upd.message?.photo && upd.message.photo.length > 0) {
        const largest = upd.message.photo[upd.message.photo.length - 1];
        const file = await downloadTelegramFileBase64(token, largest.file_id, 'image/jpeg');
        if (file) {
          const state = getState();
          const caption = upd.message.caption?.trim() || 'Elemezd a mellékelt képet (blokk, garancia, hibaképernyő vagy általános).';
          const addressed = forcedAgentId
            ? state.agents.find((a) => a.id === forcedAgentId) ?? null
            : resolveTargetAgent(caption);
          const turn = await handleUserTurn({
            threadId: state.threads[0]?.id || 'thread-main',
            content: caption,
            channel: 'telegram',
            targetAgentId: addressed?.id ?? null,
            attachments: [{ kind: 'image', mimeType: file.mimeType, dataBase64: file.dataBase64 }],
          });
          const routed = routeTelegramPhotoIntent({
            caption,
            aiReplyText: turn.coordinatorReply.content,
          });
          const suffix = routed.autoSavedNote ? `\n\n[${routed.autoSavedNote}]` : '';
          await sendTelegramMessage(`[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}${suffix}`, {
            tokenOverride: token,
            chatIdOverride: chatStr,
          });
          continue;
        }
      }

      // 1b. Telegram Document Attachment -> Save to LAN Drop
      if (upd.message?.document?.file_id) {
        const doc = upd.message.document;
        const file = await downloadTelegramFileBase64(token, doc.file_id, doc.mime_type || 'application/octet-stream');
        if (file) {
          const saved = saveLanDropFile(doc.file_name || 'telegram-file.bin', file.dataBase64);
          await sendTelegramMessage(
            `Fájl mentve a LAN Drop tárba: ${saved.fileName} (${Math.round(saved.sizeBytes / 1024)} KB)${upd.message.caption ? `\nMegjegyzés: ${upd.message.caption}` : ''}`,
            { tokenOverride: token, chatIdOverride: chatStr }
          );
          continue;
        }
      }

      // 2. Telegram Voice / Audio Note (STT -> Agent Turn -> Optional Walkie-Talkie Opus Voice Reply)
      const voiceObj = upd.message?.voice || upd.message?.audio;
      if (voiceObj?.file_id) {
        const file = await downloadTelegramFileBase64(token, voiceObj.file_id, voiceObj.mime_type || 'audio/ogg');
        if (file) {
          try {
            const stt = await invokeWithFailover({
              prompt: 'Írd le pontosan, amit a hangüzenetben hallasz. Csak a tiszta átiratot add vissza.',
              audio: { mimeType: file.mimeType, dataBase64: file.dataBase64 },
              complexity: 'simple',
              bypassCache: true,
            });
            const transcript = stt.text.trim();
            if (transcript) {
              const reply = await processTelegramInput(transcript, forcedAgentId);
              await sendTelegramMessage(`(Hangüzenet: "${transcript}")\n${reply}`, {
                tokenOverride: token,
                chatIdOverride: chatStr,
              });
              if (getState().settings.telegramVoiceReplyEnabled !== false) {
                const tts = synthesizeTelegramVoiceOgg(reply);
                if (tts.ok && tts.oggBuffer) {
                  await sendTelegramVoice(tts.oggBuffer, '', {
                    tokenOverride: token,
                    chatIdOverride: chatStr,
                  });
                }
              }
            } else {
              await sendTelegramMessage('A hangüzenet átírása üres eredményt adott.', {
                tokenOverride: token,
                chatIdOverride: chatStr,
              });
            }
          } catch (err) {
            await sendTelegramMessage(
              `Hangüzenet feldolgozás sikertelen (multimodális audio kulcs szükséges): ${err instanceof Error ? err.message : String(err)}`,
              { tokenOverride: token, chatIdOverride: chatStr }
            );
          }
          continue;
        }
      }

      const incoming = upd.message?.text ?? upd.callback_query?.data;
      if (incoming) {
        if (upd.callback_query?.id) {
          void answerTelegramCallbackQuery(token, upd.callback_query.id, 'Parancs feldolgozva');
        }
        if (upd.message?.message_id && chatStr) {
          void setTelegramReaction(token, chatStr, upd.message.message_id, '👀');
        }
        const replyQuote = upd.message?.reply_to_message?.text || upd.message?.reply_to_message?.caption;
        const reply = await processTelegramInput(incoming, forcedAgentId, replyQuote);
        const trimmedCmd = incoming.trim();
        const useInline = getState().settings.telegramInlineButtons !== false;
        const inlineButtons =
          useInline && (trimmedCmd === '/statusz' || trimmedCmd === '/status' || trimmedCmd === '/kanban' || trimmedCmd === '/nightshift')
            ? buildTelegramStatusInlineKeyboard()
            : useInline && !trimmedCmd.startsWith('/')
            ? [
                [
                  { text: '🔊 Felolvasás', callback_data: '/tts_last' },
                  { text: '📌 Memóriába', callback_data: '/pin_last' },
                ],
              ]
            : undefined;
        await sendTelegramMessage(reply, {
          tokenOverride: token,
          chatIdOverride: chatStr,
          inlineButtons,
        });
      }
    }
  } catch {
    // transient polling error ignored
  }
}

export function startTelegramPolling(): void {
  if (pollingActive) return;
  pollingActive = true;

  const poll = async () => {
    if (!pollingActive) return;
    const state = getState();

    if (!state.settings.killSwitchActive) {
      const mainToken = getTelegramTokenSecret();
      if (state.settings.telegramEnabled && mainToken) {
        void syncTelegramBotCommands(mainToken);
        void flushTelegramOutbox();
        await pollSingleBot('main', mainToken);
      }

      // Poll each agent's own dedicated Telegram Bot independently
      for (const ag of state.agents) {
        if (!ag.active || ag.isSupervisor || !ag.telegramBotEnabled || !ag.telegramHasToken) continue;
        const agToken = getAgentTelegramTokenSecret(ag.id);
        if (agToken && agToken !== mainToken) {
          await pollSingleBot(ag.id, agToken, ag.id);
        }
      }
    }

    if (pollingActive) {
      setTimeout(poll, 4000);
    }
  };

  setTimeout(poll, 2000);
}

/** Fail-closed Telegram chat ID allowlist check: denies all incoming updates when allowlist & primary chatId are empty */
export function isTelegramChatAllowed(chatId?: string | number): boolean {
  const s = getState().settings;
  const allow = (s.telegramAllowedChatIds || []).map((id) => String(id).trim()).filter(Boolean);
  const primary = (s.telegramChatId || '').trim();
  const effective = allow.length > 0 ? allow : primary ? [primary] : [];
  if (effective.length === 0 || chatId === undefined || chatId === null) {
    return false;
  }
  return effective.includes(String(chatId).trim());
}

export function stopTelegramPolling(): void {
  pollingActive = false;
}
