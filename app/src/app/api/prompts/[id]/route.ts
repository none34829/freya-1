import { NextResponse, type NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/http";
import { HttpError, NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { consumeRateLimit } from "@/server/rate-limit";
import { getPrompt, updatePrompt, deletePrompt } from "@/server/prompts/store";
import { promptUpdateSchema } from "@/lib/validation";

type ParamsPromise = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: ParamsPromise }) {
  try {
    requireUser(request);
    const { id } = await params;
    const prompt = getPrompt(id);
    if (!prompt) {
      throw new NotFoundError("Prompt not found");
    }
    return jsonResponse(prompt);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: ParamsPromise }) {
  try {
    const user = requireUser(request);
    consumeRateLimit(`prompt:update:${user.id}`);
    const { id } = await params;
    const body = await request.json();
    const parsed = promptUpdateSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid payload", parsed.error.flatten().fieldErrors);
    }

    const updated = updatePrompt(id, parsed.data);
    if (!updated) {
      throw new NotFoundError("Prompt not found");
    }

    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: ParamsPromise }) {
  try {
    const user = requireUser(request);
    consumeRateLimit(`prompt:delete:${user.id}`);
    const { id } = await params;
    const deleted = deletePrompt(id);
    if (!deleted) {
      throw new NotFoundError("Prompt not found");
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}