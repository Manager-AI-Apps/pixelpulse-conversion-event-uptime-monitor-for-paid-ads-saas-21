/**
 * POST /api/cron/run-monitors
 *
 * Scheduled cron endpoint that:
 *  1. Validates Authorization: Bearer <CRON_SECRET> using crypto.timingSafeEqual
 *     (never via query param to prevent secret leakage in logs).
 *  2. Queries funnels where enabled=true AND
 *     (lastRunAt IS NULL OR lastRunAt + scheduleMinutes * interval '1 minute' <= now()).
 *  3. Runs the orchestrator for each due funnel, updating lastRunAt after each run.
 *  4. Prunes beacon_event rows with capturedAt older than 30 days.
 *
 * The `runCronJob` helper is exported for integration testing — call it with a
 * test db and a mock orchestrator to avoid touching Playwright or the real DB.
 */

import { timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or, sql, lt } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, funnelStep, property, beaconEvent } from "@/lib/db/schema";
import { requireEnv } from "@/lib/env";
import { handleRoute, ApiError } from "@/lib/api-error";
import {
  runOrchestrator,
  type OrchestratorInput,
  type OrchestratorResult,
} from "@/lib/runner/orchestrator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrchestratorFn = (input: OrchestratorInput) => Promise<OrchestratorResult>;

interface CronResult {
  triggered: number;
  pruned: number;
}

// ---------------------------------------------------------------------------
// Core job logic (exported for integration testing)
// ---------------------------------------------------------------------------

/**
 * Run the full cron job against the given database.
 *
 * @param database  Drizzle db instance (default: production app db).
 * @param orchestrate  Orchestrator function (default: production runOrchestrator).
 */
export async function runCronJob(
  database: Database = appDb,
  orchestrate: OrchestratorFn = runOrchestrator,
): Promise<CronResult> {
  // -------------------------------------------------------------------------
  // 1. Query due funnels
  //    Condition: enabled=true AND
  //    (lastRunAt IS NULL OR lastRunAt + scheduleMinutes * '1 minute' <= now())
  // -------------------------------------------------------------------------
  const dueFunnels = await database
    .select({
      id: funnel.id,
      scheduleMinutes: funnel.scheduleMinutes,
      lastRunAt: funnel.lastRunAt,
      propertyId: funnel.propertyId,
    })
    .from(funnel)
    .where(
      and(
        eq(funnel.enabled, true),
        or(
          isNull(funnel.lastRunAt),
          sql`${funnel.lastRunAt} + (${funnel.scheduleMinutes} * interval '1 minute') <= now()`,
        ),
      ),
    );

  // -------------------------------------------------------------------------
  // 2. Run orchestrator for each due funnel
  // -------------------------------------------------------------------------
  let triggered = 0;

  for (const dueFunnel of dueFunnels) {
    // Fetch steps and property config in parallel
    const [steps, propertyRows] = await Promise.all([
      database
        .select({
          id: funnelStep.id,
          stepOrder: funnelStep.stepOrder,
          url: funnelStep.url,
          action: funnelStep.action,
          expectedEvents: funnelStep.expectedEvents,
        })
        .from(funnelStep)
        .where(eq(funnelStep.funnelId, dueFunnel.id)),
      database
        .select({ slackWebhookEncrypted: property.slackWebhookEncrypted })
        .from(property)
        .where(eq(property.id, dueFunnel.propertyId)),
    ]);

    const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const slackWebhookEncrypted = propertyRows[0]?.slackWebhookEncrypted ?? null;

    const monitorRunId = randomBytes(16).toString("hex");

    // Map steps to FunnelStepConfig for the runner
    const funnelStepConfigs = sortedSteps.map((s) => ({
      url: s.url,
      action: s.action ?? undefined,
      actionType: "navigate" as const,
    }));

    // Map steps to AssertionFunnelStep for the assertion engine
    const funnelStepsWithExpected = sortedSteps.map((s, idx) => ({
      stepIndex: idx,
      expectedEvents: (s.expectedEvents as Array<{ eventName: string }>) ?? [],
    }));

    await orchestrate({
      funnelId: dueFunnel.id,
      steps: funnelStepConfigs,
      funnelStepsWithExpected,
      slackWebhookEncrypted,
      monitorRunId,
      db: database,
    });

    // Update lastRunAt after triggering
    await database
      .update(funnel)
      .set({ lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(funnel.id, dueFunnel.id));

    triggered++;
  }

  // -------------------------------------------------------------------------
  // 3. Prune beacon_event rows older than 30 days
  // -------------------------------------------------------------------------
  const pruneResult = await database
    .delete(beaconEvent)
    .where(lt(beaconEvent.capturedAt, sql`now() - interval '30 days'`));

  // Drizzle returns `{ rowCount: number }` for deletes on node-postgres;
  // pglite/pg-lite may return a numeric or undefined — normalise defensively.
  const pruned =
    typeof pruneResult === "object" && pruneResult !== null && "rowCount" in pruneResult
      ? ((pruneResult as { rowCount?: number | null }).rowCount ?? 0)
      : 0;

  return { triggered, pruned };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST = handleRoute(async (req: NextRequest) => {
  // Read CRON_SECRET inside the handler (not at module scope) so a missing
  // env var surfaces at request time, not at build/boot time.
  const secret = requireEnv("CRON_SECRET");

  // Validate Authorization: Bearer <token> header using timing-safe comparison
  // to prevent timing-based secret enumeration attacks.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new ApiError("unauthorized", "Authorization header required");
  }

  const secretBuf = Buffer.from(secret, "utf-8");
  const tokenBuf = Buffer.from(token, "utf-8");

  // timingSafeEqual requires equal-length buffers; unequal length = invalid.
  const isValid =
    secretBuf.length === tokenBuf.length &&
    timingSafeEqual(secretBuf, tokenBuf);

  if (!isValid) {
    throw new ApiError("unauthorized", "Invalid CRON_SECRET");
  }

  // Run the job
  const result = await runCronJob();

  return NextResponse.json({
    ok: true,
    triggered: result.triggered,
    pruned: result.pruned,
  });
});
