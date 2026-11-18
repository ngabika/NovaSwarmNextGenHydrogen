import { handleUserTurn, resolveTargetAgent } from '../agents/engine';
import { searchMemories } from '../memory/vectorStore';
import { activateKillSwitch, resolveApproval } from '../security/permissionGate';
import { appendAuditLog, getState, getTelegramTokenSecret } from '../state/store';
import { collectHardwareMetrics, checkOtaUpdates } from '../system/ops';

let pollingActive = false;
let lastUpdateOffset = 0;

export async function sendTelegramMessage(
  text: string,
  options?: { inlineButtons?: Array<Array<{ text: string; callback_data: string }>> }
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const token = getTelegramTokenSecret();
  const chatId = state.settings.telegramChatId?.trim();

  if (!state.settings.telegramEnabled || !token || !chatId) {
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
 * matching every Web UI query (Section 16.2 & 16.3).
 */
export async function processTelegramInput(rawText: string): Promise<string> {
  const text = rawText.trim();
  const state = getState();

  appendAuditLog({
    type: 'telegram',
    sourceAgentId: 'telegram-gateway',
    sourceAgentName: 'Telegram Gateway',
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
    ].join('\n');
  }

  if (text === '/kanban') {
    if (state.kanban.length === 0) {
      return 'A Kanban tábla jelenleg üres.';
    }
    const lines = state.kanban.slice(0, 15).map((c) => `[${c.status.toUpperCase()}] ${c.title}`);
    return `Kanban kártyák (${state.kanban.length} db):\n${lines.join('\n')}`;
  }

  if (text === '/memoria' || text === '/memory') {
    if (state.memories.length === 0) {
      return 'Még nincs rögzített tartós memória.';
    }
    const lines = state.memories
      .slice(0, 8)
      .map((m) => `• [${m.entity}] ${m.content.slice(0, 100)}`);
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

  if (text === '/update') {
    const ota = await checkOtaUpdates();
    return `OTA Verzió: helyi=${ota.currentVersion}, távoli=${ota.latestVersion ?? 'ismeretlen'}, frissítés elérhető=${ota.updateAvailable ? 'IGEN' : 'NEM'}`;
  }

  if (text.startsWith('/keres ') || text.startsWith('/ask ')) {
    const query = text.replace(/^\/(keres|ask)\s+/i, '').trim();
    const memMatches = searchMemories(query, 4);
    const turn = await handleUserTurn({
      threadId: state.threads[0]?.id || 'thread-main',
      content: `${query}${memMatches.length ? `\n(Memória találatok: ${memMatches.map((m) => m.content).join(' | ')})` : ''}`,
      channel: 'telegram',
    });
    return `[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}`;
  }

  // Direct message or Agent-by-name addressing delegation (Section 16.2)
  const addressedAgent = resolveTargetAgent(text);
  const turn = await handleUserTurn({
    threadId: state.threads[0]?.id || 'thread-main',
    content: text,
    channel: 'telegram',
    targetAgentId: addressedAgent?.id ?? null,
  });

  return `[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}`;
}

export function startTelegramPolling(): void {
  if (pollingActive) return;
  pollingActive = true;

  const poll = async () => {
    if (!pollingActive) return;
    const state = getState();
    const token = getTelegramTokenSecret();

    if (state.settings.telegramEnabled && token && !state.settings.killSwitchActive) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateOffset + 1}&timeout=10`,
          { signal: AbortSignal.timeout(12000) }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            ok: boolean;
            result?: Array<{
              update_id: number;
              message?: { chat: { id: number }; text?: string };
              callback_query?: { id: string; data?: string };
            }>;
          };
          for (const upd of data.result || []) {
            lastUpdateOffset = Math.max(lastUpdateOffset, upd.update_id);
            if (upd.message?.text) {
              const reply = await processTelegramInput(upd.message.text);
              await sendTelegramMessage(reply);
            } else if (upd.callback_query?.data) {
              const reply = await processTelegramInput(upd.callback_query.data);
              await sendTelegramMessage(reply);
            }
          }
        }
      } catch {
        // transient polling error ignored; retries on next cycle
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
