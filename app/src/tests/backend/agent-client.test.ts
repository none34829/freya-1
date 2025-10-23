import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConversationMessage } from "@/server/agent-client";

const prompt = {
  id: "prompt-1",
  title: "Test Prompt",
  body: "Assist the user.",
  tags: [] as string[],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1,
  history: []
};

const messages: AgentConversationMessage[] = [
  {
    role: "user",
    content: "Hello there"
  }
];

const nativeFetch: typeof fetch =
  typeof global.fetch === "function"
    ? global.fetch.bind(globalThis)
    : (...args: Parameters<typeof fetch>) => fetch(...args);

afterEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  delete process.env.AGENT_HTTP_URL;
  global.fetch = nativeFetch;
});

describe("streamAgentCompletion", () => {
  it("falls back to local generator when remote agent is not configured", async () => {
    process.env.AGENT_HTTP_URL = "";
    const { streamAgentCompletion } = await import("@/server/agent-client");

    vi.useFakeTimers();
    const events: string[] = [];
    const iterator = streamAgentCompletion({
      sessionId: "session-local",
      prompt,
      messages,
      assistantMessageId: "assistant-1"
    });

    while (true) {
      const promise = iterator.next();
      await vi.advanceTimersByTimeAsync(60);
      const result = await promise;
      if (result.done) {
        break;
      }
      events.push(result.value.type);
      if (result.value.type === "assistant_done") {
        break;
      }
    }

    expect(events[0]).toBe("assistant_token");
    expect(events).toContain("assistant_done");

    await iterator.return?.(undefined);
  });

  it("emits degraded event when remote agent fetch fails", async () => {
    process.env.AGENT_HTTP_URL = "http://agent:4001";
    global.fetch = vi.fn().mockRejectedValue(new Error("agent offline")) as typeof fetch;

    const { streamAgentCompletion } = await import("@/server/agent-client");
    const iterator = streamAgentCompletion({
      sessionId: "session-remote",
      prompt,
      messages,
      assistantMessageId: "assistant-2"
    });

    const first = await iterator.next();
    expect(first.value?.type).toBe("degraded");

    await iterator.return?.(undefined);
  });
});
