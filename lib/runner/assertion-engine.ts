/**
 * PixelPulse assertion engine.
 *
 * Takes a RunResult from the headless browser runner and a set of per-step
 * expected events (validated via ExpectedEventSchema), and produces a typed
 * list of AssertionResult diagnoses.
 *
 * Detects:
 *  - purchase_fired_without_value  - purchase event present but payload has no value
 *  - duplicate_via_gtag_gtm        - 2+ GA4 purchase events in a single run
 *  - capi_silent_fail              - browser Meta Pixel fired, no CAPI call present
 *  - ga4_property_mismatch         - conflicting GA4 Measurement IDs in intercepted events
 *  - event_missing                 - an expected event was not captured at all
 *
 * No any escapes into the public API surface. Invalid expectedEvents arrays
 * are rejected at runtime via Zod (throws ZodError).
 */

import { z } from "zod";

import { ExpectedEventSchema } from "@/lib/types/expected-event";
import type { RunResult, InterceptedEvent } from "./types";
import { DiagnosisCode } from "./diagnosis";
import type { AssertionResult } from "./diagnosis";

export type { AssertionResult };

// ---------------------------------------------------------------------------
// Public parameter types
// ---------------------------------------------------------------------------

/**
 * A single funnel step as seen by the assertion engine.
 * expectedEvents is validated at runtime via ExpectedEventSchema.array().
 */
export interface AssertionFunnelStep {
  /** Zero-based index matching the funnel step order. */
  stepIndex: number;
  /**
   * Events expected to fire during this step.
   * Each entry must satisfy ExpectedEventSchema; an invalid entry causes
   * assertEvents to throw a ZodError.
   */
  expectedEvents: z.infer<typeof ExpectedEventSchema>[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalise an event name to lowercase for case-insensitive comparison. */
function normaliseName(name: string): string {
  return name.toLowerCase().trim();
}

/** Purchase-event names across common tracking platforms. */
const PURCHASE_NAMES = new Set(["purchase", "purchase_complete"]);

function isPurchaseEvent(eventName: string): boolean {
  return PURCHASE_NAMES.has(normaliseName(eventName));
}

/** Check whether an event carries a non-zero value field in its payload. */
function hasValue(event: InterceptedEvent): boolean {
  const v = event.payload["value"];
  return v !== undefined && v !== null && v !== 0 && v !== "";
}

/**
 * Return whether an InterceptedEvent represents a CAPI (server-to-server)
 * Conversions API call.
 *
 * Convention: CAPI calls are captured as source "other" events with
 * payload._capi === true. This flag is set by the runner network
 * interceptor when it detects a call to graph.facebook.com/events.
 */
function isCapiEvent(event: InterceptedEvent): boolean {
  return (
    event.source === "other" &&
    event.payload["_capi"] === true
  );
}

// ---------------------------------------------------------------------------
// Core assertion logic (pure functions for testability)
// ---------------------------------------------------------------------------

/**
 * Check for purchase events that were intercepted but carry no conversion
 * value. Returns one result per offending event.
 */
function checkPurchaseFiredWithoutValue(
  events: InterceptedEvent[],
): AssertionResult[] {
  return events
    .filter((e) => isPurchaseEvent(e.eventName) && !hasValue(e))
    .map((e) => ({
      diagnosisCode: DiagnosisCode.PurchaseFiredWithoutValue,
      message:
        "Purchase event '" + e.eventName + "' fired without a conversion value. " +
        "Ad bidding may optimise against an unmeasured event.",
      eventName: e.eventName,
    }));
}

/**
 * Detect when the same purchase event fires more than once from GA4,
 * indicating both gtag.js and a GTM container fired duplicates.
 */
function checkDuplicateViaGtagGtm(
  events: InterceptedEvent[],
): AssertionResult[] {
  const ga4Purchases = events.filter(
    (e) => e.source === "ga4" && isPurchaseEvent(e.eventName),
  );

  if (ga4Purchases.length < 2) {
    return [];
  }

  return [
    {
      diagnosisCode: DiagnosisCode.DuplicateViaGtagGtm,
      message:
        ga4Purchases.length.toString() + " GA4 purchase events detected in a single " +
        "run — likely fired by both gtag.js and a GTM container. " +
        "Conversion count will be doubled in your ad platform.",
      eventName: ga4Purchases[0].eventName,
    },
  ];
}

/**
 * Detect when the browser Meta Pixel fires a purchase/conversion event but no
 * corresponding server-side CAPI call is present.
 *
 * CAPI calls are identified by isCapiEvent(): source=other, _capi=true.
 */
function checkCapiSilentFail(
  events: InterceptedEvent[],
): AssertionResult[] {
  const metaPurchases = events.filter(
    (e) => e.source === "meta" && isPurchaseEvent(e.eventName),
  );

  if (metaPurchases.length === 0) {
    // No Meta pixel fired at all — not a CAPI issue.
    return [];
  }

  const hasCapi = events.some(isCapiEvent);
  if (hasCapi) {
    return [];
  }

  return [
    {
      diagnosisCode: DiagnosisCode.CapiSilentFail,
      message:
        "Meta Pixel purchase event fired in the browser but no " +
        "server-side Conversions API (CAPI) call was detected. " +
        "iOS privacy restrictions may cause significant under-reporting.",
      eventName: metaPurchases[0].eventName,
    },
  ];
}

/**
 * Detect conflicting GA4 Measurement IDs (e.g. after a property migration
 * where two different G-XXXXXXX IDs are active simultaneously).
 *
 * The GA4 hit payload includes a tid field containing the Measurement ID.
 */
function checkGa4PropertyMismatch(
  events: InterceptedEvent[],
): AssertionResult[] {
  const ga4Events = events.filter((e) => e.source === "ga4");
  if (ga4Events.length === 0) return [];

  const tids = new Set<string>(
    ga4Events
      .map((e) => e.payload["tid"])
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );

  if (tids.size <= 1) {
    return [];
  }

  return [
    {
      diagnosisCode: DiagnosisCode.Ga4PropertyMismatch,
      message:
        "GA4 events were sent to " + tids.size.toString() + " different Measurement IDs " +
        "(" + [...tids].join(", ") + ") in the same run. " +
        "Data may be split across multiple GA4 properties.",
    },
  ];
}

/**
 * Check that every expected event in every step has at least one matching
 * intercepted event (matched by normalised event name).
 */
function checkEventMissing(
  events: InterceptedEvent[],
  funnelSteps: AssertionFunnelStep[],
): AssertionResult[] {
  const results: AssertionResult[] = [];

  const capturedNames = new Set(events.map((e) => normaliseName(e.eventName)));

  for (const step of funnelSteps) {
    for (const expected of step.expectedEvents) {
      const normalised = normaliseName(expected.eventName);
      if (!capturedNames.has(normalised)) {
        results.push({
          diagnosisCode: DiagnosisCode.EventMissing,
          message:
            "Expected event '" + expected.eventName + "' was not captured at " +
            "step " + step.stepIndex.toString() + ". The pixel may have stopped firing.",
          eventName: expected.eventName,
          stepIndex: step.stepIndex,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const expectedEventsArraySchema = z.array(ExpectedEventSchema);

/**
 * Run all assertions against a completed headless browser runResult and the
 * expected events defined for each funnel step.
 *
 * @param runResult   - The result returned by runFunnel (or equivalent).
 * @param funnelSteps - Per-step configuration containing expected events.
 *                      Each step expectedEvents is validated at runtime;
 *                      invalid items throw a ZodError.
 * @returns           An array of AssertionResult — empty when everything
 *                    looks correct, or one entry per detected problem.
 *
 * @throws {ZodError} When any step expectedEvents fails schema validation.
 */
export function assertEvents(
  runResult: RunResult,
  funnelSteps: AssertionFunnelStep[],
): AssertionResult[] {
  // Validate expectedEvents at runtime before doing any comparisons.
  for (const step of funnelSteps) {
    // Throws ZodError if invalid — propagates to the caller.
    expectedEventsArraySchema.parse(step.expectedEvents);
  }

  const events = runResult.interceptedEvents;

  // Run all checks and flatten their results into one list.
  return [
    ...checkPurchaseFiredWithoutValue(events),
    ...checkDuplicateViaGtagGtm(events),
    ...checkCapiSilentFail(events),
    ...checkGa4PropertyMismatch(events),
    ...checkEventMissing(events, funnelSteps),
  ];
}
