import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MemoryEntry, MemoryTier } from '../../shared/types';
import { computeOllamaEmbedding } from '../providers/router';
import { appendAuditLog, getState, updateState } from '../state/store';

const VAULT_DIR = path.join(process.cwd(), 'memory-vault');

/**
 * Pure Node.js deterministic bag-of-n-grams embedding (64 dims) so semantic vector search
 * works immediately out of the box with zero external Python/Chroma dependencies.
 */
export function computeLocalEmbedding(text: string, dims = 64): number[] {
  const vec = new Array<number>(dims).fill(0);
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  if (!normalized) return vec;

  const tokens = normalized.split(/\s+/);
  for (const tok of tokens) {
    const parts = [tok];
    for (let i = 0; i <= tok.length - 3; i++) {
      parts.push(tok.slice(i, i + 3));
    }
    for (const part of parts) {
      const h = crypto.createHash('md5').update(part).digest();
      const idx = h.readUInt16BE(0) % dims;
      const sign = h[2] % 2 === 0 ? 1 : -1;
      vec[idx] += sign;
    }
  }

  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(5)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function sanitizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9áéíóöőúüű_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'note'
  );
}

/**
 * Writes an Obsidian-compatible Markdown note with YAML frontmatter, #tags, and [[wikilinks]].
 */
export function writeObsidianNote(entry: MemoryEntry, vaultBaseDir = VAULT_DIR): string {
  if (!fs.existsSync(vaultBaseDir)) {
    fs.mkdirSync(vaultBaseDir, { recursive: true });
  }
  const folder = path.join(vaultBaseDir, sanitizeSlug(entry.entity || 'general'));
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const fileName = `${entry.createdAt.slice(0, 10)}-${sanitizeSlug(entry.id.slice(0, 8))}.md`;
  const fullPath = path.join(folder, fileName);
  const tagLine = entry.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  const linkLines = entry.links.map((l) => `- [[${l}]]`).join('\n');

  const md = `---
id: ${entry.id}
entity: ${entry.entity}
tier: ${entry.tier ?? 'warm'}
salience: ${(entry.salience ?? entry.importanceScore).toFixed(2)}
created: ${entry.createdAt}
importance: ${entry.importanceScore.toFixed(2)}
---

# ${entry.entity}

${tagLine}

${entry.content}

${entry.links.length > 0 ? `## Kapcsolódó hivatkozások\n${linkLines}\n` : ''}`;

  fs.writeFileSync(fullPath, md, 'utf8');
  return path.relative(process.cwd(), fullPath);
}

export function addPersistentMemory(params: {
  content: string;
  entity: string;
  tags?: string[];
  links?: string[];
  importanceScore?: number;
  tier?: MemoryTier;
  agentId?: string;
  vaultBaseDir?: string;
}): MemoryEntry {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const tags = Array.from(new Set([...(params.tags ?? ['memory']), 'novaswarm']));
  const links = params.links ?? [];
  const embedding = computeLocalEmbedding(params.content);
  const importance = params.importanceScore ?? 0.75;

  const entry: MemoryEntry = {
    id,
    createdAt,
    content: params.content,
    entity: params.entity,
    tags,
    links,
    importanceScore: importance,
    embedding,
    tier: params.tier ?? (importance >= 0.8 ? 'hot' : 'warm'),
    salience: importance,
    lastAccessedAt: createdAt,
    agentId: params.agentId,
  };

  entry.obsidianPath = writeObsidianNote(entry, params.vaultBaseDir);

  updateState((s) => {
    s.memories.unshift(entry);
  });

  appendAuditLog({
    type: 'memory',
    sourceAgentId: params.agentId || 'memory-core',
    sourceAgentName: 'Memória Mag',
    message: `Tartós memória [${entry.tier?.toUpperCase()}] rögzítve [${entry.entity}] (${tags.map((t) => `#${t}`).join(' ')})`,
  });

  return entry;
}

export async function addPersistentMemoryAsync(params: {
  content: string;
  entity: string;
  tags?: string[];
  links?: string[];
  importanceScore?: number;
  tier?: MemoryTier;
  agentId?: string;
  vaultBaseDir?: string;
}): Promise<MemoryEntry> {
  const entry = addPersistentMemory(params);
  const semantic = await computeOllamaEmbedding(params.content);
  if (semantic && semantic.length > 0) {
    updateState((s) => {
      const ref = s.memories.find((m) => m.id === entry.id);
      if (ref) {
        ref.semanticEmbedding = semantic;
      }
    });
    entry.semanticEmbedding = semantic;
  }
  return entry;
}

/**
 * Hybrid Search (Vector Cosine + Lexical/FTS Token Score fused via RRF + Tier & Salience Weight).
 * Updates lastAccessedAt & reinforces salience of recalled items without mutating unrelated memories.
 */
export function searchMemories(
  query: string,
  limit = 8,
  opts?: { tier?: MemoryTier | 'all'; agentId?: string; reinforce?: boolean }
): Array<MemoryEntry & { score: number }> {
  const state = getState();
  const qVec = computeLocalEmbedding(query);
  const qLower = query.toLowerCase().trim();
  const qTokens = qLower
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let pool = state.memories;
  if (opts?.tier && opts.tier !== 'all') {
    pool = pool.filter((m) => (m.tier ?? 'warm') === opts.tier);
  }
  if (opts?.agentId) {
    pool = pool.filter((m) => !m.agentId || m.agentId === opts.agentId || m.tier === 'shared');
  }

  if (pool.length === 0) return [];

  const scored = pool.map((m) => {
    const vecSim = cosineSimilarity(qVec, m.embedding || []);
    const hay = `${m.entity} ${m.content} ${m.tags.join(' ')}`.toLowerCase();
    let lexHits = 0;
    for (const tok of qTokens) {
      if (hay.includes(tok)) lexHits += 1;
    }
    const exactPhraseBonus = qLower.length >= 3 && hay.includes(qLower) ? 1.5 : 0;
    const lexScore = qTokens.length > 0 ? lexHits / qTokens.length + exactPhraseBonus : exactPhraseBonus;
    return { entry: m, vecSim, lexScore };
  });

  // Rank independently for Reciprocal Rank Fusion (RRF, k = 60)
  const byVec = [...scored].sort((a, b) => b.vecSim - a.vecSim);
  const byLex = [...scored].sort((a, b) => b.lexScore - a.lexScore);
  const vecRank = new Map(byVec.map((item, idx) => [item.entry.id, idx + 1]));
  const lexRank = new Map(byLex.map((item, idx) => [item.entry.id, idx + 1]));

  const tierBoost: Record<MemoryTier, number> = {
    hot: 1.22,
    shared: 1.15,
    warm: 1.0,
    cold: 0.78,
  };

  const results = scored
    .map(({ entry, vecSim, lexScore }) => {
      const rVec = vecRank.get(entry.id) ?? pool.length;
      const rLex = lexRank.get(entry.id) ?? pool.length;
      const rrf = 1 / (60 + rVec) + 1 / (60 + rLex);
      const salience = entry.salience ?? entry.importanceScore ?? 0.6;
      const tBoost = tierBoost[entry.tier ?? 'warm'] ?? 1.0;
      const hybridScore = (rrf * 20 + Math.max(0, vecSim) * 0.6 + lexScore * 0.25) * (0.7 + salience * 0.3) * tBoost;
      return {
        ...entry,
        score: Number(hybridScore.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (opts?.reinforce && results.length > 0 && qLower.length > 0) {
    const recalledIds = new Set(results.slice(0, 3).map((r) => r.id));
    const now = new Date().toISOString();
    updateState((s) => {
      for (const m of s.memories) {
        if (recalledIds.has(m.id)) {
          m.lastAccessedAt = now;
          m.salience = Number(Math.min(1.0, (m.salience ?? m.importanceScore ?? 0.6) + 0.05).toFixed(3));
        }
      }
    });
  }

  return results;
}

/**
 * Async Hybrid Search upgrading synchronous RRF with local Ollama neural embeddings (nomic-embed-text)
 * when settings.embeddingMode === 'ollama'.
 */
export async function searchMemoriesAsync(
  query: string,
  limit = 8,
  opts?: { tier?: MemoryTier | 'all'; agentId?: string; reinforce?: boolean }
): Promise<Array<MemoryEntry & { score: number }>> {
  const state = getState();
  if (state.settings.embeddingMode !== 'ollama') {
    return searchMemories(query, limit, opts);
  }

  const baseResults = searchMemories(query, Math.max(limit * 2, 20), { ...opts, reinforce: false });
  if (baseResults.length === 0) return [];

  const qSemantic = await computeOllamaEmbedding(query);
  if (!qSemantic || qSemantic.length === 0) {
    return searchMemories(query, limit, opts);
  }

  const scored = baseResults.map((entry) => {
    const semSim = entry.semanticEmbedding?.length ? cosineSimilarity(qSemantic, entry.semanticEmbedding) : 0;
    return { entry, semSim };
  });

  const bySem = [...scored].sort((a, b) => b.semSim - a.semSim);
  const semRank = new Map(bySem.map((item, idx) => [item.entry.id, idx + 1]));

  const reranked = scored
    .map(({ entry, semSim }) => {
      const rSem = semRank.get(entry.id) ?? scored.length;
      const semRrfBoost = (1 / (60 + rSem)) * 20 + Math.max(0, semSim) * 0.85;
      return {
        ...entry,
        score: Number((entry.score + semRrfBoost).toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (opts?.reinforce && reranked.length > 0 && query.trim().length > 0) {
    const recalledIds = new Set(reranked.slice(0, 3).map((r) => r.id));
    const now = new Date().toISOString();
    updateState((s) => {
      for (const m of s.memories) {
        if (recalledIds.has(m.id)) {
          m.lastAccessedAt = now;
          m.salience = Number(Math.min(1.0, (m.salience ?? m.importanceScore ?? 0.6) + 0.05).toFixed(3));
        }
      }
    });
  }

  return reranked;
}

/**
 * Salience Decay & Tier Transition (Hot -> Warm -> Cold, NEVER deletes memories).
 */
export function runSalienceDecayAndTiering(): { decayed: number; cooledToCold: number; warmedToWarm: number } {
  const nowMs = Date.now();
  let decayed = 0;
  let cooledToCold = 0;
  let warmedToWarm = 0;

  updateState((s) => {
    for (const m of s.memories) {
      if (m.tier === 'shared') continue;
      const lastMs = Date.parse(m.lastAccessedAt || m.createdAt);
      const ageDays = Math.max(0, (nowMs - lastMs) / (1000 * 60 * 60 * 24));
      const currentSalience = m.salience ?? m.importanceScore ?? 0.7;

      if (ageDays >= 1) {
        const nextSalience = Number(Math.max(0.15, currentSalience * Math.pow(0.96, Math.min(ageDays, 30))).toFixed(3));
        if (nextSalience !== currentSalience) {
          m.salience = nextSalience;
          decayed += 1;
        }
      }

      if ((m.tier ?? 'warm') === 'hot' && ageDays >= 7 && (m.salience ?? 0.7) < 0.65) {
        m.tier = 'warm';
        warmedToWarm += 1;
      } else if ((m.tier ?? 'warm') === 'warm' && ageDays >= 21 && (m.salience ?? 0.7) < 0.4) {
        m.tier = 'cold';
        cooledToCold += 1;
      }
    }
  });

  return { decayed, cooledToCold, warmedToWarm };
}

/**
 * PreCompact Hook: before long threads grow past threshold, distills key facts
 * into Hot persistent memory so context compaction never loses critical decisions.
 */
export function preCompactThreadMemory(threadId: string, maxUncompacted = 28): {
  compacted: boolean;
  savedMemoryId?: string;
} {
  const state = getState();
  const threadMsgs = state.messages.filter((m) => m.threadId === threadId && m.channel !== 'swarm_internal');
  const thread = state.threads.find((t) => t.id === threadId);
  const alreadyCompacted = thread?.compactedCount ?? 0;

  if (threadMsgs.length - alreadyCompacted < maxUncompacted) {
    return { compacted: false };
  }

  const sliceToCompact = threadMsgs.slice(alreadyCompacted, threadMsgs.length - 8);
  if (sliceToCompact.length === 0) return { compacted: false };

  const summaryLines = sliceToCompact
    .filter((m) => m.content.trim().length > 20)
    .slice(-10)
    .map((m) => `${m.senderName}: ${m.content.replace(/\s+/g, ' ').slice(0, 140)}`);

  const entry = addPersistentMemory({
    content: `PreCompact összefoglaló (${thread?.title || threadId}):\n${summaryLines.join('\n')}`,
    entity: `Kontextus (${thread?.title || 'Fő szál'})`,
    tags: ['precompact', 'decision', 'continuity'],
    links: ['Beszélgetés Folytonosság', thread?.title || 'Fő szál'],
    importanceScore: 0.88,
    tier: 'hot',
  });

  updateState((s) => {
    const t = s.threads.find((x) => x.id === threadId);
    if (t) t.compactedCount = threadMsgs.length - 8;
  });

  return { compacted: true, savedMemoryId: entry.id };
}

/**
 * Knowledge Graph builder across entities, #tags, and [[wikilinks]] for dashboard graph view.
 */
export function getMemoryGraphData(): {
  nodes: Array<{ id: string; label: string; kind: 'entity' | 'tag' | 'link'; tier?: MemoryTier; weight: number }>;
  edges: Array<{ source: string; target: string; kind: 'tagged' | 'wikilink' }>;
} {
  const state = getState();
  const nodeMap = new Map<
    string,
    { id: string; label: string; kind: 'entity' | 'tag' | 'link'; tier?: MemoryTier; weight: number }
  >();
  const edgeSet = new Set<string>();
  const edges: Array<{ source: string; target: string; kind: 'tagged' | 'wikilink' }> = [];

  for (const m of state.memories.slice(0, 40)) {
    const entityId = `entity:${m.entity}`;
    const prev = nodeMap.get(entityId);
    nodeMap.set(entityId, {
      id: entityId,
      label: m.entity,
      kind: 'entity',
      tier: m.tier ?? 'warm',
      weight: (prev?.weight ?? 0) + 1,
    });

    for (const rawTag of m.tags.slice(0, 4)) {
      const tag = rawTag.replace(/^#/, '');
      if (tag === 'novaswarm') continue;
      const tagId = `tag:${tag}`;
      const prevTag = nodeMap.get(tagId);
      nodeMap.set(tagId, {
        id: tagId,
        label: `#${tag}`,
        kind: 'tag',
        weight: (prevTag?.weight ?? 0) + 1,
      });
      const ek = `${entityId}->${tagId}`;
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek);
        edges.push({ source: entityId, target: tagId, kind: 'tagged' });
      }
    }

    for (const link of m.links.slice(0, 4)) {
      const linkId = `link:${link}`;
      const prevLink = nodeMap.get(linkId);
      nodeMap.set(linkId, {
        id: linkId,
        label: link,
        kind: 'link',
        weight: (prevLink?.weight ?? 0) + 1,
      });
      const ek = `${entityId}=>${linkId}`;
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek);
        edges.push({ source: entityId, target: linkId, kind: 'wikilink' });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()).slice(0, 45),
    edges,
  };
}

export function listObsidianNotes(vaultBaseDir = VAULT_DIR): Array<{ path: string; content: string }> {
  if (!fs.existsSync(vaultBaseDir)) return [];
  const results: Array<{ path: string; content: string }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        results.push({
          path: path.relative(vaultBaseDir, full),
          content: fs.readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(vaultBaseDir);
  return results;
}
