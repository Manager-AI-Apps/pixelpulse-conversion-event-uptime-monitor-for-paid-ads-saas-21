import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { Database } from "@/lib/db";

/**
 * Webhook idempotency.
 *
 * Stripe (and most providers) REDELIVER webhook events — the same event id can
 * arrive more than once (retries, at-least-once delivery). Recording each
 * handled event id and skipping repeats keeps handlers exactly-once: no
 * duplicate orders, no double-applied subscription changes.
 *
 * Per-app wiring when a webhook is added:
 *   1. Re-export the table from `lib/db/schema.ts` so `drizzle-kit push`
 *      creates it:
 *        export { processedWebhookEvents } from "@/lib/webhooks/idempotency";
 *   2. Claim the event at the top of the handler, before any work:
 *        if (!(await claimWebhookEvent(db, event.id))) {
 *          return new Response(null, { status: 200 }); // already handled
 *        }
 */
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

/**
 * Atomically claim an event id. Returns `true` the FIRST time an id is seen
 * (caller should process the event) and `false` if it was already recorded
 * (caller should skip). Race-safe under concurrent deliveries because it
 * relies on the primary-key conflict, not a read-then-write.
 */
export async function claimWebhookEvent(
  db: Database,
  eventId: string,
): Promise<boolean> {
  const inserted = await db
    .insert(processedWebhookEvents)
    .values({ eventId })
    .onConflictDoNothing()
    .returning({ eventId: processedWebhookEvents.eventId });
  return inserted.length > 0;
}
