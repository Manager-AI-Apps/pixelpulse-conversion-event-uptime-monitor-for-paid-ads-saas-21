/**
 * Tests for /dashboard page.
 *
 * Integration: dashboardQuery fetches uptime stats from pglite and scopes by userId.
 * Unit: DashboardContent renders the correct labels and empty state.
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { createTestDb } from "@/tests/helpers/test-db";
import { user, property, funnel, monitorRun } from "@/lib/db/schema";
import { dashboardQuery } from "@/lib/queries/dashboard";
import { DashboardContent } from "@/app/dashboard/content";

// ---------------------------------------------------------------------------
// Integration – real DB via pglite
// ---------------------------------------------------------------------------

describe("dashboard query returns uptime stats", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("returns uptimePct7d and uptimePct30d scoped to userId", async () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Insert user-1
    await testDb.db.insert(user).values({
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      emailVerified: false,
    });

    // Insert user-2 (should not appear in user-1 query)
    await testDb.db.insert(user).values({
      id: "user-2",
      name: "Other User",
      email: "other@example.com",
      emailVerified: false,
    });

    // Insert property for user-1
    await testDb.db.insert(property).values({
      id: "prop-1",
      userId: "user-1",
      name: "Test Property",
      url: "https://example.com",
    });

    // Insert property for user-2
    await testDb.db.insert(property).values({
      id: "prop-2",
      userId: "user-2",
      name: "Other Property",
      url: "https://other.com",
    });

    // Insert funnel for user-1
    await testDb.db.insert(funnel).values({
      id: "funnel-1",
      propertyId: "prop-1",
      userId: "user-1",
      name: "Checkout Funnel",
    });

    // Insert funnel for user-2
    await testDb.db.insert(funnel).values({
      id: "funnel-2",
      propertyId: "prop-2",
      userId: "user-2",
      name: "Other Funnel",
    });

    // user-1's funnel: 2 passed + 1 failed = 66.67% uptime (all within 7 days)
    await testDb.db.insert(monitorRun).values([
      {
        id: "run-1",
        funnelId: "funnel-1",
        status: "passed",
        startedAt: fiveDaysAgo,
      },
      {
        id: "run-2",
        funnelId: "funnel-1",
        status: "passed",
        startedAt: fourDaysAgo,
      },
      {
        id: "run-3",
        funnelId: "funnel-1",
        status: "failed",
        startedAt: threeDaysAgo,
      },
    ]);

    // user-2's funnel: all passed (should NOT appear in user-1 results)
    await testDb.db.insert(monitorRun).values([
      {
        id: "run-4",
        funnelId: "funnel-2",
        status: "passed",
        startedAt: threeDaysAgo,
      },
    ]);

    const result = await dashboardQuery(testDb.db, "user-1");

    // Scoped to user-1 only
    expect(result.totalFunnels).toBe(1);
    // 3 runs total for user-1's funnel
    expect(result.recentRuns).toHaveLength(3);

    // uptimePct7d and uptimePct30d fields must exist
    const run = result.recentRuns[0];
    expect(typeof run.uptimePct7d).toBe("number");
    expect(typeof run.uptimePct30d).toBe("number");

    // 2 passed / 3 total (non-running) = 66.67%
    expect(run.uptimePct7d).toBeCloseTo(66.67, 0);
    expect(run.uptimePct30d).toBeCloseTo(66.67, 0);
  });

  it("returns empty data when userId has no funnels", async () => {
    await testDb.db.insert(user).values({
      id: "user-empty",
      name: "Empty User",
      email: "empty@example.com",
      emailVerified: false,
    });

    const result = await dashboardQuery(testDb.db, "user-empty");
    expect(result.totalFunnels).toBe(0);
    expect(result.recentRuns).toHaveLength(0);
    expect(result.passingFunnels).toBe(0);
    expect(result.failingFunnels).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit – component rendering (no DB, data passed as props)
// ---------------------------------------------------------------------------

describe("dashboard renders uptime label", () => {
  it("renders 'uptime' and '7 days' text with monitor run data", () => {
    const { container } = render(
      React.createElement(DashboardContent, {
        data: {
          totalFunnels: 2,
          passingFunnels: 1,
          failingFunnels: 1,
          recentRuns: [
            {
              id: "run-1",
              funnelId: "funnel-1",
              funnelName: "Checkout",
              propertyName: "My Site",
              status: "passed",
              startedAt: new Date(),
              finishedAt: null,
              diagnosis: null,
              uptimePct7d: 95,
              uptimePct30d: 98,
            },
          ],
        },
      }),
    );

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toContain("uptime");
    expect(text).toContain("7 days");
  });
});

describe("empty state renders when no properties", () => {
  it("shows EmptyState when recentRuns is empty", () => {
    const { container } = render(
      React.createElement(DashboardContent, {
        data: {
          totalFunnels: 0,
          passingFunnels: 0,
          failingFunnels: 0,
          recentRuns: [],
        },
      }),
    );

    const text = container.textContent?.toLowerCase() ?? "";
    // EmptyState title should be visible
    expect(text).toContain("no monitor runs");
  });
});
