import { STREAM_EVENT_TYPES } from "./constants";

export type StreamEvent =
  | { type: typeof STREAM_EVENT_TYPES.connected }
  | {
      type: typeof STREAM_EVENT_TYPES.assistantToken;
      data: {
        messageId: string;
        token: string;
        at: string;
      };
    }
  | {
      type: typeof STREAM_EVENT_TYPES.assistantDone;
      data: {
        messageId: string;
        totalTokens: number;
        firstTokenAt: string;
        lastTokenAt: string;
      };
    }
  | {
      type: typeof STREAM_EVENT_TYPES.error;
      data: {
        message: string;
      };
    }
  | {
      type: typeof STREAM_EVENT_TYPES.degraded;
      data: {
        message: string;
      };
    }
  | {
      type: typeof STREAM_EVENT_TYPES.assistantAudio;
      data: {
        messageId: string;
        audioUrl: string;
        durationMs?: number;
        voice?: string;
      };
    };

export interface SessionStream {
  close: () => void;
  getStatus: () => WebSocket["readyState"];
}

function mapEventSourceState(state: number): WebSocket["readyState"] {
  switch (state) {
    case EventSource.CONNECTING:
      return WebSocket.CONNECTING;
    case EventSource.OPEN:
      return WebSocket.OPEN;
    default:
      return WebSocket.CLOSED;
  }
}

export function connectSessionStream(
  sessionId: string,
  onEvent: (event: StreamEvent) => void,
  options: { onStatusChange?: (state: WebSocket["readyState"]) => void } = {}
): SessionStream {
  const url = `/api/stream/sessions/${sessionId}/events`;
  const source = new EventSource(url, { withCredentials: true });

  const notifyStatus = () => options.onStatusChange?.(mapEventSourceState(source.readyState));

  source.addEventListener("open", notifyStatus);
  source.addEventListener("error", notifyStatus);

  source.addEventListener("connected", () => {
    notifyStatus();
    onEvent({ type: STREAM_EVENT_TYPES.connected });
  });

  source.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data) as StreamEvent;
      onEvent(parsed);
    } catch (error) {
      console.error("Failed to parse stream event", error);
    }
  });

  return {
    close: () => {
      source.close();
      notifyStatus();
    },
    getStatus: () => mapEventSourceState(source.readyState)
  };
}
