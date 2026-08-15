/**
 * Stage: resolveIssue
 *
 * Reads:  intent, matchedIssues, githubAccessToken, repoUrl, apiKey,
 *         transcriptWindow, startingRef, meetingId
 * Writes: issueDecision
 *
 * No matches (missing or []): draft title/body with Grok 4.6 cloud agent,
 * then create the issue via Octokit.
 * Matches present: skip (reuse not implemented yet).
 */
import { createGithubIssue } from "@/lib/github";
import { draftIssueWithAgent } from "../draft-issue";
import type { PipelineStage, StageResult } from "../types";

function hasNoMatches(matchedIssues: { length: number } | undefined): boolean {
  return matchedIssues == null || matchedIssues.length === 0;
}

export const resolveIssueStage: PipelineStage = {
  id: "resolveIssue",
  description: "Create a new GitHub issue or reuse an existing matched one",
  async run(ctx): Promise<StageResult> {
    if (!hasNoMatches(ctx.matchedIssues)) {
      return {
        status: "skip",
        context: ctx,
        reason: "issue reuse not implemented yet",
      };
    }

    if (!ctx.githubAccessToken) {
      throw new Error("GitHub access token required to create an issue");
    }

    const draft = await draftIssueWithAgent({
      apiKey: ctx.apiKey,
      transcriptWindow: ctx.transcriptWindow,
      repoUrl: ctx.repoUrl,
      startingRef: ctx.startingRef,
      meetingId: ctx.meetingId,
    });

    const created = await createGithubIssue({
      token: ctx.githubAccessToken,
      repoUrl: ctx.repoUrl,
      title: draft.title,
      body: draft.body,
    });

    return {
      status: "continue",
      context: {
        ...ctx,
        issueDecision: {
          action: "create",
          issueNumber: created.number,
          issueUrl: created.htmlUrl,
        },
      },
      reason: `created issue #${created.number}`,
    };
  },
};
