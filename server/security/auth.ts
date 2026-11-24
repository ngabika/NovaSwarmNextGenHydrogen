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

export function verifySameOriginRequest(headers: {
  origin?: string;
  referer?: string;
  host?: string;
}): boolean {
  const rawOrigin = headers.origin || headers.referer;
  if (!rawOrigin) {
    // Non-browser CLI/curl/internal test requests omit Origin/Referer
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
      return true;
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

export function isRequestAuthorized(headers: { cookie?: string; authorization?: string }): boolean {
  const state = getState();
  if (!state.settings.webAuthEnabled) {
    return true;
  }
  if (!hasWebAuthPassword()) {
    return false;
  }
  const cookies = parseCookieHeader(headers.cookie);
  if (verifySessionToken(cookies[WEB_SESSION_COOKIE_NAME])) {
    return true;
  }
  return false;
}

export function isWsUpgradeAuthorized(req: http.IncomingMessage): boolean {
  if (!verifySameOriginRequest({
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers.host,
  })) {
    return false;
  }
  const state = getState();
  if (state.settings.webAuthEnabled && !hasWebAuthPassword()) {
    return isLoopbackIp(req.socket?.remoteAddress);
  }
  return isRequestAuthorized({ cookie: req.headers.cookie });
}

export function authenticateOperatorPassword(password: string): string | null {
  if (!verifyWebAuthPassword(password)) return null;
  return issueSessionToken();
}

/**
 * Middleware protecting /api/* routes when settings.webAuthEnabled is true.
 * Enforces Origin/Host same-origin check on mutating browser requests to block CSRF & DNS rebinding.
 * Leaves /api/auth/*, /api/channels/inbound/*, and /api/federation/* accessible so
 * login, Slack/Discord webhooks, and peer federation (authenticated via bearer tokens) continue functioning.
 */
export function requireWebAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const p = req.path || '';
  const isWebhookOrFed = p.startsWith('/channels/inbound/') || p.startsWith('/federation/');

  const method = (req.method || 'GET').toUpperCase();
  if (!isWebhookOrFed && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (!verifySameOriginRequest({
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      referer: typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
      host: typeof req.headers.host === 'string' ? req.headers.host : undefined,
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
      error: 'Operátori kezdő jelszó beállítása szükséges helyi konzolról (LAN hozzáférés zárolva).',
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
