import { NextRequest, NextResponse } from "next/server";

import { getSessionCookie } from "better-auth/cookies";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Auth gate (Next.js proxy — formerly "middleware").
 *
 * Uses a cookie-PRESENCE check via getSessionCookie (better-auth/cookies)
 * so this file stays edge-safe and never imports pg / Node.js built-ins.
 * The real DB-backed session validation happens inside each page/route handler
 * (Node runtime) where pg and the Drizzle adapter are safe to use.
 *
 * Adjust PROTECTED_PAGE_PREFIXES, PROTECTED_API_PREFIXES, and
 * config.matcher for this app's routes.
 *
 * NOTE: renamed from middleware.ts → proxy.ts per Next.js 16 convention.
 * The exported function must be named `proxy` (or be a default export) when
 * the file is named proxy.ts.
 */

/** Page routes that require a signed-in user → redirect to /sign-in. */
const PROTECTED_PAGE_PREFIXES: string[] = ["/dashboard", "/properties"];

/** API routes that require auth → 401 JSON. */
const PROTECTED_API_PREFIXES: string[] = [];

/** Max auth attempts per IP per minute to prevent brute-force. */
const AUTH_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW_MS = 60_000;

function hasPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Rate-limit /api/auth/* — protect against brute-force sign-in attempts.
  if (pathname.startsWith("/api/auth/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const { ok } = rateLimit(`auth:${ip}`, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many requests. Please try again later." } },
        { status: 429 },
      );
    }
    // Auth API routes are public — no session check needed here.
    return NextResponse.next();
  }

  const protectedApi = hasPrefix(pathname, PROTECTED_API_PREFIXES);
  const protectedPage = hasPrefix(pathname, PROTECTED_PAGE_PREFIXES);

  if (!protectedApi && !protectedPage) {
    return NextResponse.next();
  }

  // Cookie-presence check — edge-safe, no DB call.
  // The real session validation happens inside the page/route handler (Node runtime).
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    if (protectedApi) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Authentication required." } },
        { status: 401 },
      );
    }

    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl, { status: 307 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/properties",
    "/properties/:path*",
    "/api/auth/:path*",
  ],
};
