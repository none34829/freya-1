"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Optionally report to monitoring here
    console.error("Route error boundary:", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold text-slate-100">Something went wrong</h2>
      <p className="max-w-prose text-sm text-slate-400">
        An error occurred while rendering this page. You can try again, or go back to the Console.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
        >
          Try again
        </button>
        <a
          href="/console"
          className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
        >
          Go to Console
        </a>
      </div>
    </div>
  );
}
