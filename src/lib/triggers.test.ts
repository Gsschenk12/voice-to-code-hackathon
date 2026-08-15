import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileTranscriptSource } from "@/lib/triggers/file";
import { LoggingPipelineInitiator, runTriggerPipeline } from "@/lib/triggers/pipeline";
import { extractTranscriptBody, scanTriggers } from "@/lib/triggers/scan";
import { WisprMcpSource } from "@/lib/triggers/wispr-mcp";

const SAMPLE_DIR = path.join(process.cwd(), "sample-transcripts", "transcripts");

type ExpectedActionsFile = {
  transcripts: Array<{
    file: string;
    linked_repo: string;
    actions: Array<{ type: "issue" | "pull_request" }>;
  }>;
};

function expectedKind(type: "issue" | "pull_request"): "issue" | "pr" {
  return type === "pull_request" ? "pr" : "issue";
}

describe("scanTriggers", () => {
  it("is filler-tolerant across multiple matches", () => {
    const triggers = scanTriggers(
      "uh grok um make an issue please then grok make a PR for the fix",
    );
    expect(triggers.map((t) => t.kind)).toEqual(["issue", "pr"]);
    expect(triggers[0]?.transcriptWindow.length).toBeGreaterThan(0);
  });

  it("builds distinct focused windows for nearby wake phrases", () => {
    const triggers = scanTriggers(
      [
        "First grok make an issue about logging.",
        "Then grok make an issue about auth race.",
      ].join(" "),
    );
    expect(triggers).toHaveLength(2);
    expect(triggers[0]!.transcriptWindow).not.toEqual(triggers[1]!.transcriptWindow);
    expect(triggers[0]!.transcriptWindow).toMatch(/>>>[\s\S]*<<</);
    expect(triggers[1]!.transcriptWindow).toMatch(/>>>[\s\S]*<<</);
    expect(triggers[1]!.transcriptWindow).toContain("This request (use this):");
    expect(triggers[1]!.transcriptWindow).toContain("auth race");
    expect(triggers[0]!.transcriptWindow).toContain("logging");
  });

  it("ignores header text before ## Transcript", () => {
    const raw = [
      "# Meeting",
      "",
      "## Flow Summary",
      "",
      "Maya said grok make an issue in the summary only.",
      "",
      "## Transcript",
      "",
      "Let's start.",
      "",
      "Okay grok make a PR for dark mode.",
    ].join("\n");

    expect(scanTriggers(raw).map((t) => t.kind)).toEqual(["pr"]);
  });
});

describe("sample transcripts", () => {
  it("matches expected-actions.json trigger kinds in order", async () => {
    const expectedRaw = await readFile(path.join(SAMPLE_DIR, "expected-actions.json"), "utf8");
    const expected = JSON.parse(expectedRaw) as ExpectedActionsFile;

    const source = new FileTranscriptSource(SAMPLE_DIR);
    const initiator = new LoggingPipelineInitiator(() => {});
    const requests = await runTriggerPipeline(source, initiator);

    const byFile = new Map<string, typeof requests>();
    for (const request of requests) {
      const list = byFile.get(request.sourceId) ?? [];
      list.push(request);
      byFile.set(request.sourceId, list);
    }

    for (const transcript of expected.transcripts) {
      const kinds = (byFile.get(transcript.file) ?? []).map((r) => r.kind);
      const expectedKinds = transcript.actions.map((a) => expectedKind(a.type));
      expect(kinds, transcript.file).toEqual(expectedKinds);

      for (const request of byFile.get(transcript.file) ?? []) {
        expect(request.linkedRepo).toBe(transcript.linked_repo);
        expect(request.transcriptWindow.length).toBeGreaterThan(0);
      }
    }
  });

  it("extracts the body after ## Transcript", async () => {
    const raw = await readFile(path.join(SAMPLE_DIR, "01-sprint-planning-backend.txt"), "utf8");
    const body = extractTranscriptBody(raw);
    expect(body.startsWith("**Maya Chen**")).toBe(true);
    expect(body).not.toContain("## Flow Summary");
  });
});

describe("WisprMcpSource", () => {
  it("is a stub for the future MCP swap", async () => {
    const source = new WisprMcpSource();
    await expect(source.listSessions()).rejects.toThrow(/not implemented/i);
  });
});
