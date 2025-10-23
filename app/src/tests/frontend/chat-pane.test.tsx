import '@testing-library/jest-dom/vitest';
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ChatPane } from "@/components/console/chat-pane";
import type { Message } from "@/lib/types";

let scrollSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  scrollSpy = vi.spyOn(window.HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  scrollSpy.mockRestore();
});

describe("ChatPane", () => {
  const baseSession = {
    id: "session-1",
    promptId: "prompt-1",
    startedAt: new Date().toISOString(),
    mode: "chat" as const,
    metrics: {},
    readOnly: false
  };

  it("streams assistant tokens after sending message", async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const session = {
      ...baseSession,
      prompt: {
        id: "prompt-1",
        title: "Prompt",
        body: "",
        tags: [],
        createdAt: "",
        updatedAt: "",
        version: 1,
        history: []
      }
    };

    const { rerender } = render(
      <ChatPane
        session={session}
        messages={[]}
        isLoading={false}
        onSendMessage={onSendMessage}
        isSending={false}
        streamState="open"
        readOnly={false}
      />
    );

    const textarea = screen.getByPlaceholderText("Ask the agent something...");
    fireEvent.change(textarea, { target: { value: "How are you?" } });
    fireEvent.submit(textarea.closest("form")!);

    expect(onSendMessage).toHaveBeenCalledWith("How are you?");

    const now = new Date().toISOString();
    const userMessage: Message = {
      id: "user-1",
      sessionId: "session-1",
      role: "user",
      text: "How are you?",
      createdAt: now
    };

    const assistantMessagePartial: Message = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      text: "Doing",
      createdAt: now,
      firstTokenAt: now,
      lastTokenAt: now,
      tokenCount: 1
    };

    rerender(
      <ChatPane
        session={session}
        messages={[userMessage, assistantMessagePartial]}
        isLoading={false}
        onSendMessage={onSendMessage}
        isSending={false}
        streamState="open"
        readOnly={false}
      />
    );

    expect(await screen.findByText("Doing")).toBeInTheDocument();

    const assistantMessageComplete: Message = {
      ...assistantMessagePartial,
      text: "Doing well!",
      lastTokenAt: now,
      tokenCount: 3
    };

    rerender(
      <ChatPane
        session={session}
        messages={[userMessage, assistantMessageComplete]}
        isLoading={false}
        onSendMessage={onSendMessage}
        isSending={false}
        streamState="open"
        readOnly={false}
      />
    );

    expect(await screen.findByText("Doing well!")).toBeInTheDocument();
  });

  it("pauses auto-scroll while hovering", async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const session = {
      ...baseSession,
      prompt: {
        id: "prompt-1",
        title: "Prompt",
        body: "",
        tags: [],
        createdAt: "",
        updatedAt: "",
        version: 1,
        history: []
      }
    };

    const firstMessage: Message = {
      id: "m-user",
      sessionId: "session-1",
      role: "user",
      text: "Hello",
      createdAt: new Date().toISOString()
    };

    const { rerender } = render(
      <ChatPane
        session={session}
        messages={[firstMessage]}
        isLoading={false}
        onSendMessage={onSendMessage}
        isSending={false}
        streamState="open"
        readOnly={false}
      />
    );

    await waitFor(() => expect(scrollSpy.mock.calls.length).toBeGreaterThan(0));
    const initialCalls = scrollSpy.mock.calls.length;

    const scrollContainer = screen.getAllByTestId("message-scroll-container")[0] as HTMLElement;
    fireEvent.mouseEnter(scrollContainer);

    const secondMessage: Message = {
      id: "m-assistant-partial",
      sessionId: "session-1",
      role: "assistant",
      text: "Hi",
      createdAt: new Date().toISOString(),
      firstTokenAt: new Date().toISOString(),
      lastTokenAt: new Date().toISOString(),
      tokenCount: 1
    };

    rerender(
      <ChatPane
        session={session}
        messages={[firstMessage, secondMessage]}
        isLoading={false}
        onSendMessage={onSendMessage}
        isSending={false}
        streamState="open"
        readOnly={false}
      />
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.mouseLeave(scrollContainer);

    const thirdMessage: Message = {
      ...secondMessage,
      id: "m-assistant-complete",
      text: "Hi there!",
      tokenCount: 2
    };

    rerender(
      <ChatPane
        session={session}
        messages={[firstMessage, thirdMessage]}
        isLoading={false}
        onSendMessage={onSendMessage}
        isSending={false}
        streamState="open"
        readOnly={false}
      />
    );

    await waitFor(() => expect(scrollSpy.mock.calls.length).toBeGreaterThan(initialCalls));
  });
});
