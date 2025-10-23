import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from the root .env file
config({ path: resolve(__dirname, "../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_AGENT_URL: process.env.AGENT_HTTP_URL || "http://localhost:4001",
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    LIVEKIT_ROOM: process.env.LIVEKIT_ROOM,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    PERSIST_DB_URL: process.env.PERSIST_DB_URL,
    AGENT_HTTP_URL: process.env.AGENT_HTTP_URL,
    RATE_LIMIT_WINDOW_MIN: process.env.RATE_LIMIT_WINDOW_MIN,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
  },
};

export default nextConfig;
