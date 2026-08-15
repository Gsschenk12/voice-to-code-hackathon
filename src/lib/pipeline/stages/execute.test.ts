import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../types";
import { defaultStages } from "../orchestrate";

vi.mock("@/lib/cursor", () => ({
  launchPrPlanExecuteAgent: vi.fn(),
}));

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return {
    ...actual,
    getIssue: vi.fn(),
  };
});

import { launchPrPlanExecuteAgent } from "@/lib/cursor";
import { getIssue } from "@/lib/github";
import {
  executeStage,
  resolveAssociatedIssueNumber,
  runExecute,
} from "./execute";

const launchPrMock = vi.mocked(launchPrPlanExecuteAgent);
const getIssueMock = vi.mocked(getIssue);

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    meetingId: "meeting-1",
    kind: "pr",
    phrase: "grok make a pr",
    transcriptWindow: "grok make a pr for the logging work",
    repoUrl: "https://github.com/acme/platform",
    apiKey: "test-key",
    githubAccessToken: "gh-token",
    intent: { kind: "pr", phrase: "grok make a pr" },
    prDecision: { needed: true },
    log: [],
    ...overrides,
  };
}

describe("resolveAssociatedIssueNumber", () => {
  it("prefers issueDecision, then issueContextUpdate, then matchedIssues", () => {
    expect(
      resolveAssociatedIssueNumber(
        baseContext({
          issueDecision: { action: "create", issueNumber: 10 },
          issueContextUpdate: { issueNumber: 20, needed: false },
          matchedIssues: [{ number: 30, title: "C" }],
        }),
      ),
    ).toBe(10);

    expect(
      resolveAssociatedIssueNumber(
        baseContext({
          issueContextUpdate: { issueNumber: 20, needed: false },
          matchedIssues: [{ number: 30, title: "C" }],
        }),
      ),
    ).toBe(20);

    expect(
      resolveAssociatedIssueNumber(
        baseContext({
          matchedIssues: [{ number: 30, title: "C" }],
        }),
      ),
    ).toBe(30);

    expect(resolveAssociatedIssueNumber(baseContext())).toBeUndefined();
  });
});

describe("executeStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs after decidePrNeeded in the default pipeline", () => {
    expect(defaultStages.map((s) => s.id)).toEqual([
      "resolveIntent",
      "matchIssues",
      "addIssueContext",
      "resolveIssue",
      "decidePrNeeded",
      "execute",
    ]);
  });

  it("skips when PR is not needed", async () => {
    const result = await executeStage.run(
      baseContext({
        kind: "issue",
        intent: { kind: "issue" },
        prDecision: { needed: false },
        issueDecision: {
          action: "create",
          issueNumber: 42,
          issueUrl: "https://github.com/acme/platform/issues/42",
        },
      }),
    );

    expect(result.status).toBe("skip");
    expect(result.reason).toContain("PR not needed");
    expect(launchPrMock).not.toHaveBeenCalled();
    expect(result.context.agent).toBeUndefined();
  });

  it("skips when prDecision is missing and kind is issue", async () => {
    const result = await executeStage.run(
      baseContext({
        kind: "issue",
        intent: { kind: "issue" },
        prDecision: undefined,
      }),
    );

    expect(result.status).toBe("skip");
    expect(launchPrMock).not.toHaveBeenCalled();
  });

  it("halts when PR is needed but no associated issue exists", async () => {
    const result = await executeStage.run(baseContext());

    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/no associated GitHub issue/i);
    expect(launchPrMock).not.toHaveBeenCalled();
  });

  it("launches plan-execute for a newly created issue", async () => {
    launchPrMock.mockResolvedValue({ agentId: "bc-123", runId: "run-plan-1" });
    getIssueMock.mockResolvedValue({
      number: 42,
      title: "Add structured logging",
      url: "https://github.com/acme/platform/issues/42",
      body: "Need request IDs.",
    });

    const result = await executeStage.run(
      baseContext({
        issueDecision: {
          action: "create",
          issueNumber: 42,
          issueUrl: "https://github.com/acme/platform/issues/42",
        },
      }),
    );

    expect(result.status).toBe("continue");
    expect(result.context.agent).toEqual({ agentId: "bc-123", runId: "run-plan-1" });
    expect(result.reason).toContain("issue #42");
    expect(launchPrMock).toHaveBeenCalledOnce();
    expect(launchPrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        githubAccessToken: "gh-token",
        repoUrl: "https://github.com/acme/platform",
        meetingId: "meeting-1",
        issue: {
          number: 42,
          title: "Add structured logging",
          url: "https://github.com/acme/platform/issues/42",
          body: "Need request IDs.",
        },
      }),
    );
  });

  it("launches plan-execute for a matched issue", async () => {
    launchPrMock.mockResolvedValue({ agentId: "bc-456", runId: "run-plan-2" });
    getIssueMock.mockResolvedValue({
      number: 7,
      title: "Existing logging issue",
      url: "https://github.com/acme/platform/issues/7",
      body: "Prior context.",
    });

    const result = await executeStage.run(
      baseContext({
        matchedIssues: [
          {
            number: 7,
            title: "Existing logging issue",
            url: "https://github.com/acme/platform/issues/7",
            score: 0.9,
          },
        ],
        issueContextUpdate: { issueNumber: 7, needed: false },
      }),
    );

    expect(result.status).toBe("continue");
    expect(result.context.agent).toEqual({ agentId: "bc-456", runId: "run-plan-2" });
    expect(launchPrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: expect.objectContaining({ number: 7 }),
      }),
    );
  });

  it("halts when fetching the associated issue fails", async () => {
    const result = await runExecute(
      baseContext({
        issueDecision: {
          action: "create",
          issueNumber: 99,
          issueUrl: "https://github.com/acme/platform/issues/99",
        },
      }),
      {
        fetchIssue: async () => {
          throw new Error("Not Found");
        },
        launchPr: launchPrMock,
      },
    );

    expect(result.status).toBe("halt");
    expect(result.reason).toMatch(/Could not load associated issue #99/);
    expect(launchPrMock).not.toHaveBeenCalled();
  });
});
