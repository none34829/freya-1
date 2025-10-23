"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createPrompt as apiCreatePrompt,
  updatePrompt as apiUpdatePrompt,
  deletePrompt as apiDeletePrompt,
  fetchPrompts,
  fetchSessions,
  createSession as apiCreateSession,
  fetchSession,
  fetchSessionMessages,
  sendSessionMessage,
  fetchMetrics,
  fetchLogs,
  logout as apiLogout
} from "@/lib/api";
import type { AuthenticatedUser, Message } from "@/lib/types";
import { ApiError } from "@/lib/api-client";
import {
  connectSessionStream,
  type SessionStream,
  type StreamEvent
} from "@/lib/stream-client";
import { STREAM_EVENT_TYPES } from "@/lib/constants";
import { PromptPane } from "./prompt-pane";
import { SessionsPane } from "./sessions-pane";
import { ChatPane } from "./chat-pane";
import { MetricsPane } from "./metrics-pane";
import { PromptSwitcher } from "./prompt-switcher";

interface ConsoleViewProps {
  user: AuthenticatedUser;
}

type StreamState = "idle" | "connecting" | "open" | "closed";

type UpdatePromptPayload = { title: string; body: string; tags: string[] };

export function ConsoleView({ user }: ConsoleViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [isPromptSwitcherOpen, setPromptSwitcherOpen] = useState(false);

  const streamRef = useRef<SessionStream | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectNotifiedRef = useRef<boolean>(false);

  const handleApiError = useCallback((error: unknown, fallbackMessage: string) => {
    if (error instanceof ApiError) {
      toast.error(fallbackMessage, {
        description: `${error.message}${error.status === 429 ? " - Please slow down" : ""}`
      });
      return;
    }
    console.error(error);
    toast.error(fallbackMessage);
  }, []);

  const promptsQuery = useQuery({
    queryKey: ["prompts", searchTerm, tagFilter],
    queryFn: async () => {
      const response = await fetchPrompts({
        search: searchTerm || undefined,
        tag: tagFilter || undefined
      });
      return response.prompts;
    },
    staleTime: 30_000
  });

  const prompts = useMemo(() => promptsQuery.data ?? [], [promptsQuery.data]);

  useEffect(() => {
    if (prompts.length === 0) {
      setSelectedPromptId(null);
      return;
    }

    if (selectedPromptId && prompts.some((prompt) => prompt.id === selectedPromptId)) {
      return;
    }

    setSelectedPromptId(prompts[0]?.id ?? null);
  }, [prompts, selectedPromptId]);

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId]
  );

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const response = await fetchSessions();
      return response.sessions;
    },
    refetchInterval: 15_000,
    staleTime: 15_000
  });

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);

  const mostRecentSessionId = sessions[0]?.id ?? null;
  const isReadOnlySession = Boolean(activeSessionId && mostRecentSessionId && activeSessionId !== mostRecentSessionId);

  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSessionId(null);
      return;
    }

    if (activeSessionId && sessions.some((session) => session.id === activeSessionId)) {
      return;
    }

    setActiveSessionId(sessions[0]?.id ?? null);
  }, [sessions, activeSessionId]);

  const sessionDetailQuery = useQuery({
    queryKey: ["session", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return null;
      const response = await fetchSession(activeSessionId);
      return response.session;
    },
    enabled: Boolean(activeSessionId)
  });

  const sessionMessagesQuery = useQuery({
    queryKey: ["sessionMessages", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) {
        return [];
      }
      const response = await fetchSessionMessages(activeSessionId);
      return response.messages;
    },
    enabled: Boolean(activeSessionId),
    refetchOnWindowFocus: false
  });

  const metricsQuery = useQuery({
    queryKey: ["metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 5_000,
    refetchOnWindowFocus: false
  });

  const logsQuery = useQuery({
    queryKey: ["logs"],
    queryFn: async () => {
      const response = await fetchLogs();
      return response.logs;
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: false
  });

  const createPromptMutation = useMutation({
    mutationFn: apiCreatePrompt,
    onSuccess: (prompt) => {
      toast.success("Prompt created", { description: prompt.title });
      setSelectedPromptId(prompt.id);
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (error) => handleApiError(error, "Failed to create prompt")
  });

  const updatePromptMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePromptPayload }) =>
      apiUpdatePrompt(id, payload),
    onSuccess: (prompt) => {
      toast.success("Prompt updated", { description: prompt.title });
      setSelectedPromptId(prompt.id);
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (error) => handleApiError(error, "Failed to update prompt")
  });

  const deletePromptMutation = useMutation({
    mutationFn: apiDeletePrompt,
    onSuccess: (_, promptId) => {
      toast.success("Prompt deleted");
      if (selectedPromptId === promptId) {
        setSelectedPromptId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (error) => handleApiError(error, "Failed to delete prompt")
  });

  const createSessionMutation = useMutation({
    mutationFn: (promptId: string) => apiCreateSession({ promptId, mode: "hybrid" }),
    onSuccess: (session) => {
      toast.success("Session started", { description: `Prompt - ${selectedPrompt?.title ?? ""}` });
      setActiveSessionId(session.id);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["sessionMessages"] });
    },
    onError: (error) => handleApiError(error, "Failed to start session")
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!activeSessionId) {
        throw new Error("No active session selected");
      }
      const response = await sendSessionMessage(activeSessionId, { text });
      return response.message;
    },
    onSuccess: (message) => {
      if (!activeSessionId) return;
      queryClient.setQueryData<Message[]>(["sessionMessages", activeSessionId], (existing) => {
        const current = existing ? [...existing] : [];
        current.push(message);
        return current;
      });
    },
    onError: (error) => handleApiError(error, "Failed to send message")
  });

  const logoutMutation = useMutation({
    mutationFn: apiLogout,
    onSuccess: () => {
      toast.success("Signed out");
      router.push("/login");
      router.refresh();
    },
    onError: (error) => handleApiError(error, "Failed to logout")
  });

  const sessionWithPrompt = useMemo(() => {
    const session = sessionDetailQuery.data;
    if (!session) return null;
    const prompt = prompts.find((item) => item.id === session.promptId) ?? null;
    return { ...session, prompt };
  }, [sessionDetailQuery.data, prompts]);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      if (!activeSessionId) return;

      switch (event.type) {
        case STREAM_EVENT_TYPES.connected: {
          toast.success("Streaming connected", { description: "Live updates enabled" });
          break;
        }
        case STREAM_EVENT_TYPES.degraded: {
          toast.warning("Agent degraded mode", {
            description: event.data.message || "Agent service unavailable. Using local fallback."
          });
          break;
        }
        case STREAM_EVENT_TYPES.error: {
          toast.error("Agent stream error", { description: event.data.message });
          break;
        }
        case STREAM_EVENT_TYPES.assistantToken: {
          queryClient.setQueryData<Message[]>(["sessionMessages", activeSessionId], (existing) => {
            const current = existing ? [...existing] : [];
            const index = current.findIndex((message) => message.id === event.data.messageId);
            if (index === -1) {
              current.push({
                id: event.data.messageId,
                sessionId: activeSessionId,
                role: "assistant",
                text: event.data.token,
                createdAt: event.data.at,
                firstTokenAt: event.data.at,
                lastTokenAt: event.data.at,
                tokenCount: 1
              });
            } else {
              const existingMessage = current[index];
              current[index] = {
                ...existingMessage,
                text: `${existingMessage.text ?? ""}${event.data.token}`,
                firstTokenAt: existingMessage.firstTokenAt ?? event.data.at,
                lastTokenAt: event.data.at,
                tokenCount: (existingMessage.tokenCount ?? 0) + 1
              };
            }
            return current;
          });
          break;
        }
        case STREAM_EVENT_TYPES.assistantDone: {
          queryClient.setQueryData<Message[]>(["sessionMessages", activeSessionId], (existing) => {
            const current = existing ? [...existing] : [];
            const index = current.findIndex((message) => message.id === event.data.messageId);
            if (index === -1) {
              current.push({
                id: event.data.messageId,
                sessionId: activeSessionId,
                role: "assistant",
                text: "",
                createdAt: event.data.firstTokenAt,
                firstTokenAt: event.data.firstTokenAt,
                lastTokenAt: event.data.lastTokenAt,
                tokenCount: event.data.totalTokens
              });
            } else {
              current[index] = {
                ...current[index],
                firstTokenAt: current[index].firstTokenAt ?? event.data.firstTokenAt,
                lastTokenAt: event.data.lastTokenAt,
                tokenCount: event.data.totalTokens
              };
            }
            return current;
          });
          queryClient.invalidateQueries({ queryKey: ["metrics"] });
          queryClient.invalidateQueries({ queryKey: ["logs"] });
          queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
          queryClient.invalidateQueries({ queryKey: ["sessionMessages", activeSessionId] });
          break;
        }
        case STREAM_EVENT_TYPES.assistantAudio: {
          queryClient.setQueryData<Message[]>(["sessionMessages", activeSessionId], (existing) => {
            if (!existing) {
              return existing;
            }
            return existing.map((message) =>
              message.id === event.data.messageId
                ? {
                    ...message,
                    audioUrl: event.data.audioUrl,
                    audioDurationMs: event.data.durationMs
                  }
                : message
            );
          });
          break;
        }
        default:
          break;
      }
    },
    [activeSessionId, queryClient]
  );

  useEffect(() => {
    if (!activeSessionId) {
      streamRef.current?.close();
      streamRef.current = null;
      setStreamState("idle");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      setStreamState("connecting");

      try {
        const stream = connectSessionStream(activeSessionId, handleStreamEvent, {
          onStatusChange: (state) => {
            if (state === WebSocket.OPEN) {
              setStreamState("open");
              attempts = 0;
              reconnectNotifiedRef.current = false;
            } else if (state === WebSocket.CLOSED) {
              setStreamState("closed");
              if (!cancelled) {
                attempts += 1;
                const delay = Math.min(2 ** attempts * 1000, 10_000);
                toast.warning("Stream disconnected", {
                  description: `Attempting to reconnect in ${Math.round(delay / 1000)}s`
                });
                reconnectTimeoutRef.current = window.setTimeout(connect, delay);
              }
            } else if (state === WebSocket.CONNECTING) {
              setStreamState("connecting");
              if (!reconnectNotifiedRef.current) {
                toast.warning("Stream interrupted", { description: "Reconnecting..." });
                reconnectNotifiedRef.current = true;
              }
            }
          }
        });
        streamRef.current = stream;
      } catch (error) {
        handleApiError(error, "Unable to connect to stream");
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [activeSessionId, handleStreamEvent, handleApiError]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setPromptSwitcherOpen(true);
        return;
      }

      if (!event.metaKey && !event.ctrlKey && key === "/") {
        event.preventDefault();
        setPromptSwitcherOpen(true);
        return;
      }

      if (key === "escape") {
        setPromptSwitcherOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreatePrompt = useCallback(
    async (payload: UpdatePromptPayload) => {
      await createPromptMutation.mutateAsync(payload);
    },
    [createPromptMutation]
  );

  const handleUpdatePrompt = useCallback(
    async (id: string, payload: UpdatePromptPayload) => {
      await updatePromptMutation.mutateAsync({ id, payload });
    },
    [updatePromptMutation]
  );

  const handleDeletePrompt = useCallback(
    async (id: string) => {
      await deletePromptMutation.mutateAsync(id);
    },
    [deletePromptMutation]
  );

  const handleStartSession = useCallback(async () => {
    if (!selectedPromptId) {
      toast.error("Select a prompt first");
      return;
    }
    await createSessionMutation.mutateAsync(selectedPromptId);
  }, [createSessionMutation, selectedPromptId]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      await sendMessageMutation.mutateAsync(text);
    },
    [sendMessageMutation]
  );

  const handleLogout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Freya Agent Console</h1>
          <p className="text-sm text-slate-400">
            {selectedPrompt ? `Active prompt - ${selectedPrompt.title}` : "Select or create a prompt to start"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleStartSession}
            disabled={!selectedPromptId || createSessionMutation.isPending}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {createSessionMutation.isPending ? "Starting..." : "Start Session"}
          </button>
          <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 md:flex">
            <span className="font-semibold text-slate-200">{user.name}</span>
            <span className="text-xs uppercase tracking-wide text-slate-500">{user.role}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {logoutMutation.isPending ? "Signing out..." : "Logout"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden h-full w-[22rem] flex-col border-r border-slate-800 bg-slate-950/60 p-4 lg:flex">
          <div className="flex flex-1 min-h-0 flex-col gap-6 overflow-hidden">
            <div className="flex-[3] min-h-0 overflow-hidden">
              <PromptPane
                prompts={prompts}
                isLoading={promptsQuery.isLoading}
                selectedPromptId={selectedPromptId}
                onSelectPrompt={setSelectedPromptId}
                onCreatePrompt={handleCreatePrompt}
                onUpdatePrompt={handleUpdatePrompt}
                onDeletePrompt={handleDeletePrompt}
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                tagFilter={tagFilter}
                onTagFilterChange={setTagFilter}
                onOpenPromptSwitcher={() => setPromptSwitcherOpen(true)}
              />
            </div>
            <div className="flex-[2] min-h-0 overflow-hidden">
              <SessionsPane
                sessions={sessions}
                prompts={prompts}
                isLoading={sessionsQuery.isLoading}
                activeSessionId={activeSessionId}
                onSelectSession={setActiveSessionId}
              />
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col bg-slate-950">
          <ChatPane
            session={sessionWithPrompt}
            messages={sessionMessagesQuery.data ?? []}
            isLoading={sessionDetailQuery.isLoading || sessionMessagesQuery.isLoading}
            onSendMessage={handleSendMessage}
            isSending={sendMessageMutation.isPending}
            streamState={streamState}
            readOnly={isReadOnlySession}
            user={user}
          />
        </main>

        <aside className="hidden w-[20rem] overflow-y-auto border-l border-slate-800 bg-slate-950/60 p-4 xl:block">
          <MetricsPane
            metrics={metricsQuery.data ?? null}
            logs={logsQuery.data ?? []}
            isLoading={metricsQuery.isLoading || logsQuery.isLoading}
          />
        </aside>
      </div>

      <PromptSwitcher
        open={isPromptSwitcherOpen}
        onClose={() => setPromptSwitcherOpen(false)}
        prompts={prompts}
        onSelectPrompt={(promptId) => {
          setSelectedPromptId(promptId);
          setPromptSwitcherOpen(false);
        }}
        selectedPromptId={selectedPromptId}
      />
    </div>
  );
}








