import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MemoryEntry } from '../../shared/types';
import { appendAuditLog, getState, updateState } from '../state/store';

const VAULT_DIR = path.join(process.cwd(), 'memory-vault');

/**
 * Pure Node.js deterministic bag-of-n-grams embedding (64 dims) so semantic vector search
 * works immediately out of the box with zero Python, ChromaDB, or Qdrant dependencies (Section 4.1 & 14.1).
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
    // Word hash + character trigram hashes for fuzzy semantic recall
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
  return input
    .toLowerCase()
    .replace(/[^a-z0-9áéíóöőúüű_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'note';
}

/**
 * Writes an Obsidian-compatible Markdown note with YAML frontmatter, #tags, and [[wikilinks]] (Section 14.1).
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
  vaultBaseDir?: string;
}): MemoryEntry {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const tags = Array.from(new Set([...(params.tags ?? ['memory']), 'novaswarm']));
  const links = params.links ?? [];
  const embedding = computeLocalEmbedding(params.content);

  const entry: MemoryEntry = {
    id,
    createdAt,
    content: params.content,
    entity: params.entity,
    tags,
    links,
    importanceScore: params.importanceScore ?? 0.7,
    embedding,
  };

  entry.obsidianPath = writeObsidianNote(entry, params.vaultBaseDir);

  updateState((s) => {
    s.memories.unshift(entry);
  });

  appendAuditLog({
    type: 'memory',
    sourceAgentId: 'memory-core',
    sourceAgentName: 'Memória Mag',
    message: `Tartós memória rögzítve [${entry.entity}] (${tags.map((t) => `#${t}`).join(' ')})`,
  });

  return entry;
}

export function searchMemories(query: string, limit = 8): Array<MemoryEntry & { score: number }> {
  const state = getState();
  const qVec = computeLocalEmbedding(query);
  const qLower = query.toLowerCase();

  return state.memories
    .map((m) => {
      const vecScore = cosineSimilarity(qVec, m.embedding || []);
      const lexicalBoost = m.content.toLowerCase().includes(qLower) || m.entity.toLowerCase().includes(qLower) ? 0.35 : 0;
      const score = Number((vecScore + lexicalBoost).toFixed(4));
      return { ...m, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
