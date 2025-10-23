import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { getSession } from "@/server/db/session-store";
import { attachWebSocket, detachWebSocket } from "@/server/stream/stream-hub";
import { HttpError, NotFoundError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

type ParamsPromise = Promise<{ id: string }>;

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: ParamsPromise }) {
  try {
    requireUser(request);

    if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
      throw new HttpError(400, "Expected WebSocket upgrade request");
    }

    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      throw new NotFoundError("Session not found");
    }

    const { WebSocketPair } = globalThis as typeof globalThis & {
      WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket };
    };
    const pair = WebSocketPair ? new WebSocketPair() : null;
    if (!pair) {
      throw new HttpError(500, "WebSocketPair not supported in this environment");
    }

    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const serverSocket = server as WebSocket & { accept?: () => void };
    serverSocket.accept?.();

    attachWebSocket(session.id, serverSocket);

    serverSocket.addEventListener("close", () => {
      detachWebSocket(session.id, serverSocket);
    });

    serverSocket.addEventListener("error", () => {
      detachWebSocket(session.id, serverSocket);
    });

    serverSocket.addEventListener("message", (event) => {
      if (typeof event.data === "string" && event.data === "ping") {
        serverSocket.send("pong");
      }
    });

    serverSocket.send(JSON.stringify({ type: "connected" }));

    const upgradeInit: ResponseInit & { webSocket?: WebSocket } = {
      status: 101,
      webSocket: client
    };

    return new Response(null, upgradeInit);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
