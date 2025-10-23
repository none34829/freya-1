import { NextResponse, type NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/http";
import { messageCreateSchema } from "@/lib/validation";
import { HttpError, NotFoundError, RateLimitError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import {
  addUserMessage,
  getSession,
  getSessionMessages
} from "@/server/db/session-store";
import { getPrompt } from "@/server/prompts/store";
import { consumeRateLimit } from "@/server/rate-limit";
import { startAssistantStream } from "@/server/stream/assistant-runner";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireUser(request);
    const { id } = await params;
    const messages = await getSessionMessages(id);
    return jsonResponse({ messages });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    consumeRateLimit(`message:${user.id}`);

    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      throw new NotFoundError("Session not found");
    }

    const prompt = getPrompt(session.promptId);
    if (!prompt) {
      throw new NotFoundError("Prompt not found for session");
    }

    const body = await request.json();
    const parsed = messageCreateSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid payload", parsed.error.flatten().fieldErrors);
    }

    if (!parsed.data.text && !parsed.data.audioUrl) {
      throw new HttpError(400, "Message content is required");
    }

    const message = await addUserMessage({
      sessionId: session.id,
      text: parsed.data.text,
      audioUrl: parsed.data.audioUrl,
      audioDurationMs: parsed.data.audioDurationMs
    });

    await startAssistantStream({
      sessionId: session.id,
      prompt,
      userMessage: message,
      user
    });

    return jsonResponse({ message }, 201);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse(error);
    }

    if (error instanceof HttpError) {
      return errorResponse(error);
    }

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
