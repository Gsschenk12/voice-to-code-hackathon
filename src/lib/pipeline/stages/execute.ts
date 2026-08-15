/**
 * Stage: execute
 *
 * Reads:  prDecision, intent, kind, issueDecision, issueContextUpdate,
 *         matchedIssues, transcriptWindow, repoUrl, startingRef,
 *         apiKey, githubAccessToken, meetingId
 * Writes: agent
 *
 * Skip when a PR is not needed. Otherwise resolve the associated GitHub issue
 * and launch a plan-then-execute Cursor cloud agent (autoCreatePR).
 */
import { launchPrPlanExecuteAgent } from "@/lib/cursor";
import {
  createOctokit,
  getIssue,
  parseGithubRepoUrl,
  type ListedIssue,
} from "@/lib/github";
import type { AssociatedIssueForPrompt } from "@/lib/prompts";
import type { PipelineContext, PipelineStage, StageResult } from "../types";

export type ExecuteDeps = {
  fetchIssue?: (
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ) => Promise<ListedIssue>;
  launchPr?: typeof launchPrPlanExecuteAgent;
};

function prNeeded(ctx: PipelineContext): boolean {
  if (ctx.prDecision != null) return ctx.prDecision.needed;
  return (ctx.intent?.kind ?? ctx.kind) === "pr";
}

/** Prefer created issue, then context update, then top matched issue. */
export function resolveAssociatedIssueNumber(ctx: PipelineContext): number | undefined {
  if (ctx.issueDecision?.issueNumber != null) {
    return ctx.issueDecision.issueNumber;
  }
  if (ctx.issueContextUpdate?.issueNumber != null) {
    return ctx.issueContextUpdate.issueNumber;
  }
  const top = ctx.matchedIssues?.[0];
  return top?.number;
}

function issueUrlFromContext(ctx: PipelineContext, number: number): string | undefined {
  if (ctx.issueDecision?.issueNumber === number && ctx.issueDecision.issueUrl) {
    return ctx.issueDecision.issueUrl;
  }
  const match = ctx.matchedIssues?.find((m) => m.number === number);
  return match?.url;
}

async function defaultFetchIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<ListedIssue> {
  return getIssue(createOctokit(token), owner, repo, issueNumber);
}

export async function runExecute(
  ctx: PipelineContext,
  deps: ExecuteDeps = {},
): Promise<StageResult> {
  if (!prNeeded(ctx)) {
    return {
      status: "skip",
      context: ctx,
      reason: "PR not needed; skipping plan-execute agent",
    };
  }

  const issueNumber = resolveAssociatedIssueNumber(ctx);
  if (issueNumber == null) {
    return {
      status: "halt",
      context: ctx,
      reason:
        "PR requested but no associated GitHub issue was found. Create or match an issue first, then say the wake phrase again.",
    };
  }

  const launchPr = deps.launchPr ?? launchPrPlanExecuteAgent;
  const fetchIssueFn = deps.fetchIssue ?? defaultFetchIssue;

  let issue: AssociatedIssueForPrompt;
  const token = ctx.githubAccessToken?.trim();
  const parsedRepo = parseGithubRepoUrl(ctx.repoUrl);

  if (token && parsedRepo) {
    try {
      const loaded = await fetchIssueFn(
        token,
        parsedRepo.owner,
        parsedRepo.repo,
        issueNumber,
      );
      issue = {
        number: loaded.number,
        title: loaded.title,
        url: loaded.url,
        body: loaded.body,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        status: "halt",
        context: ctx,
        reason: `Could not load associated issue #${issueNumber} (${detail}). Check GitHub sign-in and repo access, then try again.`,
      };
    }
  } else {
    const url =
      issueUrlFromContext(ctx, issueNumber) ??
      `${ctx.repoUrl.replace(/\.git$/, "").replace(/\/$/, "")}/issues/${issueNumber}`;
    const match = ctx.matchedIssues?.find((m) => m.number === issueNumber);
    issue = {
      number: issueNumber,
      title: match?.title ?? `Issue #${issueNumber}`,
      url,
      body: null,
    };
  }

  const result = await launchPr({
    apiKey: ctx.apiKey,
    githubAccessToken: ctx.githubAccessToken,
    transcriptWindow: ctx.transcriptWindow,
    repoUrl: ctx.repoUrl,
    startingRef: ctx.startingRef,
    meetingId: ctx.meetingId,
    issue,
  });

  return {
    status: "continue",
    context: {
      ...ctx,
      agent: {
        agentId: result.agentId,
        runId: result.runId,
      },
    },
    reason: `launched plan-execute agent ${result.agentId} for issue #${issueNumber}`,
  };
}

export const executeStage: PipelineStage = {
  id: "execute",
  description: "Plan then execute a Cursor cloud agent for the associated issue PR",
  run: (ctx) => runExecute(ctx),
};
