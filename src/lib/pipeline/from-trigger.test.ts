import { describe, expect, it } from "vitest";
import {
  pipelineInputFromTrigger,
  resolveRepoUrl,
} from "./from-trigger";
import type { PipelineRequest } from "@/lib/triggers/types";

describe("resolveRepoUrl", () => {
  it("passes through full URLs", () => {
    expect(resolveRepoUrl("https://github.com/acme/api")).toBe("https://github.com/acme/api");
  });

  it("expands owner/repo", () => {
    expect(resolveRepoUrl("acme-corp/platform-api")).toBe(
      "https://github.com/acme-corp/platform-api",
    );
  });

  it("uses fallback when linkedRepo is missing", () => {
    expect(resolveRepoUrl(undefined, "https://github.com/acme/fallback")).toBe(
      "https://github.com/acme/fallback",
    );
  });

  it("returns null when nothing usable", () => {
    expect(resolveRepoUrl()).toBeNull();
    expect(resolveRepoUrl("not a repo")).toBeNull();
  });
});

describe("pipelineInputFromTrigger", () => {
  const request: PipelineRequest = {
    kind: "issue",
    phrase: "grok make an issue",
    transcriptWindow: "context grok make an issue more context",
    sourceId: "01-sprint-planning-backend.txt",
    linkedRepo: "acme-corp/platform-api",
  };

  it("maps trigger request fields into runPipeline input", () => {
    const input = pipelineInputFromTrigger(request, {
      apiKey: "key",
      githubAccessToken: "gh",
      startingRef: "main",
    });

    expect(input).toEqual({
      meetingId: "01-sprint-planning-backend.txt",
      kind: "issue",
      phrase: "grok make an issue",
      transcriptWindow: request.transcriptWindow,
      repoUrl: "https://github.com/acme-corp/platform-api",
      startingRef: "main",
      apiKey: "key",
      githubAccessToken: "gh",
    });
  });

  it("throws when repo cannot be resolved", () => {
    expect(() =>
      pipelineInputFromTrigger(
        { ...request, linkedRepo: undefined },
        { apiKey: "key" },
      ),
    ).toThrow(/No repo URL/);
  });
});
