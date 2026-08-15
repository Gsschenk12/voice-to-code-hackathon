import { describe, expect, it, vi } from "vitest";
import { detectAllKeywords } from "@/lib/keywords";
import { keywordMatchCount } from "@/hooks/useKeywordDetector";

describe("keywordMatchCount / initialFiredCount seeding", () => {
  it("counts wake phrases already in a restored transcript", () => {
    const transcript =
      "we should fix login. grok make an issue about auth. then continue.";
    expect(keywordMatchCount(transcript)).toBe(1);
    expect(detectAllKeywords(transcript)).toHaveLength(1);
  });

  it("counts multiple mentions so none re-fire after restore", () => {
    const transcript =
      "grok make an issue for A. later grok make a PR for B.";
    expect(keywordMatchCount(transcript)).toBe(2);
  });

  it("returns 0 when there are no wake phrases", () => {
    expect(keywordMatchCount("just chatting about the roadmap")).toBe(0);
  });

  it("documents that seeding skips onDetect for restored matches", () => {
    const transcript = "team: grok make an issue please";
    const initialFiredCount = keywordMatchCount(transcript);
    const matches = detectAllKeywords(transcript);
    const onDetect = vi.fn();

    // Mirror hook gate: only fire when matches.length > firedCount
    if (matches.length > initialFiredCount) {
      onDetect(matches[initialFiredCount]);
    }
    expect(onDetect).not.toHaveBeenCalled();
  });
});
