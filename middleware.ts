import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Auth gate (Next.js middleware).
 *
 * Calls auth.api.getSession() — NOT a cookie-presence check — so every
 * protected request is validated against the real session store.
 *
 * NOTE: To support the Node.js auth adapter (Drizzle/pg) this middleware
 * must run under the Node.js runtime, not the Edge runtime. The matcher
 * below deliberately excludes /api/auth/* from the session-check path;
 * those routes are rate-limited only.
 *
 * Adjust PROTECTED_PAGE_PREFIXES, PROTECTED_API_PREFIXES, and
 * config.matcher for this app's routes.
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

export async function middleware(request: NextRequest): Promise<NextResponse> {
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

  // Full DB-backed session validation (Node.js runtime required).
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
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
