import type { CommandKind } from "@/types/meeting";

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
