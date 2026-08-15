import { describe, expect, it, vi } from "vitest";
import { MATCH_SETUP, runMatchIssues } from "./match-issues";
import { runStages } from "../run";
import type { PipelineContext } from "../types";
import type { ListedIssue } from "@/lib/github";

const issues: ListedIssue[] = [
  {
    number: 847,
    title: "Fix concurrent refresh token race",
    url: "https://github.com/acme/platform/issues/847",
    body: "Mutex around the token store write.",
  },
  {
    number: 12,
    title: "Add structured logging for webhook delivery failures",
    url: "https://github.com/acme/platform/issues/12",
  },
];

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    meetingId: "meeting-1",
    kind: "issue",
    phrase: "grok make an issue",
    transcriptWindow: "grok make an issue about the refresh token race, link 847",
    repoUrl: "https://github.com/acme/platform",
    apiKey: "test-key",
    githubAccessToken: "gh-token",
    log: [],
    ...overrides,
  };
}

describe("runMatchIssues", () => {
  it("halts without a GitHub token so execute does not run", async () => {
    const result = await runMatchIssues(baseContext({ githubAccessToken: undefined }));
    expect(result.status).toBe("halt");
    expect(result.reason).toBe(MATCH_SETUP.noGithubToken);
    expect(result.context.matchedIssues).toBeUndefined();
  });

  it("halts without a Cursor API key", async () => {
    const result = await runMatchIssues(baseContext({ apiKey: "  " }));
    expect(result.status).toBe("halt");
    expect(result.reason).toBe(MATCH_SETUP.noCursorKey);
  });

  it("halts on an unparseable repo URL", async () => {
    const result = await runMatchIssues(baseContext({ repoUrl: "https://gitlab.com/acme/platform" }));
    expect(result.status).toBe("halt");
    expect(result.reason).toBe(MATCH_SETUP.badRepoUrl);
  });

  it("halts when listing issues fails", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => {
        throw new Error("API down");
      },
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/Could not list GitHub issues \(API down\)/);
    expect(result.reason).toMatch(/meeting setup/);
  });

  it("halts when Grok fails", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => issues,
      promptMatch: async () => {
        throw new Error("quota");
      },
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/Cursor API key \(quota\)/);
  });

  it("halts when Grok returns unparseable output", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => issues,
      promptMatch: async () => "sorry I cannot help with that",
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/unexpected response/);
  });

  it("continues with an empty list and does not call Grok when the repo has no issues", async () => {
    const promptMatch = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => [],
      promptMatch,
    });
    expect(result.status).toBe("continue");
    expect(result.context.matchedIssues).toEqual([]);
    expect(result.reason).toMatch(/no open issues/);
    expect(promptMatch).not.toHaveBeenCalled();
  });

  it("writes ranked matches from Grok", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => issues,
      promptMatch: async () =>
        JSON.stringify({ matches: [{ number: 847, score: 0.91 }] }),
    });
    expect(result.status).toBe("continue");
    expect(result.context.matchedIssues).toEqual([
      {
        number: 847,
        title: "Fix concurrent refresh token race",
        url: "https://github.com/acme/platform/issues/847",
        score: 0.91,
      },
    ]);
    expect(result.reason).toBe("matched 1 issue (best #847)");
  });

  it("continues with no matches when Grok returns an empty array", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => issues,
      promptMatch: async () => JSON.stringify({ matches: [] }),
    });
    expect(result.status).toBe("continue");
    expect(result.context.matchedIssues).toEqual([]);
    expect(result.reason).toBe("no matching issues");
  });

  it("matches the same way for issue and PR triggers", async () => {
    const deps = {
      listIssues: async () => issues,
      promptMatch: async () =>
        JSON.stringify({ matches: [{ number: 12, score: 0.7 }] }),
    };
    const window = "grok make a PR that adds structured log fields for webhook failures";

    const asIssue = await runMatchIssues(
      baseContext({ kind: "issue", phrase: "grok make an issue", transcriptWindow: window }),
      deps,
    );
    const asPr = await runMatchIssues(
      baseContext({ kind: "pr", phrase: "grok make a pr", transcriptWindow: window }),
      deps,
    );

    expect(asIssue.context.matchedIssues).toEqual(asPr.context.matchedIssues);
    expect(asIssue.context.matchedIssues?.[0]?.number).toBe(12);
  });

  it("does not run later stages after a setup halt", async () => {
    const ran: string[] = [];
    const result = await runStages(
      [
        {
          id: "matchIssues",
          description: "match",
          run: (ctx) => runMatchIssues(ctx),
        },
        {
          id: "execute",
          description: "execute",
          async run(ctx) {
            ran.push("execute");
            return { status: "continue" as const, context: ctx };
          },
        },
      ],
      baseContext({ githubAccessToken: undefined }),
    );

    expect(ran).toEqual([]);
    expect(result.agent).toBeUndefined();
    expect(result.log.some((e) => e.stage === "matchIssues" && e.message === MATCH_SETUP.noGithubToken)).toBe(
      true,
    );
  });
});
