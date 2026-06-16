/**
 * /api/snippet/[key]
 *
 * GET  — Serve the one-line JS beacon script (application/javascript).
 *        No authentication required; the key is the access credential.
 *
 * POST — Ingest a beacon event posted by the JS snippet running on a visitor's
 *        browser.  Pipeline:
 *          1. Validate Origin against the property's registered domain.
 *          2. Rate-limit at 60 req/min per IP+key (in-memory sliding window).
 *          3. Strip PII keys (/email|name|phone|card|token/i) from payload.
 *          4. Persist a snippet_event row.
 */

import { NextResponse } from "next/server";

import { handleRoute, ApiError } from "@/lib/api-error";
import { buildBeaconScript, processBeacon } from "@/lib/actions/snippet";

// ---------------------------------------------------------------------------
// GET — deliver the beacon script
// ---------------------------------------------------------------------------

export const GET = handleRoute(
  async (
    _request: Request,
    { params }: { params: Promise<{ key: string }> },
  ): Promise<Response> => {
    const { key } = await params;

    if (!key || typeof key !== "string") {
      throw new ApiError("bad_request", "Missing snippet key.");
    }

    const script = buildBeaconScript(key);

    return new Response(script, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        // Allow browsers to cache the script for up to 5 minutes
        "Cache-Control": "public, max-age=300",
        // CORS: snippet is loaded cross-origin from the property's site
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
);

// ---------------------------------------------------------------------------
// POST — ingest a beacon event
// ---------------------------------------------------------------------------

export const POST = handleRoute(
  async (
    request: Request,
    { params }: { params: Promise<{ key: string }> },
  ): Promise<Response> => {
    const { key } = await params;

    if (!key || typeof key !== "string") {
      throw new ApiError("bad_request", "Missing snippet key.");
    }

    const origin = request.headers.get("origin");
    // Prefer X-Forwarded-For (set by reverse proxies) then X-Real-IP, then fallback
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      "0.0.0.0";

    // Parse body — treat malformed JSON as empty payload
    let payload: unknown = {};
    try {
      payload = await request.json();
    } catch {
      // body not required to be valid JSON; proceed with empty payload
    }

    const result = await processBeacon(key, origin, ip, payload);

    if (!result.ok) {
      switch (result.status) {
        case 403:
          throw new ApiError("forbidden", result.error ?? "Origin not allowed.");
        case 429:
          throw new ApiError("rate_limited", result.error ?? "Rate limit exceeded.");
        case 404:
          throw new ApiError("not_found", result.error ?? "Snippet key not found.");
        default:
          throw new ApiError("internal", result.error ?? "Unexpected error.");
      }
    }

    return NextResponse.json({ ok: true });
  },
);

// Support pre-flight CORS requests from the property owner's site
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
