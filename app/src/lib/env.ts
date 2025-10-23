import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters")
    .default("dev-change-me-session"),
  CORS_ORIGIN: z.string().optional(),
  PERSIST_DB_URL: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_ROOM: z.string().default("agent-console"),
  AGENT_HTTP_URL: z.string().optional(),
  RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60)
});

type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    throw new Error(`Invalid environment variables: ${JSON.stringify(formatted, null, 2)}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === "production" && env.SESSION_SECRET === "dev-change-me-session") {
    throw new Error("SESSION_SECRET must be set in production.");
  }

  cached = env;
  return env;
}
