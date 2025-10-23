import { NextResponse, type NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/http";
import { promptCreateSchema, promptQuerySchema } from "@/lib/validation";
import { HttpError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { consumeRateLimit } from "@/server/rate-limit";
import { createPrompt, listPrompts } from "@/server/prompts/store";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const { searchParams } = new URL(request.url);
    const parsed = promptQuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      throw new HttpError(400, "Invalid query", parsed.error.flatten().fieldErrors);
    }

    const prompts = listPrompts(parsed.data);
    return jsonResponse({ prompts });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    consumeRateLimit(`prompt:create:${user.id}`);

    const body = await request.json();
    const parsed = promptCreateSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid payload", parsed.error.flatten().fieldErrors);
    }

    const prompt = createPrompt(parsed.data);
    return jsonResponse(prompt, 201);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
