import express from 'express';
import { extractClientIp } from './auth';

interface RateWindowEntry {
  count: number;
  resetAtMs: number;
}

const MAX_TRACKED_KEYS = 4000;

class InMemoryFixedWindowLimiter {
  private readonly store = new Map<string, RateWindowEntry>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly bucketName: string
  ) {}

  consume(key: string, nowMs = Date.now()): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const existing = this.store.get(key);
    if (!existing || existing.resetAtMs <= nowMs) {
      if (!existing && this.store.size >= MAX_TRACKED_KEYS) {
        const oldest = this.store.keys().next().value;
        if (oldest) this.store.delete(oldest);
      }
      this.store.set(key, { count: 1, resetAtMs: nowMs + this.windowMs });
      return { allowed: true, remaining: Math.max(0, this.maxRequests - 1), retryAfterSeconds: 0 };
    }

    existing.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
    if (existing.count > this.maxRequests) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - existing.count),
      retryAfterSeconds: 0,
    };
  }

  clear(): void {
    this.store.clear();
  }

  get name(): string {
    return this.bucketName;
  }
}

const defaultApiLimiter = new InMemoryFixedWindowLimiter(180, 60_000, 'api_v1');
const defaultPublicLimiter = new InMemoryFixedWindowLimiter(25, 60_000, 'public_portal');

export function resetRateLimitersForTests(): void {
  defaultApiLimiter.clear();
  defaultPublicLimiter.clear();
}

export function createRateLimitMiddleware(opts?: {
  maxRequests?: number;
  windowMs?: number;
  bucketName?: string;
  limiter?: InMemoryFixedWindowLimiter;
}): express.RequestHandler {
  const limiter =
    opts?.limiter ||
    new InMemoryFixedWindowLimiter(
      opts?.maxRequests ?? 180,
      opts?.windowMs ?? 60_000,
      opts?.bucketName || 'custom'
    );

  return (req, res, next) => {
    const ip = extractClientIp(req);
    const result = limiter.consume(`${limiter.name}:${ip}`);
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429).json({
        error: `Túl sok kérés érkezett rövid időn belül (${limiter.name}). Próbáld újra ${result.retryAfterSeconds} másodperc múlva.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: result.retryAfterSeconds,
      });
      return;
    }
    next();
  };
}

export function createDefaultApiRateLimitMiddleware(maxRequestsOverride?: number): express.RequestHandler {
  if (typeof maxRequestsOverride === 'number') {
    return createRateLimitMiddleware({ maxRequests: maxRequestsOverride, windowMs: 60_000, bucketName: 'api_v1' });
  }
  return createRateLimitMiddleware({ limiter: defaultApiLimiter });
}

export function createPublicRouteRateLimitMiddleware(maxRequestsOverride?: number): express.RequestHandler {
  if (typeof maxRequestsOverride === 'number') {
    return createRateLimitMiddleware({
      maxRequests: maxRequestsOverride,
      windowMs: 60_000,
      bucketName: 'public_portal',
    });
  }
  return createRateLimitMiddleware({ limiter: defaultPublicLimiter });
}

const LARGE_UPLOAD_PATH_PREFIXES = [
  '/api/rag/upload',
  '/api/v4/landrop',
  '/api/media/transcribe',
  '/api/media/chapters',
  '/api/v3/exif-strip',
  '/api/bundle/import',
  '/api/calendar/import-ics',
  '/api/expenses/import-csv',
  '/api/system/restore',
];

export function isLargeUploadEndpointPath(reqPath: string): boolean {
  const clean = reqPath.split('?')[0];
  return LARGE_UPLOAD_PATH_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(`${prefix}/`)
  );
}

/**
 * Global JSON payload cap: 1mb by default across the entire API/gateway,
 * expanding to 25mb ONLY on explicit file / RAG / audio / import endpoints.
 */
export function createSelectiveJsonBodyMiddleware(): express.RequestHandler {
  const smallParser = express.json({ limit: '1mb' });
  const largeParser = express.json({ limit: '25mb' });

  return (req, res, next) => {
    const targetPath = req.originalUrl || req.path || '';
    if (isLargeUploadEndpointPath(targetPath)) {
      largeParser(req, res, next);
      return;
    }
    smallParser(req, res, next);
  };
}
