import { describe, expect, it } from "vitest";
import {
  applyCaptionSnapshot,
  createMeetCaptionMergeState,
  formatMeetTranscript,
  isInterimUpdate,
  mergeCaptionSnapshot,
} from "@/lib/meet-captions";

describe("isInterimUpdate", () => {
  it("treats growing text from the same speaker as interim", () => {
    expect(
      isInterimUpdate(
        { speaker: "Alice", text: "hello" },
        { speaker: "Alice", text: "hello world" },
      ),
    ).toBe(true);
  });

  it("rejects speaker changes", () => {
    expect(
      isInterimUpdate(
        { speaker: "Alice", text: "hello" },
        { speaker: "Bob", text: "hello there" },
      ),
    ).toBe(false);
  });

  it("accepts soft rewrites with a long shared prefix", () => {
    expect(
      isInterimUpdate(
        { speaker: "Alice", text: "mic, so that's a new" },
        { speaker: "Alice", text: "mic, so that's a new person. Okay." },
      ),
    ).toBe(true);
  });
});

describe("applyCaptionSnapshot", () => {
  it("updates active turn while Meet rewrites the sentence", () => {
    const state = createMeetCaptionMergeState();
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "mic, so," }]);
    applyCaptionSnapshot(state, [
      { speaker: "Alice", text: "mic, So that's a new person. Okay." },
    ]);
    expect(state.finalized).toEqual([]);
    expect(state.active).toEqual({
      speaker: "Alice",
      text: "mic, So that's a new person. Okay.",
    });
    expect(formatMeetTranscript(state)).toBe(
      "Alice: mic, So that's a new person. Okay.",
    );
  });

  it("commits active turn when the speaker changes", () => {
    const state = createMeetCaptionMergeState();
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "file a bug" }]);
    applyCaptionSnapshot(state, [
      { speaker: "Alice", text: "file a bug" },
      { speaker: "Bob", text: "grok make an issue" },
    ]);
    expect(state.finalized).toEqual([{ speaker: "Alice", text: "file a bug" }]);
    expect(state.active).toEqual({
      speaker: "Bob",
      text: "grok make an issue",
    });
    expect(formatMeetTranscript(state)).toBe(
      "Alice: file a bug\nBob: grok make an issue",
    );
  });

  it("finalizes active after enough unchanged polls", () => {
    const state = createMeetCaptionMergeState();
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "done" }], {
      stabilityPolls: 2,
    });
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "done" }], {
      stabilityPolls: 2,
    });
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "done" }], {
      stabilityPolls: 2,
    });
    expect(state.finalized).toEqual([{ speaker: "Alice", text: "done" }]);
    expect(state.active).toBeNull();
  });

  it("does not duplicate exact finalized lines", () => {
    const state = createMeetCaptionMergeState();
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "one" }], {
      stabilityPolls: 1,
    });
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "one" }], {
      stabilityPolls: 1,
    });
    // Already finalized; same snapshot again should not re-add
    applyCaptionSnapshot(
      state,
      [
        { speaker: "Alice", text: "one" },
        { speaker: "Bob", text: "two" },
      ],
      { stabilityPolls: 1 },
    );
    const aliceLines = state.finalized.filter((r) => r.speaker === "Alice");
    expect(aliceLines).toHaveLength(1);
  });

  it("handles empty snapshots by committing active", () => {
    const state = createMeetCaptionMergeState();
    applyCaptionSnapshot(state, [{ speaker: "Alice", text: "hello" }]);
    applyCaptionSnapshot(state, []);
    expect(state.finalized).toEqual([{ speaker: "Alice", text: "hello" }]);
    expect(state.active).toBeNull();
  });

  it("formats lines without a speaker", () => {
    const { transcript } = mergeCaptionSnapshot(
      createMeetCaptionMergeState(),
      [{ speaker: "", text: "anonymous line" }],
    );
    expect(transcript).toBe("anonymous line");
  });
});
