import { describe, expect, afterEach, it } from "vitest";
import {
  recordMessageMetric,
  recordErrorMetric,
  getAggregateMetrics,
  __resetMetricsForTest
} from "@/server/observability/metrics";

afterEach(() => {
  __resetMetricsForTest();
});

describe("metrics aggregator", () => {
  it("computes averages for latency and throughput", () => {
    recordMessageMetric({ firstTokenLatencyMs: 100, tokensPerSec: 4, recordedAt: Date.now() });
    recordMessageMetric({ firstTokenLatencyMs: 200, tokensPerSec: 6, recordedAt: Date.now() });

    const metrics = getAggregateMetrics();

    expect(metrics.avgFirstTokenLatencyMs).toBe(150);
    expect(metrics.avgTokensPerSec).toBe(5);
  });

  it("calculates error rate over last 24h", () => {
    const now = Date.now();
    recordMessageMetric({ firstTokenLatencyMs: 120, tokensPerSec: 5, recordedAt: now });
    recordMessageMetric({ firstTokenLatencyMs: 130, tokensPerSec: 4.5, recordedAt: now });
    recordErrorMetric();

    const metrics = getAggregateMetrics();
    expect(metrics.errorRate24h).toBe(0.5);
  });

  it("ignores metrics older than 24 hours", () => {
    const now = Date.now();
    const twentyFiveHoursAgo = now - 25 * 60 * 60 * 1000;

    recordMessageMetric({
      firstTokenLatencyMs: 100,
      tokensPerSec: 3,
      recordedAt: twentyFiveHoursAgo
    });
    recordMessageMetric({
      firstTokenLatencyMs: 220,
      tokensPerSec: 9,
      recordedAt: now
    });

    const metrics = getAggregateMetrics();

    expect(metrics.avgFirstTokenLatencyMs).toBe(220);
    expect(metrics.avgTokensPerSec).toBe(9);
  });
});
