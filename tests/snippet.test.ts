/**
 * Acceptance tests for snippet delivery and beacon ingestion.
 *
 * - GET /api/snippet/[key] returns application/javascript containing 'pixelpulse'
 * - POST strips PII keys before persisting to snippet_event
 * - POST rejects mismatched Origin with 403
 * - POST rate-limits at 60 req/min (unit)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createTestDb } from "@/tests/helpers/test-db";
import { user, snippetEvent } from "@/lib/db/schema";
import { createProperty } from "@/lib/actions/property";
import { processBeacon } from "@/lib/actions/snippet";
import { rateLimit } from "@/lib/rate-limit";

// AES key needed because createProperty may encrypt slack webhook
const TEST_ENCRYPTION_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

// ---------------------------------------------------------------------------
// Test 1 — GET returns JS with correct Content-Type
// ---------------------------------------------------------------------------

describe("GET /api/snippet/[key]", () => {
  it("returns Content-Type application/javascript and body contains 'pixelpulse'", async () => {
    // Import route after resetting modules so mocks don't bleed
    const { GET } = await import("@/app/api/snippet/[key]/route");
    const resp = await GET(new Request("http://localhost/api/snippet/testkey"), {
      params: Promise.resolve({ key: "testkey" }),
    });

    const contentType = resp.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/javascript");

    const body = await resp.text();
    expect(body).toContain("pixelpulse");
  });
});

// ---------------------------------------------------------------------------
// Test 2 — POST strips PII before persisting
// ---------------------------------------------------------------------------

describe("POST /api/snippet/[key] — strips PII", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    testDb = await createTestDb();
    await testDb.db.insert(user).values({
      id: "u-snippet-1",
      name: "Tester",
      email: "tester@example.com",
      emailVerified: false,
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("persists beacon without email field when payload contains email", async () => {
    const prop = await createProperty(
      { name: "My Site", url: "https://example.com", userId: "u-snippet-1" },
      testDb.db,
    );

    const result = await processBeacon(
      prop.snippetKey,
      "https://example.com",
      "10.0.0.1",
      { email: "a@b.com", value: 99, event: "purchase" },
      testDb.db,
    );

    expect(result.ok).toBe(true);

    const rows = await testDb.db.select().from(snippetEvent);
    expect(rows).toHaveLength(1);

    // PII must be stripped
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("email");
    // Non-PII fields survive
    expect(payload).toHaveProperty("value", 99);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — POST rejects mismatched Origin
// ---------------------------------------------------------------------------

describe("POST /api/snippet/[key] — origin validation", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    testDb = await createTestDb();
    await testDb.db.insert(user).values({
      id: "u-snippet-2",
      name: "Tester",
      email: "tester2@example.com",
      emailVerified: false,
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("returns status 403 when Origin does not match property domain", async () => {
    const prop = await createProperty(
      { name: "My Site", url: "https://example.com", userId: "u-snippet-2" },
      testDb.db,
    );

    const result = await processBeacon(
      prop.snippetKey,
      "https://evil.com", // wrong origin
      "10.0.0.2",
      { event: "pageview" },
      testDb.db,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);

    // Nothing should have been persisted
    const rows = await testDb.db.select().from(snippetEvent);
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — POST rate-limits after 60 req/min (unit)
// ---------------------------------------------------------------------------

describe("POST /api/snippet/[key] — rate limit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("61st call with same IP+key within 60 s returns ok=false", () => {
    const frozenNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(frozenNow);

    // Use a unique, obviously-fake key so other tests don't interfere
    const key = `snippet:192.0.2.1:rate-limit-unit-test-key`;

    let result: ReturnType<typeof rateLimit> | undefined;
    for (let i = 0; i < 61; i++) {
      result = rateLimit(key, 60, 60_000);
    }

    expect(result).toBeDefined();
    expect(result!.ok).toBe(false);
    expect(result!.remaining).toBe(0);
  });
});
