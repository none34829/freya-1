import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createLiveKitToken, isLiveKitConfigured } from "../livekit.js";

const requestSchema = z.object({
  identity: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function registerLivekitRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post("/livekit/token", async (request, reply) => {
    if (!isLiveKitConfigured()) {
      reply.status(400);
      return { error: "LiveKit credentials are not configured" };
    }

    const parsed = requestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.status(400);
      return { error: "Invalid payload", details: parsed.error.flatten().fieldErrors };
    }

    const token = await createLiveKitToken(parsed.data.identity, parsed.data.metadata ?? {});
    if (!token) {
      reply.status(500);
      return { error: "Unable to generate LiveKit token" };
    }

    return token;
  });
}
