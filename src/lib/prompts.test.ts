import { describe, expect, it } from "vitest";
import { buildPrPlanPrompt } from "@/lib/prompts";
import { TRIGGER_FOCUS_INSTRUCTION } from "@/lib/pipeline/trigger-focus";

describe("buildPrPlanPrompt", () => {
  it("includes focus instructions", () => {
    const prompt = buildPrPlanPrompt({
      repoUrl: "https://github.com/acme/app",
      transcriptWindow: "This request (use this):\n>>> grok make a pr <<< for logging",
      issue: {
        number: 12,
        title: "Add logging",
        url: "https://github.com/acme/app/issues/12",
        body: "Need request IDs.",
      },
    });

    expect(prompt).toContain(TRIGGER_FOCUS_INSTRUCTION);
    expect(prompt).toContain("tagged current request");
    expect(prompt).toContain("#12");
  });
});
