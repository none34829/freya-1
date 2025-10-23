import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { getSession } from "@/server/db/session-store";
import { subscribe } from "@/server/stream/stream-hub";
import { HttpError, NotFoundError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import type { AgentCompletionEvent } from "@/lib/types";

type ParamsPromise = Promise<{ id: string }>;

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: ParamsPromise }) {
  try {
    requireUser(request);
    const { id } = await params;

    const session = await getSession(id);
    if (!session) {
      throw new NotFoundError("Session not found");
    }

    let cleanup: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();

        const send = (event: AgentCompletionEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        const unsubscribe = subscribe(session.id, send);
        controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

        cleanup = () => {
          if (!cleanup) return;
          unsubscribe();
          controller.close();
          cleanup = null;
        };

        request.signal.addEventListener("abort", () => {
          cleanup?.();
        });
      },
      cancel() {
        cleanup?.();
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
