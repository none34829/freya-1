import { NextResponse, type NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/http";
import { paginationQuerySchema, sessionCreateSchema } from "@/lib/validation";
import { HttpError, NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { consumeRateLimit } from "@/server/rate-limit";
import { createSessionRecord, listSessions, computeSessionMetrics } from "@/server/db/session-store";
import { getPrompt } from "@/server/prompts/store";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const { searchParams } = new URL(request.url);
    const parsed = paginationQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      throw new HttpError(400, "Invalid query", parsed.error.flatten().fieldErrors);
    }

    const sessions = await listSessions(parsed.data.limit);
    const sessionsWithMetrics = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        metrics: await computeSessionMetrics(session.id)
      }))
    );
    return jsonResponse({ sessions: sessionsWithMetrics });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    console.error("Failed to create session", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    consumeRateLimit(`session:create:${user.id}`);
    const body = await request.json();
    const parsed = sessionCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid payload", parsed.error.flatten().fieldErrors);
    }

    const prompt = getPrompt(parsed.data.promptId);
    if (!prompt) {
      throw new NotFoundError("Prompt not found");
    }

    const session = await createSessionRecord(parsed.data);
    return jsonResponse(session, 201);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
