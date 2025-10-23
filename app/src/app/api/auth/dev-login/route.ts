import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, errorResponse } from "@/lib/http";
import { getClientIp } from "@/lib/request";
import type { AuthenticatedUser } from "@/lib/types";
import { consumeRateLimit } from "@/server/rate-limit";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { createSessionToken } from "@/server/auth/session";
import { HttpError, RateLimitError } from "@/lib/errors";

const loginSchema = z.object({
  name: z.string().min(1).max(60).optional()
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    await consumeRateLimit(`auth:${ip}`);

    const body = await request.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Invalid payload", parsed.error.flatten().fieldErrors);
    }

    const user: AuthenticatedUser = {
      id: crypto.randomUUID(),
      name: parsed.data.name ?? "Developer",
      role: "developer"
    };

    const token = createSessionToken(user);
    const response = jsonResponse({ user });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/"
    });

    return response;
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
