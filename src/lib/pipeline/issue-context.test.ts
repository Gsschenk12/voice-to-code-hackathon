import { describe, expect, it } from "vitest";
import {
  buildIssueContextPrompt,
  ensureMeetingContextHeading,
  parseIssueContextResponse,
} from "./issue-context";
import type { IssueForContext } from "./issue-context";
import { TRIGGER_FOCUS_INSTRUCTION } from "./trigger-focus";

const issue: IssueForContext = {
  number: 847,
  title: "Fix concurrent refresh token race",
  url: "https://github.com/acme/platform/issues/847",
  body: "Mutex around the token store write.",
  comments: [{ id: 1, body: "Reproduced on staging." }],
};

describe("buildIssueContextPrompt", () => {
  it("includes transcript, issue, comments, and JSON-only instructions", () => {
    const prompt = buildIssueContextPrompt({
      transcriptWindow: "also happens when two tabs refresh at once",
      issue,
    });

    expect(prompt).toContain("also happens when two tabs refresh at once");
    expect(prompt).toContain("#847 Fix concurrent refresh token race");
    expect(prompt).toContain("Mutex around the token store write.");
    expect(prompt).toContain("Reproduced on staging.");
    expect(prompt).toContain("Do not use tools");
    expect(prompt).toContain('"needed"');
    expect(prompt).toContain("### Meeting context");
    expect(prompt).toContain(TRIGGER_FOCUS_INSTRUCTION);
  });
});

describe("parseIssueContextResponse", () => {
  it("parses needed true with a comment", () => {
    const decision = parseIssueContextResponse(
      JSON.stringify({
        needed: true,
        comment: "### Meeting context\n\nAlso fails with two tabs.",
      }),
    );
    expect(decision).toEqual({
      needed: true,
      comment: "### Meeting context\n\nAlso fails with two tabs.",
    });
  });

  it("parses fenced JSON and prepends the heading when missing", () => {
    const raw = [
      "sure:",
      "```json",
      '{ "needed": true, "comment": "Two-tab refresh reproduces it." }',
      "```",
    ].join("\n");

    const decision = parseIssueContextResponse(raw);
    expect(decision.needed).toBe(true);
    expect(decision.comment).toBe("### Meeting context\n\nTwo-tab refresh reproduces it.");
  });

  it("treats needed true with an empty comment as not needed", () => {
    expect(parseIssueContextResponse(JSON.stringify({ needed: true, comment: "  " }))).toEqual({
      needed: false,
    });
  });

  it("parses needed false", () => {
    expect(parseIssueContextResponse('{"needed":false}')).toEqual({ needed: false });
  });

  it("throws when JSON is missing needed", () => {
    expect(() => parseIssueContextResponse("not json")).toThrow(/needed boolean/);
    expect(() => parseIssueContextResponse("{}")).toThrow(/needed boolean/);
  });
});

describe("ensureMeetingContextHeading", () => {
  it("leaves an existing heading in place", () => {
    expect(ensureMeetingContextHeading("## Meeting context\n\nFact")).toBe(
      "## Meeting context\n\nFact",
    );
  });
});
