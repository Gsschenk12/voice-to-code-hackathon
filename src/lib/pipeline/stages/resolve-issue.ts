/**
 * Stage: resolveIssue
 *
 * Reads:  intent, matchedIssues, githubAccessToken, repoUrl
 * Writes: issueDecision
 *
 * Now: skip (no create/reuse yet).
 * Later: create a new issue or reuse a matched one; set issueDecision.
 */
import type { PipelineStage, StageResult } from "../types";

export const resolveIssueStage: PipelineStage = {
  id: "resolveIssue",
  description: "Create a new GitHub issue or reuse an existing matched one",
  async run(ctx): Promise<StageResult> {
    return {
      status: "skip",
      context: ctx,
      reason: "issue create/reuse not implemented yet",
    };
  },
};
