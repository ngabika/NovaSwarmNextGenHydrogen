import crypto from 'node:crypto';
import type express from 'express';
import type http from 'node:http';
import {
  getState,
  getWebSessionSecret,
  hasWebAuthPassword,
  verifyWebAuthPassword,
} from '../state/store';

export const WEB_SESSION_COOKIE_NAME = 'novaswarm_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export function isRequestAuthorized(headers: { cookie?: string; authorization?: string }): boolean {
  const state = getState();
  if (!state.settings.webAuthEnabled || !hasWebAuthPassword()) {
    return true;
  }
  const cookies = parseCookieHeader(headers.cookie);
  if (verifySessionToken(cookies[WEB_SESSION_COOKIE_NAME])) {
    return true;
  }
  return false;
}

export function isWsUpgradeAuthorized(req: http.IncomingMessage): boolean {
  return isRequestAuthorized({ cookie: req.headers.cookie });
}

export function authenticateOperatorPassword(password: string): string | null {
  if (!verifyWebAuthPassword(password)) return null;
  return issueSessionToken();
}

/**
 * Middleware protecting /api/* routes when settings.webAuthEnabled is true.
 * Leaves /api/auth/*, /api/channels/inbound/*, and /api/federation/* accessible so
 * login, Slack/Discord webhooks, and peer federation continue functioning.
 */
export function requireWebAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const state = getState();
  if (!state.settings.webAuthEnabled || !hasWebAuthPassword()) {
    next();
    return;
  }

  const p = req.path || '';
  if (
    p.startsWith('/auth/') ||
    p.startsWith('/channels/inbound/') ||
    p.startsWith('/federation/')
  ) {
    next();
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
