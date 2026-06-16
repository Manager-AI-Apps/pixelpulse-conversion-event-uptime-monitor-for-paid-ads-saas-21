import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit, pruneRateLimits } from "@/lib/rate-limit";

describe("rateLimit sliding window", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests up to limit", () => {
    const key = `test-allow-${Math.random()}`;
    for (let i = 1; i <= 5; i++) {
      const result = rateLimit(key, 5, 60_000);
      expect(result.ok).toBe(true);
    }
  });

  it("blocks after threshold — 21st call with limit=20 returns ok=false", () => {
    const frozenNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(frozenNow);

    const key = `test-block-${Math.random()}`;

    for (let i = 1; i <= 20; i++) {
      const result = rateLimit(key, 20, 60_000);
      expect(result.ok, `call ${i} should be allowed`).toBe(true);
    }

    const blocked = rateLimit(key, 20, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("slides window — old requests expire and allow new ones", () => {
    const key = `test-slide-${Math.random()}`;
    const startTime = 1_000_000;

    // Fill the window at T=0 within the window
    vi.spyOn(Date, "now").mockReturnValue(startTime);
    for (let i = 0; i < 5; i++) {
      rateLimit(key, 5, 60_000);
    }
    // One more at same time should be blocked
    expect(rateLimit(key, 5, 60_000).ok).toBe(false);

    // Advance time past the window
    vi.spyOn(Date, "now").mockReturnValue(startTime + 60_001);
    // Old requests have now slid out — should be allowed again
    expect(rateLimit(key, 5, 60_000).ok).toBe(true);
  });

  it("pruneRateLimits removes stale entries", () => {
    const key = `test-prune-${Math.random()}`;
    const startTime = 2_000_000;
    vi.spyOn(Date, "now").mockReturnValue(startTime);
    rateLimit(key, 5, 60_000);

    // Advance way past the window
    pruneRateLimits(startTime + 3_700_000);
    // After prune, a fresh window starts — allow again up to limit
    vi.spyOn(Date, "now").mockReturnValue(startTime + 3_700_000);
    const result = rateLimit(key, 5, 60_000);
    expect(result.ok).toBe(true);
  });
});
