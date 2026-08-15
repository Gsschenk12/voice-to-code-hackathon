import { runStages } from "./run";
import { executeStage } from "./stages/execute";
import { addIssueContextStage } from "./stages/add-issue-context";
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
  executeStage,
] as const;

/**
 * Run the full command pipeline after a keyword detection POST
 * (or a trigger-scanner handoff via CommandPipelineInitiator).
 * Stages may skip or halt; execute currently launches a Cursor cloud agent.
 */
export async function runPipeline(
  input: Omit<
    PipelineContext,
    "log" | "intent" | "matchedIssues" | "issueDecision" | "issueContextUpdate" | "agent"
  >,
): Promise<PipelineContext> {
  const initial: PipelineContext = {
    ...input,
    log: [],
  };
  return runStages([...defaultStages], initial);
}
