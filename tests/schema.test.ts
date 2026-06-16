import { describe, it, expect } from "vitest";

describe("ExpectedEventSchema", () => {
  it("parses a valid event with all fields", async () => {
    const { ExpectedEventSchema } = await import("@/lib/types/expected-event");
    const result = ExpectedEventSchema.parse({
      eventName: "purchase",
      currency: "USD",
      value: 99,
      dedupKey: "abc",
    });
    expect(result.eventName).toBe("purchase");
    expect(result.currency).toBe("USD");
    expect(result.value).toBe(99);
    expect(result.dedupKey).toBe("abc");
  });

  it("parses a valid event with only required fields", async () => {
    const { ExpectedEventSchema } = await import("@/lib/types/expected-event");
    const result = ExpectedEventSchema.parse({ eventName: "page_view" });
    expect(result.eventName).toBe("page_view");
    expect(result.currency).toBeUndefined();
    expect(result.value).toBeUndefined();
    expect(result.dedupKey).toBeUndefined();
  });

  it("throws when eventName is missing", async () => {
    const { ExpectedEventSchema } = await import("@/lib/types/expected-event");
    expect(() =>
      ExpectedEventSchema.parse({ currency: "USD", value: 99 })
    ).toThrow();
  });

  it("throws when eventName is not a string", async () => {
    const { ExpectedEventSchema } = await import("@/lib/types/expected-event");
    expect(() =>
      ExpectedEventSchema.parse({ eventName: 42 })
    ).toThrow();
  });
});
