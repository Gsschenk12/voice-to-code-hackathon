"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  keywordMatchCount,
  useKeywordDetector,
} from "@/hooks/useKeywordDetector";
import { useMeetCaptionStream } from "@/hooks/useMeetCaptionStream";
import { useWisprStream } from "@/hooks/useWisprStream";
import { AgentStatus } from "@/components/AgentStatus";
import { TranscriptPane } from "@/components/TranscriptPane";
import {
  loadMeeting,
  saveLastMeeting,
  saveMeeting,
} from "@/lib/client-persist";
import type {
  CaptureSource,
  CommandKind,
  LaunchCommandResponse,
  MeetingAgent,
} from "@/types/meeting";

type MeetingLiveProps = {
  meetingId: string;
  repoUrl: string;
  startingRef: string;
  captureSource?: CaptureSource;
};

function commandErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

function newPendingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pending-${crypto.randomUUID()}`;
  }
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const TRANSCRIPT_PERSIST_MS = 300;

export function MeetingLive({
  meetingId,
  repoUrl,
  startingRef,
  captureSource = "meet",
}: MeetingLiveProps) {
  const [agents, setAgents] = useState<MeetingAgent[]>([]);
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [inFlightCount, setInFlightCount] = useState(0);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [seedFiredCount, setSeedFiredCount] = useState(0);

  const wispr = useWisprStream();
  const meet = useMeetCaptionStream();
  const capture = captureSource === "meet" ? meet : wispr;
  const { status, error, transcript, setTranscript, start, stop } = capture;

  const agentsRef = useRef(agents);
  const commandLogRef = useRef(commandLog);
  const transcriptRef = useRef(transcript);
  agentsRef.current = agents;
  commandLogRef.current = commandLog;
  transcriptRef.current = transcript;

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    saveMeeting(meetingId, {
      transcript: transcriptRef.current,
      agents: agentsRef.current,
      commandLog: commandLogRef.current,
    });
  }, [meetingId]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      saveMeeting(meetingId, {
        transcript: transcriptRef.current,
        agents: agentsRef.current,
        commandLog: commandLogRef.current,
      });
    }, TRANSCRIPT_PERSIST_MS);
  }, [meetingId]);

  useEffect(() => {
    const saved = loadMeeting(meetingId);
    if (saved) {
      setAgents(saved.agents);
      setCommandLog(saved.commandLog);
      setTranscript(saved.transcript);
      setSeedFiredCount(keywordMatchCount(saved.transcript));
    }
    saveLastMeeting({
      id: meetingId,
      repoUrl,
      startingRef,
      captureSource,
    });
    setHydrated(true);
  }, [meetingId, repoUrl, startingRef, captureSource, setTranscript]);

  useEffect(() => {
    if (!hydrated) return;
    schedulePersist();
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [hydrated, transcript, agents, commandLog, schedulePersist]);

  useEffect(() => {
    if (!hydrated) return;
    const onHide = () => flushPersist();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushPersist();
    };
  }, [hydrated, flushPersist]);

  const launchCommand = useCallback(
    async (kind: CommandKind, transcriptWindow: string, phrase: string) => {
      const pendingId = newPendingId();
      setInFlightCount((n) => n + 1);
      setSetupError(null);
      setCommandLog((log) => [`Detected “${phrase}” → ${kind}`, ...log].slice(0, 20));
      setAgents((prev) => [
        {
          agentId: pendingId,
          kind,
          status: "starting",
          createdAt: new Date().toISOString(),
          pending: true,
          phrase,
        },
        ...prev,
      ]);

      try {
        const res = await fetch("/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            kind,
            phrase,
            transcriptWindow,
            repoUrl,
            startingRef,
          }),
        });
        const data: unknown = await res.json();
        if (!res.ok) {
          const message = commandErrorMessage(data, "Launch failed");
          if (
            data &&
            typeof data === "object" &&
            "code" in data &&
            (data as { code?: unknown }).code === "setup"
          ) {
            setSetupError(message);
          }
          throw new Error(message);
        }

        const launched = data as LaunchCommandResponse;

        if (launched.issue) {
          setCommandLog((log) =>
            [
              `Created issue #${launched.issue!.number}: ${launched.issue!.url}`,
              ...log,
            ].slice(0, 20),
          );
        }

        if (launched.agentId) {
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === pendingId
                ? {
                    agentId: launched.agentId!,
                    runId: launched.runId,
                    kind: launched.kind,
                    status: "running",
                    createdAt: a.createdAt,
                    phrase: a.phrase,
                  }
                : a,
            ),
          );
          setCommandLog((log) => [`Launched ${launched.agentId}`, ...log].slice(0, 20));
        } else {
          // Issue-only path: drop the optimistic pending row.
          setAgents((prev) => prev.filter((a) => a.agentId !== pendingId));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Launch failed";
        setCommandLog((log) => [`Error: ${message}`, ...log].slice(0, 20));
        setAgents((prev) =>
          prev.map((a) =>
            a.agentId === pendingId
              ? {
                  ...a,
                  status: "error",
                  pending: true,
                  error: message,
                }
              : a,
          ),
        );
      } finally {
        setInFlightCount((n) => Math.max(0, n - 1));
      }
    },
    [meetingId, repoUrl, startingRef],
  );

  useKeywordDetector({
    transcript,
    enabled: hydrated && status === "listening",
    initialFiredCount: seedFiredCount,
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

  const sourceLabel =
    captureSource === "meet" ? "Google Meet captions" : "Wispr Flow";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live meeting</h1>
          <p className="mt-1 break-all text-sm text-zinc-500">
            {repoUrl} <span className="text-zinc-400">@{startingRef}</span>
          </p>
          <p className="font-mono text-xs text-zinc-400">{meetingId}</p>
          <p className="mt-1 text-xs text-zinc-500">Source: {sourceLabel}</p>
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

      {setupError ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-semibold">Fix setup before this command can run</p>
          <p className="mt-1">{setupError}</p>
          <Link
            href="/meeting"
            className="mt-2 inline-block font-medium underline underline-offset-2"
          >
            Open meeting setup
          </Link>
        </div>
      ) : null}

      <TranscriptPane
        transcript={transcript}
        status={status}
        error={error}
        captureSource={captureSource}
      />

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
        {inFlightCount > 0 ? (
          <p className="mt-2 text-xs text-amber-600">
            {inFlightCount === 1
              ? "1 pipeline running…"
              : `${inFlightCount} pipelines running…`}
          </p>
        ) : null}
      </section>
    </div>
  );
}
