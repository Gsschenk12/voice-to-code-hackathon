import type { CommandKind } from "@/types/meeting";

export type AssociatedIssueForPrompt = {
  number: number;
  title: string;
  url: string;
  body?: string | null;
};

export function buildAgentPrompt(kind: CommandKind, transcriptWindow: string, repoUrl: string): string {
  const context = transcriptWindow.trim() || "(no transcript context provided)";

  if (kind === "pr") {
    return [
      "You are working from a live meeting transcript.",
      `Repository: ${repoUrl}`,
      "",
      "The user said roughly: \"grok make a PR\".",
      "Infer the feature/fix they want from the surrounding transcript and implement it.",
      "Make focused, high-quality changes. Prefer small commits on a new branch.",
      "A pull request will be opened automatically when you finish (autoCreatePR is enabled).",
      "Write a clear PR title/body in your final summary.",
      "",
      "Meeting transcript window:",
      "```",
      context,
      "```",
    ].join("\n");
  }

  return [
    "You are working from a live meeting transcript.",
    `Repository: ${repoUrl}`,
    "",
    "The user said roughly: \"grok make an issue\".",
    "Create a GitHub issue that captures the request discussed in the transcript.",
    "Do NOT implement code changes unless needed to draft the issue.",
    "",
    "IMPORTANT: Use the GitHub CLI with the GITHUB_TOKEN environment variable already set in your shell.",
    "Example:",
    '  gh issue create --title "..." --body "..."',
    "Include acceptance criteria and relevant transcript quotes in the issue body.",
    "Return the issue URL in your final response.",
    "",
    "Meeting transcript window:",
    "```",
    context,
    "```",
  ].join("\n");
}

/** Plan-mode prompt for PR plan-then-execute (does not edit files). */
export function buildPrPlanPrompt(params: {
  repoUrl: string;
  transcriptWindow: string;
  issue: AssociatedIssueForPrompt;
}): string {
  const context = params.transcriptWindow.trim() || "(no transcript context provided)";
  const body = params.issue.body?.trim() || "(no issue body)";

  return [
    "You are working from a live meeting transcript and an associated GitHub issue.",
    `Repository: ${params.repoUrl}`,
    "",
    "You are in plan mode. Explore the codebase and produce a concrete implementation plan.",
    "Do NOT edit files, commit, push, or open a pull request in this turn.",
    "",
    `Associated issue: #${params.issue.number} — ${params.issue.title}`,
    `Issue URL: ${params.issue.url}`,
    "Issue body:",
    "```",
    body,
    "```",
    "",
    "Meeting transcript window (extra context from the discussion):",
    "```",
    context,
    "```",
    "",
    "In your plan, cover: goals, files/areas to change, implementation steps, and test/verification notes.",
  ].join("\n");
}

/** Agent-mode follow-up after the plan run finishes. */
export function buildPrExecutePrompt(params: {
  issue: AssociatedIssueForPrompt;
}): string {
  const n = params.issue.number;
  return [
    "Looks good — implement the plan you just produced.",
    "",
    "Requirements:",
    "- Create a new branch for this work.",
    "- Make atomic commits: short title summarizing the change, then a detailed body explaining why.",
    "- Push the branch.",
    `- A pull request will be opened automatically when you finish (autoCreatePR is enabled). Put a clear PR title and body in your final summary; the body MUST link the issue with \`Fixes #${n}\` or \`Closes #${n}\` and include the issue URL: ${params.issue.url}.`,
    "- Stay focused on the associated issue; do not expand scope beyond the plan.",
  ].join("\n");
}
