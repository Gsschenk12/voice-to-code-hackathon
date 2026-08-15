import { runStages } from "./run";
import { executeStage } from "./stages/execute";
import { addIssueContextStage } from "./stages/add-issue-context";
import { decidePrNeededStage } from "./stages/decide-pr-needed";
import { matchIssuesStage } from "./stages/match-issues";
import { resolveIntentStage } from "./stages/resolve-intent";
import { resolveIssueStage } from "./stages/resolve-issue";
import type { PipelineContext } from "./types";

/** Fixed stage order for the voice-command pipeline. */
export const defaultStages = [
  resolveIntentStage,
  matchIssuesStage,
  addIssueContextStage,
  resolveIssueStage,
  decidePrNeededStage,
  executeStage,
] as const;

/**
 * Run the full command pipeline after a keyword detection POST
 * (or a trigger-scanner handoff via CommandPipelineInitiator).
 * Stages may skip or halt; execute launches a plan-then-execute Cursor cloud agent when a PR is needed.
 */
export async function runPipeline(
  input: Omit<
    PipelineContext,
    | "log"
    | "intent"
    | "matchedIssues"
    | "issueDecision"
    | "issueContextUpdate"
    | "prDecision"
    | "agent"
  >,
): Promise<PipelineContext> {
  const initial: PipelineContext = {
    ...input,
    log: [],
  };
  return runStages([...defaultStages], initial);
}
