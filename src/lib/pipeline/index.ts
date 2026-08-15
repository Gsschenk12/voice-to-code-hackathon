import { runStages } from "./run";
import { executeStage } from "./stages/execute";
import { matchIssuesStage } from "./stages/match-issues";
import { resolveIntentStage } from "./stages/resolve-intent";
import { resolveIssueStage } from "./stages/resolve-issue";
import type { PipelineContext } from "./types";

export type { PipelineContext, PipelineStage, StageResult } from "./types";
export { PipelineStageError } from "./types";
export { runStages } from "./run";

/** Fixed stage order for the voice-command pipeline. */
export const defaultStages = [
  resolveIntentStage,
  matchIssuesStage,
  resolveIssueStage,
  executeStage,
] as const;

/**
 * Run the full command pipeline after a keyword detection POST.
 * Stages may skip or halt; execute currently launches a Cursor cloud agent.
 */
export async function runPipeline(
  input: Omit<PipelineContext, "log" | "intent" | "matchedIssues" | "issueDecision" | "agent">,
): Promise<PipelineContext> {
  const initial: PipelineContext = {
    ...input,
    log: [],
  };
  return runStages([...defaultStages], initial);
}
