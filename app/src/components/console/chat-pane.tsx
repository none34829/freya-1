"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Play, SendHorizontal, Square } from "lucide-react";
import clsx from "clsx";
import type { Message, Prompt, Session, AuthenticatedUser } from "@/lib/types";
import { toast } from "sonner";
import { synthesizeSpeech } from "@/lib/api";
import { VoiceChat } from "./voice-chat";

interface ChatPaneProps {
  session: (Session & { prompt?: Prompt | null }) | null;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  streamState: "idle" | "connecting" | "open" | "closed";
  readOnly: boolean;
  user?: AuthenticatedUser;
}

const DEFAULT_TTS_VOICE = process.env.NEXT_PUBLIC_TTS_VOICE ?? "alloy";
type AudioCacheEntry = { url: string; revoke: boolean };

export function ChatPane({
  session,
  messages,
  isLoading,
  onSendMessage,
  isSending,
  streamState,
  readOnly,
  user
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const hasUserScrolledRef = useRef(false);
  const isHoveringRef = useRef(false);
  const [isHovering, setIsHovering] = useState(false);

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
      hasUserScrolledRef.current = !nearBottom;
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [session?.id]);

  useEffect(() => {
    if (!autoScrollEnabled) return;
    if (isHoveringRef.current) return;
    if (hasUserScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [sortedMessages, autoScrollEnabled, isHovering]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    if (autoScrollEnabled) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [session?.id, autoScrollEnabled]);

  const handleToggleAutoScroll = () => {
    setAutoScrollEnabled((enabled) => {
      const next = !enabled;
      if (next) {
        hasUserScrolledRef.current = false;
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: "auto" });
          });
        } else {
          bottomRef.current?.scrollIntoView({ behavior: "auto" });
        }
      } else {
        hasUserScrolledRef.current = true;
      }
      return next;
    });
  };

  const handleMouseEnter = () => {
    isHoveringRef.current = true;
    setIsHovering(true);
    hasUserScrolledRef.current = true;
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    setIsHovering(false);
    const container = listRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    hasUserScrolledRef.current = !nearBottom;
    if (autoScrollEnabled && nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  };


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !session || readOnly) return;
    try {
      await onSendMessage(trimmed);
      setDraft("");
    } catch (error) {
      console.error(error);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (readOnly) return;
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const renderStreamStatus = () => {
    switch (streamState) {
      case "open":
        return <span className="text-xs font-medium text-emerald-400">Live</span>;
      case "connecting":
        return (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Connecting...
          </span>
        );
      case "closed":
        return <span className="text-xs font-medium text-red-400">Disconnected</span>;
      default:
        return <span className="text-xs text-slate-500">Idle</span>;
    }
  };

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Select a prompt and start a session to begin chatting.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Session</p>
          <h2 className="text-lg font-semibold text-slate-100">{session.prompt?.title ?? "Untitled prompt"}</h2>
          <p className="text-xs text-slate-500">
            Started {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="text-xs text-slate-400">{renderStreamStatus()}</div>
          <button
            type="button"
            onClick={handleToggleAutoScroll}
            className={clsx(
              "rounded border px-2 py-1",
              autoScrollEnabled
                ? "border-sky-600 bg-sky-500/20 text-sky-300"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
            )}
            title="Toggle auto-scroll"
          >
            Auto-scroll: {autoScrollEnabled ? "On" : "Off"}
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-testid="message-scroll-container" className="flex-1 space-y-4 overflow-y-auto px-6 py-6"
      >
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading conversation...</p>
        ) : sortedMessages.length === 0 ? (
          <p className="text-sm text-slate-500">Send a message to begin your conversation.</p>
        ) : (
          <MessageList messages={sortedMessages} showExtendedMetrics={session.mode !== "chat"} />
        )}
        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-slate-800 px-6 py-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent something..."
            disabled={readOnly}
            className={clsx(
              "h-28 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40",
              readOnly && "cursor-not-allowed text-slate-500 opacity-70"
            )}
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{readOnly ? "Viewing archived session (read-only)" : "Enter to send, Shift+Enter for newline"}</span>
            <button
              type="submit"
              disabled={readOnly || isSending || !draft.trim()}
              className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              Send
            </button>
          </div>
        </form>
        {user && session && (
          <VoiceChat
            user={user}
            sessionId={session.id}
            promptInstructions={session.prompt?.body}
            disabled={readOnly}
          />
        )}
      </footer>
    </div>
  );
}

function MessageList({ messages, showExtendedMetrics }: { messages: Message[]; showExtendedMetrics: boolean }) {
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, AudioCacheEntry>>(new Map());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const clearAudioElement = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    clearAudioElement();
    setPlayingId(null);
  }, [clearAudioElement]);

  useEffect(() => {
    const cache = audioCacheRef.current;

    return () => {
      clearAudioElement();
      for (const entry of cache.values()) {
        if (entry.revoke) {
          URL.revokeObjectURL(entry.url);
        }
      }
      cache.clear();
    };
  }, [clearAudioElement]);

  const getAudioEntry = useCallback(
    async (message: Message): Promise<AudioCacheEntry | null> => {
      const cached = audioCacheRef.current.get(message.id);
      if (cached) {
        return cached;
      }

      if (message.audioUrl) {
        const entry: AudioCacheEntry = { url: message.audioUrl, revoke: false };
        audioCacheRef.current.set(message.id, entry);
        return entry;
      }

      if (!message.text || message.text.trim().length === 0) {
        return null;
      }

      const { blob } = await synthesizeSpeech(message.text, { voice: DEFAULT_TTS_VOICE });
      const url = URL.createObjectURL(blob);
      const entry: AudioCacheEntry = { url, revoke: true };
      audioCacheRef.current.set(message.id, entry);
      return entry;
    },
    []
  );

  const handlePlayClick = useCallback(
    async (message: Message) => {
      if (playingId === message.id) {
        stopPlayback();
        return;
      }

      if (!message.audioUrl && (!message.text || message.text.trim().length === 0)) {
        toast.error("No audio available for this response");
        return;
      }

      setLoadingId(message.id);

      try {
        const entry = await getAudioEntry(message);
        if (!entry) {
          throw new Error("No speech content available for this response");
        }

        clearAudioElement();

        const audio = new Audio(entry.url);
        audio.crossOrigin = "anonymous";
        audioElementRef.current = audio;

        await audio.play();
        setPlayingId(message.id);

        audio.onended = () => {
          stopPlayback();
        };
        audio.onerror = () => {
          toast.error("Playback failed");
          stopPlayback();
        };
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Unable to play response audio");
        stopPlayback();
      } finally {
        setLoadingId((current) => (current === message.id ? null : current));
      }
    },
    [clearAudioElement, getAudioEntry, playingId, stopPlayback]
  );

  let lastUserMessage: Message | null = null;

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        if (message.role === "user") {
          lastUserMessage = message;
        }

        const createdAt = new Date(message.createdAt);
        const metrics = showExtendedMetrics ? computeMessageMetrics(message, lastUserMessage) : null;
        let latencyInfo: string | null = null;
        if (!showExtendedMetrics && message.role === "assistant" && lastUserMessage) {
          if (message.firstTokenAt) {
            const latency =
              new Date(message.firstTokenAt).getTime() - new Date(lastUserMessage.createdAt).getTime();
            if (latency >= 0) {
              latencyInfo = `${latency}ms to first token`;
            }
          } else {
            const elapsed = Date.now() - new Date(lastUserMessage.createdAt).getTime();
            if (elapsed > 0) {
              latencyInfo = `${elapsed}ms elapsed`;
            }
          }
        }
        const tokensPerSec = computeTokensPerSecond(message);
        const hasStoredAudio = Boolean(message.audioUrl);
        const canSynthesize =
          message.role === "assistant" && Boolean(message.text && message.text.trim().length > 0);
        const showPlayButton = hasStoredAudio || canSynthesize;
        const isLoading = loadingId === message.id;
        const isPlaying = playingId === message.id;

        return (
          <div
            key={message.id}
            className={clsx(
              "flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-4",
              message.role === "assistant" ? "border-sky-900/60" : ""
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">{message.role.toUpperCase()}</span>
              <span className="text-slate-500">{createdAt.toLocaleTimeString()}</span>
            </div>
            {message.text ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{message.text}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {showExtendedMetrics ? (
                <>
                  {metrics && metrics.firstTokenLatencyMs !== null ? (
                    <span>First token: {formatDuration(metrics.firstTokenLatencyMs)}</span>
                  ) : null}
                  {metrics && metrics.responseDurationMs !== null ? (
                    <span>Response: {formatDuration(metrics.responseDurationMs)}</span>
                  ) : null}
                  {metrics && metrics.totalDurationMs !== null ? (
                    <span>Roundtrip: {formatDuration(metrics.totalDurationMs)}</span>
                  ) : null}
                  {typeof message.audioDurationMs === "number" ? (
                    <span>Audio: {formatDuration(message.audioDurationMs)}</span>
                  ) : null}
                </>
              ) : (
                <>
                  {latencyInfo ? <span>{latencyInfo}</span> : null}
                  {typeof message.audioDurationMs === "number" ? (
                    <span>Audio: {formatDuration(message.audioDurationMs)}</span>
                  ) : null}
                </>
              )}
              {message.tokenCount ? <span>{message.tokenCount} tokens</span> : null}
              {tokensPerSec !== null ? <span>{tokensPerSec.toFixed(2)} tok/s</span> : null}
              {message.error ? <span className="text-red-400">{message.error}</span> : null}
              {showPlayButton ? (
                <button
                  type="button"
                  onClick={() => {
                    void handlePlayClick(message);
                  }}
                  disabled={isLoading}
                  className={clsx(
                    "flex items-center gap-1 rounded border px-2 py-1",
                    isPlaying
                      ? "border-sky-500 bg-sky-500/20 text-sky-200"
                      : isLoading
                      ? "border-slate-700 bg-slate-800 text-slate-400"
                      : "border-slate-700 bg-slate-900/60 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isPlaying ? (
                    <Square className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  <span>{isPlaying ? "Stop audio" : "Listen to this reply"}</span>
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MessageMetrics {
  firstTokenLatencyMs: number | null;
  responseDurationMs: number | null;
  totalDurationMs: number | null;
}

function computeMessageMetrics(message: Message, lastUserMessage: Message | null): MessageMetrics {
  if (message.role !== "assistant" || !lastUserMessage) {
    return {
      firstTokenLatencyMs: null,
      responseDurationMs: null,
      totalDurationMs: null
    };
  }

  const userTime = new Date(lastUserMessage.createdAt).getTime();
  const firstTokenTime = message.firstTokenAt ? new Date(message.firstTokenAt).getTime() : null;
  const lastTokenTime = message.lastTokenAt ? new Date(message.lastTokenAt).getTime() : null;

  return {
    firstTokenLatencyMs:
      firstTokenTime !== null ? Math.max(firstTokenTime - userTime, 0) : null,
    responseDurationMs:
      firstTokenTime !== null && lastTokenTime !== null
        ? Math.max(lastTokenTime - firstTokenTime, 0)
        : null,
    totalDurationMs: lastTokenTime !== null ? Math.max(lastTokenTime - userTime, 0) : null
  };
}

function computeTokensPerSecond(message: Message): number | null {
  if (!message.firstTokenAt || !message.lastTokenAt || !message.tokenCount || message.tokenCount === 0) {
    return null;
  }
  const first = new Date(message.firstTokenAt).getTime();
  const last = new Date(message.lastTokenAt).getTime();
  const durationMs = Math.max(last - first, 0);
  if (durationMs === 0) return null;
  return (message.tokenCount / durationMs) * 1000;
}

function formatDuration(ms: number): string {
  const rounded = Math.round(ms);
  const formatter = new Intl.NumberFormat("en-US");
  return `${formatter.format(rounded)}ms`;
}
