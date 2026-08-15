/**
 * Stage: matchIssues
 *
 * Reads:  intent, transcriptWindow, repoUrl, githubAccessToken, apiKey
 * Writes: matchedIssues
 *
 * Lists open GitHub issues, then asks Grok (via Cursor, no-repo agent)
 * which ones match the trigger transcript. Kind (issue vs PR) is ignored.
 */
import { promptNoRepoAgent } from "@/lib/cursor";
import { createOctokit, listOpenIssues, parseGithubRepoUrl } from "@/lib/github";
import type { ListedIssue } from "@/lib/github";
import {
  buildIssueMatchPrompt,
  matchReason,
  parseIssueMatchResponse,
} from "../issue-match";
import type { PipelineContext, PipelineStage, StageResult } from "../types";

export type MatchIssuesDeps = {
  listIssues?: (token: string, owner: string, repo: string) => Promise<ListedIssue[]>;
  promptMatch?: (apiKey: string, prompt: string) => Promise<string>;
};

function skip(ctx: PipelineContext, reason: string): StageResult {
  return { status: "skip", context: ctx, reason };
}

async function defaultListIssues(token: string, owner: string, repo: string) {
  return listOpenIssues(createOctokit(token), owner, repo);
}

export async function runMatchIssues(
  ctx: PipelineContext,
  deps: MatchIssuesDeps = {},
): Promise<StageResult> {
  const token = ctx.githubAccessToken?.trim();
  if (!token) return skip(ctx, "no GitHub access token");

  const apiKey = ctx.apiKey?.trim();
  if (!apiKey) return skip(ctx, "no Cursor API key");

  const parsedRepo = parseGithubRepoUrl(ctx.repoUrl);
  if (!parsedRepo) return skip(ctx, "unparseable GitHub repo URL");

  const listIssues = deps.listIssues ?? defaultListIssues;
  const promptMatch = deps.promptMatch ?? promptNoRepoAgent;

  let issues: ListedIssue[];
  try {
    issues = await listIssues(token, parsedRepo.owner, parsedRepo.repo);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return skip(ctx, `failed to list issues: ${message}`);
  }

  if (issues.length === 0) {
    return {
      status: "continue",
      context: { ...ctx, matchedIssues: [] },
      reason: "no open issues in repo",
    };
  }

  const phrase = ctx.intent?.phrase ?? ctx.phrase;
  const prompt = buildIssueMatchPrompt({
    phrase,
    transcriptWindow: ctx.transcriptWindow,
    issues,
  });

  let raw: string;
  try {
    raw = await promptMatch(apiKey, prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return skip(ctx, `Grok match failed: ${message}`);
  }

  let matchedIssues;
  try {
    matchedIssues = parseIssueMatchResponse(raw, issues);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return skip(ctx, `Grok match parse failed: ${message}`);
  }

  return {
    status: "continue",
    context: { ...ctx, matchedIssues },
    reason: matchReason(matchedIssues),
  };
}

export const matchIssuesStage: PipelineStage = {
  id: "matchIssues",
  description: "Find existing repo issues that align with the transcript",
  run: (ctx) => runMatchIssues(ctx),
};
