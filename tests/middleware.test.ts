import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Middleware no longer calls auth.api.getSession — it uses getSessionCookie
// (better-auth/cookies) for an edge-safe cookie-presence check. We only need
// to mock rate-limit here; auth mock is not required.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ ok: true, remaining: 19, resetAt: 0 }),
  pruneRateLimits: vi.fn(),
}));

import { middleware } from "@/middleware";
import { rateLimit } from "@/lib/rate-limit";

/** Build a NextRequest with a fake better-auth session cookie. */
function requestWithSession(url: string): NextRequest {
  const req = new NextRequest(url);
  req.cookies.set("better-auth.session_token", "fake-session-token");
  return req;
}

describe("middleware auth gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 19, resetAt: 0 });
  });

  it("unauthenticated /dashboard redirects to /sign-in", async () => {
    // No session cookie → cookie-presence check fails → redirect.
    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
  });

  it("valid session passes through on /dashboard", async () => {
    // Cookie present → middleware lets the request through.
    // Full session validation happens later in the page (Node runtime).
    const request = requestWithSession("http://localhost:3000/dashboard");
    const response = await middleware(request);

    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(401);
  });

  it("unauthenticated /properties redirects to /sign-in", async () => {
    // No session cookie → cookie-presence check fails → redirect.
    const request = new NextRequest("http://localhost:3000/properties/123");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
  });
});
