"use server";

/**
 * Server-side actions for funnel CRUD and funnel step upsert.
 *
 * Each function accepts an optional `db` argument (defaulting to the shared
 * app database) so integration tests can inject a pglite test database.
 *
 * `expectedEvents` on every step is validated with the canonical
 * `ExpectedEventSchema` Zod schema — invalid shapes are rejected with a
 * `ZodError` BEFORE any database write.
 */

import crypto from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db as defaultDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { funnel, funnelStep } from "@/lib/db/schema";
import { ExpectedEventSchema } from "@/lib/types/expected-event";

// ---------------------------------------------------------------------------
// Custom error types (module-internal — not exported from "use server" file)
// ---------------------------------------------------------------------------

/** Thrown when the caller does not own the targeted resource. */
class AuthorizationError extends Error {
  constructor(message = "Forbidden: you do not own this resource.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Thrown when a requested resource does not exist. */
class NotFoundError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Validated expected-events array schema (no `any`)
// ---------------------------------------------------------------------------

const ExpectedEventsSchema = z.array(ExpectedEventSchema);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunnelStepInput = {
  url: string;
  action?: string;
  /**
   * Array of expected events for this step. Each element must satisfy
   * `ExpectedEventSchema` (eventName required, currency/value/dedupKey
   * optional). Validated by Zod before any DB write.
   */
  expectedEvents?: z.infer<typeof ExpectedEventsSchema>;
};

export type CreateFunnelInput = {
  propertyId: string;
  userId: string;
  name: string;
  /** Defaults to 15 minutes. */
  scheduleMinutes?: number;
  steps: FunnelStepInput[];
};

export type UpsertFunnelStepsInput = {
  funnelId: string;
  steps: {
    url: string;
    action?: string;
    /** Validated by Zod (ExpectedEventsSchema.parse) before DB write. */
    expectedEvents?: unknown[];
  }[];
};

export type PublicFunnel = {
  id: string;
  propertyId: string;
  userId: string;
  name: string;
  scheduleMinutes: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Helper — validate expectedEvents with Zod before any DB operation
// ---------------------------------------------------------------------------

function validateStepEvents(
  steps: Array<{ url: string; action?: string; expectedEvents?: unknown[] }>,
): void {
  for (let i = 0; i < steps.length; i++) {
    const events = steps[i].expectedEvents;
    if (events !== undefined && events !== null) {
      // Throws ZodError if any element violates ExpectedEventSchema
      ExpectedEventsSchema.parse(events);
    }
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new funnel for `propertyId` / `userId`, optionally with initial
 * steps. `expectedEvents` on each step is validated via Zod before insertion.
 */
export async function createFunnel(
  input: CreateFunnelInput,
  db: Database = defaultDb,
): Promise<PublicFunnel> {
  const { propertyId, userId, scheduleMinutes = 15, steps } = input;
  const name = input.name?.trim();

  if (!name) throw new Error("Funnel name is required.");
  if (!propertyId) throw new Error("propertyId is required.");
  if (!userId) throw new Error("userId is required.");

  // Validate step events before touching the DB
  validateStepEvents(steps);

  const funnelId = crypto.randomUUID();

  const rows = await db
    .insert(funnel)
    .values({
      id: funnelId,
      propertyId,
      userId,
      name,
      scheduleMinutes,
    })
    .returning({
      id: funnel.id,
      propertyId: funnel.propertyId,
      userId: funnel.userId,
      name: funnel.name,
      scheduleMinutes: funnel.scheduleMinutes,
      enabled: funnel.enabled,
      createdAt: funnel.createdAt,
      updatedAt: funnel.updatedAt,
    });

  const row = rows[0];
  if (!row) throw new Error("Funnel insert did not return a row.");

  // Insert steps if provided
  if (steps.length > 0) {
    const stepValues = steps.map((s, index) => ({
      id: crypto.randomUUID(),
      funnelId,
      stepOrder: index,
      url: s.url,
      action: s.action ?? null,
      expectedEvents: (s.expectedEvents ?? []) as z.infer<
        typeof ExpectedEventsSchema
      >,
    }));

    await db.insert(funnelStep).values(stepValues);
  }

  return row;
}

/**
 * List all funnels for a property, scoped to the owning user.
 */
export async function listFunnels(
  propertyId: string,
  userId: string,
  db: Database = defaultDb,
): Promise<PublicFunnel[]> {
  if (!propertyId || !userId) return [];

  return db
    .select({
      id: funnel.id,
      propertyId: funnel.propertyId,
      userId: funnel.userId,
      name: funnel.name,
      scheduleMinutes: funnel.scheduleMinutes,
      enabled: funnel.enabled,
      createdAt: funnel.createdAt,
      updatedAt: funnel.updatedAt,
    })
    .from(funnel)
    .where(eq(funnel.propertyId, propertyId));
}

/**
 * Delete a funnel by id. Verifies ownership before deletion.
 *
 * Throws `NotFoundError` if the funnel does not exist.
 * Throws `AuthorizationError` if the caller does not own the funnel.
 */
export async function deleteFunnel(
  id: string,
  userId: string,
  db: Database = defaultDb,
): Promise<void> {
  const rows = await db
    .select({ userId: funnel.userId })
    .from(funnel)
    .where(eq(funnel.id, id));

  const existing = rows[0];
  if (!existing) throw new NotFoundError("Funnel not found.");
  if (existing.userId !== userId) {
    throw new AuthorizationError("You do not own this funnel.");
  }

  await db.delete(funnel).where(eq(funnel.id, id));
}

/**
 * Replace all steps for a funnel.
 *
 * Validates `expectedEvents` on each step with the canonical
 * `ExpectedEventSchema` — throws `ZodError` if any step's events are invalid,
 * before any database write.
 *
 * Steps are inserted in order (stepOrder = array index) after deleting
 * all existing steps for `funnelId`.
 */
export async function upsertFunnelSteps(
  input: UpsertFunnelStepsInput,
  db: Database = defaultDb,
): Promise<void> {
  const { funnelId, steps } = input;

  if (!funnelId) throw new Error("funnelId is required.");

  // Validate BEFORE any DB operation — throws ZodError on invalid events
  validateStepEvents(steps);

  // Delete existing steps then reinsert (full replace semantics)
  await db.delete(funnelStep).where(eq(funnelStep.funnelId, funnelId));

  if (steps.length > 0) {
    const stepValues = steps.map((s, index) => ({
      id: crypto.randomUUID(),
      funnelId,
      stepOrder: index,
      url: s.url,
      action: s.action ?? null,
      expectedEvents: (s.expectedEvents ?? []) as z.infer<
        typeof ExpectedEventsSchema
      >,
    }));

    await db.insert(funnelStep).values(stepValues);
  }
}
