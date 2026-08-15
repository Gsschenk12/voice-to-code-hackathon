import { describe, expect, it } from "vitest";
import { GITHUB_ISSUE_TITLE_MAX, parseAgentIssueDraft } from "./draft-issue";

describe("parseAgentIssueDraft", () => {
  it("parses raw JSON", () => {
    expect(
      parseAgentIssueDraft('{"title":"Fix auth race","body":"## Summary\\nAdd a mutex."}'),
    ).toEqual({
      title: "Fix auth race",
      body: "## Summary\nAdd a mutex.",
    });
  });

  it("strips markdown fences", () => {
    expect(
      parseAgentIssueDraft('```json\n{"title":"Add logging","body":"Need request IDs."}\n```'),
    ).toEqual({
      title: "Add logging",
      body: "Need request IDs.",
    });
  });

  it("extracts JSON from surrounding prose", () => {
    expect(
      parseAgentIssueDraft(
        'Here is the draft:\n{"title":"Rate limits","body":"Per-tenant overrides."}\nThanks!',
      ),
    ).toEqual({
      title: "Rate limits",
      body: "Per-tenant overrides.",
    });
  });

  it("truncates titles longer than GitHub max", () => {
    const title = "x".repeat(GITHUB_ISSUE_TITLE_MAX + 40);
    const draft = parseAgentIssueDraft(JSON.stringify({ title, body: "body" }));
    expect(draft.title).toHaveLength(GITHUB_ISSUE_TITLE_MAX);
    expect(draft.body).toBe("body");
  });

  it("rejects empty text", () => {
    expect(() => parseAgentIssueDraft("   ")).toThrow(/empty text/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseAgentIssueDraft("not json")).toThrow(/valid JSON/);
  });

  it("rejects missing title", () => {
    expect(() => parseAgentIssueDraft('{"title":"","body":"ok"}')).toThrow(/title/);
  });

  it("rejects missing body", () => {
    expect(() => parseAgentIssueDraft('{"title":"ok","body":""}')).toThrow(/body/);
  });
});
