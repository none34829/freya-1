import type { AgentConfig } from "./config.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

export interface AgentConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentRequestPayload {
  sessionId: string;
  prompt: {
    id: string;
    title: string;
    body: string;
    tags: string[];
  };
  messages: AgentConversationMessage[];
}

export type AgentStreamEvent =
  | {
      type: "assistant_token";
      token: string;
    }
  | {
      type: "assistant_done";
      totalTokens: number;
    };

export async function* streamAgentResponse(
  payload: AgentRequestPayload
): AsyncGenerator<AgentStreamEvent> {
  const config = getConfig();

  if (!config.OPENAI_API_KEY) {
    logger.debug(
      { sessionId: payload.sessionId },
      "OPENAI_API_KEY not configured, using fallback agent response"
    );
    yield* streamFallbackResponse(payload);
    return;
  }

  try {
    yield* streamOpenAIResponse(payload, config);
    return;
  } catch (error) {
    logger.error(
      { error, sessionId: payload.sessionId },
      "OpenAI streaming failed, falling back to local response"
    );
    yield* streamFallbackResponse(payload);
  }
}

async function* streamOpenAIResponse(
  payload: AgentRequestPayload,
  config: AgentConfig
): AsyncGenerator<AgentStreamEvent> {
  const baseUrl = config.OPENAI_API_BASE_URL.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  const conversationMessages = payload.messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }))
    .filter((message) => message.content.length > 0);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      stream: true,
      messages: [
        {
          role: "system",
          content: payload.prompt.body
        },
        ...conversationMessages
      ]
    })
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `OpenAI request failed (${response.status} ${response.statusText})${
        errorText ? `: ${errorText}` : ""
      }`
    );
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  let buffer = "";
  let streamClosed = false;
  let emittedTokens = 0;
  let reportedTotalTokens: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += textDecoder.decode(value, { stream: true });
    }
    if (done) {
      buffer += textDecoder.decode();
    }

    let delimiterIndex: number;
    while (!streamClosed && (delimiterIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);

      const lines = rawEvent.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) {
          continue;
        }

        const data = line.slice("data:".length).trim();
        if (!data) {
          continue;
        }

        if (data === "[DONE]") {
          streamClosed = true;
          break;
        }

        let parsed: {
          usage?: { total_tokens?: number };
          choices?: Array<{
            delta?: { role?: string; content?: string | Array<{ text?: string }> };
          }>;
        };
        try {
          parsed = JSON.parse(data);
        } catch (parseError) {
          logger.warn(
            { parseError, data: data.slice(0, 200) },
            "Failed to parse OpenAI SSE chunk"
          );
          continue;
        }

        const usage = parsed.usage;
        if (usage && typeof usage.total_tokens === "number") {
          reportedTotalTokens = usage.total_tokens;
        }

        const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : undefined;
        if (!choice) {
          continue;
        }

        const delta = choice.delta ?? {};
        if (typeof delta.role === "string" && delta.role !== "assistant") {
          continue;
        }

        const content = delta.content;
        if (typeof content === "string" && content.length > 0) {
          emittedTokens += 1;
          yield {
            type: "assistant_token",
            token: content
          };
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (typeof part?.text === "string" && part.text.length > 0) {
              emittedTokens += 1;
              yield {
                type: "assistant_token",
                token: part.text
              };
            }
          }
        }
      }
    }

    if (streamClosed || done) {
      break;
    }
  }

  await reader.cancel().catch(() => undefined);

  yield {
    type: "assistant_done",
    totalTokens: reportedTotalTokens ?? emittedTokens
  };
}

async function* streamFallbackResponse(
  payload: AgentRequestPayload
): AsyncGenerator<AgentStreamEvent> {
  const responseText = buildFallbackResponse(payload);
  let tokenCount = 0;

  for (const token of tokenize(responseText)) {
    tokenCount += 1;
    yield {
      type: "assistant_token",
      token
    };
    await delay(50);
  }

  yield {
    type: "assistant_done",
    totalTokens: tokenCount
  };
}

function buildFallbackResponse(payload: AgentRequestPayload): string {
  const lastUserMessage = [...payload.messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim().length > 0);

  if (!lastUserMessage) {
    return "I didn't receive any message content to respond to yet.";
  }

  // Use the prompt body as the agent's instructions
  const instructions = payload.prompt.body;
  const userMessage = lastUserMessage.content.trim();

  // Generate a contextual response based on the prompt
  if (instructions.toLowerCase().includes("support")) {
    return generateSupportResponse(userMessage, instructions);
  } else if (instructions.toLowerCase().includes("creative") || instructions.toLowerCase().includes("write")) {
    return generateCreativeResponse(userMessage, instructions);
  } else {
    return generateGeneralResponse(userMessage, instructions);
  }
}

function generateSupportResponse(userMessage: string, _instructions: string): string {
  const responses = [
    `Hello! I'm here to help you with your question: "${userMessage}". As your support agent, I can assist with troubleshooting, provide documentation links, and guide you through solutions. What specific issue are you experiencing?`,
    `Hi there! Thanks for reaching out. I see you asked: "${userMessage}". I'm ready to provide support and help resolve any issues you might have. Could you share more details about what you're trying to accomplish?`,
    `Welcome! I'm your friendly support agent. Regarding your question "${userMessage}", I'm here to provide clear, helpful answers and guide you to the right resources. What would you like to know more about?`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateCreativeResponse(userMessage: string, _instructions: string): string {
  const responses = [
    `What an interesting prompt: "${userMessage}"! I'm excited to help you explore creative possibilities. Based on your request, I can help brainstorm ideas, provide writing assistance, or offer creative solutions. What direction would you like to take this?`,
    `Creative minds think alike! You asked: "${userMessage}". I'm here to help spark innovation and provide imaginative solutions. Let's dive into the creative process together. What's your vision?`,
    `I love creative challenges! Your question "${userMessage}" opens up many possibilities. Whether you need writing help, brainstorming, or creative problem-solving, I'm ready to collaborate. What's your next step?`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateGeneralResponse(userMessage: string, _instructions: string): string {
  const responses = [
    `Thank you for your message: "${userMessage}". I'm here to assist you with information, answer questions, and help solve problems. Based on my instructions, I aim to be helpful, accurate, and concise. How can I best help you today?`,
    `Hello! I received your question: "${userMessage}". I'm designed to provide helpful, informative responses while following my guidelines. I'm ready to assist with information, explanations, or guidance. What would you like to explore?`,
    `Hi there! Regarding your question "${userMessage}", I'm here to help provide useful information and assistance. I follow specific guidelines to ensure helpful and appropriate responses. What can I help you with?`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
