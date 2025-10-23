"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import type { Prompt } from "@/lib/types";

interface PromptSwitcherProps {
  open: boolean;
  onClose: () => void;
  prompts: Prompt[];
  onSelectPrompt: (promptId: string) => void;
  selectedPromptId: string | null;
}

export function PromptSwitcher({ open, onClose, prompts, onSelectPrompt, selectedPromptId }: PromptSwitcherProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return prompts;
    const normalized = query.toLowerCase();
    return prompts.filter((prompt) =>
      prompt.title.toLowerCase().includes(normalized) || prompt.tags.some((tag) => tag.toLowerCase().includes(normalized))
    );
  }, [prompts, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 py-16 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prompts"
            className="w-full bg-transparent text-sm text-slate-100 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-800 p-1 text-slate-400 hover:border-slate-600 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">
              No prompts found for {query ? `'${query}'` : "that search"}.
            </p>
          ) : (
            filtered.map((prompt) => {
              const isSelected = prompt.id === selectedPromptId;
              return (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => {
                    onSelectPrompt(prompt.id);
                    onClose();
                  }}
                  className={clsx(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                    isSelected
                      ? "bg-sky-500/20 text-slate-100"
                      : "text-slate-200 hover:bg-slate-800/60"
                  )}
                >
                  <p className="font-medium">{prompt.title}</p>
                  <p className="text-xs text-slate-400">{prompt.tags.join(", ")}</p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
