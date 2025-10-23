import { z } from "zod";
import dotenv from "dotenv";
import { resolve } from "path";

// Load .env from the root directory (two levels up from agent/src/)
dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config({ path: resolve(process.cwd(), "../.env") });
dotenv.config({ path: ".env" }); // fallback to current directory

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4001),
  AGENT_PORT: z.coerce.number().optional(),
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_ROOM: z.string().default("agent-console"),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  ASR_MODEL: z.string().min(1).default("whisper-1"),
  TTS_MODEL: z.string().min(1).default("gpt-4o-mini-tts"),
  TTS_VOICE: z.string().min(1).default("alloy"),
  TTS_FORMAT: z.string().min(1).default("mp3"),
  OTEL_SERVICE_NAME: z.string().default("freya-agent"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  FALLBACK_RESPONSE: z
    .string()
    .default("This is a simulated response from the Freya agent service."),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type AgentConfig = z.infer<typeof configSchema>;

let cached: AgentConfig | null = null;

export function getConfig(): AgentConfig {
  if (cached) {
    return cached;
  }
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid agent configuration: ${parsed.error.message}`);
  }
  const data = parsed.data;
  const normalized: AgentConfig = {
    ...data,
    PORT: data.AGENT_PORT ?? data.PORT
  };
  cached = normalized;
  return cached;
}
