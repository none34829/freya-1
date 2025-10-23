import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { jsonResponse, errorResponse } from "@/lib/http";
import { HttpError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { getEnv } from "@/lib/env";

const tokenRequestSchema = z.object({
  sessionId: z.string().min(1),
  identity: z.string().min(1).optional(),
  promptInstructions: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    const body = await request.json();
    const parsed = tokenRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid payload", parsed.error.flatten().fieldErrors);
    }

    const env = getEnv();
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      const missing = [];
      if (!env.LIVEKIT_URL) missing.push("LIVEKIT_URL");
      if (!env.LIVEKIT_API_KEY) missing.push("LIVEKIT_API_KEY");
      if (!env.LIVEKIT_API_SECRET) missing.push("LIVEKIT_API_SECRET");

      throw new HttpError(
        400,
        `LiveKit is not configured. Missing: ${missing.join(", ")}. Please add these to your .env file.`
      );
    }

    const identity = parsed.data.identity || `user-${user.id}`;
    const roomName = `session-${parsed.data.sessionId}`;

    // Normalize LiveKit URL for REST (RoomServiceClient expects http/https)
    const restUrl = env.LIVEKIT_URL.replace(/^ws/i, "http");

    // Ensure the room exists with metadata (so the Agent can read promptInstructions from ctx.room.metadata)
    try {
      const svc = new RoomServiceClient(restUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
      const metadata = JSON.stringify({
        sessionId: parsed.data.sessionId,
        promptInstructions: parsed.data.promptInstructions ?? undefined
      });

      try {
        await svc.createRoom({ name: roomName, emptyTimeout: 300, metadata });
      } catch (roomExistsError) {
        console.warn("LiveKit room already exists, attempting metadata update", roomExistsError);
        try {
          await svc.updateRoomMetadata(roomName, metadata);
        } catch (updateError) {
          console.warn("Failed to update LiveKit room metadata", updateError);
        }
      }
    } catch (roomSyncError) {
      console.warn("Failed to sync LiveKit room metadata", roomSyncError);
      // Don't fail token issuance if room metadata update fails.
      // The participant metadata below still carries promptInstructions as a fallback.
    }

    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity,
      name: user.name,
      metadata: JSON.stringify({
        userId: user.id,
        userName: user.name,
        sessionId: parsed.data.sessionId,
        promptInstructions: parsed.data.promptInstructions
      })
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true
    });

    const jwt = await token.toJwt();

    return jsonResponse({
      token: jwt,
      url: env.LIVEKIT_URL,
      room: roomName
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
