import pino from "pino";
import { getConfig } from "./config.js";

export const logger = pino({
  name: "freya-agent",
  level: getConfig().LOG_LEVEL,
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname"
          }
        }
      : undefined
});
