import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Auth gate (Next.js middleware).
 *
 * CRITICAL: middleware runs on the EDGE runtime, which cannot load the Node
 * builtins (e.g. `node:util/types`) that the Better Auth Drizzle/pg adapter
 * pulls in. NEVER import `@/lib/auth` or call `auth.api.getSession()` here --
 * it crashes every matched route with
 *   "Failed to load external module node:util/types".
 * Do an edge-safe cookie-PRESENCE check only; the destination page / route
 * handler does the real DB-backed `auth.api.getSession()` on the Node runtime
 * (and is where you read the actual user).
 *
 * Adjust PROTECTED_PAGE_PREFIXES, PROTECTED_API_PREFIXES, and `config.matcher`
 * for this app's routes. Keep the matcher tight -- never match public pages
 * (`/`, `/sign-in`, `/sign-up`) or the Better Auth handler (`/api/auth/*`).
 */

// Page routes that require a signed-in user -> redirect to /sign-in.
const PROTECTED_PAGE_PREFIXES: string[] = ["/dashboard"];

// API routes that require auth -> 401 JSON.
const PROTECTED_API_PREFIXES: string[] = [];

function hasPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const protectedApi = hasPrefix(pathname, PROTECTED_API_PREFIXES);
  const protectedPage = hasPrefix(pathname, PROTECTED_PAGE_PREFIXES);
  if (!protectedApi && !protectedPage) {
    return NextResponse.next();
  }

  // Edge-safe: presence check only, no DB / no Better Auth server import.
  const sessionCookie = getSessionCookie(request);
  if (sessionCookie) {
    return NextResponse.next();
  }

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

export const config = {
  // Add this app's protected routes here. Do NOT match public pages or
  // /api/auth/*.
  matcher: ["/dashboard", "/dashboard/:path*"],
};
