/**
 * Stage: resolveIntent
 *
 * Reads:  kind, phrase?, transcriptWindow
 * Writes: intent
 *
 * Now: copy kind (+ optional phrase) onto ctx.intent.
 * Later: infer title/summary from the transcript window.
 */
import type { PipelineStage, StageResult } from "../types";

export const resolveIntentStage: PipelineStage = {
  id: "resolveIntent",
  description: "Confirm which keyword fired and seed intent from the request",
  async run(ctx): Promise<StageResult> {
    return {
      status: "continue",
      context: {
        ...ctx,
        intent: {
          kind: ctx.kind,
          phrase: ctx.phrase,
        },
      },
      reason: `intent set to ${ctx.kind}`,
    };
  },
};
