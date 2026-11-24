import crypto from 'node:crypto';
import type { FederationPeer } from '../../shared/types';
import { handleUserTurn } from '../agents/engine';
import { validateSafeOutboundUrl } from '../security/egressAndCrypto';
import {
  appendAuditLog,
  getFederationPeerToken,
  getState,
  setFederationPeerToken,
  updateState,
} from '../state/store';

export function verifyFederationInboundAuth(authHeader?: string): { ok: boolean; error?: string } {
  const state = getState();
  if (!state.settings.federationEnabled) {
    return { ok: false, error: 'A Föderáció nincs engedélyezve ezen a csomóponton.' };
  }
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!token) {
    return { ok: false, error: 'Hiányzó Bearer föderációs hitelesítő token.' };
  }
  const envFedToken = process.env.NOVASWARM_FEDERATION_TOKEN?.trim();
  const candidates: string[] = [];
  if (envFedToken) candidates.push(envFedToken);
  for (const peer of state.federationPeers) {
    if (!peer.enabled) continue;
    const t = getFederationPeerToken(peer.id);
    if (t) candidates.push(t);
  }
  if (candidates.length === 0) {
    return { ok: false, error: 'Nincs konfigurált föderációs társ-token ezen a példányon.' };
  }
  const tokenBuf = Buffer.from(token);
  const matched = candidates.some((cand) => {
    const candBuf = Buffer.from(cand);
    return candBuf.length === tokenBuf.length && crypto.timingSafeEqual(candBuf, tokenBuf);
  });
  if (!matched) {
    return { ok: false, error: 'Érvénytelen föderációs hitelesítő token.' };
  }
  return { ok: true };
}

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

  const urlGuard = validateSafeOutboundUrl(peer.baseUrl);
  if (!urlGuard.safe) {
    return peer;
  }
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

  const urlGuard = validateSafeOutboundUrl(peer.baseUrl);
  if (!urlGuard.safe) {
    return { ok: false, error: urlGuard.reason };
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

/** M28: Handoff a local Kanban card to a federated peer */
export async function handoffKanbanToPeer(cardId: string, peerId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const state = getState();
  if (!state.settings.federationEnabled) {
    throw new Error('A Föderáció nincs engedélyezve.');
  }
  const card = state.kanban.find((c) => c.id === cardId);
  if (!card) throw new Error('Kanban kártya nem található.');
  const peer = state.federationPeers.find((p) => p.id === peerId && p.enabled);
  if (!peer) throw new Error('Föderációs társ nem található vagy inaktív.');

  const urlGuard = validateSafeOutboundUrl(peer.baseUrl);
  if (!urlGuard.safe) {
    return { ok: false, message: urlGuard.reason || 'Tiltott föderációs célpont URL.' };
  }
  const token = getFederationPeerToken(peer.id);
  const res = await fetch(`${peer.baseUrl}/api/federation/handoff-inbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fromNode: state.settings.instanceName,
      card: {
        title: card.title,
        description: card.description,
        priority: card.priority,
        project: card.project,
      },
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    return { ok: false, message: `Átadás sikertelen (HTTP ${res.status})` };
  }
  updateState((s) => {
    const ref = s.kanban.find((c) => c.id === cardId);
    if (ref) {
      ref.description = `${ref.description ? `${ref.description}\n\n` : ''}[Átadva föderációs társnak: ${peer.name}]`;
      ref.updatedAt = new Date().toISOString();
    }
  });
  appendAuditLog({
    type: 'federation',
    sourceAgentId: 'federation-bridge',
    sourceAgentName: 'Föderációs Híd',
    message: `Kanban kártya átadva (${peer.name}): ${card.title}`,
    verifiedExecution: true,
  });
  return { ok: true, message: `Kanban feladat átadva (${peer.name}).` };
}

export function receiveKanbanHandoff(params: {
  fromNode: string;
  card: { title: string; description?: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; project?: string };
}) {
  const state = getState();
  if (!state.settings.federationEnabled) {
    throw new Error('Föderáció nincs engedélyezve.');
  }
  const now = new Date().toISOString();
  const created = {
    id: `card-${crypto.randomUUID().slice(0, 8)}`,
    title: params.card.title.trim(),
    description: `${params.card.description || ''}\n[Föderált átadás innen: ${params.fromNode}]`.trim(),
    status: 'todo' as const,
    assignedAgentId: null,
    priority: params.card.priority || 'medium',
    subtasks: [],
    project: params.card.project,
    createdAt: now,
    updatedAt: now,
  };
  updateState((s) => {
    s.kanban.unshift(created);
  });
  appendAuditLog({
    type: 'federation',
    sourceAgentId: 'federation-bridge',
    sourceAgentName: 'Föderációs Híd',
    message: `Bejövő föderált Kanban feladat <- ${params.fromNode}: ${created.title}`,
    verifiedExecution: true,
  });
  return created;
}

/** M28: Sync 'shared' tier memories with online federated peers */
export async function syncSharedMemoriesWithPeers(): Promise<{
  syncedPeers: number;
  pushedCount: number;
}> {
  const state = getState();
  if (!state.settings.federationEnabled) {
    throw new Error('A Föderáció nincs engedélyezve.');
  }
  const shared = state.memories
    .filter((m) => m.tier === 'shared')
    .slice(0, 25)
    .map((m) => ({
      entity: m.entity,
      content: m.content,
      tags: m.tags,
      links: m.links,
      importanceScore: m.importanceScore,
    }));

  let syncedPeers = 0;
  for (const peer of state.federationPeers.filter((p) => p.enabled)) {
    const urlGuard = validateSafeOutboundUrl(peer.baseUrl);
    if (!urlGuard.safe) continue;
    const token = getFederationPeerToken(peer.id);
    try {
      const res = await fetch(`${peer.baseUrl}/api/federation/memory-sync-inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fromNode: state.settings.instanceName,
          memories: shared,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) syncedPeers++;
    } catch {
      // ignore unreachable peer
    }
  }
  return { syncedPeers, pushedCount: shared.length };
}

export function receiveSharedMemories(
  fromNode: string,
  memories: Array<{ entity: string; content: string; tags?: string[]; links?: string[]; importanceScore?: number }>
): { imported: number } {
  let imported = 0;
  updateState((s) => {
    const existing = new Set(s.memories.map((m) => m.content.trim().toLowerCase()));
    const now = new Date().toISOString();
    for (const m of memories.slice(0, 30)) {
      if (!m?.content || existing.has(m.content.trim().toLowerCase())) continue;
      s.memories.unshift({
        id: crypto.randomUUID(),
        createdAt: now,
        lastAccessedAt: now,
        content: m.content,
        entity: `${m.entity} (${fromNode})`,
        tags: Array.from(new Set([...(m.tags || []), 'federated', fromNode])),
        links: m.links || [fromNode],
        importanceScore: m.importanceScore ?? 0.8,
        salience: 0.85,
        tier: 'shared',
        embedding: [],
      });
      existing.add(m.content.trim().toLowerCase());
      imported++;
    }
  });
  return { imported };
}
