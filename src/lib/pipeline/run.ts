import type { PipelineContext, PipelineStage, StageResult } from "./types";
import { PipelineStageError } from "./types";

function appendLog(ctx: PipelineContext, stage: string, message: string): PipelineContext {
  return {
    ...ctx,
    log: [...ctx.log, { stage, message, at: Date.now() }],
  };
}

/**
 * Run stages in order. Does not import GitHub/Cursor — only the stage interface.
 *
 * - continue: use returned context, proceed
 * - skip: log reason, proceed with returned context
 * - halt: log reason, stop (no later stages)
 * - throw: wrap in PipelineStageError with stage id and rethrow
 */
export async function runStages(
  stages: PipelineStage[],
  initial: PipelineContext,
): Promise<PipelineContext> {
  let ctx = initial;

  for (const stage of stages) {
    let result: StageResult;
    try {
      result = await stage.run(ctx);
    } catch (err) {
      throw new PipelineStageError(stage.id, err);
    }

    ctx = result.context;

    if (result.status === "skip") {
      ctx = appendLog(ctx, stage.id, result.reason ?? "skipped");
      continue;
    }

    if (result.status === "halt") {
      ctx = appendLog(ctx, stage.id, result.reason ?? "halted");
      return ctx;
    }

    // continue — optional reason still useful for debugging
    if (result.reason) {
      ctx = appendLog(ctx, stage.id, result.reason);
    }
  }

  return ctx;
}
