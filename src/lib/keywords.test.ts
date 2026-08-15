import { describe, expect, it } from "vitest";
import {
  detectAllKeywords,
  detectKeyword,
  normalizeTranscript,
  rollingWindow,
} from "@/lib/keywords";

describe("normalizeTranscript", () => {
  it("lowercases and strips filler", () => {
    expect(normalizeTranscript("Um, Grok, like, make an issue!")).toBe("grok make an issue");
  });
});

describe("detectKeyword", () => {
  it("detects issue phrase", () => {
    const match = detectKeyword("hey team grok make an issue about the login bug");
    expect(match?.kind).toBe("issue");
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
});

describe("detectAllKeywords", () => {
  it("returns every match in order", () => {
    const matches = detectAllKeywords(
      "uh grok um make an issue please then grok make a PR for the fix",
    );
    expect(matches.map((m) => m.kind)).toEqual(["issue", "pr"]);
    expect(matches[0]?.phrase).toBe("grok make an issue");
    expect(matches[1]?.phrase).toBe("grok make a pr");
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
});

describe("rollingWindow", () => {
  it("keeps the tail", () => {
    const text = "a".repeat(1000);
    expect(rollingWindow(text, 100).length).toBe(100);
  });
});
