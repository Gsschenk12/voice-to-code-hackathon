"use client";

import type { CaptureSource } from "@/types/meeting";

export function TranscriptPane({
  transcript,
  status,
  error,
  captureSource = "wispr",
}: {
  transcript: string;
  status: string;
  error?: string | null;
  captureSource?: CaptureSource;
}) {
  const emptyHint =
    captureSource === "meet"
      ? "Turn on Meet captions (CC), then say “grok make an issue” or “grok make a PR”."
      : "Speak to start the transcript… Try “grok make an issue” or “grok make a PR”.";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Live transcript
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            status === "listening"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : status === "error"
                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          {status}
        </span>
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <div className="min-h-48 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-mono text-sm leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        {transcript || emptyHint}
      </div>
    </section>
  );
}
