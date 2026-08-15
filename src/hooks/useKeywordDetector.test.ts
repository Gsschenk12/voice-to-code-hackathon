import { describe, expect, it, vi } from "vitest";
import { detectAllKeywords } from "@/lib/keywords";
import {
  keywordMatchCount,
  tryFireNextKeyword,
} from "@/hooks/useKeywordDetector";

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

describe("tryFireNextKeyword drain", () => {
  const transcript =
    "grok make an issue for A. later grok make a PR for B.";
  const cooldownMs = 1_500;

  it("fires both mentions in one transcript after cooldown", () => {
    const first = tryFireNextKeyword({
      transcript,
      state: { firedCount: 0, lastFiredAt: 0 },
      now: 1_000,
      cooldownMs,
    });
    expect(first.command?.kind).toBe("issue");
    expect(first.remaining).toBe(1);
    expect(first.retryAfterMs).toBe(cooldownMs);

    const blocked = tryFireNextKeyword({
      transcript,
      state: first.state,
      now: 1_000 + 500,
      cooldownMs,
    });
    expect(blocked.command).toBeNull();
    expect(blocked.remaining).toBe(1);
    expect(blocked.retryAfterMs).toBe(1_000);

    const second = tryFireNextKeyword({
      transcript,
      state: first.state,
      now: 1_000 + cooldownMs,
      cooldownMs,
    });
    expect(second.command?.kind).toBe("pr");
    expect(second.remaining).toBe(0);
    expect(second.retryAfterMs).toBeNull();
  });

  it("returns nothing when firedCount already covers all matches", () => {
    const result = tryFireNextKeyword({
      transcript,
      state: { firedCount: 2, lastFiredAt: 5_000 },
      now: 10_000,
      cooldownMs,
    });
    expect(result.command).toBeNull();
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeNull();
  });

  it("does not fire when there are no wake phrases", () => {
    const result = tryFireNextKeyword({
      transcript: "just chatting about the roadmap",
      state: { firedCount: 0, lastFiredAt: 0 },
      now: 1_000,
      cooldownMs,
    });
    expect(result.command).toBeNull();
    expect(result.remaining).toBe(0);
  });
});
