import { describe, expect, it } from "vitest";
import { runStages } from "./run";
import type { PipelineContext, PipelineStage } from "./types";
import { PipelineStageError } from "./types";

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    meetingId: "meeting-1",
    kind: "issue",
    transcriptWindow: "grok make an issue about logging",
    repoUrl: "https://github.com/acme/platform",
    apiKey: "test-key",
    log: [],
    ...overrides,
  };
}

function stage(
  id: string,
  run: PipelineStage["run"],
): PipelineStage {
  return { id, description: id, run };
}

describe("runStages", () => {
  it("runs stages in order and mutates context", async () => {
    const order: string[] = [];
    const stages: PipelineStage[] = [
      stage("a", async (ctx) => {
        order.push("a");
        return {
          status: "continue",
          context: { ...ctx, intent: { kind: "issue", phrase: "from-a" } },
        };
      }),
      stage("b", async (ctx) => {
        order.push("b");
        expect(ctx.intent?.phrase).toBe("from-a");
        return {
          status: "continue",
          context: {
            ...ctx,
            issueDecision: { action: "create" },
          },
        };
      }),
    ];

    const result = await runStages(stages, baseContext());
    expect(order).toEqual(["a", "b"]);
    expect(result.intent?.phrase).toBe("from-a");
    expect(result.issueDecision).toEqual({ action: "create" });
  });

  it("continues after skip and records a log entry", async () => {
    const ran: string[] = [];
    const stages: PipelineStage[] = [
      stage("skipper", async (ctx) => {
        ran.push("skipper");
        return { status: "skip", context: ctx, reason: "not ready" };
      }),
      stage("next", async (ctx) => {
        ran.push("next");
        return {
          status: "continue",
          context: { ...ctx, intent: { kind: "pr" } },
        };
      }),
    ];

    const result = await runStages(stages, baseContext());
    expect(ran).toEqual(["skipper", "next"]);
    expect(result.intent?.kind).toBe("pr");
    expect(result.log.some((e) => e.stage === "skipper" && e.message === "not ready")).toBe(
      true,
    );
  });

  it("halts and does not run later stages", async () => {
    const ran: string[] = [];
    const stages: PipelineStage[] = [
      stage("stopper", async (ctx) => {
        ran.push("stopper");
        return { status: "halt", context: ctx, reason: "nothing to do" };
      }),
      stage("should-not-run", async (ctx) => {
        ran.push("should-not-run");
        return { status: "continue", context: ctx };
      }),
    ];

    const result = await runStages(stages, baseContext());
    expect(ran).toEqual(["stopper"]);
    expect(result.log.some((e) => e.stage === "stopper" && e.message === "nothing to do")).toBe(
      true,
    );
  });

  it("wraps throwing stages with PipelineStageError including stage id", async () => {
    const stages: PipelineStage[] = [
      stage("boom", async () => {
        throw new Error("cursor down");
      }),
    ];

    await expect(runStages(stages, baseContext())).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PipelineStageError);
      const pe = err as PipelineStageError;
      expect(pe.stageId).toBe("boom");
      expect(pe.message).toContain("[pipeline:boom]");
      expect(pe.message).toContain("cursor down");
      return true;
    });
  });
});
