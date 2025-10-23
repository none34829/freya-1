import { getEnv } from "@/lib/env";
import { RateLimitError } from "@/lib/errors";

interface RateEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateEntry>();

export function consumeRateLimit(key: string): void {
  const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MIN } = getEnv();
  const windowMs = RATE_LIMIT_WINDOW_MIN * 60 * 1000;
  const now = Date.now();
  const entry = rateLimitStore.get(key) ?? { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil(
      (windowMs - (now - entry.timestamps[0])) / 1000
    );
    throw new RateLimitError("Too Many Requests", retryAfter);
  }

  entry.timestamps.push(now);
  rateLimitStore.set(key, entry);
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

export function __resetRateLimitsForTest(): void {
  rateLimitStore.clear();
}
