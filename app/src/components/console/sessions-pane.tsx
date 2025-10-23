"use client";

import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import type { Session, Prompt } from "@/lib/types";

interface SessionsPaneProps {
  sessions: Session[];
  prompts: Prompt[];
  isLoading: boolean;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function SessionsPane({ sessions, prompts, isLoading, activeSessionId, onSelectSession }: SessionsPaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Sessions</h2>
        <span className="text-xs text-slate-500">Last {sessions.length} shown</span>
      </div>
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions yet. Start one to view history.</p>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const metrics = session.metrics ?? {};
            const prompt = prompts.find((p) => p.id === session.promptId);
            const sessionTitle = prompt?.title ?? "Chat";
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={clsx(
                  "w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3 text-left text-sm transition hover:border-slate-600",
                  isActive && "ring-2 ring-sky-500/60"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-100 truncate">{sessionTitle}</span>
                  <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
                    {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <span>
                    First token
                    <br />
                  <span className="font-medium text-slate-300">
                      {metrics.avgFirstTokenLatencyMs !== undefined
                        ? `${metrics.avgFirstTokenLatencyMs}ms`
                        : "--"}
                    </span>
                  </span>
                  <span>
                    Tokens/sec
                    <br />
                  <span className="font-medium text-slate-300">
                      {metrics.avgTokensPerSec !== undefined ? metrics.avgTokensPerSec : "--"}
                    </span>
                  </span>
                  <span>
                    Error rate
                    <br />
                  <span className="font-medium text-slate-300">
                      {metrics.errorRate24h !== undefined
                        ? `${Math.round(metrics.errorRate24h * 100)}%`
                        : "--"}
                    </span>
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
