/**
 * Simple in-memory rate limiter for API routes
 * For production, use Redis-backed rate limiting (e.g., @upstash/ratelimit)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  let entry = store.get(key);

  // Reset if window expired
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    store.set(key, entry);
  }

  entry.count++;

  return {
    success: entry.count <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Rate limit presets
 */
export const RATE_LIMITS = {
  /** General API: 60 req/min */
  api: { limit: 60, windowSeconds: 60 },
  /** Auth: 10 req/min */
  auth: { limit: 10, windowSeconds: 60 },
  /** Create agent: 5 req/hour */
  createAgent: { limit: 5, windowSeconds: 3600 },
  /** Hire: 10 req/hour */
  hire: { limit: 10, windowSeconds: 3600 },
  /** Search: 30 req/min */
  search: { limit: 30, windowSeconds: 60 },
} as const;

/**
 * Get rate limit key from request
 */
export function getRateLimitKey(
  request: Request,
  prefix: string
): string {
  // Use IP address or Telegram user ID
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';

  return `${prefix}:${ip}`;
}

/**
 * Rate limit response headers
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
