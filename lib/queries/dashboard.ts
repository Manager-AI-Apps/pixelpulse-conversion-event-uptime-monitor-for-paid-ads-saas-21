/**
 * dashboardQuery — fetches all dashboard data for a user in two parallel
 * queries then merges the uptime stats in memory.
 *
 * Accepts a `db` argument (defaults to the app db) so integration tests can
 * supply a pglite test DB without mocking the module.
 */

import { desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, monitorRun, property } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RunSummary = {
  id: string;
  funnelId: string;
  funnelName: string;
  propertyName: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  diagnosis: string | null;
  /** % of non-running runs that were "passed" in the last 7 calendar days. */
  uptimePct7d: number;
  /** % of non-running runs that were "passed" in the last 30 calendar days. */
  uptimePct30d: number;
};

export type DashboardData = {
  totalFunnels: number;
  passingFunnels: number;
  failingFunnels: number;
  recentRuns: RunSummary[];
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Returns the percentage as a number in [0, 100], defaulting to 100 when no
 *  completed runs exist (no data = assume healthy). */
function pct(passed: number | string, total: number | string): number {
  const t = Number(total);
  const p = Number(passed);
  if (!Number.isFinite(t) || t === 0) return 100;
  return (p / t) * 100;
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function dashboardQuery(
  db: Database = appDb,
  userId: string,
): Promise<DashboardData> {
  // 1. Funnels for this user (cheap – no joins needed here)
  const userFunnels = await db
    .select({ id: funnel.id, name: funnel.name, propertyId: funnel.propertyId })
    .from(funnel)
    .where(eq(funnel.userId, userId));

  if (userFunnels.length === 0) {
    return {
      totalFunnels: 0,
      passingFunnels: 0,
      failingFunnels: 0,
      recentRuns: [],
    };
  }

  const funnelIds = userFunnels.map((f) => f.id);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 2. Parallel: recent runs + uptime stats per funnel
  const [recentRunRows, uptimeRows] = await Promise.all([
    db
      .select({
        id: monitorRun.id,
        funnelId: monitorRun.funnelId,
        funnelName: funnel.name,
        propertyName: property.name,
        status: monitorRun.status,
        startedAt: monitorRun.startedAt,
        finishedAt: monitorRun.finishedAt,
        diagnosis: monitorRun.diagnosis,
      })
      .from(monitorRun)
      .innerJoin(funnel, eq(monitorRun.funnelId, funnel.id))
      .innerJoin(property, eq(funnel.propertyId, property.id))
      .where(inArray(monitorRun.funnelId, funnelIds))
      .orderBy(desc(monitorRun.startedAt))
      .limit(20),

    db
      .select({
        funnelId: monitorRun.funnelId,
        // COUNT(*) FILTER is valid Postgres aggregate syntax
        passed7d: sql<string>`COUNT(*) FILTER (
          WHERE ${monitorRun.status} = 'passed'
          AND   ${monitorRun.startedAt} >= ${sevenDaysAgo}
        )`,
        total7d: sql<string>`COUNT(*) FILTER (
          WHERE ${monitorRun.startedAt} >= ${sevenDaysAgo}
          AND   ${monitorRun.status} != 'running'
        )`,
        passed30d: sql<string>`COUNT(*) FILTER (
          WHERE ${monitorRun.status} = 'passed'
          AND   ${monitorRun.startedAt} >= ${thirtyDaysAgo}
        )`,
        total30d: sql<string>`COUNT(*) FILTER (
          WHERE ${monitorRun.startedAt} >= ${thirtyDaysAgo}
          AND   ${monitorRun.status} != 'running'
        )`,
      })
      .from(monitorRun)
      .where(
        inArray(monitorRun.funnelId, funnelIds),
      )
      .groupBy(monitorRun.funnelId),
  ]);

  // 3. Build uptime lookup map
  const uptimeMap = new Map<string, { uptimePct7d: number; uptimePct30d: number }>();
  for (const row of uptimeRows) {
    uptimeMap.set(row.funnelId, {
      uptimePct7d: pct(row.passed7d, row.total7d),
      uptimePct30d: pct(row.passed30d, row.total30d),
    });
  }

  // 4. Determine passing / failing counts from the most-recent run per funnel
  const latestRunStatus = new Map<string, string>();
  for (const run of recentRunRows) {
    if (!latestRunStatus.has(run.funnelId)) {
      latestRunStatus.set(run.funnelId, run.status);
    }
  }

  let passingFunnels = 0;
  let failingFunnels = 0;
  for (const [, status] of latestRunStatus) {
    if (status === "passed") passingFunnels += 1;
    else if (status === "failed" || status === "error") failingFunnels += 1;
  }

  // 5. Merge uptime stats into each run row
  const recentRuns: RunSummary[] = recentRunRows.map((run) => {
    const stats = uptimeMap.get(run.funnelId) ?? {
      uptimePct7d: 100,
      uptimePct30d: 100,
    };
    return { ...run, ...stats };
  });

  return {
    totalFunnels: userFunnels.length,
    passingFunnels,
    failingFunnels,
    recentRuns,
  };
}
