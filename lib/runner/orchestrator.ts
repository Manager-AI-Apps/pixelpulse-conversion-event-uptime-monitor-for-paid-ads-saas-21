/**
 * PixelPulse monitor run orchestrator.
 *
 * Ties together:
 *  1. The Playwright headless browser runner (with one retry on failure)
 *  2. The assertion engine (diagnosis of tracking failures)
 *  3. Persistence of monitor_run rows in Postgres
 *  4. Alert deduplication via INSERT … ON CONFLICT DO NOTHING
 *  5. Slack notification when a new alert is created
 *
 * Data-access functions accept an optional `db` argument so integration tests
 * can inject a pglite test database without mocking the module-level import.
 */

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { monitorRun, alert } from "@/lib/db/schema";
import { runFunnel } from "@/lib/runner/playwright-runner";
import {
  assertEvents,
  type AssertionFunnelStep,
} from "@/lib/runner/assertion-engine";
import type { FunnelStepConfig, RunResult } from "@/lib/runner/types";
import { buildSlackMessage, sendSlackAlert } from "@/lib/slack";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrchestratorInput {
  /** The funnel to replay. */
  funnelId: string;
  /** Ordered funnel steps consumed by the Playwright runner. */
  steps: FunnelStepConfig[];
  /**
   * Per-step expected events for the assertion engine.
   * Defaults to an empty array (no assertions) when omitted.
   */
  funnelStepsWithExpected?: AssertionFunnelStep[];
  /**
   * AES-256-GCM encrypted Slack webhook URL (from property.slackWebhookEncrypted).
   * When set, a Slack message is sent if a new alert is persisted.
   */
  slackWebhookEncrypted?: string | null;
  /**
   * Deterministic monitor run ID — used for alert deduplication in tests.
   * A random ID is generated when omitted.
   */
  monitorRunId?: string;
  /**
   * Drizzle database instance. Defaults to the app's shared pool.
   * Inject a pglite test db in integration tests.
   */
  db?: Database;
  /**
   * Override the Playwright runner — useful for tests so no real browser is
   * launched. Defaults to the production `runFunnel` from playwright-runner.
   */
  runner?: (steps: FunnelStepConfig[]) => Promise<RunResult>;
}

export interface OrchestratorResult {
  /** The monitor run ID that was persisted. */
  monitorRunId: string;
  /** Outcome of this run. */
  status: "pass" | "fail" | "error";
  /** Whether a new alert row was inserted (false when deduplicated). */
  alertInserted: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run the funnel runner with one automatic retry on failure.
 *
 * "Failure" means the runner throws OR returns `ok: false`. A second failure
 * returns a synthetic RunResult with `ok: false` rather than throwing.
 */
async function runWithRetry(
  runner: (steps: FunnelStepConfig[]) => Promise<RunResult>,
  steps: FunnelStepConfig[],
): Promise<RunResult> {
  let firstResult: RunResult | undefined;

  try {
    const result = await runner(steps);
    if (result.ok) return result;
    firstResult = result;
  } catch {
    // First attempt threw — fall through to retry.
  }

  // Retry once.
  try {
    return await runner(steps);
  } catch (retryErr) {
    // Both attempts failed — return a synthetic error result.
    const errorMessage =
      retryErr instanceof Error ? retryErr.message : String(retryErr);
    return (
      firstResult ?? {
        ok: false,
        interceptedEvents: [],
        stepResults: [],
        error: errorMessage,
        durationMs: 0,
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute one full monitor run cycle for a funnel:
 *
 * 1. Insert a `monitor_run` row with status `'running'`.
 * 2. Run the Playwright runner (retry once on failure).
 * 3. Run the assertion engine on the intercepted events.
 * 4. Update the `monitor_run` with the final status + diagnosis.
 * 5. If assertions failed, attempt to insert an `alert` row with
 *    `onConflictDoNothing()` to deduplicate concurrent/retry calls.
 * 6. If a new alert was inserted and a Slack webhook is configured, send the
 *    alert — failures are swallowed (delivery is best-effort).
 */
export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const {
    funnelId,
    steps,
    funnelStepsWithExpected = [],
    slackWebhookEncrypted,
    db = appDb,
    runner = runFunnel,
  } = input;

  const runId = input.monitorRunId ?? randomBytes(16).toString("hex");
  const startedAt = new Date();

  // -------------------------------------------------------------------------
  // 1. Create the monitor_run row (idempotent via onConflictDoNothing)
  // -------------------------------------------------------------------------
  await db
    .insert(monitorRun)
    .values({
      id: runId,
      funnelId,
      status: "running",
      startedAt,
    })
    .onConflictDoNothing();

  // -------------------------------------------------------------------------
  // 2. Run the Playwright runner with retry
  // -------------------------------------------------------------------------
  const runResult = await runWithRetry(runner, steps);

  // -------------------------------------------------------------------------
  // 3. Determine final status + diagnosis
  // -------------------------------------------------------------------------
  let status: "pass" | "fail" | "error";
  let diagnosis: string | null = null;
  let alertInserted = false;

  if (!runResult.ok) {
    status = "error";
    diagnosis = runResult.error ?? "Runner failed";
  } else {
    // Run assertions against intercepted events.
    const assertions = assertEvents(runResult, funnelStepsWithExpected);

    if (assertions.length === 0) {
      status = "pass";
    } else {
      status = "fail";
      diagnosis = assertions[0].message;

      // Build the Slack message from the first diagnosis code.
      const slackMsg = buildSlackMessage(assertions[0].diagnosisCode);

      // ------------------------------------------------------------------
      // 4. Insert alert with deduplication key = `${runId}_${channel}`
      //    onConflictDoNothing ensures idempotency on the primary key.
      // ------------------------------------------------------------------
      const alertId = `${runId}_slack`;
      const inserted = await db
        .insert(alert)
        .values({
          id: alertId,
          monitorRunId: runId,
          funnelId,
          channel: "slack",
          message: slackMsg,
          sentAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: alert.id });

      alertInserted = inserted.length > 0;

      // ------------------------------------------------------------------
      // 5. Send Slack notification if a NEW alert was created
      // ------------------------------------------------------------------
      if (alertInserted && slackWebhookEncrypted) {
        // Best-effort delivery — do not let Slack failures fail the run.
        await sendSlackAlert(slackWebhookEncrypted, slackMsg).catch(() => {
          // Intentionally swallowed.
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Update the monitor_run with final status
  // -------------------------------------------------------------------------
  await db
    .update(monitorRun)
    .set({
      status,
      finishedAt: new Date(),
      ...(diagnosis !== null ? { diagnosis } : {}),
      updatedAt: new Date(),
    })
    .where(eq(monitorRun.id, runId));

  return { monitorRunId: runId, status, alertInserted };
}
