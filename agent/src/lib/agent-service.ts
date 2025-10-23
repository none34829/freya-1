import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { registerHealthRoute } from "../health.js";
import { registerRespondRoute } from "../routes/respond.js";
import { registerLivekitRoute } from "../routes/livekit.js";
import { registerVoiceRoutes } from "../routes/voice.js";
import { registerAsrRoute } from "../routes/asr.js";
import { registerTtsRoute } from "../routes/tts.js";
import { registerRoundtripRoute } from "../routes/messages.js";
import { registerWebSocketRoutes } from "../ws.js";

export async function startAgentService(): Promise<void> {
  const config = getConfig();
  const fastify = Fastify({
    logger: {
      level: "info"
    }
  });

  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 25 * 1024 * 1024
    }
  });
  logger.info("Multipart plugin active");

  registerHealthRoute(fastify);
  await registerRespondRoute(fastify);
  await registerLivekitRoute(fastify);
  await registerVoiceRoutes(fastify);
  await registerAsrRoute(fastify);
  await registerTtsRoute(fastify);
  await registerRoundtripRoute(fastify);
  await registerWebSocketRoutes(fastify);

  try {
    await fastify.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info({ port: config.PORT }, "Agent service listening");
  } catch (error) {
    logger.error({ error }, "Failed to start agent service");
    process.exit(1);
  }
}

