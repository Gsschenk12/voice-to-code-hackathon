import { describe, expect, it } from "vitest";
import { detectAllKeywords } from "@/lib/keywords";
import {
  TRIGGER_FOCUS_INSTRUCTION,
  buildFocusedTranscript,
} from "./trigger-focus";

describe("buildFocusedTranscript", () => {
  it("tags the wake phrase and labels this request", () => {
    const transcript = "We need better logging. Please grok make an issue about logs.";
    const [match] = detectAllKeywords(transcript);
    expect(match).toBeDefined();

    const focused = buildFocusedTranscript({
      transcript,
      match: {
        phrase: match!.phrase,
        sourceStart: match!.sourceStart,
        sourceEnd: match!.sourceEnd,
      },
    });

    expect(focused).toContain("This request (use this):");
    expect(focused).toMatch(/>>>[\s\S]*grok[\s\S]*issue[\s\S]*<<</);
    expect(focused).toContain("about logs");
  });

  it("keeps earlier discussion as background for a second mention", () => {
    const transcript = [
      "First we talked about logging. grok make an issue about structured logs.",
      "Now the auth race is worse. grok make an issue about the token store.",
    ].join(" ");
    const matches = detectAllKeywords(transcript);
    expect(matches).toHaveLength(2);

    const first = buildFocusedTranscript({
      transcript,
      match: matches[0]!,
      previousMatches: [],
    });
    const second = buildFocusedTranscript({
      transcript,
      match: matches[1]!,
      previousMatches: [matches[0]!],
    });

    expect(first).not.toEqual(second);
    expect(second).toContain("Earlier discussion");
    expect(second).toContain("This request (use this):");
    expect(second).toContain("token store");

    const thisSection = second.split("This request (use this):")[1] ?? "";
    expect(thisSection).toMatch(/>>>[\s\S]*<<</);
    expect(thisSection).toContain("token store");
    // First topic stays in earlier/background, not as the tagged command in this section.
    expect(thisSection).not.toMatch(/>>>[\s\S]*structured logs/);
  });

  it("prefers the this-request section when over budget", () => {
    const earlier = "background ".repeat(80);
    const transcript = `${earlier}grok make an issue about the newest topic only.`;
    const [match] = detectAllKeywords(transcript);
    expect(match).toBeDefined();

    const focused = buildFocusedTranscript({
      transcript,
      match: match!,
      maxChars: 200,
    });

    expect(focused.length).toBeLessThanOrEqual(200);
    expect(focused).toContain("This request (use this):");
    expect(focused).toContain("newest topic");
  });
});

describe("TRIGGER_FOCUS_INSTRUCTION", () => {
  it("mentions tagged wake phrases and this request", () => {
    expect(TRIGGER_FOCUS_INSTRUCTION).toMatch(/>>>/);
    expect(TRIGGER_FOCUS_INSTRUCTION).toMatch(/This request/);
    expect(TRIGGER_FOCUS_INSTRUCTION).toMatch(/previous/i);
  });
});
