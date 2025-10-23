import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

interface TtsRequestBody {
  text: string;
  voice?: string;
  format?: string;
}

function sanitizeBody(body: unknown): TtsRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const { text, voice, format } = body as Partial<TtsRequestBody>;
  const normalizedText = typeof text === "string" ? text.trim() : "";

  if (!normalizedText) {
    throw new Error("Text is required");
  }

  return {
    text: normalizedText,
    voice: typeof voice === "string" && voice.trim().length > 0 ? voice.trim() : undefined,
    format: typeof format === "string" && format.trim().length > 0 ? format.trim() : undefined
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();

  if (!env.AGENT_HTTP_URL) {
    return NextResponse.json({ error: "Agent service is not configured" }, { status: 503 });
  }

  let payload: TtsRequestBody;
  try {
    payload = sanitizeBody(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }

  const agentUrl = new URL("/api/tts/synthesize", env.AGENT_HTTP_URL).toString();
  const agentResponse = await fetch(agentUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Agent TTS request failed",
        status: agentResponse.status,
        detail: errorText ? errorText.slice(0, 2000) : undefined
      },
      { status: 502 }
    );
  }

  const audioBuffer = await agentResponse.arrayBuffer();
  const contentType = agentResponse.headers.get("content-type") ?? "audio/mpeg";
  const contentLength = agentResponse.headers.get("content-length");
  const voiceHeader = agentResponse.headers.get("x-tts-voice");
  const formatHeader = agentResponse.headers.get("x-tts-format");
  const durationHeader = agentResponse.headers.get("x-audio-duration-ms");

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  if (voiceHeader) {
    headers.set("X-TTS-Voice", voiceHeader);
  }
  if (formatHeader) {
    headers.set("X-TTS-Format", formatHeader);
  }
  if (durationHeader) {
    headers.set("X-Audio-Duration-Ms", durationHeader);
  }

  return new NextResponse(audioBuffer, {
    status: 200,
    headers
  });
}
