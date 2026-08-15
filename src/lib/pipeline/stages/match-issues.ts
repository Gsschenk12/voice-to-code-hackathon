/**
 * Stage: matchIssues
 *
 * Reads:  intent, transcriptWindow, repoUrl, githubAccessToken, apiKey
 * Writes: matchedIssues
 *
 * Lists open GitHub issues, then asks Grok (via Cursor, no-repo agent)
 * which ones match the trigger transcript. Kind (issue vs PR) is ignored.
 *
 * Missing credentials and GitHub/Grok failures halt so execute does not run.
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

export const MATCH_SETUP = {
  noGithubToken:
    "GitHub is not connected. Go back to meeting setup, sign in with GitHub, then say the wake phrase again.",
  noCursorKey:
    "Cursor API key is missing. Go back to meeting setup, save your Cursor API key, then say the wake phrase again.",
  badRepoUrl:
    "The selected repository is not a GitHub URL. Pick a GitHub repo on the meeting setup page, then say the wake phrase again.",
} as const;

function halt(ctx: PipelineContext, reason: string): StageResult {
  return { status: "halt", context: ctx, reason };
}

function listFailedReason(detail: string): string {
  return `Could not list GitHub issues (${detail}). Check GitHub sign-in and repo access on the meeting setup page, then try again.`;
}

function grokFailedReason(detail: string): string {
  return `Issue matching could not run with your Cursor API key (${detail}). Check the key on the meeting setup page, then say the wake phrase again.`;
}

function grokParseFailedReason(detail: string): string {
  return `Issue matching returned an unexpected response (${detail}). Check your Cursor API key on the meeting setup page, then say the wake phrase again.`;
}

async function defaultListIssues(token: string, owner: string, repo: string) {
  return listOpenIssues(createOctokit(token), owner, repo);
}

export async function runMatchIssues(
  ctx: PipelineContext,
  deps: MatchIssuesDeps = {},
): Promise<StageResult> {
  const token = ctx.githubAccessToken?.trim();
  if (!token) return halt(ctx, MATCH_SETUP.noGithubToken);

  const apiKey = ctx.apiKey?.trim();
  if (!apiKey) return halt(ctx, MATCH_SETUP.noCursorKey);

  const parsedRepo = parseGithubRepoUrl(ctx.repoUrl);
  if (!parsedRepo) return halt(ctx, MATCH_SETUP.badRepoUrl);

  const listIssues = deps.listIssues ?? defaultListIssues;
  const promptMatch = deps.promptMatch ?? promptNoRepoAgent;

  let issues: ListedIssue[];
  try {
    issues = await listIssues(token, parsedRepo.owner, parsedRepo.repo);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return halt(ctx, listFailedReason(message));
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
    return halt(ctx, grokFailedReason(message));
  }

  let matchedIssues;
  try {
    matchedIssues = parseIssueMatchResponse(raw, issues);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return halt(ctx, grokParseFailedReason(message));
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
