/**
 * In-memory sliding-window rate limiter using a per-key timestamp log.
 *
 * Suitable for the single-instance Render free tier; swap for
 * Redis/Upstash if the app ever scales horizontally.
 *
 * Apply on auth routes (brute-force protection) and webhooks (abuse
 * protection).
 *
 * Usage (in a route handler):
 *   const { ok } = rateLimit(`signin:${ip}`, 20, 60_000);
 *   if (!ok) throw new ApiError("rate_limited", "Too many attempts.");
 */

/** Maximum window we ever track for pruning purposes (1 hour). */
const MAX_WINDOW_MS = 3_600_000;

interface SlidingBucket {
  /** Sorted ascending list of request timestamps inside the window. */
  timestamps: number[];
}

const windows = new Map<string, SlidingBucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Epoch ms when the oldest in-window request expires (first slot frees). */
  resetAt: number;
}

/**
 * Sliding-window rate limit check.
 *
 * @param key       Unique key for this rate-limit bucket (e.g. `auth:<ip>`)
 * @param limit     Maximum allowed requests per window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const bucket = windows.get(key);
  // Keep only timestamps within the sliding window
  const timestamps = bucket
    ? bucket.timestamps.filter((t) => t > windowStart)
    : [];

  if (timestamps.length >= limit) {
    // Cannot admit; update bucket with pruned timestamps
    windows.set(key, { timestamps });
    // Next slot opens when the oldest in-window request expires
    const resetAt = (timestamps[0] ?? now) + windowMs;
    return { ok: false, remaining: 0, resetAt };
  }

  timestamps.push(now);
  windows.set(key, { timestamps });

  const resetAt = (timestamps[0] ?? now) + windowMs;
  return { ok: true, remaining: limit - timestamps.length, resetAt };
}

/**
 * Drop expired buckets so the Map doesn't grow unbounded.
 * Call periodically (e.g. in a cron route) for long-running processes.
 */
export function pruneRateLimits(now: number = Date.now()): void {
  const cutoff = now - MAX_WINDOW_MS;
  for (const [key, bucket] of windows) {
    const recent = bucket.timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) {
      windows.delete(key);
    } else {
      bucket.timestamps = recent;
    }
  }
}
