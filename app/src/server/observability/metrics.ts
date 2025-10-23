interface MessageMetric {
  firstTokenLatencyMs: number;
  tokensPerSec: number;
  recordedAt: number;
}

interface ErrorMetric {
  recordedAt: number;
}

const messageMetrics: MessageMetric[] = [];
const errorMetrics: ErrorMetric[] = [];
const MAX_METRICS = 200;

export function recordMessageMetric(metric: MessageMetric): void {
  messageMetrics.push(metric);

  if (messageMetrics.length > MAX_METRICS) {
    messageMetrics.splice(0, messageMetrics.length - MAX_METRICS);
  }
}

export function recordErrorMetric(): void {
  errorMetrics.push({ recordedAt: Date.now() });

  if (errorMetrics.length > MAX_METRICS) {
    errorMetrics.splice(0, errorMetrics.length - MAX_METRICS);
  }
}

export function getAggregateMetrics(): {
  avgFirstTokenLatencyMs: number | null;
  avgTokensPerSec: number | null;
  errorRate24h: number;
} {
  const now = Date.now();
  const cutOff = now - 24 * 60 * 60 * 1000;

  const recentMessages = messageMetrics.filter((metric) => metric.recordedAt >= cutOff);
  const recentErrors = errorMetrics.filter((metric) => metric.recordedAt >= cutOff);

  const avgFirstTokenLatencyMs =
    recentMessages.length > 0
      ? Math.round(
          recentMessages.reduce((sum, metric) => sum + metric.firstTokenLatencyMs, 0) /
            recentMessages.length
        )
      : null;

  const avgTokensPerSec =
    recentMessages.length > 0
      ? Number(
          (
            recentMessages.reduce((sum, metric) => sum + metric.tokensPerSec, 0) /
            recentMessages.length
          ).toFixed(2)
        )
      : null;

  // Error rate uses total operations = messages length (avoid zero division)
  const totalOperations = recentMessages.length || 1;
  const errorRate24h = Number(
    Math.min(recentErrors.length / totalOperations, 1).toFixed(2)
  );

  return { avgFirstTokenLatencyMs, avgTokensPerSec, errorRate24h };
}

export function __resetMetricsForTest(): void {
  messageMetrics.length = 0;
  errorMetrics.length = 0;
}
