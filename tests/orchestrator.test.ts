/**
 * Acceptance tests for lib/runner/orchestrator.ts and lib/slack.ts.
 *
 * Test groups:
 * 1. Integration — orchestrator persists monitor_run on success
 * 2. Integration — alert deduplication via onConflictDoNothing
 * 3. Unit — slack buildSlackMessage returns human-readable diagnosis copy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

import { createTestDb } from "@/tests/helpers/test-db";
import { user, property, funnel, monitorRun, alert } from "@/lib/db/schema";
import { runOrchestrator } from "@/lib/runner/orchestrator";
import { buildSlackMessage } from "@/lib/slack";
import { DiagnosisCode } from "@/lib/runner/diagnosis";
import type { RunResult } from "@/lib/runner/types";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const PASSING_RUN_RESULT: RunResult = {
  ok: true,
  interceptedEvents: [],
  stepResults: [
    {
      stepIndex: 0,
      url: "https://example.com",
      status: "passed",
      events: [],
    },
  ],
  durationMs: 100,
};

// ---------------------------------------------------------------------------
// Integration — orchestrator persists monitor_run on success
// ---------------------------------------------------------------------------

describe("orchestrator persists monitor_run on success", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();

    await testDb.db.insert(user).values({
      id: "user-orch-1",
      name: "Test User",
      email: `orch1-${randomBytes(4).toString("hex")}@example.com`,
      emailVerified: false,
    });
    await testDb.db.insert(property).values({
      id: "prop-orch-1",
      userId: "user-orch-1",
      name: "Test Property",
      url: "https://example.com",
    });
    await testDb.db.insert(funnel).values({
      id: "funnel-orch-1",
      propertyId: "prop-orch-1",
      userId: "user-orch-1",
      name: "Test Funnel",
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("inserts monitor_run with status='pass' when runner returns ok=true and no assertion failures", async () => {
    const mockRunner = vi.fn().mockResolvedValue(PASSING_RUN_RESULT);
    const runId = randomBytes(8).toString("hex");

    const result = await runOrchestrator({
      funnelId: "funnel-orch-1",
      steps: [{ url: "https://example.com", actionType: "navigate" }],
      funnelStepsWithExpected: [],
      monitorRunId: runId,
      db: testDb.db,
      runner: mockRunner,
    });

    expect(result.status).toBe("pass");
    expect(result.monitorRunId).toBe(runId);

    const rows = await testDb.db
      .select({ id: monitorRun.id, status: monitorRun.status })
      .from(monitorRun)
      .where(
        (
          await import("drizzle-orm")
        ).eq(monitorRun.id, runId),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// Integration — alert deduplication via onConflictDoNothing
// ---------------------------------------------------------------------------

describe("alert deduplication via onConflictDoNothing", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();

    await testDb.db.insert(user).values({
      id: "user-dedup-1",
      name: "Dedup User",
      email: `dedup-${randomBytes(4).toString("hex")}@example.com`,
      emailVerified: false,
    });
    await testDb.db.insert(property).values({
      id: "prop-dedup-1",
      userId: "user-dedup-1",
      name: "Dedup Property",
      url: "https://example.com",
    });
    await testDb.db.insert(funnel).values({
      id: "funnel-dedup-1",
      propertyId: "prop-dedup-1",
      userId: "user-dedup-1",
      name: "Dedup Funnel",
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("inserts only one alert row when orchestrator runs twice with the same monitorRunId", async () => {
    // A runner that returns ok=true but the funnelStepsWithExpected expects an
    // event that never appears in interceptedEvents — triggering EventMissing.
    const mockRunner = vi.fn().mockResolvedValue(PASSING_RUN_RESULT);
    const runId = randomBytes(8).toString("hex");

    const input = {
      funnelId: "funnel-dedup-1",
      steps: [{ url: "https://example.com", actionType: "navigate" as const }],
      funnelStepsWithExpected: [
        {
          stepIndex: 0,
          expectedEvents: [{ eventName: "purchase" }],
        },
      ],
      monitorRunId: runId,
      db: testDb.db,
      runner: mockRunner,
    };

    // First run: should insert alert
    const first = await runOrchestrator(input);
    expect(first.alertInserted).toBe(true);

    // Second run with same runId: alert insert should be a no-op
    const second = await runOrchestrator({ ...input, runner: vi.fn().mockResolvedValue(PASSING_RUN_RESULT) });
    expect(second.alertInserted).toBe(false);

    // Only one alert row should exist
    const alertRows = await testDb.db
      .select({ id: alert.id })
      .from(alert)
      .where(
        (
          await import("drizzle-orm")
        ).eq(alert.monitorRunId, runId),
      );

    expect(alertRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unit — slack buildSlackMessage returns human-readable diagnosis copy
// ---------------------------------------------------------------------------

describe("buildSlackMessage", () => {
  it("returns string containing 'Purchase fired without value' for purchase_fired_without_value", () => {
    const msg = buildSlackMessage(DiagnosisCode.PurchaseFiredWithoutValue);
    expect(msg).toContain("Purchase fired without value");
  });

  it("returns string containing 'CAPI silent fail' for capi_silent_fail", () => {
    const msg = buildSlackMessage(DiagnosisCode.CapiSilentFail);
    expect(msg).toContain("CAPI silent fail");
  });

  it("returns string containing 'duplicate via gtag + GTM' (case-insensitive) for duplicate_via_gtag_gtm", () => {
    const msg = buildSlackMessage(DiagnosisCode.DuplicateViaGtagGtm);
    expect(msg.toLowerCase()).toContain("duplicate via gtag + gtm");
  });

  it("returns string containing 'GA4 property mismatch' for ga4_property_mismatch", () => {
    const msg = buildSlackMessage(DiagnosisCode.Ga4PropertyMismatch);
    expect(msg).toContain("GA4 property mismatch");
  });

  it("accepts a plain string diagnosis code and includes it in the output", () => {
    const msg = buildSlackMessage("purchase_fired_without_value");
    expect(msg).toContain("Purchase fired without value");
  });
});
