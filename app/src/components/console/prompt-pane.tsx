"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Edit3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import type { Prompt } from "@/lib/types";

interface PromptPaneProps {
  prompts: Prompt[];
  isLoading: boolean;
  selectedPromptId: string | null;
  onSelectPrompt: (promptId: string) => void;
  onCreatePrompt: (payload: { title: string; body: string; tags: string[] }) => Promise<void>;
  onUpdatePrompt: (id: string, payload: { title: string; body: string; tags: string[] }) => Promise<void>;
  onDeletePrompt: (id: string) => Promise<void>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  onOpenPromptSwitcher: () => void;
}

interface PromptDraft {
  title: string;
  body: string;
  tags: string;
}

const emptyDraft: PromptDraft = {
  title: "",
  body: "",
  tags: ""
};

export function PromptPane({
  prompts,
  isLoading,
  selectedPromptId,
  onSelectPrompt,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  searchTerm,
  onSearchTermChange,
  tagFilter,
  onTagFilterChange,
  onOpenPromptSwitcher
}: PromptPaneProps) {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<PromptDraft>(emptyDraft);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, PromptDraft>>({});

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    prompts.forEach((prompt) => {
      prompt.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [prompts]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tags = normalizeTags(createDraft.tags);
    if (!createDraft.title.trim() || !createDraft.body.trim()) {
      toast.error("Prompt title and body are required");
      return;
    }

    try {
      await onCreatePrompt({
        title: createDraft.title.trim(),
        body: createDraft.body.trim(),
        tags
      });
      setCreateDraft(emptyDraft);
      setCreateOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdate = async (promptId: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = editDrafts[promptId];
    if (!draft) return;

    const tags = normalizeTags(draft.tags);
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.error("Prompt title and body are required");
      return;
    }

    try {
      await onUpdatePrompt(promptId, {
        title: draft.title.trim(),
        body: draft.body.trim(),
        tags
      });
      setEditingPromptId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (promptId: string) => {
    if (!window.confirm("Delete this prompt?")) {
      return;
    }
    try {
      await onDeletePrompt(promptId);
    } catch (error) {
      console.error(error);
    }
  };

  const startEditing = (prompt: Prompt) => {
    setEditingPromptId(prompt.id);
    setEditDrafts((previous) => ({
      ...previous,
      [prompt.id]: {
        title: prompt.title,
        body: prompt.body,
        tags: prompt.tags.join(", ")
      }
    }));
  };

  const editingDraft = (promptId: string): PromptDraft => {
    const existing = editDrafts[promptId];
    if (existing) return existing;
    const prompt = prompts.find((item) => item.id === promptId);
    if (!prompt) return emptyDraft;
    return {
      title: prompt.title,
      body: prompt.body,
      tags: prompt.tags.join(", ")
    };
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1 pb-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Prompt Library</h2>
            <button
              type="button"
              onClick={() => setCreateOpen((value) => !value)}
              className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600"
            >
              <Plus className="h-4 w-4" />
              {isCreateOpen ? "Close" : "New Prompt"}
            </button>
          </div>
          <div className="space-y-2">
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search prompts"
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Press</span>
              <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">/</kbd>
              <span>or</span>
              <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">Cmd+K</kbd>
              <span>to switch prompts</span>
              <button
                type="button"
                className="rounded border border-transparent px-1.5 py-0.5 text-xs text-sky-400 hover:border-sky-500"
                onClick={onOpenPromptSwitcher}
              >
                Open switcher
              </button>
            </div>
          </div>
          {availableTags.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {availableTags.map((tag) => {
                const isActive = tagFilter === tag;
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => onTagFilterChange(isActive ? "" : tag)}
                    className={clsx(
                      "rounded-full border px-3 py-1 transition",
                      isActive
                        ? "border-sky-500 bg-sky-500/20 text-sky-300"
                        : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
              {tagFilter ? (
                <button
                  type="button"
                  onClick={() => onTagFilterChange("")}
                  className="rounded-full border border-transparent px-3 py-1 text-xs text-slate-500 hover:border-slate-600 hover:text-slate-200"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isCreateOpen ? (
          <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div>
              <label className="text-xs font-medium text-slate-400">Title</label>
              <input
                value={createDraft.title}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, title: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Body</label>
              <textarea
                value={createDraft.body}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, body: event.target.value }))}
                className="mt-1 h-28 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Tags (comma separated)</label>
              <input
                value={createDraft.tags}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, tags: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div className="flex justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setCreateDraft(emptyDraft);
                  setCreateOpen(false);
                }}
                className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-sky-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-sky-400"
              >
                Save Prompt
              </button>
            </div>
          </form>
        ) : null}

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading prompts...</p>
          ) : prompts.length === 0 ? (
            <p className="text-sm text-slate-500">No prompts match the current filters.</p>
          ) : (
            prompts.map((prompt) => {
              const isSelected = selectedPromptId === prompt.id;
              const isExpanded = expandedPromptId === prompt.id;
              const isEditing = editingPromptId === prompt.id;
              const draft = editingDraft(prompt.id);

              return (
                <div
                  key={prompt.id}
                  className={clsx(
                    "rounded-lg border border-slate-800 bg-slate-900/60 transition",
                    isSelected ? "ring-2 ring-sky-500/60" : "hover:border-slate-600"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPrompt(prompt.id);
                      setExpandedPromptId((current) => (current === prompt.id ? null : prompt.id));
                    }}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-slate-100">{prompt.title}</h3>
                      <p className="text-xs text-slate-500">{new Date(prompt.updatedAt).toLocaleString()}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>

                  {isExpanded ? (
                    <div className="space-y-4 border-t border-slate-800 px-4 py-3 text-sm text-slate-200">
                      {isEditing ? (
                        <form onSubmit={(event) => handleUpdate(prompt.id, event)} className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-slate-400">Title</label>
                            <input
                              value={draft.title}
                              onChange={(event) =>
                                setEditDrafts((state) => ({
                                  ...state,
                                  [prompt.id]: { ...state[prompt.id], title: event.target.value }
                                }))
                              }
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-400">Body</label>
                            <textarea
                              value={draft.body}
                              onChange={(event) =>
                                setEditDrafts((state) => ({
                                  ...state,
                                  [prompt.id]: { ...state[prompt.id], body: event.target.value }
                                }))
                              }
                              className="mt-1 h-28 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-400">Tags</label>
                            <input
                              value={draft.tags}
                              onChange={(event) =>
                                setEditDrafts((state) => ({
                                  ...state,
                                  [prompt.id]: { ...state[prompt.id], tags: event.target.value }
                                }))
                              }
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                            />
                          </div>
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setEditingPromptId(null)}
                              className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="rounded bg-sky-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-sky-400"
                            >
                              Save Changes
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="space-y-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{prompt.body}</p>
                          {prompt.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                              {prompt.tags.map((tag) => (
                                <span key={tag} className="rounded-full border border-slate-700 px-2 py-0.5">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {prompt.history.length > 0 ? (
                            <details className="rounded border border-slate-800 bg-slate-950/60">
                              <summary className="cursor-pointer px-3 py-2 text-xs text-slate-400">
                                Version history ({prompt.history.length})
                              </summary>
                              <div className="space-y-2 px-3 py-2 text-xs text-slate-400">
                                {prompt.history.slice(0, 3).map((entry) => (
                                  <div key={`${entry.version}-${entry.updatedAt}`}>
                                    <p className="font-medium">
                                      v{entry.version} - {new Date(entry.updatedAt).toLocaleString()}
                                    </p>
                                    <p className="text-slate-500">{entry.body}</p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => startEditing(prompt)}
                              className="flex items-center gap-1 rounded border border-slate-700 px-3 py-1 text-slate-300 transition hover:border-slate-500"
                            >
                              <Edit3 className="h-3 w-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(prompt.id)}
                              className="flex items-center gap-1 rounded border border-red-700 px-3 py-1 text-red-300 transition hover:border-red-500"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 10);
}
