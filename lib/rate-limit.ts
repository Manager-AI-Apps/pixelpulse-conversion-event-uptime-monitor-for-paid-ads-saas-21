/**
 * Minimal in-memory rate limiter (fixed window). Suitable for the single-
 * instance Render free tier; swap the store for Redis/Upstash if the app ever
 * scales horizontally. Apply on auth routes (brute-force protection) and
 * webhooks (abuse protection).
 *
 * Usage (in a route handler):
 *   const { ok } = rateLimit(`signin:${ip}`, 5, 60_000);
 *   if (!ok) throw new ApiError("rate_limited", "Too many attempts.");
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/** Drop expired buckets so the Map doesn't grow unbounded. */
export function pruneRateLimits(now: number = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
