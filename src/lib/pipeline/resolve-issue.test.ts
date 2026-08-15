import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "./types";

vi.mock("./draft-issue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./draft-issue")>();
  return {
    ...actual,
    draftIssueWithAgent: vi.fn(),
  };
});

vi.mock("@/lib/github", () => ({
  createGithubIssue: vi.fn(),
}));

import { createGithubIssue } from "@/lib/github";
import { draftIssueWithAgent } from "./draft-issue";
import { resolveIssueStage } from "./stages/resolve-issue";

const draftIssueWithAgentMock = vi.mocked(draftIssueWithAgent);
const createGithubIssueMock = vi.mocked(createGithubIssue);

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    meetingId: "meeting-1",
    kind: "issue",
    transcriptWindow: "grok make an issue about logging",
    repoUrl: "https://github.com/acme/platform",
    apiKey: "test-key",
    githubAccessToken: "gh-token",
    log: [],
    ...overrides,
  };
}

describe("resolveIssueStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drafts and creates an issue when there are no matches", async () => {
    draftIssueWithAgentMock.mockResolvedValue({
      title: "Add structured logging",
      body: "Need request IDs.",
    });
    createGithubIssueMock.mockResolvedValue({
      number: 42,
      htmlUrl: "https://github.com/acme/platform/issues/42",
    });

    const result = await resolveIssueStage.run(baseContext({ matchedIssues: [] }));

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("created issue #42");
    expect(result.context.issueDecision).toEqual({
      action: "create",
      issueNumber: 42,
      issueUrl: "https://github.com/acme/platform/issues/42",
    });
    expect(draftIssueWithAgentMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      transcriptWindow: "grok make an issue about logging",
      repoUrl: "https://github.com/acme/platform",
      startingRef: undefined,
      meetingId: "meeting-1",
    });
    expect(createGithubIssueMock).toHaveBeenCalledWith({
      token: "gh-token",
      repoUrl: "https://github.com/acme/platform",
      title: "Add structured logging",
      body: "Need request IDs.",
    });
  });

  it("treats missing matchedIssues as no matches", async () => {
    draftIssueWithAgentMock.mockResolvedValue({
      title: "Title",
      body: "Body",
    });
    createGithubIssueMock.mockResolvedValue({
      number: 7,
      htmlUrl: "https://github.com/acme/platform/issues/7",
    });

    const result = await resolveIssueStage.run(baseContext());
    expect(result.status).toBe("continue");
    expect(result.context.issueDecision?.issueNumber).toBe(7);
  });

  it("skips when matches exist (reuse not implemented)", async () => {
    const result = await resolveIssueStage.run(
      baseContext({
        matchedIssues: [{ number: 3, title: "Existing" }],
      }),
    );

    expect(result.status).toBe("skip");
    expect(result.reason).toBe("issue reuse not implemented yet");
    expect(draftIssueWithAgentMock).not.toHaveBeenCalled();
    expect(createGithubIssueMock).not.toHaveBeenCalled();
  });

  it("throws when GitHub token is missing", async () => {
    await expect(
      resolveIssueStage.run(baseContext({ githubAccessToken: undefined })),
    ).rejects.toThrow(/GitHub access token/);
    expect(draftIssueWithAgentMock).not.toHaveBeenCalled();
  });
});
