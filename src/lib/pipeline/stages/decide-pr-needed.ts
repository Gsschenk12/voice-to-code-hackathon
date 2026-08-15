/**
 * Stage: decidePrNeeded
 *
 * Reads:  intent.kind, kind
 * Writes: prDecision
 *
 * Yes if the wake phrase was a PR trigger (`grok make a PR`); otherwise no.
 * Later stages act on this decision (PR launch stays in follow-up branches).
 */
import type { PipelineStage, StageResult } from "../types";

export const decidePrNeededStage: PipelineStage = {
  id: "decidePrNeeded",
  description: "Decide whether a PR is needed from the wake-phrase trigger",
  async run(ctx): Promise<StageResult> {
    const needed = (ctx.intent?.kind ?? ctx.kind) === "pr";

    return {
      status: "continue",
      context: {
        ...ctx,
        prDecision: { needed },
      },
      reason: `PR needed: ${needed ? "yes" : "no"}`,
    };
  },
};
