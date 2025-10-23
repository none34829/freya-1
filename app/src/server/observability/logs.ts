import type { LogLine } from "@/lib/types";

const MAX_LOGS = 200;
const logs: LogLine[] = [];

export function logLine(entry: Omit<LogLine, "ts"> & { ts?: string }): void {
  const fullEntry: LogLine = {
    ts: entry.ts ?? new Date().toISOString(),
    level: entry.level,
    msg: entry.msg,
    ...(entry.meta ? { meta: entry.meta } : {})
  };

  logs.push(fullEntry);

  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  if (process.env.NODE_ENV !== "test") {
    console.log(`[${fullEntry.level.toUpperCase()}] ${fullEntry.ts} ${fullEntry.msg}`, fullEntry.meta ?? "");
  }
}

export function getRecentLogs(limit = 20): LogLine[] {
  return logs.slice(-limit).reverse();
}
