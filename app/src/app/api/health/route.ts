import { NextResponse } from "next/server";

const startTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.round((Date.now() - startTime) / 1000);
  return NextResponse.json({
    status: "ok",
    uptimeSeconds,
    version: process.env.npm_package_version ?? "0.0.0"
  });
}
