import crypto from 'node:crypto';
import type { FederationPeer } from '../../shared/types';
import { handleUserTurn } from '../agents/engine';
import {
  appendAuditLog,
  getFederationPeerToken,
  getState,
  setFederationPeerToken,
  updateState,
} from '../state/store';

const VALID_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export function isValidFederationAddress(address: string): { peer: string; agent: string } | null {
  const parts = address.split('/');
  if (parts.length !== 2) return null;
  if (!VALID_SEGMENT.test(parts[0]) || !VALID_SEGMENT.test(parts[1])) return null;
  return { peer: parts[0], agent: parts[1] };
}

export function addFederationPeer(input: {
  name: string;
  baseUrl: string;
  sharedToken?: string;
}): FederationPeer {
  const cleanName = input.name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!VALID_SEGMENT.test(cleanName)) {
    throw new Error('Érvénytelen föderációs társ név ([a-zA-Z0-9_-] engedélyezett).');
  }
  const id = `fed-${crypto.randomUUID().slice(0, 6)}`;
  if (input.sharedToken?.trim()) {
    setFederationPeerToken(id, input.sharedToken.trim());
  }
  const peer: FederationPeer = {
    id,
    name: cleanName,
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    enabled: true,
    hasToken: Boolean(input.sharedToken?.trim()),
    status: 'untested',
    remoteAgents: [],
    lastSyncAt: null,
  };
  updateState((s) => {
    s.federationPeers.push(peer);
  });
  return peer;
}

export function removeFederationPeer(id: string): void {
  setFederationPeerToken(id, '');
  updateState((s) => {
    s.federationPeers = s.federationPeers.filter((p) => p.id !== id);
  });
}

export async function pingFederationPeer(id: string): Promise<FederationPeer | null> {
  const state = getState();
  const peer = state.federationPeers.find((p) => p.id === id);
  if (!peer) return null;

  const token = getFederationPeerToken(peer.id);
  try {
    const res = await fetch(`${peer.baseUrl}/api/federation/manifest`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      instanceName?: string;
      agents?: Array<{ id: string; name: string; role: string }>;
    };
    updateState((s) => {
      const ref = s.federationPeers.find((p) => p.id === id);
      if (ref) {
        ref.status = 'online';
        ref.remoteAgents = data.agents || [];
        ref.lastSyncAt = new Date().toISOString();
        ref.lastError = undefined;
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateState((s) => {
      const ref = s.federationPeers.find((p) => p.id === id);
      if (ref) {
        ref.status = 'offline';
        ref.lastSyncAt = new Date().toISOString();
        ref.lastError = msg;
      }
    });
  }
  return getState().federationPeers.find((p) => p.id === id) ?? null;
}

export async function sendFederationMessage(params: {
  address: string;
  content: string;
  fromAgent?: string;
}): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const state = getState();
  if (!state.settings.federationEnabled) {
    throw new Error('A Föderáció jelenleg ki van kapcsolva a beállításokban.');
  }
  const parsed = isValidFederationAddress(params.address);
  if (!parsed) {
    throw new Error('Érvénytelen föderációs cím. Használd a <társ>/<ágens> formátumot.');
  }
  const peer = state.federationPeers.find((p) => p.name === parsed.peer && p.enabled);
  if (!peer) {
    throw new Error(`Föderált társ nem található vagy inaktív: ${parsed.peer}`);
  }

  const token = getFederationPeerToken(peer.id);
  try {
    const res = await fetch(`${peer.baseUrl}/api/federation/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        fromNode: state.settings.instanceName,
        fromAgent: params.fromAgent || 'coordinator',
        targetAgent: parsed.agent,
        content: params.content,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
    appendAuditLog({
      type: 'federation',
      sourceAgentId: 'federation-bridge',
      sourceAgentName: 'Föderációs Híd',
      message: `Kimenő föderációs üzenet -> ${params.address} (${res.ok ? 'OK' : `HTTP ${res.status}`})`,
      verifiedExecution: res.ok,
    });
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, reply: data.reply };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function receiveFederationMessage(params: {
  fromNode: string;
  fromAgent: string;
  targetAgent: string;
  content: string;
}): Promise<{ ok: boolean; reply: string }> {
  const state = getState();
  if (!state.settings.federationEnabled) {
    throw new Error('Föderáció nincs engedélyezve ezen a példányon.');
  }
  const threadId = `thread-fed-${params.fromNode.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!state.threads.some((t) => t.id === threadId)) {
    const now = new Date().toISOString();
    updateState((s) => {
      s.threads.push({
        id: threadId,
        title: `Föderáció: ${params.fromNode}`,
        folder: 'Föderáció',
        isolationMode: 'sandboxed',
        channelSource: 'federation',
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  const targetMatch = state.agents.find(
    (a) => !a.isSupervisor && a.active && (a.name.toLowerCase() === params.targetAgent.toLowerCase() || a.id === params.targetAgent)
  );
  const turn = await handleUserTurn({
    threadId,
    content: `[Föderált üzenet: ${params.fromNode}/${params.fromAgent}] ${params.content}`,
    channel: 'federation',
    targetAgentId: targetMatch?.id ?? null,
  });

  appendAuditLog({
    type: 'federation',
    sourceAgentId: targetMatch?.id || 'federation-bridge',
    sourceAgentName: 'Föderációs Híd',
    message: `Bejövő föderációs üzenet <- ${params.fromNode}/${params.fromAgent}`,
    verifiedExecution: true,
  });

  return { ok: true, reply: turn.coordinatorReply.content };
}
