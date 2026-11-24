import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import type http from 'node:http';
import {
  appendAuditLog,
  getState,
  getWebSessionSecret,
  hasWebAuthPassword,
  verifyWebAuthPassword,
} from '../state/store';
import { constantTimeEqual } from './egressAndCrypto';

export const WEB_SESSION_COOKIE_NAME = 'novaswarm_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SETUP_LOG_FILENAME = '.novaswarm-setup.log';

interface LoginAttemptRecord {
  failures: number;
  lockedUntilMs: number;
  lastAttemptMs: number;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();
const MAX_LOGIN_TRACKED_IPS = 2000;
const BASE_LOCK_MS = 60_000; // 1 minute after 5 failed attempts
const MAX_LOCK_MS = 60 * 60_000; // cap at 60 minutes

interface OneTimeSetupState {
  code: string;
  digestHex: string;
  used: boolean;
  createdAt: string;
}

let activeSetupCode: OneTimeSetupState | null = null;

function getSetupLogPath(): string {
  return process.env.NOVASWARM_SETUP_LOG_PATH?.trim() || path.join(process.cwd(), SETUP_LOG_FILENAME);
}

export function normalizeClientIp(ip?: string): string {
  if (!ip) return 'unknown';
  const clean = ip.replace(/^::ffff:/i, '').trim().toLowerCase();
  if (clean === '::1') return '127.0.0.1';
  return clean || 'unknown';
}

export function extractClientIp(req: Pick<express.Request, 'ip' | 'socket'>): string {
  return normalizeClientIp(req.ip || req.socket?.remoteAddress);
}

export function checkLoginRateLimit(
  ip: string,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSeconds: number; failures: number } {
  const key = normalizeClientIp(ip);
  const rec = loginAttempts.get(key);
  if (!rec) return { allowed: true, retryAfterSeconds: 0, failures: 0 };
  if (rec.lockedUntilMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((rec.lockedUntilMs - nowMs) / 1000)),
      failures: rec.failures,
    };
  }
  return { allowed: true, retryAfterSeconds: 0, failures: rec.failures };
}

export function recordLoginFailure(
  ip: string,
  nowMs = Date.now(),
  reason = 'Hibás operátori jelszó'
): { failures: number; lockedUntilMs: number; retryAfterSeconds: number } {
  const key = normalizeClientIp(ip);
  if (!loginAttempts.has(key) && loginAttempts.size >= MAX_LOGIN_TRACKED_IPS) {
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey) loginAttempts.delete(oldestKey);
  }
  const prev = loginAttempts.get(key);
  const failures = (prev?.failures || 0) + 1;
  let lockedUntilMs = prev?.lockedUntilMs || 0;
  let retryAfterSeconds = 0;
  if (failures >= 5) {
    const exp = Math.min(10, failures - 5);
    const lockMs = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * Math.pow(2, exp));
    lockedUntilMs = nowMs + lockMs;
    retryAfterSeconds = Math.ceil(lockMs / 1000);
  }
  loginAttempts.set(key, { failures, lockedUntilMs, lastAttemptMs: nowMs });

  appendAuditLog({
    type: 'security',
    sourceAgentId: 'web-auth',
    sourceAgentName: 'Web Hitelesítés',
    message:
      failures >= 5
        ? `Sikertelen belépési kísérlet (#${failures}, IP: ${key}) — exponenciális zár aktiválva (${retryAfterSeconds} mp). Ok: ${reason}`
        : `Sikertelen belépési kísérlet (#${failures}, IP: ${key}). Ok: ${reason}`,
    verifiedExecution: true,
    metadata: { ip: key, failures, retryAfterSeconds },
  });

  return { failures, lockedUntilMs, retryAfterSeconds };
}

export function clearLoginFailures(ip: string): void {
  loginAttempts.delete(normalizeClientIp(ip));
}

export function ensureOneTimeSetupCode(): string | null {
  if (hasWebAuthPassword()) {
    return null;
  }
  if (activeSetupCode && !activeSetupCode.used) {
    return activeSetupCode.code;
  }
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  const digestHex = crypto.createHash('sha256').update(formatted).digest('hex');
  const createdAt = new Date().toISOString();
  activeSetupCode = { code: formatted, digestHex, used: false, createdAt };

  try {
    const logPath = getSetupLogPath();
    fs.writeFileSync(
      logPath,
      `[${createdAt}] NovaSwarm Egyszeri Telepítési Setup-Kód: ${formatted}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
  } catch {
    // non-fatal if filesystem is read-only
  }

  console.info(
    `[NovaSwarm BIZTONSÁG] Első telepítési egyszeri Setup-Kód (mentve: ${SETUP_LOG_FILENAME}): ${formatted}`
  );
  return formatted;
}

export function getActiveOneTimeSetupCodeForTests(): string | null {
  if (hasWebAuthPassword()) return null;
  return activeSetupCode && !activeSetupCode.used ? activeSetupCode.code : null;
}

export function verifyOneTimeSetupCode(candidate?: string): boolean {
  if (!activeSetupCode) {
    ensureOneTimeSetupCode();
  }
  if (!activeSetupCode || activeSetupCode.used) {
    return false;
  }
  const normalized = (candidate || '').trim().toUpperCase();
  if (!normalized) {
    return false;
  }
  const candidateDigestHex = crypto.createHash('sha256').update(normalized).digest('hex');
  return constantTimeEqual(candidateDigestHex, activeSetupCode.digestHex);
}

export function consumeOneTimeSetupCode(): void {
  if (!activeSetupCode) return;
  activeSetupCode.used = true;
  activeSetupCode.code = '';
  try {
    const logPath = getSetupLogPath();
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(
        logPath,
        `[${new Date().toISOString()}] NovaSwarm Setup-Kód sikeresen felhasználva és érvénytelenítve.\n`,
        { encoding: 'utf8', mode: 0o600 }
      );
    }
  } catch {
    // ignore cleanup failure
  }
}

export function verifyAndConsumeOneTimeSetupCode(candidate?: string): boolean {
  if (!verifyOneTimeSetupCode(candidate)) {
    return false;
  }
  consumeOneTimeSetupCode();
  return true;
}

export function resetAuthSecurityStateForTests(): void {
  loginAttempts.clear();
  activeSetupCode = null;
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function issueSessionToken(ttlMs = SESSION_TTL_MS): string {
  const secret = getWebSessionSecret();
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'operator',
      iat: Date.now(),
      exp: Date.now() + ttlMs,
      nonce: crypto.randomBytes(8).toString('hex'),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token?: string): boolean {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const secret = getWebSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
      sub?: string;
    };
    if (decoded.sub !== 'operator') return false;
    if (typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeLoopbackHost(host: string): string {
  const clean = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1') return 'loopback';
  return clean;
}

export function isLoopbackIp(ip?: string): boolean {
  if (!ip) return false;
  const clean = ip.replace(/^::ffff:/i, '').trim().toLowerCase();
  return clean === '127.0.0.1' || clean === '::1' || clean === 'localhost';
}

function isPrivateOrLocalIpAddress(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '').split('%')[0].trim().toLowerCase();
  if (!clean) return false;
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;

  // Check RFC1918 & loopback IPv4 ranges
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = Number(ipv4Match[1]);
    const o2 = Number(ipv4Match[2]);
    const o3 = Number(ipv4Match[3]);
    const o4 = Number(ipv4Match[4]);
    if ([o1, o2, o3, o4].some((n) => n < 0 || n > 255)) return false;
    if (o1 === 127 || o1 === 10) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  }

  // IPv6 ULA (fc00::/7) and link-local (fe80::/10)
  if (clean.includes(':')) {
    if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) {
      return true;
    }
  }

  // Check host's actual network interfaces (LAN / Tailscale / WireGuard local IPs)
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const info of entries) {
        const addr = info.address.replace(/^::ffff:/i, '').split('%')[0].toLowerCase();
        if (addr === clean) return true;
      }
    }
  } catch {
    // ignore interface enumeration error
  }

  return false;
}

function parseHostHeader(hostHeader?: string): { hostLower: string; hostnameLower: string } | null {
  if (!hostHeader || typeof hostHeader !== 'string') return null;
  const trimmed = hostHeader.trim();
  if (!trimmed || /[\s\\/?#@]/.test(trimmed)) return null;
  try {
    const parsed = new URL(`http://${trimmed}`);
    if (parsed.username || parsed.password) return null;
    const hostnameLower = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostnameLower) return null;
    return { hostLower: parsed.host.toLowerCase(), hostnameLower };
  } catch {
    return null;
  }
}

/**
 * DNS-Rebinding Host Allowlist:
 * Allows localhost, 127.0.0.1, ::1, private LAN IPs (10/8, 172.16/12, 192.168/16),
 * local NIC IPs, *.local mDNS names, APP_URL host, and NOVASWARM_ALLOWED_HOSTS.
 */
export function isAllowedHostHeader(hostHeader?: string): boolean {
  const parsed = parseHostHeader(hostHeader);
  if (!parsed) return false;
  const { hostLower, hostnameLower } = parsed;

  if (hostnameLower === 'localhost' || hostnameLower === '127.0.0.1' || hostnameLower === '::1') {
    return true;
  }
  if (isPrivateOrLocalIpAddress(hostnameLower)) {
    return true;
  }
  if (hostnameLower.endsWith('.local') && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/.test(hostnameLower)) {
    return true;
  }

  if (process.env.APP_URL) {
    try {
      const appHostname = new URL(process.env.APP_URL).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (appHostname && hostnameLower === appHostname) return true;
    } catch {
      // ignore invalid APP_URL
    }
  }

  if (process.env.NOVASWARM_ALLOWED_HOSTS) {
    const extras = process.env.NOVASWARM_ALLOWED_HOSTS.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (extras.includes(hostnameLower) || extras.includes(hostLower)) {
      return true;
    }
  }

  return false;
}

export function requireAllowedHostMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  if (!isAllowedHostHeader(hostHeader)) {
    res.status(403).json({
      error: 'Tiltott Host fejléc — DNS-rebinding védelem aktiválva.',
      code: 'DNS_REBINDING_HOST_BLOCKED',
    });
    return;
  }
  next();
}

export function verifySameOriginRequest(headers: {
  origin?: string;
  referer?: string;
  host?: string;
}): boolean {
  if (headers.host !== undefined && !isAllowedHostHeader(headers.host)) {
    return false;
  }
  const rawOrigin = headers.origin || headers.referer;
  if (!rawOrigin) {
    // Non-browser CLI/curl/internal test requests omit Origin/Referer,
    // still subject to the Host allowlist check above.
    return true;
  }
  try {
    const parsedOrigin = new URL(rawOrigin);
    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
      return false;
    }
    const reqHostHeader = (headers.host || '').trim();
    if (!reqHostHeader) {
      return normalizeLoopbackHost(parsedOrigin.hostname) === 'loopback';
    }
    const parsedReqUrl = new URL(`http://${reqHostHeader}`);
    if (
      normalizeLoopbackHost(parsedOrigin.hostname) === 'loopback' &&
      normalizeLoopbackHost(parsedReqUrl.hostname) === 'loopback'
    ) {
      // Check port match when loopback
      const oPort = parsedOrigin.port || (parsedOrigin.protocol === 'https:' ? '443' : '80');
      const rPort = parsedReqUrl.port || '80';
      return oPort === rPort;
    }
    if (parsedOrigin.host.toLowerCase() === parsedReqUrl.host.toLowerCase()) {
      return isAllowedHostHeader(parsedReqUrl.host);
    }
    if (process.env.APP_URL) {
      try {
        const appUrl = new URL(process.env.APP_URL);
        if (parsedOrigin.host.toLowerCase() === appUrl.host.toLowerCase()) return true;
      } catch {
        // ignore invalid APP_URL
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function hasValidHumanSessionCookie(headers: { cookie?: string }): boolean {
  if (!hasWebAuthPassword()) {
    return false;
  }
  const cookies = parseCookieHeader(headers.cookie);
  return verifySessionToken(cookies[WEB_SESSION_COOKIE_NAME]);
}

export function isRequestAuthorized(headers: { cookie?: string; authorization?: string }): boolean {
  const state = getState();
  if (!state.settings.webAuthEnabled) {
    return true;
  }
  return hasValidHumanSessionCookie(headers);
}

export function getWsUpgradeDecision(req: http.IncomingMessage): {
  authorized: boolean;
  statusCode: 401 | 403;
  reason?: string;
} {
  if (!isAllowedHostHeader(req.headers.host)) {
    return { authorized: false, statusCode: 403, reason: 'DNS_REBINDING_HOST_BLOCKED' };
  }
  if (!verifySameOriginRequest({
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers.host,
  })) {
    return { authorized: false, statusCode: 403, reason: 'CSRF_ORIGIN_MISMATCH' };
  }
  const state = getState();
  if (state.settings.webAuthEnabled && !hasWebAuthPassword()) {
    return isLoopbackIp(req.socket?.remoteAddress)
      ? { authorized: true, statusCode: 401 }
      : { authorized: false, statusCode: 401, reason: 'AUTH_SETUP_REQUIRED' };
  }
  if (!isRequestAuthorized({ cookie: req.headers.cookie })) {
    return { authorized: false, statusCode: 401, reason: 'WEB_AUTH_REQUIRED' };
  }
  return { authorized: true, statusCode: 401 };
}

export function isWsUpgradeAuthorized(req: http.IncomingMessage): boolean {
  return getWsUpgradeDecision(req).authorized;
}

export function authenticateOperatorPassword(password: string): string | null {
  if (!verifyWebAuthPassword(password)) return null;
  return issueSessionToken();
}

/**
 * Middleware protecting /api/* routes when settings.webAuthEnabled is true.
 * Enforces Host allowlist + Origin/Host same-origin check to block CSRF & DNS rebinding.
 * Leaves /api/auth/*, /api/channels/inbound/*, and /api/federation/* accessible so
 * login, Slack/Discord webhooks, and peer federation (authenticated via bearer tokens) continue functioning.
 */
export function requireWebAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  if (!isAllowedHostHeader(hostHeader)) {
    res.status(403).json({
      error: 'Tiltott Host fejléc — DNS-rebinding védelem aktiválva.',
      code: 'DNS_REBINDING_HOST_BLOCKED',
    });
    return;
  }

  const p = req.path || '';
  const isWebhookOrFed = p.startsWith('/channels/inbound/') || p.startsWith('/federation/');

  const method = (req.method || 'GET').toUpperCase();
  if (!isWebhookOrFed && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (!verifySameOriginRequest({
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      referer: typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
      host: hostHeader,
    })) {
      res.status(403).json({
        error: 'Érvénytelen Origin/Host fejléc (CSRF / DNS-rebinding védelem).',
        code: 'CSRF_ORIGIN_MISMATCH',
      });
      return;
    }
  }

  const state = getState();
  if (!state.settings.webAuthEnabled) {
    next();
    return;
  }

  if (p.startsWith('/auth/') || isWebhookOrFed) {
    next();
    return;
  }

  if (!hasWebAuthPassword()) {
    // Allow local loopback initial setup / preview until operator claims a password,
    // while blocking remote unauthenticated LAN access when no password is set yet.
    const clientIp = req.ip || req.socket?.remoteAddress;
    if (isLoopbackIp(clientIp)) {
      next();
      return;
    }
    res.status(401).json({
      error: 'Operátori kezdő jelszó beállítása szükséges egyszeri setup-kóddal (LAN hozzáférés zárolva).',
      code: 'AUTH_SETUP_REQUIRED',
    });
    return;
  }

  if (isRequestAuthorized(req.headers)) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Operátori hitelesítés szükséges (LAN WebUI Zár aktív).',
    code: 'WEB_AUTH_REQUIRED',
  });
}
