/**
 * Tests for funnel server actions and funnel list UI.
 *
 * Three groups:
 * 1. Integration — createFunnel persists funnel + steps in pglite
 * 2. Unit — upsertFunnelSteps rejects invalid expectedEvents with ZodError
 * 3. Unit — FunnelListContent renders "Add Funnel" button
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";

import { createTestDb } from "@/tests/helpers/test-db";
import { user, property, funnelStep } from "@/lib/db/schema";
import {
  createFunnel,
  upsertFunnelSteps,
  listFunnels,
} from "@/lib/actions/funnel";
import { FunnelListContent } from "@/app/properties/[propertyId]/funnels/content";

// ---------------------------------------------------------------------------
// Mocks for Next.js
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => React.createElement("a", { href, ...props }, children),
}));

// ---------------------------------------------------------------------------
// Integration — createFunnel persists with steps
// ---------------------------------------------------------------------------

describe("createFunnel persists with steps", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();

    // Seed user + property
    await testDb.db.insert(user).values({
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      emailVerified: false,
    });
    await testDb.db.insert(property).values({
      id: "prop-1",
      userId: "user-1",
      name: "My Store",
      url: "https://store.example.com",
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("creates funnel_step rows with correct stepOrder and validated expectedEvents", async () => {
    const f = await createFunnel(
      {
        propertyId: "prop-1",
        userId: "user-1",
        name: "Checkout Funnel",
        steps: [
          {
            url: "https://store.example.com/cart",
            action: "Add to cart",
            expectedEvents: [
              { eventName: "add_to_cart", currency: "USD", value: 49.99 },
            ],
          },
          {
            url: "https://store.example.com/thank-you",
            action: "Purchase complete",
            expectedEvents: [
              {
                eventName: "purchase",
                currency: "USD",
                value: 49.99,
                dedupKey: "order-123",
              },
            ],
          },
        ],
      },
      testDb.db,
    );

    // Funnel should be persisted with the provided name
    expect(f.name).toBe("Checkout Funnel");
    expect(f.propertyId).toBe("prop-1");
    expect(f.userId).toBe("user-1");

    // Both steps should exist
    const steps = await testDb.db
      .select()
      .from(funnelStep)
      .where(eq(funnelStep.funnelId, f.id));

    expect(steps).toHaveLength(2);

    // Steps must be ordered correctly
    const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    expect(sorted[0].stepOrder).toBe(0);
    expect(sorted[1].stepOrder).toBe(1);

    // expectedEvents must be stored as JSON and match input
    const step0Events = sorted[0].expectedEvents as Array<{
      eventName: string;
    }>;
    expect(step0Events[0].eventName).toBe("add_to_cart");

    const step1Events = sorted[1].expectedEvents as Array<{
      eventName: string;
      dedupKey?: string;
    }>;
    expect(step1Events[0].eventName).toBe("purchase");
    expect(step1Events[0].dedupKey).toBe("order-123");
  });

  it("listFunnels returns only funnels for the given propertyId scoped to userId", async () => {
    await createFunnel(
      {
        propertyId: "prop-1",
        userId: "user-1",
        name: "Funnel A",
        steps: [],
      },
      testDb.db,
    );

    const funnels = await listFunnels("prop-1", "user-1", testDb.db);
    expect(funnels).toHaveLength(1);
    expect(funnels[0].name).toBe("Funnel A");
  });
});

// ---------------------------------------------------------------------------
// Unit — upsertFunnelSteps rejects invalid expectedEvents
// ---------------------------------------------------------------------------

describe("upsertFunnelSteps rejects invalid expectedEvents", () => {
  it("throws ZodError when eventName is missing from an expectedEvent", async () => {
    await expect(
      upsertFunnelSteps({
        funnelId: "funnel-id",
        steps: [
          {
            url: "https://example.com/purchase",
            // eventName is required but absent — should fail Zod validation
            expectedEvents: [{ currency: "USD", value: 99.99 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("throws ZodError when eventName is an empty string", async () => {
    await expect(
      upsertFunnelSteps({
        funnelId: "funnel-id",
        steps: [
          {
            url: "https://example.com/purchase",
            expectedEvents: [{ eventName: "" }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Unit — funnel list page renders Add Funnel button
// ---------------------------------------------------------------------------

describe("funnel list page renders Add Funnel button", () => {
  it("renders 'Add Funnel' button text with empty funnel data", () => {
    render(
      React.createElement(FunnelListContent, {
        funnels: [],
        propertyId: "prop-1",
      }),
    );

    // When empty, "Add Funnel" appears in both the PageHeader action and the
    // EmptyState action — getAllByText handles the multiple-match case.
    const addFunnelElements = screen.getAllByText("Add Funnel");
    expect(addFunnelElements.length).toBeGreaterThan(0);
  });

  it("renders 'Add Funnel' button text when funnels are present", () => {
    render(
      React.createElement(FunnelListContent, {
        funnels: [
          {
            id: "funnel-1",
            propertyId: "prop-1",
            userId: "user-1",
            name: "Checkout Funnel",
            scheduleMinutes: 15,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        propertyId: "prop-1",
      }),
    );

    // With funnels present, "Add Funnel" only appears in the PageHeader action
    expect(screen.getByText("Add Funnel")).toBeInTheDocument();
  });
});
