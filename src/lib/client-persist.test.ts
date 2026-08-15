import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadLastMeeting,
  loadMeeting,
  loadSetup,
  parsePersistedLastMeeting,
  parsePersistedMeeting,
  parsePersistedSetup,
  PERSIST_VERSION,
  readJson,
  saveLastMeeting,
  saveMeeting,
  saveSetup,
  transcriptToCaptionRows,
  writeJson,
} from "@/lib/client-persist";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readJson / writeJson", () => {
  it("round-trips objects", () => {
    writeJson("k", { a: 1 });
    expect(readJson("k")).toEqual({ a: 1 });
  });

  it("returns null for missing keys", () => {
    expect(readJson("missing")).toBeNull();
  });

  it("returns null for bad JSON", () => {
    store.set("bad", "{not-json");
    expect(readJson("bad")).toBeNull();
  });
});

describe("parsePersistedSetup", () => {
  it("accepts a valid snapshot", () => {
    expect(
      parsePersistedSetup({
        v: PERSIST_VERSION,
        repoUrl: "https://github.com/org/repo",
        startingRef: "main",
        captureSource: "meet",
        repos: [{ url: "https://github.com/org/repo" }],
      }),
    ).toEqual({
      v: PERSIST_VERSION,
      repoUrl: "https://github.com/org/repo",
      startingRef: "main",
      captureSource: "meet",
      repos: [{ url: "https://github.com/org/repo" }],
    });
  });

  it("rejects wrong version or bad shape", () => {
    expect(parsePersistedSetup(null)).toBeNull();
    expect(parsePersistedSetup({ v: 99, repoUrl: "" })).toBeNull();
    expect(
      parsePersistedSetup({
        v: PERSIST_VERSION,
        repoUrl: "x",
        startingRef: "main",
        captureSource: "other",
        repos: [],
      }),
    ).toBeNull();
  });
});

describe("parsePersistedMeeting", () => {
  it("accepts a valid snapshot", () => {
    const agent = {
      agentId: "a1",
      kind: "issue" as const,
      status: "running",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      parsePersistedMeeting({
        v: PERSIST_VERSION,
        transcript: "hello",
        agents: [agent],
        commandLog: ["Detected"],
      }),
    ).toEqual({
      v: PERSIST_VERSION,
      transcript: "hello",
      agents: [agent],
      commandLog: ["Detected"],
    });
  });

  it("rejects invalid agents", () => {
    expect(
      parsePersistedMeeting({
        v: PERSIST_VERSION,
        transcript: "",
        agents: [{ agentId: 1 }],
        commandLog: [],
      }),
    ).toBeNull();
  });
});

describe("setup / meeting / last-meeting loaders", () => {
  it("saves and loads setup", () => {
    saveSetup({
      repoUrl: "https://github.com/a/b",
      startingRef: "dev",
      captureSource: "wispr",
      repos: [{ url: "https://github.com/a/b" }],
    });
    expect(loadSetup()?.repoUrl).toBe("https://github.com/a/b");
    expect(loadSetup()?.captureSource).toBe("wispr");
  });

  it("saves and loads meeting by id", () => {
    saveMeeting("m1", {
      transcript: "Alice: hi",
      agents: [],
      commandLog: ["ok"],
    });
    expect(loadMeeting("m1")?.transcript).toBe("Alice: hi");
    expect(loadMeeting("missing")).toBeNull();
  });

  it("saves and loads last meeting", () => {
    saveLastMeeting({
      id: "m1",
      repoUrl: "https://github.com/a/b",
      startingRef: "main",
      captureSource: "meet",
    });
    expect(loadLastMeeting()?.id).toBe("m1");
  });

  it("returns null when last meeting is corrupt", () => {
    writeJson("vtc:last-meeting", { v: PERSIST_VERSION, id: "" });
    expect(parsePersistedLastMeeting(readJson("vtc:last-meeting"))).toBeNull();
    expect(loadLastMeeting()).toBeNull();
  });
});

describe("transcriptToCaptionRows", () => {
  it("parses speaker-attributed lines", () => {
    expect(transcriptToCaptionRows("Alice: hello\nBob: world")).toEqual([
      { speaker: "Alice", text: "hello" },
      { speaker: "Bob", text: "world" },
    ]);
  });

  it("treats lines without a speaker as bare text", () => {
    expect(transcriptToCaptionRows("just words")).toEqual([
      { speaker: "", text: "just words" },
    ]);
  });
});
