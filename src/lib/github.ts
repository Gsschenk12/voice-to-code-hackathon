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

export type CreateGithubIssueParams = {
  token: string;
  repoUrl: string;
  title: string;
  body: string;
};

export type CreatedGithubIssue = {
  number: number;
  htmlUrl: string;
};

/** Create a GitHub issue via the REST API using the user's OAuth token. */
export async function createGithubIssue(
  params: CreateGithubIssueParams,
): Promise<CreatedGithubIssue> {
  const parsed = parseGithubRepoUrl(params.repoUrl);
  if (!parsed) {
    throw new Error(`Unparsable GitHub repo URL: ${params.repoUrl}`);
  }

  const octokit = createOctokit(params.token);
  const { data } = await octokit.rest.issues.create({
    owner: parsed.owner,
    repo: parsed.repo,
    title: params.title,
    body: params.body,
  });

  return {
    number: data.number,
    htmlUrl: data.html_url,
  };
}

export type IssueComment = {
  id: number;
  body: string;
};

/** Single issue (same shape as list items). */
export async function getIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<ListedIssue> {
  const { data } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  return {
    number: data.number,
    title: data.title,
    url: data.html_url,
    body: data.body ?? null,
  };
}

/** All comments on an issue, paginated. */
export async function listIssueComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueComment[]> {
  const comments: IssueComment[] = [];
  const iterator = octokit.paginate.iterator(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  for await (const response of iterator) {
    for (const comment of response.data as Array<{ id: number; body?: string | null }>) {
      comments.push({
        id: comment.id,
        body: comment.body ?? "",
      });
    }
  }

  return comments;
}

export async function createIssueComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ url: string }> {
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return { url: data.html_url };
}
