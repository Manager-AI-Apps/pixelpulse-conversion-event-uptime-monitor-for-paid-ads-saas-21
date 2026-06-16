import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Hoist mocks before module imports resolve
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ ok: true, remaining: 19, resetAt: 0 }),
  pruneRateLimits: vi.fn(),
}));

import { middleware } from "@/middleware";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

describe("middleware auth gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 19, resetAt: 0 });
  });

  it("unauthenticated /dashboard redirects to /sign-in", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
  });

  it("valid session passes through on /dashboard", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: {
        id: "sess-1",
        userId: "user-1",
        token: "tok",
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await middleware(request);

    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(401);
  });

  it("unauthenticated /properties redirects to /sign-in", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/properties/123");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
  });
});
