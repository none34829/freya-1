import { promises as fs } from "fs";
import path from "path";
import { getEnv } from "@/lib/env";
import type {
  Message,
  MessageId,
  PromptId,
  Session,
  SessionId,
  SessionMetrics,
  SessionMode
} from "@/lib/types";
import { logLine } from "../observability/logs";

interface PersistedData {
  sessions: Session[];
  messages: Message[];
}

const defaultData: PersistedData = {
  sessions: [],
  messages: []
};

let data: PersistedData = structuredClone(defaultData);
let isLoaded = false;
let writeQueue: Promise<void> = Promise.resolve();

function resolveDbPath(): string {
  const { PERSIST_DB_URL } = getEnv();

  if (PERSIST_DB_URL && PERSIST_DB_URL.startsWith("file:")) {
    const rawPath = PERSIST_DB_URL.replace("file:", "");
    return path.resolve(process.cwd(), rawPath);
  }

  return path.resolve(process.cwd(), "data", "freya.json");
}

async function ensureLoaded(): Promise<void> {
  if (isLoaded) {
    return;
  }

  const dbPath = resolveDbPath();
  try {
    const fileContent = await fs.readFile(dbPath, "utf-8");
    data = JSON.parse(fileContent) as PersistedData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await persist();
    } else {
      throw error;
    }
  }

  isLoaded = true;
}

async function persist(): Promise<void> {
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), "utf-8");
}

async function mutate<T>(fn: (state: PersistedData) => T): Promise<T> {
  await ensureLoaded();
  const result = fn(data);
  writeQueue = writeQueue.then(() => persist());
  await writeQueue;
  return result;
}

export async function createSessionRecord(params: {
  promptId: PromptId;
  mode: SessionMode;
}): Promise<Session> {
  const now = new Date().toISOString();
  return mutate((state) => {
    const session: Session = {
      id: crypto.randomUUID(),
      promptId: params.promptId,
      startedAt: now,
      mode: params.mode,
      metrics: {},
      readOnly: false
    };

    state.sessions.push(session);
    logLine({
      level: "info",
      msg: "Session created",
      meta: { sessionId: session.id, promptId: session.promptId, mode: session.mode }
    });
    return session;
  });
}

export async function listSessions(limit = 10): Promise<Session[]> {
  await ensureLoaded();
  return [...data.sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit)
    .map((session) => ({ ...session, readOnly: true }));
}

export async function getSession(sessionId: SessionId): Promise<Session | null> {
  await ensureLoaded();
  const found = data.sessions.find((session) => session.id === sessionId);
  if (!found) {
    return null;
  }
  return { ...found };
}

export async function endSession(sessionId: SessionId): Promise<void> {
  await mutate((state) => {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (session) {
      session.endedAt = new Date().toISOString();
    }
  });
}

export async function addUserMessage(params: {
  sessionId: SessionId;
  text?: string;
  audioUrl?: string;
  audioDurationMs?: number;
}): Promise<Message> {
  const now = new Date().toISOString();
  return mutate((state) => {
    const message: Message = {
      id: crypto.randomUUID(),
      sessionId: params.sessionId,
      role: "user",
      text: params.text,
      audioUrl: params.audioUrl,
      audioDurationMs: params.audioDurationMs,
      createdAt: now
    };

    state.messages.push(message);
    logLine({
      level: "info",
      msg: "User message stored",
      meta: { sessionId: params.sessionId, messageId: message.id }
    });
    return message;
  });
}

export async function createAssistantMessage(sessionId: SessionId): Promise<Message> {
  const now = new Date().toISOString();
  return mutate((state) => {
    const message: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      text: "",
      createdAt: now
    };

    state.messages.push(message);
    logLine({
      level: "info",
      msg: "Assistant message created",
      meta: { sessionId, messageId: message.id }
    });
    return message;
  });
}

export async function appendAssistantToken(params: {
  sessionId: SessionId;
  messageId: MessageId;
  token: string;
  at: string;
}): Promise<Message | null> {
  return mutate((state) => {
    const message = state.messages.find(
      (item) => item.id === params.messageId && item.sessionId === params.sessionId
    );

    if (!message) {
      return null;
    }

    message.text = (message.text ?? "") + params.token;
    message.tokenCount = (message.tokenCount ?? 0) + 1;
    message.lastTokenAt = params.at;
    if (!message.firstTokenAt) {
      message.firstTokenAt = params.at;
    }

    return { ...message };
  });
}

export async function finalizeAssistantMessage(params: {
  sessionId: SessionId;
  messageId: MessageId;
  completedAt: string;
}): Promise<Message | null> {
  return mutate((state) => {
    const message = state.messages.find(
      (item) => item.id === params.messageId && item.sessionId === params.sessionId
    );

    if (!message) {
      return null;
    }

    message.lastTokenAt = params.completedAt;

    if (message.firstTokenAt && message.tokenCount && message.tokenCount > 0) {
      const durationMs =
        new Date(message.lastTokenAt).getTime() - new Date(message.firstTokenAt).getTime();
      const durationSec = Math.max(durationMs / 1000, 0.001);
      message.tokenRate = Number((message.tokenCount / durationSec).toFixed(2));
    }

    return { ...message };
  });
}

export async function attachMessageAudio(params: {
  sessionId: SessionId;
  messageId: MessageId;
  audioUrl: string;
  audioDurationMs?: number;
}): Promise<Message | null> {
  return mutate((state) => {
    const message = state.messages.find(
      (item) => item.id === params.messageId && item.sessionId === params.sessionId
    );

    if (!message) {
      return null;
    }

    message.audioUrl = params.audioUrl;
    if (typeof params.audioDurationMs === "number") {
      message.audioDurationMs = params.audioDurationMs;
    }

    return { ...message };
  });
}

export async function recordMessageError(params: {
  sessionId: SessionId;
  messageId: MessageId;
  error: string;
}): Promise<Message | null> {
  return mutate((state) => {
    const message = state.messages.find(
      (item) => item.id === params.messageId && item.sessionId === params.sessionId
    );

    if (!message) {
      return null;
    }

    message.error = params.error;
    message.lastTokenAt = new Date().toISOString();
    return { ...message };
  });
}

export async function getSessionMessages(sessionId: SessionId): Promise<Message[]> {
  await ensureLoaded();
  return data.messages
    .filter((message) => message.sessionId === sessionId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((message) => ({ ...message }));
}

export async function computeSessionMetrics(sessionId: SessionId): Promise<SessionMetrics> {
  const messages = await getSessionMessages(sessionId);
  const assistantMessages = messages.filter((message) => message.role === "assistant");

  if (assistantMessages.length === 0) {
    return {};
  }

  const latencies = assistantMessages
    .map((message) => {
      if (!message.firstTokenAt) {
        return null;
      }

      const userMessage = messages
        .filter((m) => m.role === "user")
        .reverse()
        .find((m) => new Date(m.createdAt).getTime() <= new Date(message.createdAt).getTime());

      if (!userMessage) {
        return null;
      }

      return (
        new Date(message.firstTokenAt).getTime() - new Date(userMessage.createdAt).getTime()
      );
    })
    .filter((value): value is number => value !== null && !Number.isNaN(value));

  const tokenRates = assistantMessages
    .map((message) => message.tokenRate)
    .filter((value): value is number => typeof value === "number");

  const avgFirstTokenLatencyMs =
    latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : undefined;

  const avgTokensPerSec =
    tokenRates.length > 0
      ? Number((tokenRates.reduce((a, b) => a + b, 0) / tokenRates.length).toFixed(2))
      : undefined;

  const errorRate24h = (() => {
    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;
    const recentMessages = assistantMessages.filter(
      (message) => new Date(message.createdAt).getTime() >= windowStart
    );
    if (recentMessages.length === 0) {
      return undefined;
    }
    const errors = recentMessages.filter((message) => Boolean(message.error)).length;
    return Number((errors / recentMessages.length).toFixed(2));
  })();

  return {
    ...(avgFirstTokenLatencyMs !== undefined ? { avgFirstTokenLatencyMs } : {}),
    ...(avgTokensPerSec !== undefined ? { avgTokensPerSec } : {}),
    ...(errorRate24h !== undefined ? { errorRate24h } : {})
  };
}
