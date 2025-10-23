import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { initializeVoiceAgent, getVoiceAgent, shutdownVoiceAgent } from "../voice-agent.js";
import { logger } from "../logger.js";

const initRequestSchema = z.object({
  roomName: z.string().min(1),
  identity: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const voiceProcessSchema = z.object({
  audioData: z.string().min(1),
  sessionId: z.string().min(1),
  promptId: z.string().min(1),
  type: z.enum(["speech-to-text", "text-to-speech", "process-voice"]).default("process-voice")
});

export async function registerVoiceRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize voice agent for a room
  fastify.post("/voice/init", async (request, reply) => {
    const parsed = initRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return {
        error: "Invalid payload",
        details: parsed.error.flatten().fieldErrors
      };
    }

    try {
      const agent = await initializeVoiceAgent({
        roomName: parsed.data.roomName,
        identity: parsed.data.identity,
        metadata: parsed.data.metadata
      });

      logger.info({ roomName: parsed.data.roomName }, "Voice agent initialized");
      
      return {
        success: true,
        roomName: parsed.data.roomName,
        identity: parsed.data.identity,
        ready: agent.isReady()
      };
    } catch (error) {
      logger.error({ error }, "Failed to initialize voice agent");
      reply.status(500);
      return {
        error: error instanceof Error ? error.message : "Failed to initialize voice agent"
      };
    }
  });

  // Get voice agent status
  fastify.get("/voice/status", async (_request, _reply) => {
    const agent = getVoiceAgent();
    
    return {
      initialized: agent !== null,
      ready: agent?.isReady() || false
    };
  });

  // Process voice input
  fastify.post("/voice/process", async (request, reply) => {
    const parsed = voiceProcessSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return {
        error: "Invalid payload",
        details: parsed.error.flatten().fieldErrors
      };
    }

    const agent = getVoiceAgent();
    if (!agent || !agent.isReady()) {
      reply.status(400);
      return {
        error: "Voice agent not initialized or not ready"
      };
    }

    try {
      const { audioData, sessionId, promptId, type } = parsed.data;

      switch (type) {
        case "speech-to-text": {
          const transcription = await agent.speechToText(audioData);
          return {
            success: true,
            transcription,
            sessionId
          };
        }
        case "text-to-speech": {
          // For TTS, audioData would actually be text
          const audioResult = await agent.textToSpeech(audioData);
          return {
            success: true,
            audioUrl: audioResult.audioUrl,
            duration: audioResult.duration,
            sessionId
          };
        }
        case "process-voice":
        default: {
          const response = await agent.processVoiceInput(audioData, sessionId, promptId);
          const audioResult = await agent.textToSpeech(response);
          return {
            success: true,
            textResponse: response,
            audioUrl: audioResult.audioUrl,
            duration: audioResult.duration,
            sessionId
          };
        }
      }
    } catch (error) {
      logger.error({ error }, "Failed to process voice input");
      reply.status(500);
      return {
        error: error instanceof Error ? error.message : "Failed to process voice input"
      };
    }
  });

  // Shutdown voice agent
  fastify.post("/voice/shutdown", async (request, reply) => {
    try {
      await shutdownVoiceAgent();
      logger.info("Voice agent shutdown");
      
      return {
        success: true,
        message: "Voice agent shutdown successfully"
      };
    } catch (error) {
      logger.error({ error }, "Failed to shutdown voice agent");
      reply.status(500);
      return {
        error: error instanceof Error ? error.message : "Failed to shutdown voice agent"
      };
    }
  });
}
