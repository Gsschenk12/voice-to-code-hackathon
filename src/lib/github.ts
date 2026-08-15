import { Octokit } from "octokit";

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
