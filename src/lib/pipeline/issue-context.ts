import type { IssueComment, ListedIssue } from "@/lib/github";
import { TRIGGER_FOCUS_INSTRUCTION } from "./trigger-focus";

const BODY_EXCERPT_CHARS = 800;
const COMMENT_EXCERPT_CHARS = 400;
const MAX_COMMENTS_IN_PROMPT = 20;

export type IssueContextDecision = {
  needed: boolean;
  comment?: string;
};

export type IssueForContext = ListedIssue & {
  comments: IssueComment[];
};

export function buildIssueContextPrompt(params: {
  transcriptWindow: string;
  issue: IssueForContext;
}): string {
  const transcript = params.transcriptWindow.trim() || "(empty transcript)";
  const comments = params.issue.comments.slice(-MAX_COMMENTS_IN_PROMPT);
  const commentBlock =
    comments.length === 0
      ? "(none)"
      : comments
          .map((comment) => excerpt(comment.body, COMMENT_EXCERPT_CHARS) || "(empty comment)")
          .join("\n\n");

  const body = excerpt(params.issue.body, BODY_EXCERPT_CHARS) || "(no body)";

  return [
    "You decide whether a meeting transcript has new context that should be added to an existing GitHub issue.",
    "",
    "Do not use tools. Do not edit files. Reply with JSON only.",
    "Compare the current request in the transcript to the issue title, body, and comments.",
    TRIGGER_FOCUS_INSTRUCTION,
    "Only add a comment when this request has new, useful facts that are not already on the issue.",
    'If nothing new, return {"needed":false}.',
    'If new facts exist, return {"needed":true,"comment":"..."} where comment is markdown starting with ### Meeting context followed by the new facts only — not a dump of the whole transcript unless that is the new material.',
    "",
    "Issue:",
    `#${params.issue.number} ${params.issue.title}`,
    body,
    "",
    "Existing comments:",
    commentBlock,
    "",
    "Transcript window:",
    "```",
    transcript,
    "```",
    "",
    "Return JSON of the form:",
    '{"needed":true,"comment":"### Meeting context\\n\\nNew fact."}',
    "or",
    '{"needed":false}',
  ].join("\n");
}

function excerpt(text?: string | null, maxChars = BODY_EXCERPT_CHARS): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars).trimEnd()}…`;
}

type ContextPayload = {
  needed?: unknown;
  comment?: unknown;
};

/** Parse Grok JSON; empty comments with needed:true become needed:false. */
export function parseIssueContextResponse(raw: string): IssueContextDecision {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed.needed !== "boolean") {
    throw new Error("Issue-context response was not JSON with a needed boolean");
  }

  const comment = typeof parsed.comment === "string" ? parsed.comment.trim() : "";
  if (!parsed.needed || !comment) {
    return { needed: false };
  }

  return { needed: true, comment: ensureMeetingContextHeading(comment) };
}

export function ensureMeetingContextHeading(comment: string): string {
  const trimmed = comment.trim();
  if (/^#{1,6}\s*meeting context\b/i.test(trimmed)) return trimmed;
  return `### Meeting context\n\n${trimmed}`;
}

function extractJsonObject(raw: string): ContextPayload | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const parsed = tryParseObject(candidate);
  if (parsed) return parsed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return tryParseObject(candidate.slice(start, end + 1));
}

function tryParseObject(text: string): ContextPayload | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as ContextPayload;
  } catch {
    return null;
  }
}

export function issueContextReason(update: {
  issueNumber: number;
  needed: boolean;
}): string {
  if (!update.needed) return `no new context for #${update.issueNumber}`;
  return `added context to #${update.issueNumber}`;
}
