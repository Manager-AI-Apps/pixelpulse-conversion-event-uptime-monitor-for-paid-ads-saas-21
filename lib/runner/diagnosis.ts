/**
 * Typed diagnosis codes for the PixelPulse assertion engine.
 *
 * Each code represents a known failure mode that can be unambiguously detected
 * from intercepted tracking events during a synthetic monitor run.
 */

/** All known diagnosis codes — no `any`, exhaustive enum. */
export enum DiagnosisCode {
  /** A GA4 / conversion purchase event fired but the payload had no `value`. */
  PurchaseFiredWithoutValue = "purchase_fired_without_value",
  /**
   * The same purchase event fired twice from GA4 (once from gtag.js, once from
   * a GTM container) resulting in double-counted conversion data.
   */
  DuplicateViaGtagGtm = "duplicate_via_gtag_gtm",
  /**
   * The browser-side Meta Pixel fired a purchase event but no corresponding
   * Conversions API (CAPI) server-side call was detected.
   */
  CapiSilentFail = "capi_silent_fail",
  /**
   * A GA4 event was routed to a different Measurement ID than the one
   * expected, indicating a property misconfiguration.
   */
  Ga4PropertyMismatch = "ga4_property_mismatch",
  /** An expected tracking event did not appear in the intercepted events. */
  EventMissing = "event_missing",
}

/** One assertion failure produced by the assertion engine. */
export interface AssertionResult {
  /** Typed diagnosis code — never a raw string. */
  diagnosisCode: DiagnosisCode;
  /** Human-readable explanation of the failure (suitable for Slack alerts). */
  message: string;
  /** The event name that triggered the diagnosis, when applicable. */
  eventName?: string;
  /** Zero-based index of the funnel step this result relates to, if known. */
  stepIndex?: number;
}
