import type { AgentCompletionEvent, SessionId } from "@/lib/types";
import { logLine } from "../observability/logs";

type Listener = (event: AgentCompletionEvent) => void;

const socketConnections = new Map<SessionId, Set<WebSocket>>();
const listenerConnections = new Map<SessionId, Set<Listener>>();

function ensureSocketSet(sessionId: SessionId): Set<WebSocket> {
  const existing = socketConnections.get(sessionId);
  if (existing) return existing;
  const created = new Set<WebSocket>();
  socketConnections.set(sessionId, created);
  return created;
}

function ensureListenerSet(sessionId: SessionId): Set<Listener> {
  const existing = listenerConnections.get(sessionId);
  if (existing) return existing;
  const created = new Set<Listener>();
  listenerConnections.set(sessionId, created);
  return created;
}

export function attachWebSocket(sessionId: SessionId, socket: WebSocket): void {
  ensureSocketSet(sessionId).add(socket);
  logLine({ level: "info", msg: "WebSocket connected", meta: { sessionId } });
}

export function detachWebSocket(sessionId: SessionId, socket: WebSocket): void {
  const set = socketConnections.get(sessionId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) {
    socketConnections.delete(sessionId);
  }
  logLine({ level: "info", msg: "WebSocket disconnected", meta: { sessionId } });
}

export function subscribe(sessionId: SessionId, listener: Listener): () => void {
  const set = ensureListenerSet(sessionId);
  set.add(listener);
  return () => {
    const current = listenerConnections.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenerConnections.delete(sessionId);
    }
  };
}

export function broadcastEvent(sessionId: SessionId, event: AgentCompletionEvent): void {
  const sockets = socketConnections.get(sessionId);
  if (sockets && sockets.size > 0) {
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  const listeners = listenerConnections.get(sessionId);
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        logLine({ level: "error", msg: "Listener dispatch failed", meta: { sessionId, error } });
      }
    }
  }
}

export function hasSubscribers(sessionId: SessionId): boolean {
  return (
    (socketConnections.get(sessionId)?.size ?? 0) > 0 ||
    (listenerConnections.get(sessionId)?.size ?? 0) > 0
  );
}
