import type { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { z } from "zod";
import type { RawData, WebSocket } from "ws";
import { streamAgentResponse } from "./agent.js";
import { logger } from "./logger.js";

const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1)
});

const requestSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    tags: z.array(z.string())
  }),
  messages: z.array(conversationMessageSchema).min(1)
});

type FastifySocketStream = {
  socket: WebSocket;
};

export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyWebsocket);

  fastify.get("/ws/respond", { websocket: true }, async (connection) => {
    await handleConnection(connection);
  });
}

async function handleConnection(connection: unknown): Promise<void> {
  const { socket } = connection as FastifySocketStream;
  socket.send(JSON.stringify({ type: "connected" }));

  socket.on("message", async (raw: RawData) => {
    try {
      const payload = JSON.parse(raw.toString());
      const parsed = await requestSchema.parseAsync(payload);
      logger.info(
        { sessionId: parsed.sessionId, promptId: parsed.prompt.id },
        "Streaming tokens via WebSocket"
      );

      for await (const event of streamAgentResponse(parsed)) {
        socket.send(JSON.stringify(event));
      }
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, "WebSocket error");
      socket.send(
        JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error"
        })
      );
    }
  });
}



