import { describe, expect, it } from "vitest";
import { defaultStages } from "../orchestrate";
import type { PipelineContext } from "../types";
import { decidePrNeededStage } from "./decide-pr-needed";

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    meetingId: "meeting-1",
    kind: "issue",
    phrase: "grok make an issue",
    transcriptWindow: "grok make an issue about logging",
    repoUrl: "https://github.com/acme/platform",
    apiKey: "test-key",
    log: [],
    ...overrides,
  };
}

describe("decidePrNeededStage", () => {
  it("runs after resolveIssue and before execute", () => {
    expect(defaultStages.map((stage) => stage.id)).toEqual([
      "resolveIntent",
      "matchIssues",
      "addIssueContext",
      "resolveIssue",
      "decidePrNeeded",
      "execute",
    ]);
  });

  it("says yes when kind is pr", async () => {
    const result = await decidePrNeededStage.run(
      baseContext({ kind: "pr", phrase: "grok make a pr" }),
    );

    expect(result.status).toBe("continue");
    expect(result.context.prDecision).toEqual({ needed: true });
    expect(result.reason).toBe("PR needed: yes");
  });

  it("says yes when intent.kind is pr", async () => {
    const result = await decidePrNeededStage.run(
      baseContext({
        kind: "issue",
        intent: { kind: "pr", phrase: "grok make a pr" },
      }),
    );

    expect(result.status).toBe("continue");
    expect(result.context.prDecision).toEqual({ needed: true });
    expect(result.reason).toBe("PR needed: yes");
  });

  it("says no when kind is issue", async () => {
    const result = await decidePrNeededStage.run(baseContext());

    expect(result.status).toBe("continue");
    expect(result.context.prDecision).toEqual({ needed: false });
    expect(result.reason).toBe("PR needed: no");
  });

  it("prefers intent.kind over ctx.kind", async () => {
    const result = await decidePrNeededStage.run(
      baseContext({
        kind: "pr",
        phrase: "grok make a pr",
        intent: { kind: "issue", phrase: "grok make an issue" },
      }),
    );

    expect(result.status).toBe("continue");
    expect(result.context.prDecision).toEqual({ needed: false });
    expect(result.reason).toBe("PR needed: no");
  });
});
