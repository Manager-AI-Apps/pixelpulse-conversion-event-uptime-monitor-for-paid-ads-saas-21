/**
 * Unit tests for lib/runner/assertion-engine.ts
 *
 * Each test group maps directly to one acceptance criterion:
 *  1. purchase_fired_without_value
 *  2. duplicate_via_gtag_gtm
 *  3. capi_silent_fail
 *  4. event_missing
 */

import { describe, it, expect } from "vitest";

import { assertEvents, type AssertionFunnelStep } from "@/lib/runner/assertion-engine";
import { DiagnosisCode } from "@/lib/runner/diagnosis";
import type { RunResult } from "@/lib/runner/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid RunResult, override fields as needed. */
function makeRunResult(
  interceptedEvents: RunResult["interceptedEvents"],
  ok = true,
): RunResult {
  return {
    ok,
    interceptedEvents,
    stepResults: [],
    durationMs: 500,
  };
}

// ---------------------------------------------------------------------------
// 1. purchase_fired_without_value
// ---------------------------------------------------------------------------

describe("detects purchase_fired_without_value", () => {
  it("returns purchase_fired_without_value when a purchase event has no value field", () => {
    const runResult = makeRunResult([
      {
        source: "ga4",
        eventName: "purchase",
        payload: { currency: "USD" }, // <— no `value`
        capturedAt: Date.now(),
        pageUrl: "https://example.com/thank-you",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "purchase", currency: "USD", value: 99 }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).toContain(DiagnosisCode.PurchaseFiredWithoutValue);
  });

  it("does NOT flag purchase_fired_without_value when value is present", () => {
    const runResult = makeRunResult([
      {
        source: "ga4",
        eventName: "purchase",
        payload: { value: 99, currency: "USD" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/thank-you",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "purchase", currency: "USD", value: 99 }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).not.toContain(DiagnosisCode.PurchaseFiredWithoutValue);
  });
});

// ---------------------------------------------------------------------------
// 2. duplicate_via_gtag_gtm
// ---------------------------------------------------------------------------

describe("detects duplicate_via_gtag_gtm", () => {
  it("returns duplicate_via_gtag_gtm when two purchase events arrive from ga4", () => {
    const runResult = makeRunResult([
      {
        source: "ga4",
        eventName: "purchase",
        payload: { value: 99, currency: "USD", tid: "G-AAA111" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/thank-you",
      },
      {
        source: "ga4",
        eventName: "purchase",
        payload: { value: 99, currency: "USD", tid: "G-AAA111" },
        capturedAt: Date.now() + 10,
        pageUrl: "https://example.com/thank-you",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "purchase" }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).toContain(DiagnosisCode.DuplicateViaGtagGtm);
  });

  it("does NOT flag duplicate_via_gtag_gtm for a single ga4 purchase event", () => {
    const runResult = makeRunResult([
      {
        source: "ga4",
        eventName: "purchase",
        payload: { value: 49.99, currency: "USD" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/ty",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      { stepIndex: 0, expectedEvents: [{ eventName: "purchase" }] },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).not.toContain(DiagnosisCode.DuplicateViaGtagGtm);
  });
});

// ---------------------------------------------------------------------------
// 3. capi_silent_fail
// ---------------------------------------------------------------------------

describe("detects capi_silent_fail", () => {
  it("returns capi_silent_fail when browser Meta pixel fires but no CAPI event is present", () => {
    // Browser Meta Pixel fires — source "meta"
    // No corresponding CAPI event (source "other" with _capi: true)
    const runResult = makeRunResult([
      {
        source: "meta",
        eventName: "Purchase",
        payload: { value: 99, currency: "USD" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/thank-you",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "purchase" }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).toContain(DiagnosisCode.CapiSilentFail);
  });

  it("does NOT flag capi_silent_fail when a CAPI event accompanies the browser pixel", () => {
    const runResult = makeRunResult([
      {
        source: "meta",
        eventName: "Purchase",
        payload: { value: 99, currency: "USD" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/thank-you",
      },
      // CAPI call represented as source="other" with _capi: true in payload
      {
        source: "other",
        eventName: "Purchase",
        payload: { _capi: true, value: 99, currency: "USD" },
        capturedAt: Date.now() + 5,
        pageUrl: "https://example.com/thank-you",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      { stepIndex: 0, expectedEvents: [{ eventName: "purchase" }] },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).not.toContain(DiagnosisCode.CapiSilentFail);
  });
});

// ---------------------------------------------------------------------------
// 4. event_missing
// ---------------------------------------------------------------------------

describe("detects event_missing", () => {
  it("returns event_missing when expected purchase event does not appear in interceptedEvents", () => {
    const runResult = makeRunResult([
      // Only an add_to_cart event fired — purchase never fired
      {
        source: "ga4",
        eventName: "add_to_cart",
        payload: { value: 99, currency: "USD" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/cart",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "purchase", currency: "USD", value: 99 }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).toContain(DiagnosisCode.EventMissing);
  });

  it("does NOT flag event_missing when the expected event is present", () => {
    const runResult = makeRunResult([
      {
        source: "ga4",
        eventName: "purchase",
        payload: { value: 99, currency: "USD" },
        capturedAt: Date.now(),
        pageUrl: "https://example.com/thank-you",
      },
    ]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "purchase" }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const codes = results.map((r) => r.diagnosisCode);
    expect(codes).not.toContain(DiagnosisCode.EventMissing);
  });

  it("returns event_missing for each step that has a missing event", () => {
    const runResult = makeRunResult([]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "sign_up" }],
      },
      {
        stepIndex: 1,
        expectedEvents: [{ eventName: "purchase" }],
      },
    ];

    const results = assertEvents(runResult, steps);
    const missing = results.filter((r) => r.diagnosisCode === DiagnosisCode.EventMissing);
    // Both events are missing
    expect(missing.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Invalid expectedEvents throws ZodError
// ---------------------------------------------------------------------------

describe("validates expectedEvents via ExpectedEventSchema", () => {
  it("throws when expectedEvents contains an invalid event (empty eventName)", () => {
    const runResult = makeRunResult([]);

    const steps: AssertionFunnelStep[] = [
      {
        stepIndex: 0,
        expectedEvents: [{ eventName: "" }],
      },
    ];

    expect(() => assertEvents(runResult, steps)).toThrow();
  });
});
