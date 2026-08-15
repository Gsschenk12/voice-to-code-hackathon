/**
 * Stage: matchIssues
 *
 * Reads:  intent, transcriptWindow, repoUrl, githubAccessToken
 * Writes: matchedIssues
 *
 * Now: skip (no GitHub calls yet).
 * Later: list open issues via createOctokit / parseGithubRepoUrl and score
 *        against the transcript; populate matchedIssues.
 */
import type { PipelineStage, StageResult } from "../types";

export const matchIssuesStage: PipelineStage = {
  id: "matchIssues",
  description: "Find existing repo issues that align with the transcript",
  async run(ctx): Promise<StageResult> {
    return {
      status: "skip",
      context: ctx,
      reason: "issue matching not implemented yet",
    };
  },
};
