import { describe, expect, it } from "vitest";
import {
  detectAllKeywords,
  detectKeyword,
  isGrokWakeWord,
  normalizeTranscript,
  normalizeWithAlignment,
  rollingWindow,
} from "@/lib/keywords";

describe("normalizeTranscript", () => {
  it("lowercases and strips filler", () => {
    expect(normalizeTranscript("Um, Grok, like, make an issue!")).toBe("grok make an issue");
  });
});

describe("normalizeWithAlignment", () => {
  it("maps normalized characters back to original indices", () => {
    const original = "Hey Grok make an issue now";
    const { normalized, sourceIndex } = normalizeWithAlignment(original);
    expect(normalized).toContain("grok make an issue");
    expect(sourceIndex).toHaveLength(normalized.length);

    const start = normalized.indexOf("grok make an issue");
    const end = start + "grok make an issue".length;
    const sourceStart = sourceIndex[start]!;
    const sourceEnd = sourceIndex[end - 1]! + 1;
    expect(original.slice(sourceStart, sourceEnd).toLowerCase()).toContain("grok");
    expect(original.slice(sourceStart, sourceEnd).toLowerCase()).toContain("issue");
  });

  it("spans include filler words spoken inside the phrase", () => {
    const original = "please grok uh make an issue about auth";
    const matches = detectAllKeywords(original);
    expect(matches).toHaveLength(1);
    const span = original.slice(matches[0]!.sourceStart, matches[0]!.sourceEnd);
    expect(span.toLowerCase()).toContain("grok");
    expect(span.toLowerCase()).toContain("uh");
    expect(span.toLowerCase()).toContain("issue");
  });
});

describe("detectKeyword", () => {
  it("detects issue phrase", () => {
    const match = detectKeyword("hey team grok make an issue about the login bug");
    expect(match?.kind).toBe("issue");
    expect(match?.sourceStart).toBeGreaterThanOrEqual(0);
    expect(match?.sourceEnd).toBeGreaterThan(match!.sourceStart);
  });

  it("detects PR phrase", () => {
    const match = detectKeyword("okay grok make a PR for dark mode");
    expect(match?.kind).toBe("pr");
  });

  it("detects pull request synonym", () => {
    const match = detectKeyword("please grok make a pull request now");
    expect(match?.kind).toBe("pr");
  });

  it("is filler-tolerant", () => {
    const match = detectKeyword("uh grok um make an issue please");
    expect(match?.kind).toBe("issue");
  });

  it("returns null when absent", () => {
    expect(detectKeyword("let's talk about the roadmap")).toBeNull();
  });

  it("is case-insensitive for the wake word", () => {
    expect(detectKeyword("GROK make an issue about logging")?.kind).toBe("issue");
    expect(detectKeyword("Grok make a PR for dark mode")?.kind).toBe("pr");
  });

  it("accepts STT aliases for the wake word", () => {
    expect(detectKeyword("hey team rock make an issue about the login bug")?.kind).toBe("issue");
    expect(detectKeyword("okay groc make a PR for dark mode")?.kind).toBe("pr");
    expect(detectKeyword("please brock make a pull request now")?.kind).toBe("pr");
  });

  it("accepts 1-edit misspellings of grok", () => {
    expect(detectKeyword("grot make an issue please")?.kind).toBe("issue");
  });

  it("does not treat go or make-only phrases as a wake word", () => {
    expect(detectKeyword("go make a PR for dark mode")).toBeNull();
    expect(detectKeyword("let's make an issue about logging")).toBeNull();
  });
});

describe("detectAllKeywords", () => {
  it("returns every match in order with distinct source spans", () => {
    const text =
      "uh grok um make an issue please then grok make a PR for the fix";
    const matches = detectAllKeywords(text);
    expect(matches.map((m) => m.kind)).toEqual(["issue", "pr"]);
    expect(matches[0]?.phrase).toBe("grok make an issue");
    expect(matches[1]?.phrase).toBe("grok make a pr");
    expect(matches[0]!.sourceEnd).toBeLessThanOrEqual(matches[1]!.sourceStart);
    expect(text.slice(matches[0]!.sourceStart, matches[0]!.sourceEnd).toLowerCase()).toMatch(
      /grok[\s\S]*issue/,
    );
    expect(text.slice(matches[1]!.sourceStart, matches[1]!.sourceEnd).toLowerCase()).toMatch(
      /grok[\s\S]*pr/,
    );
  });

  it("does not overlap shorter PR variants", () => {
    const matches = detectAllKeywords("please grok make a pull request now");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.kind).toBe("pr");
    expect(matches[0]?.phrase).toBe("grok make a pull request");
  });

  it("returns empty when absent", () => {
    expect(detectAllKeywords("let's talk about the roadmap")).toEqual([]);
  });

  it("canonicalizes mixed STT aliases to grok phrases", () => {
    const matches = detectAllKeywords(
      "uh rock um make an issue please then brock make a PR for the fix",
    );
    expect(matches.map((m) => m.kind)).toEqual(["issue", "pr"]);
    expect(matches[0]?.phrase).toBe("grok make an issue");
    expect(matches[1]?.phrase).toBe("grok make a pr");
  });

  it("gives two issue mentions different spans", () => {
    const text =
      "First, grok make an issue about logging. Later, grok make an issue about auth.";
    const matches = detectAllKeywords(text);
    expect(matches).toHaveLength(2);
    expect(matches[0]!.sourceStart).not.toBe(matches[1]!.sourceStart);
    expect(matches[0]!.sourceEnd).toBeLessThanOrEqual(matches[1]!.sourceStart);
  });

  it("maps STT alias spans back to the spoken wake token", () => {
    const text = "please rock make an issue about auth";
    const matches = detectAllKeywords(text);
    expect(matches).toHaveLength(1);
    const span = text.slice(matches[0]!.sourceStart, matches[0]!.sourceEnd);
    expect(span.toLowerCase()).toContain("rock");
    expect(span.toLowerCase()).toContain("issue");
  });
});

describe("isGrokWakeWord", () => {
  it("accepts grok, listed aliases, and 1-edit variants", () => {
    expect(isGrokWakeWord("grok")).toBe(true);
    expect(isGrokWakeWord("GROK")).toBe(true);
    expect(isGrokWakeWord("rock")).toBe(true);
    expect(isGrokWakeWord("groc")).toBe(true);
    expect(isGrokWakeWord("brock")).toBe(true);
    expect(isGrokWakeWord("grot")).toBe(true);
  });

  it("rejects common words that are not close to grok", () => {
    expect(isGrokWakeWord("go")).toBe(false);
    expect(isGrokWakeWord("ok")).toBe(false);
    expect(isGrokWakeWord("make")).toBe(false);
    expect(isGrokWakeWord("issue")).toBe(false);
  });
});

describe("rollingWindow", () => {
  it("keeps the tail", () => {
    const text = "a".repeat(1000);
    expect(rollingWindow(text, 100).length).toBe(100);
  });
});
