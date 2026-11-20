import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { addPersistentMemoryAsync, searchMemories } from '../memory/vectorStore';
import { appendAuditLog, getState } from '../state/store';
import { cleanHtmlToMarkdown } from '../web/searchAndBrowser';

const RAG_DOCS_DIR = path.join(process.cwd(), 'rag-docs');

/**
 * Pure Node.js PDF text extractor (no native C++ dependencies):
 * Decompresses FlateDecode streams where present and extracts readable PDF text operators (Tj / TJ).
 */
export function extractTextFromPdfBuffer(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const pieces: string[] = [];

  const collectTextOps = (chunk: string) => {
    const literalRe = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")/g;
    let m: RegExpExecArray | null;
    while ((m = literalRe.exec(chunk)) !== null) {
      const clean = m[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\([()\\])/g, '$1');
      if (clean.trim()) pieces.push(clean);
    }
    const arrayRe = /\[([\s\S]*?)\]\s*TJ/g;
    while ((m = arrayRe.exec(chunk)) !== null) {
      const inner = m[1].match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
      if (inner) {
        pieces.push(
          inner
            .map((s) => s.slice(1, -1).replace(/\\([()\\])/g, '$1'))
            .join('')
        );
      }
    }
  };

  collectTextOps(raw);

  // Decompress compressed PDF streams
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let sm: RegExpExecArray | null;
  let guard = 0;
  while ((sm = streamRe.exec(raw)) !== null && guard < 80) {
    guard++;
    const streamBytes = Buffer.from(sm[1], 'latin1');
    try {
      const inflated = zlib.inflateSync(streamBytes).toString('latin1');
      collectTextOps(inflated);
    } catch {
      // Not FlateDecode or partial stream
    }
  }

  const joined = pieces.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length > 20) return joined;

  // Fallback printable ASCII runs
  return raw
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

export function chunkText(text: string, maxChars = 750, overlap = 100): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let idx = 0;
  while (idx < clean.length && chunks.length < 40) {
    const end = Math.min(clean.length, idx + maxChars);
    chunks.push(clean.slice(idx, end).trim());
    if (end >= clean.length) break;
    idx = Math.max(0, end - overlap);
  }
  return chunks.filter((c) => c.length > 10);
}

/**
 * Ú3: Document Ingestion & Local RAG pipeline (TXT, MD, CSV, JSON, HTML, PDF)
 */
export async function ingestDocumentToRag(params: {
  filename: string;
  mimeType?: string;
  dataBase64: string;
  tags?: string[];
}): Promise<{ filename: string; chunksCreated: number; memoryIds: string[]; preview: string }> {
  if (!fs.existsSync(RAG_DOCS_DIR)) {
    fs.mkdirSync(RAG_DOCS_DIR, { recursive: true });
  }
  const safeName = path.basename(params.filename).replace(/[^a-zA-Z0-9._-]/g, '_') || `doc-${Date.now()}.txt`;
  const buf = Buffer.from(params.dataBase64, 'base64');
  fs.writeFileSync(path.join(RAG_DOCS_DIR, safeName), buf);

  const lower = safeName.toLowerCase();
  let extractedText = '';
  if (lower.endsWith('.pdf') || params.mimeType === 'application/pdf') {
    extractedText = extractTextFromPdfBuffer(buf);
  } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    extractedText = cleanHtmlToMarkdown(buf.toString('utf8')).text;
  } else {
    extractedText = buf.toString('utf8');
  }

  const chunks = chunkText(extractedText, 750, 80);
  const memoryIds: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const entry = await addPersistentMemoryAsync({
      entity: `Dokumentum: ${safeName}`,
      content: `[Forrás: ${safeName} #${i + 1}/${chunks.length}]\n${chunks[i]}`,
      tags: Array.from(new Set([...(params.tags || []), 'rag', 'document', safeName])),
      links: ['Helyi RAG Tudástár', safeName],
      importanceScore: 0.85,
      tier: 'hot',
    });
    memoryIds.push(entry.id);
  }

  appendAuditLog({
    type: 'memory',
    sourceAgentId: 'rag-ingestor',
    sourceAgentName: 'Dokumentum RAG',
    message: `Dokumentum feldolgozva és indexelve: ${safeName} (${chunks.length} blokk)`,
    verifiedExecution: true,
  });

  return {
    filename: safeName,
    chunksCreated: chunks.length,
    memoryIds,
    preview: extractedText.slice(0, 400),
  };
}

export function listRagDocuments(): Array<{ name: string; sizeBytes: number; updatedAt: string }> {
  if (!fs.existsSync(RAG_DOCS_DIR)) return [];
  return fs
    .readdirSync(RAG_DOCS_DIR)
    .map((name) => {
      const st = fs.statSync(path.join(RAG_DOCS_DIR, name));
      return { name, sizeBytes: st.size, updatedAt: st.mtime.toISOString() };
    })
    .filter((x) => x.sizeBytes >= 0);
}

/**
 * Ú27: Offline Survival Knowledge Pack Searcher
 * Combines local memories, local docs, README, and optional Linux `man` pages without internet.
 */
export function searchOfflineKnowledgePack(query: string): {
  memoryHits: Array<{ entity: string; content: string; score: number }>;
  localDocHits: Array<{ file: string; excerpt: string }>;
  manPageExcerpt: string | null;
} {
  const q = query.trim();
  const memoryHits = searchMemories(q, 5).map((m) => ({
    entity: m.entity,
    content: m.content.slice(0, 320),
    score: m.score,
  }));

  const localDocHits: Array<{ file: string; excerpt: string }> = [];
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const scanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (/\.(md|txt|json|csv)$/i.test(entry.name)) {
        try {
          const txt = fs.readFileSync(full, 'utf8');
          const lower = txt.toLowerCase();
          if (tokens.some((tok) => lower.includes(tok))) {
            const firstTok = tokens.find((tok) => lower.includes(tok))!;
            const pos = Math.max(0, lower.indexOf(firstTok) - 80);
            localDocHits.push({
              file: path.relative(process.cwd(), full),
              excerpt: txt.slice(pos, pos + 280).replace(/\s+/g, ' ').trim(),
            });
          }
        } catch {
          // skip unreadable
        }
      }
      if (localDocHits.length >= 8) break;
    }
  };
  scanDir(RAG_DOCS_DIR);
  scanDir(path.join(process.cwd(), 'memory-vault'));

  let manPageExcerpt: string | null = null;
  if (tokens.length > 0 && /^[a-z0-9._-]+$/i.test(tokens[0])) {
    try {
      const out = execFileSync('man', ['-P', 'cat', tokens[0]], {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (out.trim()) {
        manPageExcerpt = out.replace(/.\x08/g, '').slice(0, 1800).trim();
      }
    } catch {
      manPageExcerpt = null;
    }
  }

  return { memoryHits, localDocHits, manPageExcerpt };
}

export function getOfflinePackStats(): {
  ragDocsCount: number;
  memoryCount: number;
  vaultFilesCount: number;
} {
  const vaultDir = path.join(process.cwd(), 'memory-vault');
  let vaultFilesCount = 0;
  if (fs.existsSync(vaultDir)) {
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith('.md')) vaultFilesCount++;
      }
    };
    walk(vaultDir);
  }
  return {
    ragDocsCount: listRagDocuments().length,
    memoryCount: getState().memories.length,
    vaultFilesCount,
  };
}
