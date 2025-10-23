import { AccessToken } from "livekit-server-sdk";
import { getConfig } from "./config.js";

export function isLiveKitConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET);
}

export async function createLiveKitToken(
  identity: string,
  metadata?: Record<string, unknown>
): Promise<
  | {
      token: string;
      url: string;
      room: string;
    }
  | null
> {
  if (!isLiveKitConfigured()) {
    return null;
  }

  const config = getConfig();
  const token = new AccessToken(config.LIVEKIT_API_KEY!, config.LIVEKIT_API_SECRET!, {
    identity,
    metadata: metadata ? JSON.stringify(metadata) : undefined
  });

  token.addGrant({
    room: config.LIVEKIT_ROOM,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true
  });

  return {
    token: await token.toJwt(),
    url: config.LIVEKIT_URL!,
    room: config.LIVEKIT_ROOM
  };
}
