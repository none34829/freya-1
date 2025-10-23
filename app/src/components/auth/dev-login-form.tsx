"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { devLogin } from "@/lib/api";

export function DevLoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setSubmitting(true);
    try {
      await devLogin(name.trim() ? name.trim() : undefined);
      toast.success("Welcome back", { description: "Redirecting to console..." });
      router.push("/console");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Login failed", {
        description: error instanceof Error ? error.message : "Unexpected error"
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <label className="block text-left">
        <span className="text-sm font-medium text-slate-300">Display name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Dev User"
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/50"
        />
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSubmitting ? "Signing in" : "Dev Login"}
      </button>
    </form>
  );
}
