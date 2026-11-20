import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MemoryEntry, MemoryRelation, MemoryTier } from '../../shared/types';
import { computeOllamaEmbedding } from '../providers/router';
import { appendAuditLog, getState, updateState } from '../state/store';

const VAULT_DIR = path.join(process.cwd(), 'memory-vault');

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

/** M12: Lightweight entity-relation extraction (rule-based + wikilink synthesis) */
export function extractRelationsFromMemory(entity: string, content: string, links: string[]): MemoryRelation[] {
  const rels: MemoryRelation[] = [];
  const seen = new Set<string>();
  const addRel = (target: string, relation: string) => {
    const clean = target.trim();
    if (!clean || clean.toLowerCase() === entity.toLowerCase() || seen.has(`${clean}:${relation}`)) return;
    seen.add(`${clean}:${relation}`);
    rels.push({ target: clean.slice(0, 60), relation });
  };

  for (const l of links) {
    addRel(l, 'kapcsolódik');
  }

  const wikiRe = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wikiRe.exec(content)) !== null) {
    addRel(m[1], 'hivatkozik');
  }

  const depRe = /\b(uses|depends on|runs on|hosts|integrates|használja|függ|futtatja|kezeli)\s+([A-Z0-9][a-zA-Z0-9_.-]{2,30})/gi;
  while ((m = depRe.exec(content)) !== null) {
    addRel(m[2], m[1].toLowerCase());
  }

  return rels.slice(0, 8);
}

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

/** M11: Detect & resolve contradicting older memory on same entity */
const CONTRADICTION_MARKERS = /\b(már nem|nem |helyett|frissítve|megváltozott|törölve|kikapcsolva|lecserélve|no longer|instead|replaced|deprecated|changed to|disabled)\b/i;

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
  const relations = extractRelationsFromMemory(params.entity, params.content, links);

  let supersedesId: string | undefined;
  const current = getState();
  const hasMarker = CONTRADICTION_MARKERS.test(params.content);
  const candidates = current.memories.filter(
    (m) => !m.supersededBy && m.entity.toLowerCase() === params.entity.toLowerCase()
  );
  for (const prev of candidates) {
    const sim = cosineSimilarity(embedding, prev.embedding || []);
    if (sim > 0.72 || (hasMarker && sim > 0.45)) {
      supersedesId = prev.id;
      break;
    }
  }

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
    supersedesId,
    relations,
  };

  entry.obsidianPath = writeObsidianNote(entry, params.vaultBaseDir);

  updateState((s) => {
    if (supersedesId) {
      const oldRef = s.memories.find((m) => m.id === supersedesId);
      if (oldRef) {
        oldRef.supersededBy = entry.id;
        oldRef.tier = 'cold';
      }
    }
    s.memories.unshift(entry);
  });

  appendAuditLog({
    type: 'memory',
    sourceAgentId: params.agentId || 'memory-core',
    sourceAgentName: 'Memória Mag',
    message: supersedesId
      ? `Ellentmondás feloldva [${entry.entity}]: új tény (${entry.id.slice(0, 6)}) felülírta a régit (${supersedesId.slice(0, 6)}).`
      : `Tartós memória [${entry.tier?.toUpperCase()}] rögzítve [${entry.entity}] (${tags.map((t) => `#${t}`).join(' ')})`,
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
      const supersededPenalty = entry.supersededBy ? 0.55 : 1.0;
      const hybridScore = (rrf * 20 + Math.max(0, vecSim) * 0.6 + lexScore * 0.25) * (0.7 + salience * 0.3) * tBoost * supersededPenalty;
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

export function getMemoryGraphData(): {
  nodes: Array<{ id: string; label: string; kind: 'entity' | 'tag' | 'link'; tier?: MemoryTier; weight: number }>;
  edges: Array<{ source: string; target: string; kind: 'tagged' | 'wikilink' | 'relation'; label?: string }>;
} {
  const state = getState();
  const nodeMap = new Map<
    string,
    { id: string; label: string; kind: 'entity' | 'tag' | 'link'; tier?: MemoryTier; weight: number }
  >();
  const edgeSet = new Set<string>();
  const edges: Array<{ source: string; target: string; kind: 'tagged' | 'wikilink' | 'relation'; label?: string }> = [];

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

    for (const rel of (m.relations || []).slice(0, 4)) {
      const targetId = `link:${rel.target}`;
      const prevT = nodeMap.get(targetId);
      nodeMap.set(targetId, {
        id: targetId,
        label: rel.target,
        kind: 'link',
        weight: (prevT?.weight ?? 0) + 1,
      });
      const ek = `${entityId}~>${targetId}:${rel.relation}`;
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek);
        edges.push({ source: entityId, target: targetId, kind: 'relation', label: rel.relation });
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

/** Ú23: Safe Markdown Wiki CRUD inside memory-vault/ */
function resolveSafeVaultPath(relPath: string, vaultBaseDir = VAULT_DIR): string {
  if (!fs.existsSync(vaultBaseDir)) {
    fs.mkdirSync(vaultBaseDir, { recursive: true });
  }
  const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const withExt = cleanRel.endsWith('.md') ? cleanRel : `${cleanRel}.md`;
  const abs = path.resolve(vaultBaseDir, withExt);
  const baseResolved = path.resolve(vaultBaseDir);
  if (!abs.startsWith(baseResolved + path.sep)) {
    throw new Error('Érvénytelen vault útvonal (traversal tiltva).');
  }
  return abs;
}

export function readVaultNote(relPath: string, vaultBaseDir = VAULT_DIR): { path: string; content: string } {
  const abs = resolveSafeVaultPath(relPath, vaultBaseDir);
  if (!fs.existsSync(abs)) {
    throw new Error(`Wiki jegyzet nem található: ${relPath}`);
  }
  return {
    path: path.relative(vaultBaseDir, abs),
    content: fs.readFileSync(abs, 'utf8'),
  };
}

export function saveVaultNote(relPath: string, content: string, vaultBaseDir = VAULT_DIR): { path: string; content: string } {
  const abs = resolveSafeVaultPath(relPath, vaultBaseDir);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return {
    path: path.relative(vaultBaseDir, abs),
    content,
  };
}

export function deleteVaultNote(relPath: string, vaultBaseDir = VAULT_DIR): void {
  const abs = resolveSafeVaultPath(relPath, vaultBaseDir);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { force: true });
  }
}

/** M43: Memory Time Machine — restore an older superseded memory back to active HOT tier */
export function restoreSupersededMemory(memoryId: string): MemoryEntry {
  let restored: MemoryEntry | undefined;
  updateState((s) => {
    const target = s.memories.find((m) => m.id === memoryId);
    if (!target) throw new Error('Memória bejegyzés nem található.');
    const newerId = target.supersededBy;
    target.supersededBy = undefined;
    target.tier = 'hot';
    target.salience = 0.95;
    target.lastAccessedAt = new Date().toISOString();
    if (newerId) {
      const newerRef = s.memories.find((m) => m.id === newerId);
      if (newerRef && newerRef.supersedesId === target.id) {
        newerRef.tier = 'cold';
      }
    }
    restored = target;
  });
  if (!restored) throw new Error('Memória visszaállítása sikertelen.');
  appendAuditLog({
    type: 'memory',
    sourceAgentId: 'memory-time-machine',
    sourceAgentName: 'Memória Időgép',
    message: `Korábbi memória visszaállítva aktív HOT rétegre: [${restored.entity}] ${restored.content.slice(0, 80)}`,
    verifiedExecution: true,
  });
  return restored;
}

/** M47: Obsidian Vault Full-Text Search, Backlinks & Daily Note Generator */
export function searchObsidianVault(query: string, vaultBaseDir = VAULT_DIR): Array<{
  path: string;
  title: string;
  excerpt: string;
  matches: number;
}> {
  const notes = listObsidianNotes(vaultBaseDir);
  const q = query.trim().toLowerCase();
  if (!q) {
    return notes.slice(0, 30).map((n) => ({
      path: n.path,
      title: n.content.match(/^#\s+(.+)$/m)?.[1] || path.basename(n.path, '.md'),
      excerpt: n.content.replace(/^---[\s\S]*?---/, '').trim().slice(0, 180),
      matches: 1,
    }));
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: Array<{ path: string; title: string; excerpt: string; matches: number }> = [];
  for (const note of notes) {
    const lower = `${note.path}\n${note.content}`.toLowerCase();
    let count = 0;
    for (const tok of tokens) {
      if (lower.includes(tok)) count++;
    }
    if (count > 0) {
      const firstPos = Math.max(0, lower.indexOf(tokens[0]) - 60);
      hits.push({
        path: note.path,
        title: note.content.match(/^#\s+(.+)$/m)?.[1] || path.basename(note.path, '.md'),
        excerpt: note.content.slice(firstPos, firstPos + 200).replace(/\s+/g, ' ').trim(),
        matches: count,
      });
    }
  }
  return hits.sort((a, b) => b.matches - a.matches).slice(0, 30);
}

export function getVaultBacklinks(targetNotePath: string, vaultBaseDir = VAULT_DIR): Array<{
  sourcePath: string;
  context: string;
}> {
  const notes = listObsidianNotes(vaultBaseDir);
  const baseName = path.basename(targetNotePath, '.md').toLowerCase();
  const targetClean = targetNotePath.replace(/\.md$/i, '').toLowerCase();
  const backlinks: Array<{ sourcePath: string; context: string }> = [];

  for (const n of notes) {
    if (n.path === targetNotePath) continue;
    const wikiRe = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = wikiRe.exec(n.content)) !== null) {
      const linkVal = m[1].split('|')[0].trim().toLowerCase();
      if (linkVal === baseName || linkVal === targetClean || linkVal.includes(baseName)) {
        const start = Math.max(0, m.index - 40);
        backlinks.push({
          sourcePath: n.path,
          context: n.content.slice(start, start + 120).replace(/\s+/g, ' ').trim(),
        });
        break;
      }
    }
  }
  return backlinks;
}

export function ensureDailyObsidianNote(
  dateStr = new Date().toISOString().slice(0, 10),
  appendSection?: string,
  vaultBaseDir = VAULT_DIR
): { path: string; content: string } {
  const rel = `daily/${dateStr}.md`;
  const abs = resolveSafeVaultPath(rel, vaultBaseDir);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  let content = '';
  if (fs.existsSync(abs)) {
    content = fs.readFileSync(abs, 'utf8');
  } else {
    content = `---\ndate: ${dateStr}\ntags: [daily, second-brain]\n---\n\n# Napi Jegyzet — ${dateStr}\n\n[[Álmodási Ciklus]] · [[Rendszer Tudásbázis]]\n\n`;
  }
  if (appendSection?.trim()) {
    content = `${content.trimEnd()}\n\n${appendSection.trim()}\n`;
  }
  fs.writeFileSync(abs, content, 'utf8');
  return { path: path.relative(vaultBaseDir, abs), content };
}
