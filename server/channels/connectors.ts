import crypto from 'node:crypto';
import type {
  ChannelConnector,
  ChannelConnectorType,
  PairingRequest,
} from '../../shared/types';
import { handleUserTurn } from '../agents/engine';
import {
  appendAuditLog,
  getChannelBotTokenSecret,
  getChannelConnectorSecret,
  getState,
  setChannelBotTokenSecret,
  setChannelConnectorSecret,
  updateState,
} from '../state/store';

export function createChannelConnector(input: {
  type: ChannelConnectorType;
  name: string;
  webhookUrl: string;
  secret?: string;
  defaultAgentId?: string | null;
  botToken?: string;
  channelId?: string;
  pollingEnabled?: boolean;
}): ChannelConnector {
  const id = `ch-${input.type}-${crypto.randomUUID().slice(0, 6)}`;
  if (input.secret?.trim()) {
    setChannelConnectorSecret(id, input.secret.trim());
  }
  if (input.botToken?.trim()) {
    setChannelBotTokenSecret(id, input.botToken.trim());
  }
  const conn: ChannelConnector = {
    id,
    type: input.type,
    name: input.name.trim(),
    enabled: true,
    hasSecret: Boolean(input.secret?.trim()),
    webhookUrl: input.webhookUrl.trim(),
    defaultAgentId: input.defaultAgentId ?? null,
    pollingEnabled: Boolean(input.pollingEnabled && input.channelId?.trim()),
    botTokenConfigured: Boolean(input.botToken?.trim()),
    channelId: input.channelId?.trim() || undefined,
    lastEventAt: null,
  };
  updateState((s) => {
    s.channelConnectors.push(conn);
  });
  appendAuditLog({
    type: 'channel',
    sourceAgentId: id,
    sourceAgentName: conn.name,
    message: `Csatorna csatlakozó létrehozva: ${conn.type.toUpperCase()} (${conn.name})`,
    verifiedExecution: true,
  });
  return conn;
}

export function deleteChannelConnector(id: string): void {
  setChannelConnectorSecret(id, '');
  setChannelBotTokenSecret(id, '');
  updateState((s) => {
    s.channelConnectors = s.channelConnectors.filter((c) => c.id !== id);
  });
}

/** M18: Update Discord/Slack bidirectional polling config */
export function updateChannelPollingConfig(
  connectorId: string,
  input: { botToken?: string; channelId?: string; pollingEnabled?: boolean }
): ChannelConnector | null {
  if (typeof input.botToken === 'string' && input.botToken.trim()) {
    setChannelBotTokenSecret(connectorId, input.botToken.trim());
  }
  let updated: ChannelConnector | null = null;
  updateState((s) => {
    const conn = s.channelConnectors.find((c) => c.id === connectorId);
    if (!conn) return;
    if (typeof input.channelId === 'string') conn.channelId = input.channelId.trim() || undefined;
    if (typeof input.pollingEnabled === 'boolean') conn.pollingEnabled = input.pollingEnabled;
    conn.botTokenConfigured = Boolean(getChannelBotTokenSecret(connectorId));
    updated = conn;
  });
  return updated;
}

/** M18: Bidirectional active REST polling for Discord & Slack without requiring public inbound ports */
export async function pollExternalChannels(fetchImpl: typeof fetch = fetch): Promise<{ polled: number; processed: number }> {
  const state = getState();
  if (state.settings.killSwitchActive) return { polled: 0, processed: 0 };

  const targets = state.channelConnectors.filter(
    (c) => c.enabled && c.pollingEnabled && c.botTokenConfigured && c.channelId && (c.type === 'discord' || c.type === 'slack')
  );
  let polled = 0;
  let processed = 0;

  for (const conn of targets) {
    const botToken = getChannelBotTokenSecret(conn.id);
    if (!botToken || !conn.channelId) continue;
    polled++;

    try {
      if (conn.type === 'discord') {
        const res = await fetchImpl(
          `https://discord.com/api/v10/channels/${encodeURIComponent(conn.channelId)}/messages?limit=5`,
          {
            headers: { Authorization: `Bot ${botToken}`, 'User-Agent': 'NovaSwarm-ChannelPoller/2.0' },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (!res.ok) continue;
        const msgs = (await res.json()) as Array<{
          id: string;
          content?: string;
          author?: { id: string; username?: string; bot?: boolean };
        }>;
        const chronological = [...(Array.isArray(msgs) ? msgs : [])].reverse();
        for (const m of chronological) {
          if (m.author?.bot || !m.content?.trim()) continue;
          if (conn.lastMessageId && m.id <= conn.lastMessageId) continue;
          updateState((s) => {
            const ref = s.channelConnectors.find((c) => c.id === conn.id);
            if (ref) ref.lastMessageId = m.id;
          });
          await handleInboundChannelEvent({
            connectorId: conn.id,
            senderId: m.author?.id || 'discord-user',
            senderLabel: m.author?.username || 'Discord',
            text: m.content,
          });
          processed++;
        }
      } else if (conn.type === 'slack') {
        const res = await fetchImpl(
          `https://slack.com/api/conversations.history?channel=${encodeURIComponent(conn.channelId)}&limit=5`,
          {
            headers: { Authorization: `Bearer ${botToken}` },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (!res.ok) continue;
        const data = (await res.json()) as {
          ok?: boolean;
          messages?: Array<{ ts: string; user?: string; bot_id?: string; text?: string }>;
        };
        if (!data.ok || !Array.isArray(data.messages)) continue;
        const chronological = [...data.messages].reverse();
        for (const m of chronological) {
          if (m.bot_id || !m.text?.trim()) continue;
          if (conn.lastMessageId && m.ts <= conn.lastMessageId) continue;
          updateState((s) => {
            const ref = s.channelConnectors.find((c) => c.id === conn.id);
            if (ref) ref.lastMessageId = m.ts;
          });
          await handleInboundChannelEvent({
            connectorId: conn.id,
            senderId: m.user || 'slack-user',
            senderLabel: m.user || 'Slack',
            text: m.text,
          });
          processed++;
        }
      }
    } catch {
      // transient network poll error
    }
  }

  return { polled, processed };
}

export async function sendToChannelConnector(
  connectorId: string,
  text: string
): Promise<{ sent: boolean; reason?: string }> {
  const state = getState();
  const conn = state.channelConnectors.find((c) => c.id === connectorId);
  if (!conn || !conn.enabled) {
    return { sent: false, reason: 'Csatlakozó nem található vagy inaktív' };
  }
  if (!conn.webhookUrl) {
    return { sent: false, reason: 'Webhook URL nincs megadva' };
  }

  const secret = getChannelConnectorSecret(conn.id);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }

  const payload =
    conn.type === 'discord'
      ? { content: text.slice(0, 1900) }
      : conn.type === 'slack'
      ? { text: text.slice(0, 3500) }
      : { source: 'novaswarm', message: text, timestamp: new Date().toISOString() };

  try {
    const res = await fetch(conn.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    updateState((s) => {
      const ref = s.channelConnectors.find((c) => c.id === connectorId);
      if (ref) {
        ref.lastEventAt = new Date().toISOString();
        ref.lastError = res.ok ? undefined : `HTTP ${res.status}`;
      }
    });
    return res.ok ? { sent: true } : { sent: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    updateState((s) => {
      const ref = s.channelConnectors.find((c) => c.id === connectorId);
      if (ref) ref.lastError = reason;
    });
    return { sent: false, reason };
  }
}

export function checkOrCreatePairing(params: {
  channel: PairingRequest['channel'];
  senderId: string;
  senderLabel: string;
}): { paired: boolean; code?: string; request?: PairingRequest } {
  const state = getState();
  if (!state.settings.channelPairingRequired) {
    return { paired: true };
  }
  if (params.channel === 'telegram' && state.settings.telegramChatId && params.senderId === state.settings.telegramChatId) {
    return { paired: true };
  }

  const existing = state.pairingRequests.find(
    (p) => p.channel === params.channel && p.senderId === params.senderId
  );
  if (existing) {
    if (existing.status === 'approved') return { paired: true };
    if (existing.status === 'pending') return { paired: false, code: existing.code, request: existing };
    return { paired: false };
  }

  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const req: PairingRequest = {
    id: `pair-${crypto.randomUUID().slice(0, 6)}`,
    channel: params.channel,
    senderId: params.senderId,
    senderLabel: params.senderLabel || params.senderId,
    code,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.pairingRequests.unshift(req);
  });

  appendAuditLog({
    type: 'channel',
    sourceAgentId: 'pairing-gate',
    sourceAgentName: 'Csatorna Párosítás',
    message: `Új párosítási kérelem (${params.channel}/${req.senderLabel}): kód=${code}`,
    verifiedExecution: true,
  });

  return { paired: false, code, request: req };
}

export function resolvePairingRequest(
  idOrCode: string,
  decision: 'approved' | 'rejected'
): PairingRequest | null {
  let resolved: PairingRequest | null = null;
  updateState((s) => {
    const match = s.pairingRequests.find(
      (p) => p.status === 'pending' && (p.id === idOrCode || p.code.toUpperCase() === idOrCode.toUpperCase())
    );
    if (!match) return;
    match.status = decision;
    match.resolvedAt = new Date().toISOString();
    resolved = match;
  });
  if (resolved) {
    appendAuditLog({
      type: 'channel',
      sourceAgentId: 'pairing-gate',
      sourceAgentName: 'Csatorna Párosítás',
      message: `Párosítás (${(resolved as PairingRequest).channel}/${(resolved as PairingRequest).code}): ${decision}`,
      verifiedExecution: true,
    });
  }
  return resolved;
}

export async function handleInboundChannelEvent(params: {
  connectorId: string;
  senderId: string;
  senderLabel?: string;
  text: string;
}): Promise<{ ok: boolean; pairingRequired?: boolean; pairingCode?: string; replyText?: string }> {
  const state = getState();
  const conn = state.channelConnectors.find((c) => c.id === params.connectorId);
  if (!conn || !conn.enabled) {
    throw new Error('Csatorna csatlakozó nem található vagy le van tiltva.');
  }

  const pair = checkOrCreatePairing({
    channel: conn.type,
    senderId: params.senderId,
    senderLabel: params.senderLabel || params.senderId,
  });
  if (!pair.paired) {
    return {
      ok: false,
      pairingRequired: true,
      pairingCode: pair.code,
      replyText: `Párosítás szükséges. Jóváhagyási kód: ${pair.code} (Telegram: /pairing approve ${pair.code})`,
    };
  }

  const threadId = `thread-${conn.type}-${conn.id}`;
  if (!state.threads.some((t) => t.id === threadId)) {
    const now = new Date().toISOString();
    updateState((s) => {
      s.threads.push({
        id: threadId,
        title: `${conn.type.toUpperCase()}: ${conn.name}`,
        folder: 'Külső Csatornák',
        isolationMode: 'sandboxed',
        channelSource: conn.type,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  const turn = await handleUserTurn({
    threadId,
    content: params.text,
    channel: conn.type,
    targetAgentId: conn.defaultAgentId,
  });

  updateState((s) => {
    const ref = s.channelConnectors.find((c) => c.id === params.connectorId);
    if (ref) ref.lastEventAt = new Date().toISOString();
  });

  if (conn.webhookUrl) {
    void sendToChannelConnector(conn.id, `[${turn.coordinatorReply.senderName}]: ${turn.coordinatorReply.content}`);
  }

  return { ok: true, replyText: turn.coordinatorReply.content };
}
