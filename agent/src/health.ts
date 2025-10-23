import type { FastifyInstance } from "fastify";
import { getConfig } from "./config.js";

const startTime = Date.now();

export function registerHealthRoute(fastify: FastifyInstance): void {
  fastify.get("/health", async () => ({
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    environment: getConfig().NODE_ENV
  }));
}
