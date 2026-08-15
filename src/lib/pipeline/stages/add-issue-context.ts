/**
 * Stage: addIssueContext
 *
 * Reads:  matchedIssues, transcriptWindow, repoUrl, githubAccessToken, apiKey
 * Writes: issueContextUpdate (only when a match is detected)
 *
 * Match detected: ask Grok 4.6 whether the transcript has new facts, then
 * comment them onto the top-ranked issue if needed.
 *
 * No match: pass through unchanged so later create-issue work can run.
 * GitHub/Grok failures on the matched path halt so execute does not run.
 */
import { promptCloudAgent } from "@/lib/cursor";
import {
  createIssueComment,
  createOctokit,
  getIssue,
  listIssueComments,
  parseGithubRepoUrl,
} from "@/lib/github";
import type { IssueComment, ListedIssue } from "@/lib/github";
import {
  buildIssueContextPrompt,
  issueContextReason,
  parseIssueContextResponse,
} from "../issue-context";
import type { IssueForContext } from "../issue-context";
import type { PipelineContext, PipelineStage, StageResult } from "../types";

export const GROK_46_MODEL_ID = "grok-4.6";

export type IssueWithComments = {
  issue: ListedIssue;
  comments: IssueComment[];
};

export type AddIssueContextDeps = {
  getIssue?: (
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ) => Promise<IssueWithComments>;
  promptContext?: (apiKey: string, prompt: string) => Promise<string>;
  createComment?: (
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ) => Promise<{ url: string }>;
};

function halt(ctx: PipelineContext, reason: string): StageResult {
  return { status: "halt", context: ctx, reason };
}

function fetchFailedReason(detail: string): string {
  return `Could not load the matched GitHub issue (${detail}). Check GitHub sign-in and repo access on the meeting setup page, then try again.`;
}

function grokFailedReason(detail: string): string {
  return `Issue context could not run with your Cursor API key (${detail}). Check the key on the meeting setup page, then say the wake phrase again.`;
}

function grokParseFailedReason(detail: string): string {
  return `Issue context returned an unexpected response (${detail}). Check your Cursor API key on the meeting setup page, then say the wake phrase again.`;
}

function commentFailedReason(detail: string): string {
  return `Could not comment on the matched GitHub issue (${detail}). Check GitHub sign-in and repo access on the meeting setup page, then try again.`;
}

async function defaultGetIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueWithComments> {
  const octokit = createOctokit(token);
  const [issue, comments] = await Promise.all([
    getIssue(octokit, owner, repo, issueNumber),
    listIssueComments(octokit, owner, repo, issueNumber),
  ]);
  return { issue, comments };
}

async function defaultPromptContext(apiKey: string, prompt: string): Promise<string> {
  const { text } = await promptCloudAgent({
    apiKey,
    modelId: GROK_46_MODEL_ID,
    prompt,
    repos: [],
    logLabel: "issue-context",
  });
  return text;
}

async function defaultCreateComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ url: string }> {
  return createIssueComment(createOctokit(token), owner, repo, issueNumber, body);
}

function toIssueForContext(loaded: IssueWithComments): IssueForContext {
  return {
    ...loaded.issue,
    comments: loaded.comments,
  };
}

export async function runAddIssueContext(
  ctx: PipelineContext,
  deps: AddIssueContextDeps = {},
): Promise<StageResult> {
  const matches = ctx.matchedIssues;
  if (!matches || matches.length === 0) {
    return { status: "continue", context: ctx };
  }

  const best = [...matches].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (!best) {
    return { status: "continue", context: ctx };
  }
  const token = ctx.githubAccessToken?.trim();
  const apiKey = ctx.apiKey?.trim();
  const parsedRepo = parseGithubRepoUrl(ctx.repoUrl);

  if (!token || !apiKey || !parsedRepo) {
    return halt(
      ctx,
      grokFailedReason("GitHub token, Cursor API key, or GitHub repo URL is missing"),
    );
  }

  const getIssueFn = deps.getIssue ?? defaultGetIssue;
  const promptContext = deps.promptContext ?? defaultPromptContext;
  const createComment = deps.createComment ?? defaultCreateComment;

  let loaded: IssueWithComments;
  try {
    loaded = await getIssueFn(token, parsedRepo.owner, parsedRepo.repo, best.number);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return halt(ctx, fetchFailedReason(message));
  }

  const prompt = buildIssueContextPrompt({
    transcriptWindow: ctx.transcriptWindow,
    issue: toIssueForContext(loaded),
  });

  let raw: string;
  try {
    raw = await promptContext(apiKey, prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return halt(ctx, grokFailedReason(message));
  }

  let decision;
  try {
    decision = parseIssueContextResponse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return halt(ctx, grokParseFailedReason(message));
  }

  if (!decision.needed || !decision.comment) {
    return {
      status: "continue",
      context: {
        ...ctx,
        issueContextUpdate: { issueNumber: best.number, needed: false },
      },
      reason: issueContextReason({ issueNumber: best.number, needed: false }),
    };
  }

  let posted: { url: string };
  try {
    posted = await createComment(
      token,
      parsedRepo.owner,
      parsedRepo.repo,
      best.number,
      decision.comment,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return halt(ctx, commentFailedReason(message));
  }

  return {
    status: "continue",
    context: {
      ...ctx,
      issueContextUpdate: {
        issueNumber: best.number,
        needed: true,
        commentUrl: posted.url,
      },
    },
    reason: issueContextReason({ issueNumber: best.number, needed: true }),
  };
}

export const addIssueContextStage: PipelineStage = {
  id: "addIssueContext",
  description: "Add meeting context to a matched GitHub issue when Grok finds new facts",
  run: (ctx) => runAddIssueContext(ctx),
};
