/**
 * Unit tests for lib/runner/playwright-runner.ts
 *
 * These are pure-function tests — they do NOT launch a real browser.
 * The three acceptance criteria tested here:
 *
 * 1. RunResult type is fully typed (tsc --noEmit gate covers this; runtime
 *    check confirms the type object is assignable with no `any`).
 * 2. stripPii removes keys matching /email|name|phone|card|token/i.
 * 3. capEvents returns at most 50 events.
 */

import { describe, it, expect } from "vitest";

import { stripPii, capEvents } from "@/lib/runner/playwright-runner";
import type { InterceptedEvent, RunResult } from "@/lib/runner/types";

// ---------------------------------------------------------------------------
// RunResult type is fully typed — tsc is the real check; this test documents
// the expected shape so a human reviewer can confirm there's no `any`.
// ---------------------------------------------------------------------------

describe("RunResult type is fully typed", () => {
  it("InterceptedEvent is assignable with strongly typed source", () => {
    const event: InterceptedEvent = {
      source: "ga4",
      eventName: "purchase",
      payload: { value: 99, currency: "USD" },
      capturedAt: Date.now(),
      pageUrl: "https://example.com/checkout",
    };
    expect(event.source).toBe("ga4");
    expect(event.eventName).toBe("purchase");
  });

  it("RunResult is assignable with an interceptedEvents array of InterceptedEvent", () => {
    const run: RunResult = {
      ok: true,
      interceptedEvents: [
        {
          source: "stripe",
          eventName: "purchase",
          payload: { value: 49.99 },
          capturedAt: Date.now(),
          pageUrl: "https://example.com/thank-you",
        },
      ],
      stepResults: [
        {
          stepIndex: 0,
          url: "https://example.com/thank-you",
          status: "passed",
          events: [],
        },
      ],
      durationMs: 1234,
    };
    expect(run.ok).toBe(true);
    expect(run.interceptedEvents).toHaveLength(1);
    expect(run.interceptedEvents[0].source).toBe("stripe");
  });
});

// ---------------------------------------------------------------------------
// stripPii — removes keys whose names match /email|name|phone|card|token/i
// ---------------------------------------------------------------------------

describe("stripPii", () => {
  it("removes the email key", () => {
    const result = stripPii({ email: "a@b.com", value: 99 });
    expect(result).toEqual({ value: 99 });
    expect(result).not.toHaveProperty("email");
  });

  it("removes all PII-pattern keys and keeps non-matching keys", () => {
    const input: Record<string, unknown> = {
      customerEmail: "x@y.com",
      customerName: "Alice",
      phoneNumber: "555-0100",
      cardNumber: "4242424242424242",
      accessToken: "tok_abc",
      amount: 100,
      currency: "USD",
      event_id: "ev_001",
    };
    const result = stripPii(input);
    expect(result).toEqual({ amount: 100, currency: "USD", event_id: "ev_001" });
  });

  it("is case-insensitive for the PII regex", () => {
    const result = stripPii({ EMAIL: "x@y.com", VALUE: 5 });
    expect(result).toEqual({ VALUE: 5 });
    expect(result).not.toHaveProperty("EMAIL");
  });

  it("preserves keys with no PII match", () => {
    const input = { en: "US", value: 99, event_id: "abc" };
    expect(stripPii(input)).toEqual({ en: "US", value: 99, event_id: "abc" });
  });

  it("returns empty object when all keys match PII pattern", () => {
    const input = { email: "a@b.com", name: "Bob", token: "tok_1" };
    expect(stripPii(input)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// capEvents — caps the collected events at MAX_EVENTS (50) per run
// ---------------------------------------------------------------------------

describe("capEvents", () => {
  it("caps at 50 when given 55 events", () => {
    const events: InterceptedEvent[] = Array.from({ length: 55 }, (_, i) => ({
      source: "ga4" as const,
      eventName: `event_${i}`,
      payload: { index: i },
      capturedAt: Date.now(),
      pageUrl: "https://example.com",
    }));
    const result = capEvents(events);
    expect(result).toHaveLength(50);
    // Should return the FIRST 50
    expect(result[0].eventName).toBe("event_0");
    expect(result[49].eventName).toBe("event_49");
  });

  it("returns all events when fewer than 50", () => {
    const events: InterceptedEvent[] = Array.from({ length: 10 }, (_, i) => ({
      source: "meta" as const,
      eventName: `ev_${i}`,
      payload: {},
      capturedAt: Date.now(),
      pageUrl: "https://example.com",
    }));
    expect(capEvents(events)).toHaveLength(10);
  });

  it("handles exactly 50 events", () => {
    const events: InterceptedEvent[] = Array.from({ length: 50 }, (_, i) => ({
      source: "stripe" as const,
      eventName: `ev_${i}`,
      payload: {},
      capturedAt: Date.now(),
      pageUrl: "https://example.com",
    }));
    expect(capEvents(events)).toHaveLength(50);
  });

  it("handles an empty array", () => {
    expect(capEvents([])).toHaveLength(0);
  });
});
