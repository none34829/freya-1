import { NextResponse, type NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/http";
import { HttpError, NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { computeSessionMetrics, getSession } from "@/server/db/session-store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireUser(request);
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      throw new NotFoundError("Session not found");
    }

    const metrics = await computeSessionMetrics(session.id);
    return jsonResponse({
      session: { ...session, metrics }
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
