import crypto from 'node:crypto';
import type {
  ChannelConnector,
  ChannelConnectorType,
  PairingRequest,
} from '../../shared/types';
import { handleUserTurn } from '../agents/engine';
import {
  appendAuditLog,
  getChannelConnectorSecret,
  getState,
  setChannelConnectorSecret,
  updateState,
} from '../state/store';

export function createChannelConnector(input: {
  type: ChannelConnectorType;
  name: string;
  webhookUrl: string;
  secret?: string;
  defaultAgentId?: string | null;
}): ChannelConnector {
  const id = `ch-${input.type}-${crypto.randomUUID().slice(0, 6)}`;
  if (input.secret?.trim()) {
    setChannelConnectorSecret(id, input.secret.trim());
  }
  const conn: ChannelConnector = {
    id,
    type: input.type,
    name: input.name.trim(),
    enabled: true,
    hasSecret: Boolean(input.secret?.trim()),
    webhookUrl: input.webhookUrl.trim(),
    defaultAgentId: input.defaultAgentId ?? null,
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
  updateState((s) => {
    s.channelConnectors = s.channelConnectors.filter((c) => c.id !== id);
  });
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

/**
 * OpenClaw Channel Pairing Gate: checks if external sender is paired; if unknown & pairing required,
 * issues a 6-character pairing code and queues an approval request.
 */
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
    sourceAgentName: 'OpenClaw Pairing',
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
      sourceAgentName: 'OpenClaw Pairing',
      message: `Párosítás (${(resolved as PairingRequest).channel}/${(resolved as PairingRequest).code}): ${decision}`,
      verifiedExecution: true,
    });
  }
  return resolved;
}

/**
 * Handles inbound messages from Discord, Slack, or Generic Webhooks, placing them in an
 * isolated sandboxed session thread (OpenClaw pattern).
 */
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

  // Ensure a sandboxed session thread exists for this external channel
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
