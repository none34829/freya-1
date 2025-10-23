import { getEnv } from "@/lib/env";
import type { AgentCompletionEvent, MessageId, Prompt, SessionId } from "@/lib/types";
import { logLine } from "./observability/logs";

export interface AgentConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AgentRequestParams {
  sessionId: SessionId;
  prompt: Prompt;
  messages: AgentConversationMessage[];
  assistantMessageId: MessageId;
}

const textDecoder = new TextDecoder();

interface SynthesizeSpeechOptions {
  voice?: string;
  format?: string;
}

export async function synthesizeAgentSpeech(
  text: string,
  options: SynthesizeSpeechOptions = {}
): Promise<{ audioUrl: string; durationMs: number | null; voice?: string; format?: string }> {
  const env = getEnv();

  if (!env.AGENT_HTTP_URL) {
    throw new Error("Agent service is not configured");
  }

  const response = await fetch(new URL("/api/tts/synthesize", env.AGENT_HTTP_URL).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      ...(options.voice ? { voice: options.voice } : {}),
      ...(options.format ? { format: options.format } : {})
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Agent TTS request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? "audio/mpeg";
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const audioUrl = `data:${mimeType};base64,${base64}`;
  const durationHeader = response.headers.get("x-audio-duration-ms");
  const voiceHeader = response.headers.get("x-tts-voice") ?? options.voice ?? undefined;
  const formatHeader = response.headers.get("x-tts-format") ?? options.format ?? undefined;

  const durationMs =
    durationHeader && !Number.isNaN(Number(durationHeader))
      ? Number(durationHeader)
      : null;

  return {
    audioUrl,
    durationMs,
    voice: voiceHeader,
    format: formatHeader
  };
}

export async function* streamAgentCompletion(
  params: AgentRequestParams
): AsyncGenerator<AgentCompletionEvent> {
  const env = getEnv();

  if (env.AGENT_HTTP_URL) {
    try {
      yield* fetchFromAgentService(env.AGENT_HTTP_URL, params);
      return;
    } catch (error) {
      logLine({
        level: "warn",
        msg: "Falling back to local agent stream",
        meta: {
          sessionId: params.sessionId,
          agentUrl: env.AGENT_HTTP_URL,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      // Notify clients that we are running in degraded mode (fallback)
      yield {
        type: "degraded",
        data: { message: "Agent service unavailable. Using local fallback." }
      } as AgentCompletionEvent;
    }
  }

  yield* fallbackStream(params);
}

async function* fetchFromAgentService(
  agentUrl: string,
  params: AgentRequestParams
): AsyncGenerator<AgentCompletionEvent> {
  const response = await fetch(new URL("/respond", agentUrl).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId: params.sessionId,
      prompt: {
        id: params.prompt.id,
        title: params.prompt.title,
        body: params.prompt.body,
        tags: params.prompt.tags
      },
      messages: params.messages
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Agent response failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  let buffer = "";
  let tokenCount = 0;
  let firstTokenAt: string | null = null;
  let lastTokenAt: string | null = null;
  let completionSent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += textDecoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      const event = JSON.parse(line) as
        | { type: "assistant_token"; token: string }
        | { type: "assistant_done"; totalTokens?: number }
        | { type: "error"; message: string };

      if (event.type === "assistant_token") {
        const at = new Date().toISOString();
        tokenCount += 1;
        firstTokenAt = firstTokenAt ?? at;
        lastTokenAt = at;

        yield {
          type: "assistant_token",
          data: {
            messageId: params.assistantMessageId,
            token: event.token,
            at
          }
        };
      } else if (event.type === "assistant_done") {
        const completion = {
          messageId: params.assistantMessageId,
          totalTokens: event.totalTokens ?? tokenCount,
          firstTokenAt: firstTokenAt ?? new Date().toISOString(),
          lastTokenAt: lastTokenAt ?? new Date().toISOString()
        };

        yield {
          type: "assistant_done",
          data: completion
        };
        completionSent = true;
        logLine({
          level: "info",
          msg: "Agent service completed stream",
          meta: { sessionId: params.sessionId, messageId: params.assistantMessageId, tokenCount }
        });
      } else if (event.type === "error") {
        yield {
          type: "error",
          data: { message: event.message }
        };
      }
    }
  }

  if (!completionSent) {
    const completion = {
      messageId: params.assistantMessageId,
      totalTokens: tokenCount,
      firstTokenAt: firstTokenAt ?? new Date().toISOString(),
      lastTokenAt: lastTokenAt ?? new Date().toISOString()
    };

    yield {
      type: "assistant_done",
      data: completion
    };
  }
}

async function* fallbackStream(
  params: AgentRequestParams
): AsyncGenerator<AgentCompletionEvent> {
  const responseText = generateFallbackResponse(params);
  let tokenCount = 0;
  let firstTokenAt: string | null = null;
  let lastTokenAt: string | null = null;

  for (const token of tokenize(responseText)) {
    const at = new Date().toISOString();
    firstTokenAt = firstTokenAt ?? at;
    lastTokenAt = at;
    tokenCount += 1;

    yield {
      type: "assistant_token",
      data: {
        messageId: params.assistantMessageId,
        token,
        at
      }
    };

    await delay(60);
  }

  yield {
    type: "assistant_done",
    data: {
      messageId: params.assistantMessageId,
      totalTokens: tokenCount,
      firstTokenAt: firstTokenAt ?? new Date().toISOString(),
      lastTokenAt: lastTokenAt ?? new Date().toISOString()
    }
  };

  logLine({
    level: "info",
    msg: "Fallback agent response completed",
    meta: { sessionId: params.sessionId, messageId: params.assistantMessageId, tokenCount }
  });
}

function generateFallbackResponse(params: AgentRequestParams): string {
  const lastUserMessage = [...params.messages].reverse().find((item) => item.role === "user");
  const userMessage = lastUserMessage?.content ?? "";
  return [
    `Hello! I'm your ${params.prompt.title} assistant.`,
    userMessage ? `Regarding your message: "${userMessage}"` : "I'm ready whenever you are.",
    "",
    "I'm here to help you with your questions and provide assistance based on my role.",
    "",
    "Note: This is a fallback response while the voice agent is connecting."
  ].join(" ");
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
