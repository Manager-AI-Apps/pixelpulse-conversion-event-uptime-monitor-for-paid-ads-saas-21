import { z } from "zod";

/**
 * The per-step assertion shape recorded by the funnel recorder and checked
 * during each synthetic monitor run.
 *
 * - `eventName`  Required. The tracking event name e.g. "purchase", "sign_up".
 * - `currency`   Optional ISO-4217 code (e.g. "USD"). Checked when present.
 * - `value`      Optional numeric conversion value. Checked when present.
 * - `dedupKey`   Optional deduplication / event-id key. Checked when present.
 */
export const ExpectedEventSchema = z.object({
  eventName: z.string().min(1, "eventName must not be empty"),
  currency: z.string().optional(),
  value: z.number().optional(),
  dedupKey: z.string().optional(),
});

export type ExpectedEvent = z.infer<typeof ExpectedEventSchema>;
