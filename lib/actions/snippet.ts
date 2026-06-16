/**
 * Server-side actions for the JS snippet delivery and beacon ingestion.
 *
 * Exports:
 *  - stripPii          — remove PII keys from a raw payload object
 *  - validateOriginAgainstUrl — check Origin header against property URL
 *  - getPropertyByKey  — look up a property by its snippetKey
 *  - insertSnippetEvent — write a PII-stripped visitor beacon row
 *  - processBeacon     — full pipeline: origin + rate-limit + PII + insert
 *  - buildBeaconScript — generate the inline JS snippet for GET delivery
 *
 * Functions that touch the database accept an optional `db` argument (defaulting
 * to the shared app database) so integration tests can inject a pglite instance.
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";

import { db as defaultDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { property, snippetEvent } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// PII scrubbing
// ---------------------------------------------------------------------------

const PII_PATTERN = /email|name|phone|card|token/i;

/**
 * Remove top-level keys from a payload object whose names match the PII
 * pattern (/email|name|phone|card|token/i).  Non-object payloads are
 * returned as an empty object.
 */
export function stripPii(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const raw = payload as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!PII_PATTERN.test(key)) {
      clean[key] = raw[key];
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Origin validation
// ---------------------------------------------------------------------------

/**
 * Return `true` when `origin` matches the origin component of `propertyUrl`.
 *
 * Example: `validateOriginAgainstUrl('https://example.com', 'https://example.com/some/path')` → true
 */
export function validateOriginAgainstUrl(
  origin: string,
  propertyUrl: string,
): boolean {
  try {
    const expected = new URL(propertyUrl).origin;
    return origin === expected;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/**
 * Return the property row for `snippetKey`, or `null` if not found.
 */
export async function getPropertyByKey(
  snippetKey: string,
  db: Database = defaultDb,
): Promise<{ id: string; url: string } | null> {
  const rows = await db
    .select({ id: property.id, url: property.url })
    .from(property)
    .where(eq(property.snippetKey, snippetKey));
  return rows[0] ?? null;
}

/**
 * Write a PII-stripped visitor beacon row to `snippet_event`.
 *
 * @param propertyId   Owning property's primary key
 * @param payload      Already-scrubbed payload (call stripPii first)
 * @param db           Database instance (injectable for tests)
 */
export async function insertSnippetEvent(
  propertyId: string,
  strippedPayload: Record<string, unknown>,
  db: Database = defaultDb,
): Promise<void> {
  const eventName =
    typeof strippedPayload["event"] === "string"
      ? (strippedPayload["event"] as string)
      : "event";

  await db.insert(snippetEvent).values({
    id: crypto.randomUUID(),
    propertyId,
    eventName,
    payload: strippedPayload,
  });
}

// ---------------------------------------------------------------------------
// Full beacon pipeline
// ---------------------------------------------------------------------------

export interface BeaconResult {
  ok: boolean;
  status: number;
  error?: string;
}

/** Maximum beacon requests per IP+key per minute. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/**
 * Process a single incoming beacon POST:
 *   1. Resolve property by snippetKey
 *   2. Validate Origin against property URL
 *   3. Apply sliding-window rate limit (60 req/min per IP+key)
 *   4. Strip PII from payload
 *   5. Insert snippet_event row
 *
 * Returns a result object so route handlers can map it to HTTP responses
 * without catching errors.
 */
export async function processBeacon(
  snippetKey: string,
  origin: string | null,
  ip: string,
  payload: unknown,
  db: Database = defaultDb,
): Promise<BeaconResult> {
  // 1. Resolve property
  const prop = await getPropertyByKey(snippetKey, db);
  if (!prop) {
    return { ok: false, status: 404, error: "Snippet key not found." };
  }

  // 2. Validate Origin
  if (!validateOriginAgainstUrl(origin ?? "", prop.url)) {
    return { ok: false, status: 403, error: "Origin not allowed." };
  }

  // 3. Rate limit (in-memory; shared across requests in a single process)
  const rl = rateLimit(`snippet:${ip}:${snippetKey}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return { ok: false, status: 429, error: "Rate limit exceeded." };
  }

  // 4. Strip PII
  const strippedPayload = stripPii(payload);

  // 5. Persist
  await insertSnippetEvent(prop.id, strippedPayload, db);

  return { ok: true, status: 200 };
}

// ---------------------------------------------------------------------------
// Beacon script builder
// ---------------------------------------------------------------------------

/**
 * Build the inline JavaScript beacon that property owners embed on their site.
 * The returned string is served with Content-Type: application/javascript.
 */
export function buildBeaconScript(snippetKey: string): string {
  // Sanitise the key before embedding (it should already be a hex string, but
  // reject anything that could break the JS context).
  const safeKey = snippetKey.replace(/[^a-zA-Z0-9_\-]/g, "");

  return `/* PixelPulse beacon — do not modify */
(function(){
  var _pixelpulse_key = '${safeKey}';
  var _pixelpulse_url = '/api/snippet/' + _pixelpulse_key;

  /**
   * Send a conversion event to PixelPulse.
   *
   * @param {string} eventName  e.g. 'purchase', 'signup'
   * @param {object} [payload]  optional extra data (PII is stripped server-side)
   */
  window.pixelpulse = function(eventName, payload) {
    try {
      var data = Object.assign({}, payload || {}, { event: eventName });
      fetch(_pixelpulse_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true
      }).catch(function() {});
    } catch (e) { /* silent fail */ }
  };

  // Auto-fire a pageview on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.pixelpulse('pageview');
    });
  } else {
    window.pixelpulse('pageview');
  }
})();
`;
}
