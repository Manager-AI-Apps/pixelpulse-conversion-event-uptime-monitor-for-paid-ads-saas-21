/**
 * PixelPulse headless browser runner.
 *
 * Replays a recorded funnel using Chromium (via playwright-core), intercepts
 * GA4, Meta Pixel, and Stripe network requests, strips PII, caps events at 50,
 * and returns a fully typed RunResult.
 *
 * playwright-core is an optional runtime dependency — it is loaded dynamically
 * so that the module can be imported in environments (tests, edge functions)
 * where playwright-core is not installed. The module specifier is intentionally
 * widened to `string` to prevent TypeScript from attempting static module
 * resolution at compile time.
 */

import type {
  EventSource,
  FunnelStepConfig,
  InterceptedEvent,
  RunResult,
  StepResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of intercepted events stored per run. */
const MAX_EVENTS = 50;

/** PII regex: matches key names that likely contain personal data. */
const PII_PATTERN = /email|name|phone|card|token/i;

/** Network URL patterns that identify known tracking endpoints. */
const SOURCE_PATTERNS: { pattern: RegExp; source: EventSource }[] = [
  { pattern: /google-analytics\.com\/g\/collect|gtag\/collect/, source: "ga4" },
  { pattern: /facebook\.com\/tr/, source: "meta" },
  { pattern: /r\.stripe\.com/, source: "stripe" },
];

// ---------------------------------------------------------------------------
// Pure utility functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Strips top-level keys from `payload` whose names match PII_PATTERN.
 * Returns a new object — does not mutate the input.
 */
export function stripPii(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!PII_PATTERN.test(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Returns at most MAX_EVENTS (50) items from `events`.
 * Earlier events are preferred (first-50 semantics).
 */
export function capEvents(events: InterceptedEvent[]): InterceptedEvent[] {
  return events.slice(0, MAX_EVENTS);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Classify a request URL as a known tracking source or "other". */
function classifyUrl(requestUrl: string): EventSource | null {
  for (const { pattern, source } of SOURCE_PATTERNS) {
    if (pattern.test(requestUrl)) {
      return source;
    }
  }
  return null;
}

/**
 * Parse a raw payload string (JSON body or URL-encoded query string) into a
 * key/value object. Returns an empty object on parse failure.
 */
function parsePayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  // Attempt JSON first
  if (raw.trimStart().startsWith("{") || raw.trimStart().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to URL-encoded parse
    }
  }
  // URL-encoded form data
  try {
    const params = new URLSearchParams(raw);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Minimal playwright-core type shims
// (playwright-core is loaded dynamically at runtime; only its public API
//  surface is described here — no `any` escapes into RunResult or callers)
// ---------------------------------------------------------------------------

type PwRequest = {
  url(): string;
  postData(): string | null;
  method(): string;
};

type PwPage = {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  click(selector: string, opts?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string, opts?: { timeout?: number }): Promise<void>;
  close(): Promise<void>;
  on(event: "request", handler: (req: PwRequest) => void): void;
  url(): string;
};

type PwBrowser = {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
};

type PwModule = {
  chromium: {
    executablePath(): string;
    launch(opts?: { executablePath?: string; headless?: boolean }): Promise<PwBrowser>;
  };
};

/**
 * Load playwright-core at runtime.
 *
 * We widen the specifier type to `string` so TypeScript does not attempt
 * static module resolution — playwright-core is NOT a compile-time dep.
 * The cast to `PwModule` is safe because we own the `playwright-core` API
 * surface we use; if the package is missing, this throws at runtime.
 */
async function loadPlaywright(): Promise<PwModule> {
  // Intentionally widened to `string` to block static module resolution.
  const moduleId: string = "playwright-core";
  const pw = await import(/* webpackIgnore: true */ moduleId);
  return pw as unknown as PwModule;
}

/** Resolve the Chromium executable path from env or playwright's auto-detect. */
function resolveExecutablePath(pw: PwModule): string | undefined {
  const envPath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
  if (envPath) return envPath;
  try {
    return pw.chromium.executablePath();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Replay `steps` in a headless Chromium session, intercept tracking events
 * from GA4 / Meta Pixel / Stripe endpoints, and return a fully typed
 * RunResult.
 *
 * - Events are capped at 50 per run.
 * - PII fields (matching /email|name|phone|card|token/i) are stripped from
 *   all intercepted payloads before the result is returned.
 * - Each unsuccessful step is recorded as "failed"; subsequent steps are
 *   marked "skipped" after the first failure to avoid cascading errors.
 */
export async function runFunnel(
  steps: FunnelStepConfig[],
): Promise<RunResult> {
  const startedAt = Date.now();

  let pw: PwModule;
  try {
    pw = await loadPlaywright();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load playwright-core";
    return {
      ok: false,
      interceptedEvents: [],
      stepResults: [],
      error: `Playwright unavailable: ${message}`,
      durationMs: Date.now() - startedAt,
    };
  }

  const executablePath = resolveExecutablePath(pw);
  let browser: PwBrowser | null = null;

  try {
    browser = await pw.chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });

    const page = await browser.newPage();

    // Accumulate intercepted events across all steps.
    const allEvents: InterceptedEvent[] = [];
    // Track which events were present at the start of each step so we can
    // attribute new events to the step they were captured in.
    let eventCountAtStepStart = 0;

    // Install the network interceptor once — it fills `allEvents`.
    page.on("request", (req: PwRequest) => {
      if (allEvents.length >= MAX_EVENTS) return;
      const requestUrl = req.url();
      const source = classifyUrl(requestUrl);
      if (source === null) return;

      const rawBody = req.postData();
      const urlParams = requestUrl.includes("?")
        ? requestUrl.slice(requestUrl.indexOf("?") + 1)
        : null;
      const rawPayload = rawBody ?? urlParams;
      const parsed = parsePayload(rawPayload);
      const stripped = stripPii(parsed);

      // Extract event name: GA4 uses "en", Meta uses "event", Stripe varies.
      const eventName =
        (stripped["en"] as string | undefined) ??
        (stripped["event"] as string | undefined) ??
        "event";

      allEvents.push({
        source,
        eventName,
        payload: stripped,
        capturedAt: Date.now(),
        pageUrl: page.url(),
      });
    });

    const stepResults: StepResult[] = [];
    let aborted = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (aborted) {
        stepResults.push({
          stepIndex: i,
          url: step.url,
          status: "skipped",
          events: [],
        });
        continue;
      }

      eventCountAtStepStart = allEvents.length;

      try {
        // Navigate if needed (always navigate for "navigate" or first action)
        if (step.actionType === "navigate" || !step.actionType) {
          await page.goto(step.url, { waitUntil: "networkidle", timeout: 30_000 });
        } else {
          // Non-navigate step: still navigate if the URL differs from current
          if (page.url() !== step.url) {
            await page.goto(step.url, { waitUntil: "networkidle", timeout: 30_000 });
          }
          if (step.actionType === "click" && step.selector) {
            await page.click(step.selector, { timeout: 10_000 });
          } else if (step.actionType === "fill" && step.selector) {
            await page.fill(step.selector, step.fillValue ?? "", { timeout: 10_000 });
          }
        }

        // Events captured during this step
        const stepEvents = allEvents.slice(eventCountAtStepStart);

        stepResults.push({
          stepIndex: i,
          url: step.url,
          status: "passed",
          events: stepEvents,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stepResults.push({
          stepIndex: i,
          url: step.url,
          status: "failed",
          events: allEvents.slice(eventCountAtStepStart),
          error: message,
        });
        aborted = true;
      }
    }

    await page.close();

    const cappedEvents = capEvents(allEvents);
    const anyFailed = stepResults.some((s) => s.status === "failed");

    return {
      ok: !anyFailed,
      interceptedEvents: cappedEvents,
      stepResults,
      ...(anyFailed
        ? {
            error: stepResults.find((s) => s.status === "failed")?.error,
          }
        : {}),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (browser !== null) {
      await browser.close().catch(() => {
        // Best-effort cleanup — do not mask the original error.
      });
    }
  }
}
