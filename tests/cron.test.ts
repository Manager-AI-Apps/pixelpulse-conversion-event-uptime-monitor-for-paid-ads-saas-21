/**
 * Acceptance tests for the cron run-monitors route.
 *
 * Groups:
 * 1. Unit — rejects missing/wrong CRON_SECRET (401)
 * 2. Integration — triggers due funnels only (lastRunAt > scheduleMinutes ago)
 * 3. Integration — prunes beacon_event rows older than 30 days
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

import { createTestDb } from "@/tests/helpers/test-db";
import {
  user,
  property,
  funnel,
  funnelStep,
  monitorRun,
  beaconEvent,
} from "@/lib/db/schema";
import { NextRequest } from "next/server";

import { POST, runCronJob } from "@/app/api/cron/run-monitors/route";
import type { OrchestratorResult } from "@/lib/runner/orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/run-monitors", {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

// ---------------------------------------------------------------------------
// Unit — auth validation
// ---------------------------------------------------------------------------

describe("rejects missing/wrong cron secret", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret-abc");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    const res = await POST(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is malformed (no Bearer prefix)", async () => {
    const res = await POST(makeRequest("test-cron-secret-abc"));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Integration — triggers due funnels only
// ---------------------------------------------------------------------------

describe("triggers due funnels only", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();

    await testDb.db.insert(user).values({
      id: "cron-user-1",
      name: "Cron User",
      email: `cron-${randomBytes(4).toString("hex")}@example.com`,
      emailVerified: false,
    });
    await testDb.db.insert(property).values({
      id: "cron-prop-1",
      userId: "cron-user-1",
      name: "Cron Property",
      url: "https://example.com",
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("calls orchestrator only for funnel whose lastRunAt is past the interval", async () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Funnel 1: lastRunAt = 20 min ago, scheduleMinutes = 15 → DUE
    await testDb.db.insert(funnel).values({
      id: "cron-funnel-due",
      propertyId: "cron-prop-1",
      userId: "cron-user-1",
      name: "Due Funnel",
      scheduleMinutes: 15,
      enabled: true,
      lastRunAt: twentyMinutesAgo,
    });

    // Funnel 2: lastRunAt = 5 min ago, scheduleMinutes = 15 → NOT DUE
    await testDb.db.insert(funnel).values({
      id: "cron-funnel-not-due",
      propertyId: "cron-prop-1",
      userId: "cron-user-1",
      name: "Not Due Funnel",
      scheduleMinutes: 15,
      enabled: true,
      lastRunAt: fiveMinutesAgo,
    });

    // Funnel 3: disabled, should never be triggered
    await testDb.db.insert(funnel).values({
      id: "cron-funnel-disabled",
      propertyId: "cron-prop-1",
      userId: "cron-user-1",
      name: "Disabled Funnel",
      scheduleMinutes: 15,
      enabled: false,
      lastRunAt: twentyMinutesAgo,
    });

    const triggeredFunnelIds: string[] = [];
    const mockOrchestrate = vi
      .fn()
      .mockImplementation(async (input: { funnelId: string }) => {
        triggeredFunnelIds.push(input.funnelId);
        return {
          monitorRunId: randomBytes(8).toString("hex"),
          status: "pass" as const,
          alertInserted: false,
        } satisfies OrchestratorResult;
      });

    await runCronJob(testDb.db, mockOrchestrate);

    expect(triggeredFunnelIds).toHaveLength(1);
    expect(triggeredFunnelIds[0]).toBe("cron-funnel-due");
  });

  it("triggers a funnel with lastRunAt=null (never run)", async () => {
    await testDb.db.insert(funnel).values({
      id: "cron-funnel-never-run",
      propertyId: "cron-prop-1",
      userId: "cron-user-1",
      name: "Never Run Funnel",
      scheduleMinutes: 15,
      enabled: true,
      lastRunAt: null,
    });

    const triggeredFunnelIds: string[] = [];
    const mockOrchestrate = vi
      .fn()
      .mockImplementation(async (input: { funnelId: string }) => {
        triggeredFunnelIds.push(input.funnelId);
        return {
          monitorRunId: randomBytes(8).toString("hex"),
          status: "pass" as const,
          alertInserted: false,
        } satisfies OrchestratorResult;
      });

    await runCronJob(testDb.db, mockOrchestrate);

    expect(triggeredFunnelIds).toContain("cron-funnel-never-run");
  });
});

// ---------------------------------------------------------------------------
// Integration — prunes beacon_event rows older than 30 days
// ---------------------------------------------------------------------------

describe("prunes beacon_event rows older than 30 days", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();

    await testDb.db.insert(user).values({
      id: "prune-user-1",
      name: "Prune User",
      email: `prune-${randomBytes(4).toString("hex")}@example.com`,
      emailVerified: false,
    });
    await testDb.db.insert(property).values({
      id: "prune-prop-1",
      userId: "prune-user-1",
      name: "Prune Property",
      url: "https://example.com",
    });
    await testDb.db.insert(funnel).values({
      id: "prune-funnel-1",
      propertyId: "prune-prop-1",
      userId: "prune-user-1",
      name: "Prune Funnel",
      scheduleMinutes: 15,
      enabled: false, // disabled so no orchestration runs
    });
    await testDb.db.insert(funnelStep).values({
      id: "prune-step-1",
      funnelId: "prune-funnel-1",
      stepOrder: 0,
      url: "https://example.com",
      expectedEvents: [],
    });
    await testDb.db.insert(monitorRun).values({
      id: "prune-run-1",
      funnelId: "prune-funnel-1",
      status: "passed",
      startedAt: new Date(),
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("deletes beacon_event rows with capturedAt older than 30 days and keeps recent ones", async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Old event — should be pruned
    await testDb.db.insert(beaconEvent).values({
      id: "beacon-old",
      monitorRunId: "prune-run-1",
      stepId: "prune-step-1",
      source: "ga4",
      eventName: "purchase",
      capturedAt: thirtyOneDaysAgo,
    });

    // Recent event — should NOT be pruned
    await testDb.db.insert(beaconEvent).values({
      id: "beacon-new",
      monitorRunId: "prune-run-1",
      stepId: "prune-step-1",
      source: "ga4",
      eventName: "purchase",
      capturedAt: now,
    });

    const mockOrchestrate = vi.fn().mockResolvedValue({
      monitorRunId: "test-run",
      status: "pass" as const,
      alertInserted: false,
    } satisfies OrchestratorResult);

    await runCronJob(testDb.db, mockOrchestrate);

    const remaining = await testDb.db
      .select({ id: beaconEvent.id })
      .from(beaconEvent);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("beacon-new");
  });
});
