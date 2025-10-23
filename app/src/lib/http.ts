import { NextResponse } from "next/server";
import type { HttpError } from "./errors";

export function jsonResponse<T>(data: T, init?: number | ResponseInit): NextResponse<T> {
  if (typeof init === "number") {
    return NextResponse.json(data, { status: init });
  }
  return NextResponse.json(data, init);
}

export function errorResponse(error: HttpError): NextResponse<{ error: string }> {
  const response = NextResponse.json(
    {
      error: error.message,
      ...(error.details ? { details: error.details } : {})
    },
    { status: error.status }
  );

  if ("retryAfter" in error && typeof error.retryAfter === "number") {
    response.headers.set("Retry-After", error.retryAfter.toString());
  }

  return response;
}
