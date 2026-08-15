import { describe, expect, it, vi } from "vitest";
import { GROK_46_MODEL_ID, runAddIssueContext } from "./add-issue-context";
import { defaultStages } from "../orchestrate";
import { runStages } from "../run";
import type { PipelineContext } from "../types";
import type { ListedIssue } from "@/lib/github";

const issue: ListedIssue = {
  number: 847,
  title: "Fix concurrent refresh token race",
  url: "https://github.com/acme/platform/issues/847",
  body: "Mutex around the token store write.",
};

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    meetingId: "meeting-1",
    kind: "issue",
    phrase: "grok make an issue",
    transcriptWindow: "also happens when two tabs refresh at once",
    repoUrl: "https://github.com/acme/platform",
    apiKey: "test-key",
    githubAccessToken: "gh-token",
    log: [],
    matchedIssues: [
      {
        number: 847,
        title: "Fix concurrent refresh token race",
        url: "https://github.com/acme/platform/issues/847",
        score: 0.91,
      },
    ],
    ...overrides,
  };
}

describe("runAddIssueContext", () => {
  it("pins Grok 4.6 for the context agent", () => {
    expect(GROK_46_MODEL_ID).toBe("grok-4.6");
  });

  it("runs after matchIssues and before resolveIssue", () => {
    expect(defaultStages.map((stage) => stage.id)).toEqual([
      "resolveIntent",
      "matchIssues",
      "addIssueContext",
      "resolveIssue",
      "decidePrNeeded",
      "execute",
    ]);
  });
  it("passes through unmatched context with no Grok or GitHub calls", async () => {
    const getIssue = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const promptContext = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const createComment = vi.fn(async () => {
      throw new Error("should not be called");
    });

    const unmatched = baseContext({ matchedIssues: [] });
    const result = await runAddIssueContext(unmatched, {
      getIssue,
      promptContext,
      createComment,
    });

    expect(result.status).toBe("continue");
    expect(result.context).toBe(unmatched);
    expect(result.context.issueContextUpdate).toBeUndefined();
    expect(result.reason).toBeUndefined();
    expect(getIssue).not.toHaveBeenCalled();
    expect(promptContext).not.toHaveBeenCalled();
    expect(createComment).not.toHaveBeenCalled();
  });

  it("passes through when matchedIssues is missing", async () => {
    const promptContext = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const missing = baseContext();
    delete missing.matchedIssues;

    const result = await runAddIssueContext(missing, { promptContext });
    expect(result.status).toBe("continue");
    expect(result.context).toBe(missing);
    expect(promptContext).not.toHaveBeenCalled();
  });

  it("posts a comment when Grok finds new context", async () => {
    const createComment = vi.fn(async () => ({
      url: "https://github.com/acme/platform/issues/847#issuecomment-9",
    }));
    const result = await runAddIssueContext(baseContext(), {
      getIssue: async () => ({ issue, comments: [] }),
      promptContext: async () =>
        JSON.stringify({
          needed: true,
          comment: "### Meeting context\n\nAlso fails with two tabs.",
        }),
      createComment,
    });

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("added context to #847");
    expect(result.context.issueContextUpdate).toEqual({
      issueNumber: 847,
      needed: true,
      commentUrl: "https://github.com/acme/platform/issues/847#issuecomment-9",
    });
    expect(createComment).toHaveBeenCalledWith(
      "gh-token",
      "acme",
      "platform",
      847,
      "### Meeting context\n\nAlso fails with two tabs.",
    );
  });

  it("does not write to GitHub when Grok says nothing new", async () => {
    const createComment = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const result = await runAddIssueContext(baseContext(), {
      getIssue: async () => ({ issue, comments: [] }),
      promptContext: async () => JSON.stringify({ needed: false }),
      createComment,
    });

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("no new context for #847");
    expect(result.context.issueContextUpdate).toEqual({
      issueNumber: 847,
      needed: false,
    });
    expect(createComment).not.toHaveBeenCalled();
  });

  it("uses the top-ranked match when several are present", async () => {
    const getIssue = vi.fn(async (_token, _owner, _repo, issueNumber: number) => ({
      issue: { ...issue, number: issueNumber },
      comments: [],
    }));
    await runAddIssueContext(
      baseContext({
        matchedIssues: [
          { number: 12, title: "Logging", score: 0.4 },
          { number: 847, title: "Race", score: 0.9 },
        ],
      }),
      {
        getIssue,
        promptContext: async () => JSON.stringify({ needed: false }),
        createComment: async () => ({ url: "unused" }),
      },
    );
    expect(getIssue).toHaveBeenCalledWith("gh-token", "acme", "platform", 847);
  });

  it("halts when loading the issue fails", async () => {
    const result = await runAddIssueContext(baseContext(), {
      getIssue: async () => {
        throw new Error("404");
      },
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/Could not load the matched GitHub issue \(404\)/);
    expect(result.context.issueContextUpdate).toBeUndefined();
  });

  it("halts when Grok fails", async () => {
    const result = await runAddIssueContext(baseContext(), {
      getIssue: async () => ({ issue, comments: [] }),
      promptContext: async () => {
        throw new Error("quota");
      },
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/Cursor API key \(quota\)/);
  });

  it("halts when Grok returns unparseable output", async () => {
    const result = await runAddIssueContext(baseContext(), {
      getIssue: async () => ({ issue, comments: [] }),
      promptContext: async () => "sorry I cannot help with that",
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/unexpected response/);
  });

  it("halts when commenting fails", async () => {
    const result = await runAddIssueContext(baseContext(), {
      getIssue: async () => ({ issue, comments: [] }),
      promptContext: async () =>
        JSON.stringify({ needed: true, comment: "### Meeting context\n\nNew." }),
      createComment: async () => {
        throw new Error("403");
      },
    });
    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/Could not comment on the matched GitHub issue \(403\)/);
  });

  it("does not run later stages after a matched-path halt", async () => {
    const ran: string[] = [];
    const result = await runStages(
      [
        {
          id: "addIssueContext",
          description: "context",
          run: (ctx) =>
            runAddIssueContext(ctx, {
              getIssue: async () => {
                throw new Error("down");
              },
            }),
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
      baseContext(),
    );

    expect(ran).toEqual([]);
    expect(result.agent).toBeUndefined();
    expect(
      result.log.some(
        (e) => e.stage === "addIssueContext" && /Could not load the matched GitHub issue/.test(e.message),
      ),
    ).toBe(true);
  });
});
