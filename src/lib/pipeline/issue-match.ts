import type { ListedIssue } from "@/lib/github";
import type { MatchedIssue } from "./types";

export const MAX_MATCHED_ISSUES = 5;
const BODY_EXCERPT_CHARS = 400;

export type IssueCandidate = ListedIssue;

export function buildIssueMatchPrompt(params: {
  phrase?: string;
  transcriptWindow: string;
  issues: IssueCandidate[];
}): string {
  const phrase = params.phrase?.trim() || "(none)";
  const transcript = params.transcriptWindow.trim() || "(empty transcript)";
  const issueBlock = params.issues
    .map((issue) => formatIssueForPrompt(issue))
    .join("\n\n");

  return [
    "You match a meeting transcript to existing GitHub issues.",
    "",
    "Do not use tools. Do not edit files. Reply with JSON only.",
    "Ignore whether the wake phrase asked to file an issue or open a pull request.",
    "Matching is the same either way. Only return issues that are the same work as the request in the transcript.",
    "If none match, return an empty matches array.",
    "",
    "Trigger phrase:",
    phrase,
    "",
    "Transcript window:",
    "```",
    transcript,
    "```",
    "",
    "Open issues:",
    issueBlock || "(none)",
    "",
    "Return JSON of the form:",
    '{"matches":[{"number":847,"score":0.92}]}',
    "score is 0 to 1 for how strongly the issue is the same work.",
  ].join("\n");
}

function formatIssueForPrompt(issue: IssueCandidate): string {
  const excerpt = excerptBody(issue.body);
  const lines = [`#${issue.number} ${issue.title}`];
  if (excerpt) lines.push(excerpt);
  return lines.join("\n");
}

function excerptBody(body?: string | null): string {
  if (!body) return "";
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length <= BODY_EXCERPT_CHARS) return collapsed;
  return `${collapsed.slice(0, BODY_EXCERPT_CHARS).trimEnd()}…`;
}

type MatchPayload = {
  matches?: unknown;
};

/** Parse Grok JSON; keep only issue numbers that exist in `issues`. */
export function parseIssueMatchResponse(
  raw: string,
  issues: IssueCandidate[],
): MatchedIssue[] {
  const parsed = extractJsonObject(raw);
  if (!parsed || !Array.isArray(parsed.matches)) {
    throw new Error("Issue-match response was not JSON with a matches array");
  }

  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const seen = new Set<number>();
  const matched: MatchedIssue[] = [];

  for (const item of parsed.matches) {
    if (!item || typeof item !== "object") continue;
    const record = item as { number?: unknown; score?: unknown };
    const number = Number(record.number);
    if (!Number.isInteger(number) || seen.has(number)) continue;
    const issue = byNumber.get(number);
    if (!issue) continue;
    seen.add(number);

    const score =
      typeof record.score === "number" && Number.isFinite(record.score)
        ? record.score
        : undefined;

    matched.push({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      score,
    });
  }

  matched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return matched.slice(0, MAX_MATCHED_ISSUES);
}

function extractJsonObject(raw: string): MatchPayload | null {
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

function tryParseObject(text: string): MatchPayload | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as MatchPayload;
  } catch {
    return null;
  }
}

export function matchReason(matched: MatchedIssue[]): string {
  if (matched.length === 0) return "no matching issues";
  const best = matched[0];
  return `matched ${matched.length} issue${matched.length === 1 ? "" : "s"} (best #${best.number})`;
}
