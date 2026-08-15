import { describe, expect, it } from "vitest";
import {
  buildIssueMatchPrompt,
  parseIssueMatchResponse,
} from "./issue-match";
import type { IssueCandidate } from "./issue-match";

const issues: IssueCandidate[] = [
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
    body: "Need request ID and tenant ID.",
  },
];

describe("buildIssueMatchPrompt", () => {
  it("includes phrase, transcript, issue numbers, and kind-agnostic instructions", () => {
    const prompt = buildIssueMatchPrompt({
      phrase: "grok make a pr",
      transcriptWindow: "link issue number 847 if that's still open",
      issues,
    });

    expect(prompt).toContain("grok make a pr");
    expect(prompt).toContain("link issue number 847 if that's still open");
    expect(prompt).toContain("#847 Fix concurrent refresh token race");
    expect(prompt).toContain("#12 Add structured logging for webhook delivery failures");
    expect(prompt).toMatch(/Ignore whether the wake phrase asked to file an issue or open a pull request/i);
    expect(prompt).toContain("Do not use tools");
    expect(prompt).toContain('"matches"');
  });
});

describe("parseIssueMatchResponse", () => {
  it("parses a raw JSON object", () => {
    const matched = parseIssueMatchResponse(
      JSON.stringify({ matches: [{ number: 847, score: 0.9 }] }),
      issues,
    );
    expect(matched).toEqual([
      {
        number: 847,
        title: "Fix concurrent refresh token race",
        url: "https://github.com/acme/platform/issues/847",
        score: 0.9,
      },
    ]);
  });

  it("parses a fenced JSON block with surrounding prose", () => {
    const raw = [
      "Here you go:",
      "```json",
      '{ "matches": [{ "number": 12, "score": 0.81 }, { "number": 847, "score": 0.4 }] }',
      "```",
      "good luck",
    ].join("\n");

    const matched = parseIssueMatchResponse(raw, issues);
    expect(matched.map((m) => m.number)).toEqual([12, 847]);
    expect(matched[0]?.title).toBe("Add structured logging for webhook delivery failures");
  });

  it("drops unknown issue numbers and sorts by score", () => {
    const matched = parseIssueMatchResponse(
      JSON.stringify({
        matches: [
          { number: 999, score: 1 },
          { number: 12, score: 0.2 },
          { number: 847, score: 0.95 },
        ],
      }),
      issues,
    );
    expect(matched.map((m) => m.number)).toEqual([847, 12]);
  });

  it("throws when JSON is missing matches", () => {
    expect(() => parseIssueMatchResponse("not json", issues)).toThrow(/matches array/);
    expect(() => parseIssueMatchResponse("{}", issues)).toThrow(/matches array/);
  });
});
