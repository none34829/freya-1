import { afterAll, describe, expect, it } from "vitest";
import path from "path";
import fs from "fs/promises";

process.env.PERSIST_DB_URL = `file:./data/test-session-store.json`;

import {
  appendAssistantToken,
  createAssistantMessage,
  createSessionRecord,
  finalizeAssistantMessage,
  recordMessageError
} from "@/server/db/session-store";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-session-store.json");

afterAll(async () => {
  await fs.rm(TEST_DB_PATH, { force: true });
});

describe("session store helpers", () => {
  it("computes token rate when finalizing assistant message", async () => {
    const session = await createSessionRecord({ promptId: "prompt-1", mode: "chat" });
    const assistant = await createAssistantMessage(session.id);

    const firstAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
    const secondAt = new Date("2024-01-01T00:00:01.000Z").toISOString();

    await appendAssistantToken({
      sessionId: session.id,
      messageId: assistant.id,
      token: "Hello ",
      at: firstAt
    });

    await appendAssistantToken({
      sessionId: session.id,
      messageId: assistant.id,
      token: "world!",
      at: secondAt
    });

    const finalized = await finalizeAssistantMessage({
      sessionId: session.id,
      messageId: assistant.id,
      completedAt: secondAt
    });

    expect(finalized?.tokenCount).toBe(2);
    expect(finalized?.tokenRate).toBeCloseTo(2); // 2 tokens / 1s
  });

  it("returns null when appending token to unknown message", async () => {
    const result = await appendAssistantToken({
      sessionId: "session-missing",
      messageId: "message-missing",
      token: "Hi",
      at: new Date().toISOString()
    });

    expect(result).toBeNull();
  });

  it("records assistant message errors", async () => {
    const session = await createSessionRecord({ promptId: "prompt-2", mode: "chat" });
    const assistant = await createAssistantMessage(session.id);

    await recordMessageError({
      sessionId: session.id,
      messageId: assistant.id,
      error: "LLM unreachable"
    });

    const finalized = await finalizeAssistantMessage({
      sessionId: session.id,
      messageId: assistant.id,
      completedAt: new Date().toISOString()
    });

    expect(finalized?.error).toBe("LLM unreachable");
  });
});

