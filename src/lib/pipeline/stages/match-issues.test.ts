import { describe, expect, it, vi } from "vitest";
import { runMatchIssues } from "./match-issues";
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
  it("skips without a GitHub token", async () => {
    const result = await runMatchIssues(baseContext({ githubAccessToken: undefined }));
    expect(result.status).toBe("skip");
    expect(result.reason).toMatch(/no GitHub access token/);
    expect(result.context.matchedIssues).toBeUndefined();
  });

  it("skips without a Cursor API key", async () => {
    const result = await runMatchIssues(baseContext({ apiKey: "  " }));
    expect(result.status).toBe("skip");
    expect(result.reason).toMatch(/no Cursor API key/);
  });

  it("skips on an unparseable repo URL", async () => {
    const result = await runMatchIssues(baseContext({ repoUrl: "https://gitlab.com/acme/platform" }));
    expect(result.status).toBe("skip");
    expect(result.reason).toMatch(/unparseable/);
  });

  it("skips when listing issues fails", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => {
        throw new Error("API down");
      },
    });
    expect(result.status).toBe("skip");
    expect(result.reason).toMatch(/failed to list issues: API down/);
  });

  it("skips when Grok fails", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => issues,
      promptMatch: async () => {
        throw new Error("quota");
      },
    });
    expect(result.status).toBe("skip");
    expect(result.reason).toMatch(/Grok match failed: quota/);
  });

  it("skips when Grok returns unparseable output", async () => {
    const result = await runMatchIssues(baseContext(), {
      listIssues: async () => issues,
      promptMatch: async () => "sorry I cannot help with that",
    });
    expect(result.status).toBe("skip");
    expect(result.reason).toMatch(/Grok match parse failed/);
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
});
