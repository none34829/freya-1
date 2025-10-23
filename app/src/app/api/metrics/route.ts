import { NextResponse, type NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/http";
import { HttpError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { getAggregateMetrics } from "@/server/observability/metrics";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const metrics = getAggregateMetrics();
    return jsonResponse(metrics);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
