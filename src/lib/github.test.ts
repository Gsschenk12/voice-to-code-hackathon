import { describe, expect, it } from "vitest";
import { listOpenIssues, parseGithubRepoUrl } from "@/lib/github";
import type { Octokit } from "octokit";

describe("parseGithubRepoUrl", () => {
  it("parses owner and repo from a github URL", () => {
    expect(parseGithubRepoUrl("https://github.com/acme/platform")).toEqual({
      owner: "acme",
      repo: "platform",
    });
  });

  it("strips .git suffix", () => {
    expect(parseGithubRepoUrl("https://github.com/acme/platform.git")).toEqual({
      owner: "acme",
      repo: "platform",
    });
  });

  it("returns null for non-GitHub hosts", () => {
    expect(parseGithubRepoUrl("https://gitlab.com/acme/platform")).toBeNull();
  });
});

describe("listOpenIssues", () => {
  it("drops pull requests and stops at the limit", async () => {
    const pages = [
      {
        data: [
          {
            number: 1,
            title: "Logging",
            body: "need structured logs",
            html_url: "https://github.com/acme/platform/issues/1",
          },
          {
            number: 2,
            title: "A PR",
            body: null,
            html_url: "https://github.com/acme/platform/pull/2",
            pull_request: { url: "https://api.github.com/repos/acme/platform/pulls/2" },
          },
          {
            number: 3,
            title: "Rate limits",
            body: "per tenant",
            html_url: "https://github.com/acme/platform/issues/3",
          },
        ],
      },
    ];

    const octokit = {
      rest: { issues: { listForRepo: {} } },
      paginate: {
        iterator: async function* () {
          yield* pages;
        },
      },
    } as unknown as Octokit;

    const issues = await listOpenIssues(octokit, "acme", "platform", 10);
    expect(issues.map((i) => i.number)).toEqual([1, 3]);
    expect(issues[0]).toEqual({
      number: 1,
      title: "Logging",
      url: "https://github.com/acme/platform/issues/1",
      body: "need structured logs",
    });
  });
});
