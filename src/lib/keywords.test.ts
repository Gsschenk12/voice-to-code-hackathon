import { describe, expect, it } from "vitest";
import { detectKeyword, normalizeTranscript, rollingWindow } from "@/lib/keywords";

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

describe("rollingWindow", () => {
  it("keeps the tail", () => {
    const text = "a".repeat(1000);
    expect(rollingWindow(text, 100).length).toBe(100);
  });
});
