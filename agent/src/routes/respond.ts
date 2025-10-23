import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { streamAgentResponse } from "../agent.js";
import { logger } from "../logger.js";

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

export async function registerRespondRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post("/respond", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return {
        error: "Invalid payload",
        details: parsed.error.flatten().fieldErrors
      };
    }

    logger.info(
      {
        sessionId: parsed.data.sessionId,
        promptId: parsed.data.prompt.id
      },
      "Generating streaming response"
    );

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "application/jsonl",
      Connection: "keep-alive",
      "Cache-Control": "no-cache"
    });

    try {
      for await (const event of streamAgentResponse(parsed.data)) {
        reply.raw.write(JSON.stringify(event) + "\n");
      }
    } catch (error) {
      logger.error({ error }, "Failed to stream agent response");
      reply.raw.write(
        JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown agent error"
        }) + "\n"
      );
    } finally {
      reply.raw.end();
    }

    return;
  });
}
