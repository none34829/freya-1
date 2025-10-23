"use client";

import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import type { LogLine, SessionMetrics } from "@/lib/types";

interface MetricsPaneProps {
  metrics: SessionMetrics | null;
  logs: LogLine[];
  isLoading: boolean;
}

export function MetricsPane({ metrics, logs, isLoading }: MetricsPaneProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Metrics</h2>
        {metrics ? (
          <dl className="grid grid-cols-1 gap-3 text-sm text-slate-200">
            <MetricItem label="Avg first-token latency" value={metrics.avgFirstTokenLatencyMs !== null && metrics.avgFirstTokenLatencyMs !== undefined ? `${metrics.avgFirstTokenLatencyMs}ms` : "--"} />
            <MetricItem label="Avg tokens/sec" value={metrics.avgTokensPerSec !== null && metrics.avgTokensPerSec !== undefined ? metrics.avgTokensPerSec.toFixed(2) : "--"} />
            <MetricItem label="Error rate (24h)" value={metrics.errorRate24h !== null && metrics.errorRate24h !== undefined ? `${Math.round(metrics.errorRate24h * 100)}%` : "--"} />
          </dl>
        ) : (
          <p className="text-sm text-slate-500">No metrics yet.</p>
        )}
      </section>

      <section className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Logs</h2>
          <span className="text-xs text-slate-500">{logs.length} entries</span>
        </div>
        <div className="h-full space-y-2 overflow-y-auto pr-1 text-xs">
          {isLoading ? (
            <p className="text-slate-500">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-slate-500">No logs recorded in the last window.</p>
          ) : (
            logs.map((log) => (
              <div
                key={`${log.ts}-${log.msg}`}
                className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <span className={clsx("font-semibold", logLevelClass(log.level))}>{log.level.toUpperCase()}</span>
                  <span className="text-slate-500">
                    {formatDistanceToNow(new Date(log.ts), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-1 text-slate-200">{log.msg}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function logLevelClass(level: LogLine["level"]): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-yellow-300";
    default:
      return "text-slate-300";
  }
}
