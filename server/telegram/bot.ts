import crypto from 'node:crypto';
import type { ApprovalRequest } from '../../shared/types';
import { handleUserTurn, resolveTargetAgent } from '../agents/engine';
import { resolvePairingRequest } from '../channels/connectors';
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
  appendAuditLog,
  getAgentTelegramTokenSecret,
  getState,
  getTelegramTokenSecret,
  updateState,
} from '../state/store';
import { collectHardwareMetrics, checkOtaUpdates } from '../system/ops';

let pollingActive = false;
const botOffsets = new Map<string, number>();

export async function sendTelegramMessage(
  text: string,
  options?: {
    inlineButtons?: Array<Array<{ text: string; callback_data: string }>>;
    tokenOverride?: string;
    chatIdOverride?: string;
  }
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const token = options?.tokenOverride || getTelegramTokenSecret();
  const chatId = options?.chatIdOverride || state.settings.telegramChatId?.trim();

  if (!token || !chatId || (!options?.tokenOverride && !state.settings.telegramEnabled)) {
    return { sent: false, reason: 'Telegram nincs konfigurálva (token vagy chat ID hiányzik)' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        reply_markup: options?.inlineButtons ? { inline_keyboard: options.inlineButtons } : undefined,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { sent: false, reason: `HTTP ${res.status}` };
    }
    return { sent: true };
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
        const inlineButtons =
          trimmedCmd === '/statusz' || trimmedCmd === '/status' || trimmedCmd === '/kanban'
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
