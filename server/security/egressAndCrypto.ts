import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { NotaryRecord } from '../../shared/types';
import { getState, updateState } from '../state/store';

function isBlockedMetadataOrUnspecifiedIp(ipRaw: string): boolean {
  let ip = ipRaw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (ip.startsWith('::ffff:')) {
    const rest = ip.slice('::ffff:'.length);
    if (rest.includes('.')) {
      ip = rest;
    } else {
      const hexParts = rest.split(':');
      if (hexParts.length === 2 && /^[0-9a-f]{1,4}$/.test(hexParts[0]) && /^[0-9a-f]{1,4}$/.test(hexParts[1])) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      }
    }
  }
  if (ip === '0.0.0.0' || ip === '::' || ip === '::0' || ip.startsWith('169.254.') || ip === '100.100.100.200') {
    return true;
  }
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  return false;
}

/**
 * M114: SSRF / Cloud Metadata Egress Guard
 * Protects against cloud metadata endpoint SSRF (169.254.169.254, metadata.google.internal)
 * while permitting explicit LAN hosts (192.168.x.x, 10.x.x.x, localhost) for local Home Assistant & Ollama.
 */
export function validateSafeOutboundUrl(
  rawUrl: string,
  _allowlist?: string[]
): { ok: boolean; safe: boolean; reason?: string } {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, safe: false, reason: `Tiltott protokoll: ${u.protocol}` };
    }
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'metadata.google.internal' ||
      host === 'metadata.goog' ||
      host === 'metadata.azure.internal' ||
      isBlockedMetadataOrUnspecifiedIp(host)
    ) {
      return { ok: false, safe: false, reason: `Blokkolt cloud metadata célpont (SSRF védelem): ${host}` };
    }
    return { ok: true, safe: true };
  } catch {
    return { ok: false, safe: false, reason: 'Érvénytelen URL formátum.' };
  }
}

export async function validateSafeOutboundUrlAsync(
  rawUrl: string,
  lookupFn: (hostname: string) => Promise<Array<{ address: string }>> = (h) => dns.lookup(h, { all: true })
): Promise<{ ok: boolean; safe: boolean; reason?: string }> {
  const syncCheck = validateSafeOutboundUrl(rawUrl);
  if (!syncCheck.ok) return syncCheck;
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (net.isIP(host) === 0 && host !== 'localhost') {
      const records = await lookupFn(host);
      for (const rec of records) {
        if (isBlockedMetadataOrUnspecifiedIp(rec.address)) {
          return {
            ok: false,
            safe: false,
            reason: `DNS rebinding / SSRF védelem: "${host}" tiltott címre (${rec.address}) mutat.`,
          };
        }
      }
    }
    return { ok: true, safe: true };
  } catch {
    return { ok: true, safe: true };
  }
}

/**
 * M119: Outbound secret leak redaction helper (when guardrails or secret redaction is active)
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bAIza[0-9A-Za-z\-_]{25,}\b/g,
  /\bsk-(proj-|ant-|or-v1-)?[0-9A-Za-z\-_]{20,}\b/g,
  /\bghp_[0-9A-Za-z]{25,}\b/g,
  /\b\d{8,12}:AA[0-9A-Za-z\-_]{25,}\b/g,
];

export function redactLeakedSecrets(text: string): { redacted: string; foundCount: number } {
  let out = text;
  let foundCount = 0;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m) => {
      foundCount += 1;
      return `${m.slice(0, 6)}***REDACTED***`;
    });
  }
  return { redacted: out, foundCount };
}

/**
 * M111: RFC 6238 TOTP generator & verifier (SHA-1, 30s step, 6 digits)
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function computeTotpCode(secretBase32: string, timeMs = Date.now()): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(timeMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secretBase32: string, candidate: string, timeMs = Date.now()): boolean {
  const clean = candidate.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const delta of [-30_000, 0, 30_000]) {
    if (computeTotpCode(secretBase32, timeMs + delta) === clean) {
      return true;
    }
  }
  return false;
}

/**
 * Ú150: SHA-256 Document Hash Notarizer
 */
export function notarizeDocumentHash(input: {
  fileName: string;
  contentBase64?: string;
  textContent?: string;
  note?: string;
}): NotaryRecord {
  const buf = input.contentBase64
    ? Buffer.from(input.contentBase64, 'base64')
    : Buffer.from(input.textContent || '', 'utf8');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const rec: NotaryRecord = {
    id: `notary-${crypto.randomUUID().slice(0, 8)}`,
    fileName: input.fileName.trim() || 'document.bin',
    sha256,
    sizeBytes: buf.length,
    note: input.note?.trim() || undefined,
    notarizedAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.notaryRecords.unshift(rec);
    if (s.notaryRecords.length > 500) s.notaryRecords.length = 500;
  });
  return rec;
}

export function verifyNotarizedHash(contentOrBase64: string, isBase64 = false): {
  sha256: string;
  matchedRecord: NotaryRecord | null;
} {
  const buf = isBase64 ? Buffer.from(contentOrBase64, 'base64') : Buffer.from(contentOrBase64, 'utf8');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const matchedRecord = getState().notaryRecords.find((r) => r.sha256 === sha256) || null;
  return { sha256, matchedRecord };
}
