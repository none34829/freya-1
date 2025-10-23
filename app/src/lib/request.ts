import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string {
  const header =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("forwarded");

  return header?.split(",")[0]?.trim() ?? "unknown";
}
