import type { AuthenticatedUser, Message, Prompt, SessionId } from "@/lib/types";
import { streamAgentCompletion, synthesizeAgentSpeech, type AgentConversationMessage } from "../agent-client";
import {
  appendAssistantToken,
  createAssistantMessage,
  finalizeAssistantMessage,
  recordMessageError,
  getSessionMessages,
  getSession,
  attachMessageAudio
} from "../db/session-store";
import { recordMessageMetric, recordErrorMetric } from "../observability/metrics";
import { logLine } from "../observability/logs";
import { broadcastEvent } from "./stream-hub";

interface StartAssistantParams {
  sessionId: SessionId;
  prompt: Prompt;
  userMessage: Message;
  user: AuthenticatedUser;
}

const MAX_CONVERSATION_MESSAGES = 30;

export async function startAssistantStream(params: StartAssistantParams): Promise<void> {
  const history = await getSessionMessages(params.sessionId);
  const session = await getSession(params.sessionId);
  const shouldAttachAudio = session?.mode === "voice" || session?.mode === "hybrid";
  const conversation: AgentConversationMessage[] = history
    .map((message) => normalizeForAgent(message))
    .filter((message): message is AgentConversationMessage => message !== null)
    .slice(-MAX_CONVERSATION_MESSAGES);

  const assistantMessage = await createAssistantMessage(params.sessionId);

  (async () => {
    try {
      for await (const event of streamAgentCompletion({
        sessionId: params.sessionId,
        prompt: params.prompt,
        messages: conversation,
        assistantMessageId: assistantMessage.id
      })) {
        switch (event.type) {
          case "assistant_token": {
            await appendAssistantToken({
              sessionId: params.sessionId,
              messageId: assistantMessage.id,
              token: event.data.token,
              at: event.data.at
            });

            broadcastEvent(params.sessionId, event);
            break;
          }
          case "degraded": {
            // Surface degraded mode (HTTP agent down) to the client
            broadcastEvent(params.sessionId, event);
            logLine({
              level: "warn",
              msg: "Agent degraded mode (fallback active)",
              meta: { sessionId: params.sessionId }
            });
            break;
          }
          case "assistant_done": {
            const finalized = await finalizeAssistantMessage({
              sessionId: params.sessionId,
              messageId: assistantMessage.id,
              completedAt: event.data.lastTokenAt
            });

            if (finalized && finalized.firstTokenAt) {
              const latency =
                new Date(finalized.firstTokenAt).getTime() -
                new Date(params.userMessage.createdAt).getTime();
              if (latency >= 0 && finalized.tokenRate !== undefined) {
                recordMessageMetric({
                  firstTokenLatencyMs: latency,
                  tokensPerSec: finalized.tokenRate,
                  recordedAt: Date.now()
                });
              }
            }

            broadcastEvent(params.sessionId, event);

            if (
              shouldAttachAudio &&
              finalized &&
              typeof finalized.text === "string" &&
              finalized.text.trim().length > 0
            ) {
              try {
                const tts = await synthesizeAgentSpeech(finalized.text);
                await attachMessageAudio({
                  sessionId: params.sessionId,
                  messageId: assistantMessage.id,
                  audioUrl: tts.audioUrl,
                  audioDurationMs: tts.durationMs ?? undefined
                });
                broadcastEvent(params.sessionId, {
                  type: "assistant_audio",
                  data: {
                    messageId: assistantMessage.id,
                    audioUrl: tts.audioUrl,
                    durationMs: tts.durationMs ?? undefined,
                    voice: tts.voice
                  }
                });
              } catch (audioError) {
                logLine({
                  level: "warn",
                  msg: "Failed to synthesize assistant audio",
                  meta: {
                    sessionId: params.sessionId,
                    messageId: assistantMessage.id,
                    error: audioError instanceof Error ? audioError.message : audioError
                  }
                });
              }
            }
            break;
          }
          case "error": {
            await recordMessageError({
              sessionId: params.sessionId,
              messageId: assistantMessage.id,
              error: event.data.message
            });
            recordErrorMetric();
            broadcastEvent(params.sessionId, event);
            break;
          }
          default:
            break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await recordMessageError({
        sessionId: params.sessionId,
        messageId: assistantMessage.id,
        error: message
      });
      recordErrorMetric();
      broadcastEvent(params.sessionId, {
        type: "error",
        data: { message }
      });
      logLine({
        level: "error",
        msg: "Assistant stream failed",
        meta: { sessionId: params.sessionId, error: message }
      });
    }
  })().catch((error) => {
    logLine({
      level: "error",
      msg: "Assistant stream background error",
      meta: { sessionId: params.sessionId, error }
    });
  });
}

function normalizeForAgent(message: Message): AgentConversationMessage | null {
  const content = (message.text ?? "").trim();
  if (!content) {
    return null;
  }

  if (message.role === "user" || message.role === "assistant" || message.role === "system") {
    return {
      role: message.role,
      content
    };
  }

  return null;
}
