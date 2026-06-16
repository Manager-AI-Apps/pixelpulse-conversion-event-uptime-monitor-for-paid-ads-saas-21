/**
 * Types for the PixelPulse headless browser runner.
 *
 * All types are strictly typed — no `any`. The `InterceptedEvent.source`
 * is a discriminated union so call-sites cannot pass arbitrary strings.
 */

/** Tracking source classifiers recognized by the interceptor. */
export type EventSource = "ga4" | "meta" | "stripe" | "other";

/** One intercepted tracking event captured during a headless browser session. */
export interface InterceptedEvent {
  /** Tracking source: "ga4" | "meta" | "stripe" | "other". */
  source: EventSource;
  /** Raw event name as reported by the pixel/SDK (e.g. "purchase"). */
  eventName: string;
  /**
   * PII-stripped key/value payload.
   * Keys matching /email|name|phone|card|token/i are removed before storage.
   */
  payload: Record<string, unknown>;
  /** Unix timestamp (ms) when the network request was intercepted. */
  capturedAt: number;
  /** Page URL that was loaded when the event fired. */
  pageUrl: string;
}

/** Configuration for a single step in the funnel replay. */
export interface FunnelStepConfig {
  /** Full URL to navigate to at the start of this step. */
  url: string;
  /** Human-readable description of the user action (for diagnostics). */
  action?: string;
  /**
   * Action type for the step.
   * - `"navigate"` — just navigate to `url` and wait for network idle.
   * - `"click"`    — click the element matching `selector`.
   * - `"fill"`     — type `fillValue` into the element matching `selector`.
   */
  actionType?: "navigate" | "click" | "fill";
  /** CSS selector used for click / fill actions. */
  selector?: string;
  /** Value to type when `actionType` is `"fill"`. */
  fillValue?: string;
}

/** Status for a single funnel step execution, including events it produced. */
export interface StepResult {
  /** Zero-based index of this step. */
  stepIndex: number;
  /** URL that was navigated to. */
  url: string;
  /** Outcome of this step replay. */
  status: "passed" | "failed" | "skipped";
  /** Intercepted events captured specifically while this step was executing. */
  events: InterceptedEvent[];
  /** Error message if `status` is `"failed"`. */
  error?: string;
}

/**
 * Full result returned after a synthetic funnel replay with the headless
 * browser. This is the primary return type of `runFunnel`.
 */
export interface RunResult {
  /** Whether the replay completed all steps without a fatal browser error. */
  ok: boolean;
  /**
   * All intercepted tracking events from the run, capped at 50, with PII
   * stripped. Ordered by capture time.
   */
  interceptedEvents: InterceptedEvent[];
  /** Per-step outcome in the order the steps were executed. */
  stepResults: StepResult[];
  /** Human-readable error summary when `ok` is false. */
  error?: string;
  /** Wall-clock duration of the entire run in milliseconds. */
  durationMs: number;
}
