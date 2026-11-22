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
import { activateKillSwitch, resolveApproval } from '../security/permissionGate';
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
import {
  appendAuditLog,
  getAgentTelegramTokenSecret,
  getState,
  getTelegramTokenSecret,
  updateState,
  verifyAuditLogChain,
} from '../state/store';
import { collectHardwareMetrics, checkOtaUpdates } from '../system/ops';

let pollingActive = false;
const botOffsets = new Map<string, number>();
let commandsSyncedToken: string | null = null;

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

/**
 * Processes an incoming Telegram command or message with 100% live-data parity
 * matching Web UI + supporting Per-Agent Dedicated Bot routing.
 */
export async function processTelegramInput(
  rawText: string,
  forcedAgentId?: string | null
): Promise<string> {
  const text = rawText.trim();
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
      '/statusz · /autopilot · /top · /df',
      '/mission <cél> · /nightshift · /kapszula',
      '/kanban · /otlet <cél> · /lista [tétel]',
      '/search <kifejezés> · /vita <téma>',
      '/bash <magyar kérés> · /hiba · /frissites',
      '/lan · /behatolo · /wol <MAC> · /cluster',
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
  const turn = await handleUserTurn({
    threadId: state.threads[0]?.id || 'thread-main',
    content: text,
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
          chat: { id: number };
          text?: string;
          caption?: string;
          photo?: Array<{ file_id: string; width?: number; height?: number }>;
          voice?: { file_id: string; mime_type?: string };
          audio?: { file_id: string; mime_type?: string };
        };
        callback_query?: { id: string; message?: { chat: { id: number } }; data?: string };
      }>;
    };
    for (const upd of data.result || []) {
      botOffsets.set(botKey, Math.max(botOffsets.get(botKey) ?? 0, upd.update_id));
      const chatId = upd.message?.chat?.id ?? upd.callback_query?.message?.chat?.id;
      const chatStr = chatId ? String(chatId) : undefined;
      const allowList = getState().settings.telegramAllowedChatIds || [];
      if (allowList.length > 0 && (!chatStr || !allowList.includes(chatStr))) {
        continue;
      }

      // 1. Telegram Photo (Multimodal Vision)
      if (upd.message?.photo && upd.message.photo.length > 0) {
        const largest = upd.message.photo[upd.message.photo.length - 1];
        const file = await downloadTelegramFileBase64(token, largest.file_id, 'image/jpeg');
        if (file) {
          const state = getState();
          const caption = upd.message.caption?.trim() || 'Elemezd a mellékelt képet.';
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
          await sendTelegramMessage(`[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}`, {
            tokenOverride: token,
            chatIdOverride: chatStr,
          });
          continue;
        }
      }

      // 2. Telegram Voice / Audio Note (STT -> Agent Turn)
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
        const reply = await processTelegramInput(incoming, forcedAgentId);
        const trimmedCmd = incoming.trim();
        const useInline = getState().settings.telegramInlineButtons !== false;
        const inlineButtons =
          useInline && (trimmedCmd === '/statusz' || trimmedCmd === '/status' || trimmedCmd === '/kanban' || trimmedCmd === '/nightshift')
            ? buildTelegramStatusInlineKeyboard()
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

export function stopTelegramPolling(): void {
  pollingActive = false;
}
