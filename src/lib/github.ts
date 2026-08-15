import { Octokit } from "octokit";

const DEFAULT_ISSUE_LIMIT = 100;

export type ListedIssue = {
  number: number;
  title: string;
  url: string;
  body?: string | null;
};

/** Optional Octokit helper for server-side GitHub calls (issue fallback, etc.). */
export function createOctokit(token: string) {
  return new Octokit({ auth: token });
}

export function parseGithubRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(repoUrl);
    if (!url.hostname.includes("github.com")) return null;
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

type IssueListItem = {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  pull_request?: unknown;
};

/** Open issues only (GitHub's issues API includes PRs — those are dropped). */
export async function listOpenIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  limit = DEFAULT_ISSUE_LIMIT,
): Promise<ListedIssue[]> {
  const issues: ListedIssue[] = [];
  const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    per_page: Math.min(100, limit),
  });

  for await (const response of iterator) {
    for (const issue of response.data as IssueListItem[]) {
      if (issue.pull_request) continue;
      issues.push({
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        body: issue.body ?? null,
      });
      if (issues.length >= limit) return issues;
    }
  }

  return issues;
}
