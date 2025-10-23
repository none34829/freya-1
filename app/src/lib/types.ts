export type PromptId = string;

export interface Prompt {
  id: PromptId;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  history: Array<{
    version: number;
    title: string;
    body: string;
    tags: string[];
    updatedAt: string;
  }>;
}

export type SessionMode = "chat" | "voice" | "hybrid";
export type SessionId = string;

export interface Session {
  id: SessionId;
  promptId: PromptId;
  startedAt: string;
  endedAt?: string;
  mode: SessionMode;
  metrics: SessionMetrics;
  readOnly?: boolean;
}

export interface SessionMetrics {
  avgFirstTokenLatencyMs?: number;
  avgTokensPerSec?: number;
  errorRate24h?: number;
}

export type MessageId = string;

export interface Message {
  id: MessageId;
  sessionId: SessionId;
  role: "user" | "assistant" | "system";
  text?: string;
  audioUrl?: string;
  audioDurationMs?: number;
  createdAt: string;
  firstTokenAt?: string;
  lastTokenAt?: string;
  tokenCount?: number;
  tokenRate?: number;
  error?: string;
}

export interface LogLine {
  ts: string;
  level: "info" | "warn" | "error";
  msg: string;
  meta?: Record<string, unknown>;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: "developer";
}

export interface AgentTokenChunk {
  token: string;
  at: string;
}

export type AgentCompletionEvent =
  | {
      type: "assistant_token";
      data: AgentTokenChunk & { messageId: MessageId };
    }
  | {
      type: "assistant_done";
      data: {
        messageId: MessageId;
        totalTokens: number;
        firstTokenAt: string;
        lastTokenAt: string;
      };
    }
  | {
      type: "error";
      data: { message: string };
    }
  | {
      type: "degraded";
      data: { message: string };
    }
  | {
      type: "assistant_audio";
      data: {
        messageId: MessageId;
        audioUrl: string;
        durationMs?: number;
        voice?: string;
      };
    };
