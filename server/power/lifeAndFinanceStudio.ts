import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BookmarkEntry,
  BudgetEnvelope,
  ClipboardHistoryItem,
  CrmContact,
  HomeInventoryItem,
  MealPlanEntry,
  PackageOrder,
  SharedPortalLink,
  VehicleMaintenanceItem,
} from '../../shared/types';
import { addSharedListItem } from './universalSuite';
import { appendAuditLog, getState, updateState } from '../state/store';

/** Ú83: Universal CSV/JSON Data Wrangler */
export function wrangleStructuredData(input: {
  raw: string;
  format: 'csv' | 'json';
  filterField?: string;
  filterValue?: string;
  groupBy?: string;
}): {
  ok: boolean;
  rowCount: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  groupedCounts?: Record<string, number>;
  numericStats?: Record<string, { min: number; max: number; avg: number; sum: number }>;
  error?: string;
} {
  try {
    let rows: Array<Record<string, unknown>> = [];
    if (input.format === 'json') {
      const parsed = JSON.parse(input.raw);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      const lines = input.raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return { ok: true, rowCount: 0, columns: [], rows: [] };
      const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
      const headers = lines[0].split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ''));
      for (const line of lines.slice(1)) {
        const vals = line.split(sep).map((v) => v.trim().replace(/^["']|["']$/g, ''));
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          const rawVal = vals[i] ?? '';
          const num = Number(rawVal);
          obj[h] = rawVal !== '' && Number.isFinite(num) ? num : rawVal;
        });
        rows.push(obj);
      }
    }

    if (input.filterField && input.filterValue) {
      const needle = input.filterValue.toLowerCase();
      rows = rows.filter((r) => String(r[input.filterField!] ?? '').toLowerCase().includes(needle));
    }

    const colSet = new Set<string>();
    for (const r of rows) Object.keys(r).forEach((k) => colSet.add(k));
    const columns = [...colSet];

    const groupedCounts: Record<string, number> = {};
    if (input.groupBy) {
      for (const r of rows) {
        const key = String(r[input.groupBy] ?? '(üres)');
        groupedCounts[key] = (groupedCounts[key] || 0) + 1;
      }
    }

    const numericStats: Record<string, { min: number; max: number; avg: number; sum: number }> = {};
    for (const col of columns) {
      const nums = rows.map((r) => Number(r[col])).filter((n) => Number.isFinite(n));
      if (nums.length > 0 && nums.length >= rows.length * 0.5) {
        const sum = nums.reduce((a, b) => a + b, 0);
        numericStats[col] = {
          min: Math.min(...nums),
          max: Math.max(...nums),
          sum: Number(sum.toFixed(2)),
          avg: Number((sum / nums.length).toFixed(2)),
        };
      }
    }

    return {
      ok: true,
      rowCount: rows.length,
      columns,
      rows: rows.slice(0, 100),
      groupedCounts: input.groupBy ? groupedCounts : undefined,
      numericStats,
    };
  } catch (err) {
    return {
      ok: false,
      rowCount: 0,
      columns: [],
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Ú131: Advanced SVG Chart Builder (bar / line / pie) */
export function generateChartSvg(params: {
  type: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  values: number[];
}): string {
  const safeVals = params.values.map((v) => (Number.isFinite(v) && v >= 0 ? v : 0));
  const safeLabels = params.labels.map((l) => String(l).replace(/[<>&"]/g, ''));
  const safeTitle = params.title.replace(/[<>&"]/g, '');
  const w = 540;
  const h = 280;

  if (params.type === 'pie') {
    const total = safeVals.reduce((a, b) => a + b, 0) || 1;
    const colors = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    let angle = 0;
    const cx = 140;
    const cy = 150;
    const r = 90;
    const paths = safeVals.map((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + slice);
      const y2 = cy + r * Math.sin(angle + slice);
      const large = slice > Math.PI ? 1 : 0;
      angle += slice;
      return `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${colors[i % colors.length]}" />`;
    });
    const legend = safeLabels.slice(0, 6).map(
      (lbl, i) =>
        `<rect x="275" y="${65 + i * 28}" width="12" height="12" fill="${colors[i % colors.length]}" rx="2"/><text x="295" y="${75 + i * 28}" font-size="12" fill="#334155">${lbl}: ${safeVals[i] ?? 0}</text>`
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f8fafc" rx="10"/><text x="20" y="30" font-size="16" font-weight="bold" fill="#0f172a">${safeTitle}</text>${paths.join('')}${legend.join('')}</svg>`;
  }

  const maxV = Math.max(...safeVals, 1);
  if (params.type === 'line') {
    const stepX = safeVals.length > 1 ? 440 / (safeVals.length - 1) : 440;
    const pts = safeVals.map((v, i) => `${50 + i * stepX},${225 - (v / maxV) * 160}`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f8fafc" rx="10"/><text x="20" y="30" font-size="16" font-weight="bold" fill="#0f172a">${safeTitle}</text><polyline fill="none" stroke="#4f46e5" stroke-width="3" points="${pts.join(' ')}" />${pts
      .map((p, i) => {
        const [x, y] = p.split(',');
        return `<circle cx="${x}" cy="${y}" r="4" fill="#4f46e5"/><text x="${x}" y="250" text-anchor="middle" font-size="11" fill="#475569">${safeLabels[i] ?? i}</text>`;
      })
      .join('')}</svg>`;
  }

  const barW = Math.max(16, Math.min(56, Math.floor(420 / Math.max(1, safeVals.length)) - 10));
  const bars = safeVals.map((v, i) => {
    const bh = Math.round((v / maxV) * 155);
    const x = 50 + i * (barW + 14);
    const y = 220 - bh;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="#4f46e5" rx="4"/><text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#0f172a">${v}</text><text x="${x + barW / 2}" y="245" text-anchor="middle" font-size="11" fill="#475569">${(safeLabels[i] ?? '').slice(0, 8)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f8fafc" rx="10"/><text x="20" y="30" font-size="16" font-weight="bold" fill="#0f172a">${safeTitle}</text>${bars.join('')}</svg>`;
}

/** Ú87: Pure Binary JPEG/PNG EXIF & Metadata Stripper */
export function stripImageMetadataBase64(dataBase64: string): {
  ok: boolean;
  format: 'jpeg' | 'png' | 'unknown';
  originalBytes: number;
  strippedBytes: number;
  removedBytes: number;
  cleanedBase64: string;
} {
  const cleanB64 = dataBase64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(cleanB64, 'base64');

  // JPEG: SOI (FF D8), remove APP1..APP15 (FF E1..FF EF) and COM (FF FE)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    const chunks: Buffer[] = [buf.subarray(0, 2)];
    let offset = 2;
    while (offset + 3 < buf.length) {
      if (buf[offset] !== 0xff) {
        chunks.push(buf.subarray(offset));
        break;
      }
      const marker = buf[offset + 1];
      if (marker === 0xda) {
        // Start of Scan: copy rest verbatim
        chunks.push(buf.subarray(offset));
        break;
      }
      if (marker === 0xd9) {
        chunks.push(buf.subarray(offset, offset + 2));
        break;
      }
      const segLen = buf.readUInt16BE(offset + 2);
      const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
      if (!isMetadata) {
        chunks.push(buf.subarray(offset, offset + 2 + segLen));
      }
      offset += 2 + segLen;
    }
    const out = Buffer.concat(chunks);
    return {
      ok: true,
      format: 'jpeg',
      originalBytes: buf.length,
      strippedBytes: out.length,
      removedBytes: Math.max(0, buf.length - out.length),
      cleanedBase64: out.toString('base64'),
    };
  }

  // PNG: Signature (89 50 4E 47 0D 0A 1A 0A), strip tEXt, zTXt, iTXt, eXIf chunks
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const chunks: Buffer[] = [buf.subarray(0, 8)];
    let offset = 8;
    const stripTypes = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'pHYs']);
    while (offset + 12 <= buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
      const totalChunk = 12 + len;
      if (offset + totalChunk > buf.length) break;
      if (!stripTypes.has(type)) {
        chunks.push(buf.subarray(offset, offset + totalChunk));
      }
      offset += totalChunk;
      if (type === 'IEND') break;
    }
    const out = Buffer.concat(chunks);
    return {
      ok: true,
      format: 'png',
      originalBytes: buf.length,
      strippedBytes: out.length,
      removedBytes: Math.max(0, buf.length - out.length),
      cleanedBase64: out.toString('base64'),
    };
  }

  return {
    ok: false,
    format: 'unknown',
    originalBytes: buf.length,
    strippedBytes: buf.length,
    removedBytes: 0,
    cleanedBase64: cleanB64,
  };
}

/** Ú88: Pure TypeScript QR Code SVG Generator (Deterministic Byte-mode QR-like / Standard V2-L Matrix) */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsComputeEcc(data: Uint8Array, ecCount: number): Uint8Array {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < poly.length; j++) {
        res[i + j] ^= gfMul(poly[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

export function generateQrSvg(text: string, size = 220): string {
  // Version 3-L (29x29 modules, capacity 53 UTF-8 bytes)
  const payloadBytes = Buffer.from(text.slice(0, 52), 'utf8');
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(payloadBytes.length, 8);
  for (const b of payloadBytes) pushBits(b, 8);
  pushBits(0, 4); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const dataCodewords = new Uint8Array(55); // V3-L = 55 data codewords
  for (let i = 0; i < 55; i++) {
    if (i * 8 < bits.length) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i * 8 + b] || 0);
      dataCodewords[i] = byte;
    } else {
      dataCodewords[i] = (i - Math.floor(bits.length / 8)) % 2 === 0 ? 0xec : 0x11;
    }
  }
  const ecc = rsComputeEcc(dataCodewords, 15);
  const allBits: number[] = [];
  for (const cw of dataCodewords) for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  for (const cw of ecc) for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);

  const N = 29;
  const grid = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
  const reserved = Array.from({ length: N }, () => new Uint8Array(N));

  const placeFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const on =
          r >= 0 &&
          r <= 6 &&
          c >= 0 &&
          c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        grid[rr][cc] = on ? 1 : 0;
        reserved[rr][cc] = 1;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Alignment pattern at (22, 22) for V3
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = 22 + r;
      const cc = 22 + c;
      const on = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      grid[rr][cc] = on ? 1 : 0;
      reserved[rr][cc] = 1;
    }
  }
  for (let i = 8; i < N - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    reserved[6][i] = 1;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
    reserved[i][6] = 1;
  }
  grid[N - 8][8] = 1;
  reserved[N - 8][8] = 1;

  // Format info strip reservation & Version 3-L Mask 0 (111011111000100)
  const fmtBits = '111011111000100'.split('').map(Number);
  for (let i = 0; i < 15; i++) {
    const bit = fmtBits[i];
    if (i < 6) {
      grid[8][i] = bit;
      reserved[8][i] = 1;
    } else if (i < 8) {
      grid[8][i + 1] = bit;
      reserved[8][i + 1] = 1;
    } else {
      grid[N - 15 + i][8] = bit;
      reserved[N - 15 + i][8] = 1;
    }
    if (i < 8) {
      grid[8][N - 1 - i] = bit;
      reserved[8][N - 1 - i] = 1;
    } else if (i < 9) {
      grid[7][8] = bit;
      reserved[7][8] = 1;
    } else {
      grid[14 - i][8] = bit;
      reserved[14 - i][8] = 1;
    }
  }

  let bitIdx = 0;
  let up = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < N; step++) {
      const r = up ? N - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (!reserved[r][c]) {
          const dataBit = allBits[bitIdx++] ?? 0;
          const mask = (r + c) % 2 === 0 ? 1 : 0;
          grid[r][c] = dataBit ^ mask;
        }
      }
    }
    up = !up;
  }

  const rects: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c] === 1) {
        rects.push(`<rect x="${c + 2}" y="${r + 2}" width="1" height="1" fill="#0f172a"/>`);
      }
    }
  }
  const view = N + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}" shape-rendering="crispEdges"><rect width="${view}" height="${view}" fill="#ffffff"/>${rects.join('')}</svg>`;
}

/** Ú89: Batch File Renamer (Dry-Run + Apply) inside safe working dir */
export function batchRenameFiles(params: {
  directory: string;
  findRegex: string;
  replaceWith: string;
  apply?: boolean;
}): { ok: boolean; previews: Array<{ from: string; to: string }>; appliedCount: number; error?: string } {
  const dir = path.resolve(process.cwd(), params.directory.replace(/^\/+/, ''));
  if (!dir.startsWith(process.cwd()) || !fs.existsSync(dir)) {
    return { ok: false, previews: [], appliedCount: 0, error: 'Érvénytelen vagy nem létező könyvtár.' };
  }
  const rx = new RegExp(params.findRegex, 'g');
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
  const previews: Array<{ from: string; to: string }> = [];
  let appliedCount = 0;

  for (const e of entries) {
    const nextName = e.name.replace(rx, params.replaceWith);
    if (nextName && nextName !== e.name && !nextName.includes('/') && !nextName.includes('..')) {
      previews.push({ from: e.name, to: nextName });
      if (params.apply) {
        fs.renameSync(path.join(dir, e.name), path.join(dir, nextName));
        appliedCount += 1;
      }
    }
  }
  return { ok: true, previews, appliedCount };
}

/** Ú90: Smart Text Transformer + Clipboard History */
export function transformTextUtility(params: {
  mode: 'json_pretty' | 'json_minify' | 'sql_format' | 'base64_encode' | 'base64_decode' | 'jwt_decode' | 'sha256';
  input: string;
  saveToClipboard?: boolean;
}): { ok: boolean; output: string; clipItem?: ClipboardHistoryItem } {
  let output = '';
  try {
    switch (params.mode) {
      case 'json_pretty':
        output = JSON.stringify(JSON.parse(params.input), null, 2);
        break;
      case 'json_minify':
        output = JSON.stringify(JSON.parse(params.input));
        break;
      case 'sql_format':
        output = params.input
          .replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|INNER JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|INSERT INTO|VALUES|UPDATE|SET)\b/gi, '\n$1')
          .trim();
        break;
      case 'base64_encode':
        output = Buffer.from(params.input, 'utf8').toString('base64');
        break;
      case 'base64_decode':
        output = Buffer.from(params.input.trim(), 'base64').toString('utf8');
        break;
      case 'jwt_decode': {
        const parts = params.input.trim().split('.');
        if (parts.length < 2) throw new Error('Érvénytelen JWT token.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        output = JSON.stringify({ header, payload }, null, 2);
        break;
      }
      case 'sha256':
        output = crypto.createHash('sha256').update(params.input).digest('hex');
        break;
    }

    let clipItem: ClipboardHistoryItem | undefined;
    if (params.saveToClipboard) {
      clipItem = {
        id: `clip-${crypto.randomUUID().slice(0, 6)}`,
        content: output,
        kind: params.mode.startsWith('json') ? 'json' : 'code',
        createdAt: new Date().toISOString(),
      };
      updateState((s) => {
        s.clipboardHistory.unshift(clipItem!);
        if (s.clipboardHistory.length > 50) s.clipboardHistory = s.clipboardHistory.slice(0, 50);
      });
    }
    return { ok: true, output, clipItem };
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}

/** Ú91: Personal CRM */
export function addCrmContact(input: Partial<CrmContact> & { name: string }): CrmContact {
  const c: CrmContact = {
    id: `crm-${crypto.randomUUID().slice(0, 6)}`,
    name: input.name.trim(),
    relation: input.relation?.trim() || 'Partner',
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    birthday: input.birthday?.trim() || undefined,
    lastContactedAt: input.lastContactedAt || new Date().toISOString(),
    nextFollowUpAt: input.nextFollowUpAt || undefined,
    notes: input.notes?.trim() || undefined,
  };
  updateState((s) => {
    s.crmContacts.unshift(c);
  });
  return c;
}

/** Ú99: Package Tracker */
export function addPackageOrder(input: { trackingNumber: string; carrier: string; title: string }): PackageOrder {
  const order: PackageOrder = {
    id: `pkg-${crypto.randomUUID().slice(0, 6)}`,
    trackingNumber: input.trackingNumber.trim(),
    carrier: input.carrier.trim() || 'GLS / MPL / Foxpost',
    title: input.title.trim(),
    status: 'ordered',
    updatedAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.packages.unshift(order);
  });
  return order;
}

/** Ú100: Shared Portal Link */
export function createSharedPortalLink(input: {
  title: string;
  resourceType: SharedPortalLink['resourceType'];
  resourceId: string;
  ttlHours?: number;
}): SharedPortalLink {
  const token = crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  const item: SharedPortalLink = {
    id: `shr-${crypto.randomUUID().slice(0, 6)}`,
    token,
    title: input.title.trim(),
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    expiresAt: input.ttlHours ? new Date(now + input.ttlHours * 3600_000).toISOString() : undefined,
    createdAt: new Date(now).toISOString(),
    views: 0,
  };
  updateState((s) => {
    s.sharedLinks.unshift(item);
  });
  return item;
}

export function resolveSharedPortalResource(token: string): {
  link: SharedPortalLink;
  payload: unknown;
} | null {
  const s = getState();
  const link = s.sharedLinks.find((l) => l.token === token);
  if (!link) return null;
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) return null;

  updateState((draft) => {
    const ref = draft.sharedLinks.find((l) => l.id === link.id);
    if (ref) ref.views += 1;
  });

  if (link.resourceType === 'artifact') {
    return { link, payload: s.artifacts.find((a) => a.id === link.resourceId) || null };
  }
  if (link.resourceType === 'report') {
    return { link, payload: s.researchReports.find((r) => r.id === link.resourceId) || null };
  }
  return { link, payload: s.sharedLists.find((l) => l.id === link.resourceId) || s.sharedLists[0] || null };
}

/** Ú106: Academic Paper Search (CrossRef / arXiv API) */
export async function searchAcademicPapers(query: string): Promise<{
  ok: boolean;
  papers: Array<{ title: string; authors: string; year: string; url: string; source: string }>;
  error?: string;
}> {
  try {
    const res = await fetch(
      `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=6`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      message?: {
        items?: Array<{
          title?: string[];
          author?: Array<{ given?: string; family?: string }>;
          URL?: string;
          published?: { 'date-parts'?: number[][] };
        }>;
      };
    };
    const papers = (data.message?.items || []).map((it) => ({
      title: it.title?.[0] || 'Cím nélküli publikáció',
      authors:
        (it.author || [])
          .slice(0, 3)
          .map((a) => `${a.given || ''} ${a.family || ''}`.trim())
          .join(', ') || 'Ismeretlen szerző',
      year: String(it.published?.['date-parts']?.[0]?.[0] || 'N/A'),
      url: it.URL || '',
      source: 'CrossRef',
    }));
    return { ok: true, papers };
  } catch (err) {
    return { ok: false, papers: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Ú107: Read-It-Later Bookmark Archiver */
export async function archiveBookmarkUrl(url: string, tags: string[] = []): Promise<BookmarkEntry> {
  let title = url;
  let archivedExcerpt = '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const html = await res.text();
    title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || url;
    archivedExcerpt = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
  } catch {
    archivedExcerpt = 'Offline mentett hivatkozás (tartalom letöltése sikertelen).';
  }
  const entry: BookmarkEntry = {
    id: `bm-${crypto.randomUUID().slice(0, 6)}`,
    url: url.trim(),
    title,
    tags,
    archivedExcerpt,
    read: false,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.bookmarks.unshift(entry);
  });
  return entry;
}

/** Ú113-Ú115: Home Inventory, Meal Planner -> /lista Sync, Vehicle Maintenance */
export function addHomeInventoryItem(input: { name: string; quantity: number; unit: string; category?: string }): HomeInventoryItem {
  const item: HomeInventoryItem = {
    id: `inv-${crypto.randomUUID().slice(0, 6)}`,
    name: input.name.trim(),
    quantity: Number(input.quantity) || 1,
    unit: input.unit.trim() || 'db',
    category: input.category?.trim() || 'Kamra',
    updatedAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.homeInventory.unshift(item);
  });
  return item;
}

export function addMealAndSyncShoppingList(input: {
  day: string;
  mealName: string;
  ingredients: string[];
}): { meal: MealPlanEntry; addedItems: number } {
  const meal: MealPlanEntry = {
    id: `meal-${crypto.randomUUID().slice(0, 6)}`,
    day: input.day.trim(),
    mealName: input.mealName.trim(),
    ingredients: input.ingredients.map((i) => i.trim()).filter(Boolean),
  };
  updateState((s) => {
    s.mealPlan.unshift(meal);
  });
  const pantryNames = new Set(getState().homeInventory.filter((i) => i.quantity > 0).map((i) => i.name.toLowerCase()));
  let addedItems = 0;
  for (const ing of meal.ingredients) {
    if (!pantryNames.has(ing.toLowerCase())) {
      addSharedListItem('Bevásárlólista', ing, `Étrend (${meal.mealName})`);
      addedItems += 1;
    }
  }
  return { meal, addedItems };
}

export function addVehicleMaintenanceItem(input: {
  vehicleOrAsset: string;
  task: string;
  dueAtDate?: string;
  dueAtKm?: number;
}): VehicleMaintenanceItem {
  const item: VehicleMaintenanceItem = {
    id: `veh-${crypto.randomUUID().slice(0, 6)}`,
    vehicleOrAsset: input.vehicleOrAsset.trim(),
    task: input.task.trim(),
    dueAtDate: input.dueAtDate,
    dueAtKm: input.dueAtKm,
    done: false,
  };
  updateState((s) => {
    s.vehicleMaintenance.unshift(item);
  });
  return item;
}

/** Ú136: Color Palette & WCAG 2.1 Contrast Ratio Checker */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const ch = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function checkWcagContrast(fgHex: string, bgHex: string): {
  fg: string;
  bg: string;
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
} {
  const l1 = relLuminance(hexToRgb(fgHex));
  const l2 = relLuminance(hexToRgb(bgHex));
  const ratio = Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
  return {
    fg: fgHex,
    bg: bgHex,
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3.0,
    aaaNormal: ratio >= 7.0,
  };
}

/** Ú141-Ú147: Personal Finance, VAT/Compound Calc & Envelope Budgets */
export function computeVatAndCompound(params: {
  netAmount?: number;
  vatRatePercent?: number;
  principal?: number;
  annualYieldPercent?: number;
  months?: number;
  monthlyContribution?: number;
}): {
  vat: { net: number; vatAmount: number; gross: number; ratePercent: number };
  compound: { futureValue: number; totalInvested: number; totalInterest: number; months: number };
} {
  const net = Number(params.netAmount ?? 100000);
  const rate = Number(params.vatRatePercent ?? 27);
  const vatAmount = Number(((net * rate) / 100).toFixed(2));
  const gross = Number((net + vatAmount).toFixed(2));

  const principal = Number(params.principal ?? 500000);
  const annualYield = Number(params.annualYieldPercent ?? 6.5);
  const months = Math.max(1, Math.min(480, Math.round(Number(params.months ?? 36))));
  const monthlyContrib = Number(params.monthlyContribution ?? 50000);
  const rMonthly = annualYield / 100 / 12;

  let balance = principal;
  for (let m = 0; m < months; m++) {
    balance = balance * (1 + rMonthly) + monthlyContrib;
  }
  const totalInvested = principal + monthlyContrib * months;
  return {
    vat: { net, vatAmount, gross, ratePercent: rate },
    compound: {
      futureValue: Math.round(balance),
      totalInvested: Math.round(totalInvested),
      totalInterest: Math.round(balance - totalInvested),
      months,
    },
  };
}

export function upsertBudgetEnvelope(input: { category: string; monthlyLimit: number; spent?: number }): BudgetEnvelope {
  let saved!: BudgetEnvelope;
  updateState((s) => {
    const existing = s.budgetEnvelopes.find((e) => e.category.toLowerCase() === input.category.trim().toLowerCase());
    if (existing) {
      existing.monthlyLimit = Number(input.monthlyLimit) || 0;
      if (typeof input.spent === 'number') existing.spent = input.spent;
      saved = existing;
    } else {
      saved = {
        id: `env-${crypto.randomUUID().slice(0, 6)}`,
        category: input.category.trim(),
        monthlyLimit: Number(input.monthlyLimit) || 0,
        spent: Number(input.spent ?? 0),
        currency: s.settings.defaultCurrency || 'HUF',
      };
      s.budgetEnvelopes.push(saved);
    }
  });
  return saved;
}

/** Ú147: Live Currency Exchange Converter (EKB / Frankfurter API with graceful fallback) */
export async function convertCurrencyLive(amount: number, from: string, to: string): Promise<{
  ok: boolean;
  amount: number;
  from: string;
  to: string;
  converted: number;
  rate: number;
  source: 'frankfurter_ecb' | 'fallback_reference';
  date: string;
}> {
  const f = from.toUpperCase().trim() || 'EUR';
  const t = to.toUpperCase().trim() || 'HUF';
  if (f === t) {
    return {
      ok: true,
      amount,
      from: f,
      to: t,
      converted: amount,
      rate: 1,
      source: 'frankfurter_ecb',
      date: new Date().toISOString().slice(0, 10),
    };
  }
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
    const converted = data.rates?.[t];
    if (typeof converted !== 'number') throw new Error('Nincs árfolyam ehhez a devizapárhoz');
    return {
      ok: true,
      amount,
      from: f,
      to: t,
      converted: Number(converted.toFixed(2)),
      rate: Number((converted / Math.max(1e-9, amount)).toFixed(4)),
      source: 'frankfurter_ecb',
      date: data.date || new Date().toISOString().slice(0, 10),
    };
  } catch {
    const refRatesPerEur: Record<string, number> = { EUR: 1, HUF: 400, USD: 1.08, GBP: 0.85, CHF: 0.94 };
    const eurVal = amount / (refRatesPerEur[f] || 1);
    const converted = eurVal * (refRatesPerEur[t] || 1);
    return {
      ok: true,
      amount,
      from: f,
      to: t,
      converted: Number(converted.toFixed(2)),
      rate: Number((converted / Math.max(1e-9, amount)).toFixed(4)),
      source: 'fallback_reference',
      date: new Date().toISOString().slice(0, 10),
    };
  }
}

export function logNotaryAudit(filename: string, sha256: string) {
  appendAuditLog({
    type: 'security',
    sourceAgentId: 'notary',
    sourceAgentName: 'Dokumentum Közjegyző',
    message: `SHA-256 közjegyzői lenyomat rögzítve: ${filename} (${sha256.slice(0, 16)}...)`,
    verifiedExecution: true,
  });
}
