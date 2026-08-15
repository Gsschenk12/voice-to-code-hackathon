import type { CaptureSource, MeetingAgent } from "@/types/meeting";

export const PERSIST_VERSION = 1 as const;

const SETUP_KEY = "vtc:setup";
const LAST_MEETING_KEY = "vtc:last-meeting";

export function meetingKey(meetingId: string): string {
  return `vtc:meeting:${meetingId}`;
}

export type PersistedSetup = {
  v: typeof PERSIST_VERSION;
  repoUrl: string;
  startingRef: string;
  captureSource: CaptureSource;
  repos: Array<{ url: string }>;
};

export type PersistedMeeting = {
  v: typeof PERSIST_VERSION;
  transcript: string;
  agents: MeetingAgent[];
  commandLog: string[];
};

export type PersistedLastMeeting = {
  v: typeof PERSIST_VERSION;
  id: string;
  repoUrl: string;
  startingRef: string;
  captureSource: CaptureSource;
};

function storage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function readJson(key: string): unknown {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(key);
    if (raw == null || raw === "") return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode — ignore
  }
}

function isCaptureSource(value: unknown): value is CaptureSource {
  return value === "wispr" || value === "meet";
}

function isRepoList(value: unknown): value is Array<{ url: string }> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as { url?: unknown }).url === "string",
  );
}

function isMeetingAgent(value: unknown): value is MeetingAgent {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (
    typeof a.agentId !== "string" ||
    (a.kind !== "issue" && a.kind !== "pr") ||
    typeof a.status !== "string" ||
    typeof a.createdAt !== "string"
  ) {
    return false;
  }
  if (a.pending !== undefined && typeof a.pending !== "boolean") return false;
  if (a.phrase !== undefined && typeof a.phrase !== "string") return false;
  return true;
}

export function parsePersistedSetup(raw: unknown): PersistedSetup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== PERSIST_VERSION) return null;
  if (typeof o.repoUrl !== "string") return null;
  if (typeof o.startingRef !== "string") return null;
  if (!isCaptureSource(o.captureSource)) return null;
  if (!isRepoList(o.repos)) return null;
  return {
    v: PERSIST_VERSION,
    repoUrl: o.repoUrl,
    startingRef: o.startingRef,
    captureSource: o.captureSource,
    repos: o.repos.map((r) => ({ url: r.url })),
  };
}

export function parsePersistedMeeting(raw: unknown): PersistedMeeting | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== PERSIST_VERSION) return null;
  if (typeof o.transcript !== "string") return null;
  if (!Array.isArray(o.agents) || !o.agents.every(isMeetingAgent)) return null;
  if (
    !Array.isArray(o.commandLog) ||
    !o.commandLog.every((line) => typeof line === "string")
  ) {
    return null;
  }
  return {
    v: PERSIST_VERSION,
    transcript: o.transcript,
    agents: o.agents as MeetingAgent[],
    commandLog: o.commandLog as string[],
  };
}

export function parsePersistedLastMeeting(
  raw: unknown,
): PersistedLastMeeting | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== PERSIST_VERSION) return null;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.repoUrl !== "string" || !o.repoUrl) return null;
  if (typeof o.startingRef !== "string") return null;
  if (!isCaptureSource(o.captureSource)) return null;
  return {
    v: PERSIST_VERSION,
    id: o.id,
    repoUrl: o.repoUrl,
    startingRef: o.startingRef,
    captureSource: o.captureSource,
  };
}

export function loadSetup(): PersistedSetup | null {
  return parsePersistedSetup(readJson(SETUP_KEY));
}

export function saveSetup(setup: Omit<PersistedSetup, "v">): void {
  writeJson(SETUP_KEY, { v: PERSIST_VERSION, ...setup });
}

export function loadMeeting(meetingId: string): PersistedMeeting | null {
  return parsePersistedMeeting(readJson(meetingKey(meetingId)));
}

export function saveMeeting(
  meetingId: string,
  meeting: Omit<PersistedMeeting, "v">,
): void {
  writeJson(meetingKey(meetingId), { v: PERSIST_VERSION, ...meeting });
}

export function loadLastMeeting(): PersistedLastMeeting | null {
  return parsePersistedLastMeeting(readJson(LAST_MEETING_KEY));
}

export function saveLastMeeting(
  last: Omit<PersistedLastMeeting, "v">,
): void {
  writeJson(LAST_MEETING_KEY, { v: PERSIST_VERSION, ...last });
}

/** Parse Meet-style "Speaker: text" lines into caption rows for merge seeding. */
export function transcriptToCaptionRows(
  transcript: string,
): Array<{ speaker: string; text: string }> {
  const lines = transcript.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: Array<{ speaker: string; text: string }> = [];
  for (const line of lines) {
    const colon = line.indexOf(": ");
    if (colon > 0 && colon < 80) {
      rows.push({
        speaker: line.slice(0, colon).trim(),
        text: line.slice(colon + 2).trim(),
      });
    } else {
      rows.push({ speaker: "", text: line });
    }
  }
  return rows;
}
