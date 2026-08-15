"use client";

import { useCallback, useState } from "react";
import { useKeywordDetector } from "@/hooks/useKeywordDetector";
import { useWisprStream } from "@/hooks/useWisprStream";
import { AgentStatus } from "@/components/AgentStatus";
import { TranscriptPane } from "@/components/TranscriptPane";
import type { CommandKind, MeetingAgent } from "@/types/meeting";

type MeetingLiveProps = {
  meetingId: string;
  repoUrl: string;
  startingRef: string;
};

export function MeetingLive({ meetingId, repoUrl, startingRef }: MeetingLiveProps) {
  const [agents, setAgents] = useState<MeetingAgent[]>([]);
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);

  const { status, error, transcript, start, stop } = useWisprStream();

  const launchCommand = useCallback(
    async (kind: CommandKind, transcriptWindow: string, phrase: string) => {
      setLaunching(true);
      setCommandLog((log) => [`Detected “${phrase}” → ${kind}`, ...log].slice(0, 20));
      try {
        const res = await fetch("/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            kind,
            transcriptWindow,
            repoUrl,
            startingRef,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Launch failed");

        setAgents((prev) => [
          {
            agentId: data.agentId,
            runId: data.runId,
            kind: data.kind,
            status: "running",
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setCommandLog((log) => [`Launched ${data.agentId}`, ...log].slice(0, 20));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Launch failed";
        setCommandLog((log) => [`Error: ${message}`, ...log].slice(0, 20));
      } finally {
        setLaunching(false);
      }
    },
    [meetingId, repoUrl, startingRef],
  );

  useKeywordDetector({
    transcript,
    enabled: status === "listening" && !launching,
    onDetect: (cmd) => {
      void launchCommand(cmd.kind, cmd.transcriptWindow, cmd.phrase);
    },
  });

  const refreshAgent = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setAgents((prev) =>
        prev.map((a) =>
          a.agentId === agentId
            ? {
                ...a,
                status: data.status ?? a.status,
                summary: data.summary ?? a.summary,
              }
            : a,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Refresh failed";
      setCommandLog((log) => [`Refresh error: ${message}`, ...log].slice(0, 20));
    }
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live meeting</h1>
          <p className="mt-1 break-all text-sm text-zinc-500">
            {repoUrl} <span className="text-zinc-400">@{startingRef}</span>
          </p>
          <p className="font-mono text-xs text-zinc-400">{meetingId}</p>
        </div>
        <div className="flex gap-2">
          {status === "listening" || status === "connecting" ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Stop listening
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Start listening
            </button>
          )}
        </div>
      </header>

      <TranscriptPane transcript={transcript} status={status} error={error} />

      <AgentStatus agents={agents} onRefresh={(id) => void refreshAgent(id)} />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Command log
        </h2>
        <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {commandLog.length === 0 ? <li>Waiting for wake phrases…</li> : null}
          {commandLog.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
        {launching ? <p className="mt-2 text-xs text-amber-600">Launching cloud agent…</p> : null}
      </section>
    </div>
  );
}
