import type { Prompt, PromptId } from "@/lib/types";
import { logLine } from "../observability/logs";

interface PromptInput {
  title: string;
  body: string;
  tags: string[];
}

const promptStore = new Map<PromptId, Prompt>();

function seedDefaults(): void {
  if (promptStore.size > 0) {
    return;
  }

  const now = new Date().toISOString();
  const defaultPrompt: Prompt = {
    id: crypto.randomUUID(),
    title: "Friendly Support Agent",
    body:
      "You are Freya, a helpful support agent. Provide concise answers, ask clarifying questions, and always mention relevant docs when available.",
    tags: ["support", "default"],
    createdAt: now,
    updatedAt: now,
    version: 1,
    history: []
  };

  promptStore.set(defaultPrompt.id, defaultPrompt);
}

seedDefaults();

export function listPrompts(params: { search?: string; tag?: string } = {}): Prompt[] {
  const { search, tag } = params;

  return Array.from(promptStore.values())
    .filter((prompt) => {
      const matchesSearch =
        !search ||
        prompt.title.toLowerCase().includes(search.toLowerCase()) ||
        prompt.body.toLowerCase().includes(search.toLowerCase());

      const matchesTag = !tag || prompt.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase());

      return matchesSearch && matchesTag;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function createPrompt(input: PromptInput): Prompt {
  const now = new Date().toISOString();
  const prompt: Prompt = {
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    version: 1,
    history: []
  };

  promptStore.set(prompt.id, prompt);
  logLine({ level: "info", msg: `Prompt created: ${prompt.title}`, meta: { promptId: prompt.id } });
  return prompt;
}

export function updatePrompt(id: PromptId, input: PromptInput): Prompt | null {
  const existing = promptStore.get(id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  const historyEntry = {
    version: existing.version,
    title: existing.title,
    body: existing.body,
    tags: existing.tags,
    updatedAt: existing.updatedAt
  };

  const updated: Prompt = {
    ...existing,
    title: input.title,
    body: input.body,
    tags: input.tags,
    updatedAt: now,
    version: existing.version + 1,
    history: [historyEntry, ...existing.history]
  };

  promptStore.set(id, updated);
  logLine({
    level: "info",
    msg: `Prompt updated: ${updated.title}`,
    meta: { promptId: id, version: updated.version }
  });
  return updated;
}

export function deletePrompt(id: PromptId): boolean {
  const deleted = promptStore.delete(id);
  if (deleted) {
    logLine({ level: "warn", msg: `Prompt deleted`, meta: { promptId: id } });
  }
  return deleted;
}

export function getPrompt(id: PromptId): Prompt | null {
  return promptStore.get(id) ?? null;
}
