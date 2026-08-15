/**
 * Draft a GitHub issue title/body via a Grok 4.6 cloud agent that can
 * inspect the cloned repo and the meeting transcript. Does not create
 * the issue — that happens via Octokit after this returns.
 */
import { promptCloudAgent } from "@/lib/cursor";

export const ISSUE_DRAFT_MODEL = "grok-4.6";
export const GITHUB_ISSUE_TITLE_MAX = 256;

export type IssueDraft = {
  title: string;
  body: string;
};

export type DraftIssueParams = {
  apiKey: string;
  transcriptWindow: string;
  repoUrl: string;
  startingRef?: string;
  meetingId: string;
};

function buildDraftIssuePrompt(transcriptWindow: string, repoUrl: string): string {
  const context = transcriptWindow.trim() || "(no transcript context provided)";

  return [
    "You are drafting a GitHub issue from a live meeting transcript.",
    `Repository: ${repoUrl}`,
    "",
    "Explore the cloned repository as needed so the issue is grounded in real",
    "files, APIs, and naming. Use the transcript as the spoken request.",
    "",
    "Do NOT implement code changes.",
    "Do NOT create a GitHub issue, pull request, or run gh / git write commands.",
    "",
    "Reply with ONLY a JSON object (no markdown fences, no prose) of the form:",
    '{"title":"...","body":"..."}',
    "",
    "Requirements:",
    "- title: concise GitHub issue title (max 256 characters)",
    "- body: markdown with a short summary, acceptance criteria, relevant",
    "  file/API paths when known, and brief transcript quotes",
    "",
    "Meeting transcript window:",
    "```",
    context,
    "```",
  ].join("\n");
}

/** Strip optional ``` / ```json fences and parse title/body from agent text. */
export function parseAgentIssueDraft(raw: string): IssueDraft {
  let text = raw.trim();
  if (!text) {
    throw new Error("Issue draft agent returned empty text");
  }

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) {
    text = fence[1].trim();
  } else {
    // Agent sometimes wraps JSON in prose; try the first {...} block.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Issue draft agent did not return valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Issue draft JSON must be an object");
  }

  const record = parsed as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";

  if (!title) {
    throw new Error("Issue draft JSON is missing a non-empty title");
  }
  if (!body) {
    throw new Error("Issue draft JSON is missing a non-empty body");
  }

  return {
    title: title.slice(0, GITHUB_ISSUE_TITLE_MAX),
    body,
  };
}

/**
 * One-shot cloud agent: clone repo, draft title/body from transcript + code.
 * Uses shared promptCloudAgent — does not inject GITHUB_TOKEN.
 */
export async function draftIssueWithAgent(params: DraftIssueParams): Promise<IssueDraft> {
  const {
    apiKey,
    transcriptWindow,
    repoUrl,
    startingRef = "main",
    meetingId,
  } = params;

  const { text } = await promptCloudAgent({
    apiKey,
    modelId: ISSUE_DRAFT_MODEL,
    prompt: buildDraftIssuePrompt(transcriptWindow, repoUrl),
    repos: [{ url: repoUrl, startingRef }],
    autoCreatePR: false,
    metadata: {
      meeting_id: meetingId,
      command: "draft-issue",
    },
    logLabel: "draft-issue",
  });

  return parseAgentIssueDraft(text);
}
