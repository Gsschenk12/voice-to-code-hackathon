"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { loadSetup, saveLastMeeting, saveSetup } from "@/lib/client-persist";
import type { CaptureSource } from "@/types/meeting";

function newMeetingId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `meeting-${Date.now()}`;
}

export function MeetingSetup() {
  const { data: session, update, status } = useSession();
  const router = useRouter();
  const [cursorKey, setCursorKey] = useState(session?.cursorApiKey ?? "");
  const [repos, setRepos] = useState<Array<{ url: string }>>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [startingRef, setStartingRef] = useState("main");
  const [captureSource, setCaptureSource] = useState<CaptureSource>("meet");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadSetup();
    if (saved) {
      setRepoUrl(saved.repoUrl);
      setStartingRef(saved.startingRef || "main");
      setCaptureSource(saved.captureSource);
      setRepos(saved.repos);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveSetup({ repoUrl, startingRef, captureSource, repos });
  }, [ready, repoUrl, startingRef, captureSource, repos]);

  const saveCursorKey = useCallback(async () => {
    setSavingKey(true);
    setError(null);
    try {
      await update({ cursorApiKey: cursorKey.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Cursor API key");
    } finally {
      setSavingKey(false);
    }
  }, [cursorKey, update]);

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true);
    setError(null);
    try {
      if (cursorKey.trim() && cursorKey.trim() !== session?.cursorApiKey) {
        await update({ cursorApiKey: cursorKey.trim() });
      }
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load repos");
      setRepos(data.repos ?? []);
      if (data.repos?.[0]?.url && !repoUrl) {
        setRepoUrl(data.repos[0].url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repos");
    } finally {
      setLoadingRepos(false);
    }
  }, [cursorKey, session?.cursorApiKey, update, repoUrl]);

  const startMeeting = useCallback(() => {
    if (!repoUrl) {
      setError("Select a repository first.");
      return;
    }
    if (!cursorKey.trim() && !session?.cursorApiKey) {
      setError("Enter and save your Cursor API key first.");
      return;
    }
    const id = newMeetingId();
    const ref = startingRef || "main";
    saveSetup({ repoUrl, startingRef: ref, captureSource, repos });
    saveLastMeeting({
      id,
      repoUrl,
      startingRef: ref,
      captureSource,
    });
    const params = new URLSearchParams({
      repo: repoUrl,
      ref,
      source: captureSource,
    });
    router.push(`/meeting/${id}?${params.toString()}`);
  }, [
    repoUrl,
    startingRef,
    captureSource,
    repos,
    cursorKey,
    session?.cursorApiKey,
    router,
  ]);

  if (status === "loading") {
    return <p className="text-sm text-zinc-500">Loading session…</p>;
  }

  if (!session) {
    return (
      <p className="text-sm text-zinc-500">
        Sign in with GitHub on the home page before starting a meeting.
      </p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meeting setup</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Signed in as {session.user?.name || session.user?.email}. Paste your Cursor API key and
          pick a repo connected via the Cursor GitHub App.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Cursor API key</span>
        <input
          type="password"
          value={cursorKey}
          onChange={(e) => setCursorKey(e.target.value)}
          placeholder="key_..."
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="text-xs text-zinc-500">
          Stored on your Auth.js session for this hackathon scaffold. Get a key from Cursor →
          Integrations.
        </span>
        <button
          type="button"
          onClick={() => void saveCursorKey()}
          disabled={savingKey || !cursorKey.trim()}
          className="mt-1 w-fit rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {savingKey ? "Saving…" : "Save key"}
        </button>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Repository</span>
          <button
            type="button"
            onClick={() => void loadRepos()}
            disabled={loadingRepos}
            className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            {loadingRepos ? "Loading…" : "Load from Cursor"}
          </button>
        </div>
        {repos.length > 0 ? (
          <select
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {repos.map((r) => (
              <option key={r.url} value={r.url}>
                {r.url}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Starting ref</span>
          <input
            type="text"
            value={startingRef}
            onChange={(e) => setStartingRef(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Transcript source</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <input
            type="radio"
            name="captureSource"
            value="meet"
            checked={captureSource === "meet"}
            onChange={() => setCaptureSource("meet")}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Google Meet captions (free)</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Reads live captions from a Meet tab via the unpacked Chrome
              extension in <code className="font-mono">extension/</code>. No
              ASR key needed.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <input
            type="radio"
            name="captureSource"
            value="wispr"
            checked={captureSource === "wispr"}
            onChange={() => setCaptureSource("wispr")}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Wispr Flow (mic)</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Streams your microphone through Wispr. Requires{" "}
              <code className="font-mono">WISPR_API_KEY</code>.
            </span>
          </span>
        </label>
      </fieldset>

      <button
        type="button"
        onClick={startMeeting}
        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Start meeting
      </button>
    </div>
  );
}
