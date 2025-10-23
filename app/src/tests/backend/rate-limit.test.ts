import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, __resetRateLimitsForTest } from "@/server/rate-limit";
import { RateLimitError } from "@/lib/errors";

afterEach(() => {
  __resetRateLimitsForTest();
  vi.useRealTimers();
});

describe("rate limit", () => {
  it("allows requests within the window", () => {
    expect(() => consumeRateLimit("key:test")).not.toThrow();
  });

  it("throws when exceeding the limit", () => {
    for (let i = 0; i < 60; i += 1) {
      consumeRateLimit("key:limit");
    }
    expect(() => consumeRateLimit("key:limit")).toThrow(RateLimitError);
  });

  it("allows requests again after the window resets", () => {
    vi.useFakeTimers();
    const start = new Date("2025-01-01T00:00:00Z");
    vi.setSystemTime(start);

    const key = "key:window";
    for (let i = 0; i < 60; i += 1) {
      consumeRateLimit(key);
    }
    expect(() => consumeRateLimit(key)).toThrow(RateLimitError);

    const windowMs = 5 * 60 * 1000;
    vi.setSystemTime(start.getTime() + windowMs + 1000);

    expect(() => consumeRateLimit(key)).not.toThrow();
  });
});
