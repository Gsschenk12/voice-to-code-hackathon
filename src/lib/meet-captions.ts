/** A single visible caption row from Meet's DOM snapshot. */
export type CaptionRow = {
  speaker: string;
  text: string;
};

export type MeetCaptionMergeState = {
  /** Fully committed turns (stable). */
  finalized: CaptionRow[];
  /** In-progress turn being rewritten by Meet. */
  active: CaptionRow | null;
  /** How many consecutive unchanged polls we've seen for `active`. */
  stablePolls: number;
  /** Last snapshot signature for change detection. */
  lastKey: string;
};

export type MergeOptions = {
  /** Polls without change before committing active turn. Default 4 (~4s at 1s poll). */
  stabilityPolls?: number;
};

const DEFAULT_STABILITY_POLLS = 4;

export function createMeetCaptionMergeState(): MeetCaptionMergeState {
  return {
    finalized: [],
    active: null,
    stablePolls: 0,
    lastKey: "",
  };
}

function normalizeRow(row: CaptionRow): CaptionRow {
  return {
    speaker: (row.speaker || "").trim(),
    text: (row.text || "").trim(),
  };
}

function rowKey(row: CaptionRow | null): string {
  if (!row) return "";
  return `${row.speaker}\0${row.text}`;
}

function snapshotKey(rows: CaptionRow[]): string {
  return JSON.stringify(rows.map(normalizeRow));
}

/**
 * True when `next` looks like an interim rewrite of `prev` (same speaker,
 * and text grows or is a close rewrite of the same utterance).
 */
export function isInterimUpdate(prev: CaptionRow, next: CaptionRow): boolean {
  if (prev.speaker !== next.speaker) return false;
  if (!prev.text) return true;
  if (!next.text) return false;
  // Meet usually extends the in-progress sentence
  if (next.text.startsWith(prev.text)) return true;
  if (prev.text.startsWith(next.text)) return true;
  // Soft rewrite: shared prefix of at least half the shorter string
  const minLen = Math.min(prev.text.length, next.text.length);
  if (minLen < 8) return false;
  let shared = 0;
  while (shared < minLen && prev.text[shared] === next.text[shared]) shared++;
  return shared >= Math.floor(minLen * 0.5);
}

function commitActive(state: MeetCaptionMergeState): void {
  if (!state.active?.text) {
    state.active = null;
    state.stablePolls = 0;
    return;
  }
  const last = state.finalized[state.finalized.length - 1];
  if (
    last &&
    last.speaker === state.active.speaker &&
    last.text === state.active.text
  ) {
    // Exact duplicate — skip
  } else {
    state.finalized.push({ ...state.active });
  }
  state.active = null;
  state.stablePolls = 0;
}

/**
 * Apply a Meet caption region snapshot to merge state.
 * Meet rewrites the live sentence in place — do not append every mutation.
 */
export function applyCaptionSnapshot(
  state: MeetCaptionMergeState,
  rows: CaptionRow[],
  options: MergeOptions = {},
): MeetCaptionMergeState {
  const stabilityPolls = options.stabilityPolls ?? DEFAULT_STABILITY_POLLS;
  const normalized = rows.map(normalizeRow).filter((r) => r.text);
  const key = snapshotKey(normalized);

  if (key === state.lastKey) {
    if (state.active) {
      state.stablePolls += 1;
      if (state.stablePolls >= stabilityPolls) {
        commitActive(state);
      }
    }
    return state;
  }

  state.lastKey = key;
  state.stablePolls = 0;

  if (normalized.length === 0) {
    // Region empty / captions toggled off — keep finalized, clear active
    if (state.active) commitActive(state);
    return state;
  }

  // Meet typically shows a short rolling window; treat the last row as active
  // and any prior rows as candidates already visible (may include committed).
  const visibleActive = normalized[normalized.length - 1]!;
  const visiblePrior = normalized.slice(0, -1);

  // Seed finalized from prior visible rows that aren't already there
  for (const row of visiblePrior) {
    const exists = state.finalized.some(
      (f) => f.speaker === row.speaker && f.text === row.text,
    );
    if (!exists) {
      // If this matches / extends current active, commit active first as this row
      if (state.active && isInterimUpdate(state.active, row)) {
        state.active = row;
        commitActive(state);
      } else if (
        state.active &&
        (state.active.speaker !== row.speaker ||
          !isInterimUpdate(state.active, row))
      ) {
        commitActive(state);
        if (
          !state.finalized.some(
            (f) => f.speaker === row.speaker && f.text === row.text,
          )
        ) {
          state.finalized.push({ ...row });
        }
      } else if (!state.active) {
        state.finalized.push({ ...row });
      }
    }
  }

  if (!state.active) {
    state.active = { ...visibleActive };
    return state;
  }

  if (isInterimUpdate(state.active, visibleActive)) {
    state.active = { ...visibleActive };
    return state;
  }

  // Speaker change or divergent text → commit and start new turn
  commitActive(state);
  state.active = { ...visibleActive };
  return state;
}

/** Render speaker-attributed transcript for keyword detection + UI. */
export function formatMeetTranscript(state: MeetCaptionMergeState): string {
  const lines: string[] = [];
  for (const row of state.finalized) {
    lines.push(formatLine(row));
  }
  if (state.active?.text) {
    lines.push(formatLine(state.active));
  }
  return lines.join("\n");
}

function formatLine(row: CaptionRow): string {
  const speaker = row.speaker.trim();
  if (speaker) return `${speaker}: ${row.text}`;
  return row.text;
}

/** Convenience: apply snapshot and return updated transcript string. */
export function mergeCaptionSnapshot(
  state: MeetCaptionMergeState,
  rows: CaptionRow[],
  options?: MergeOptions,
): { state: MeetCaptionMergeState; transcript: string } {
  applyCaptionSnapshot(state, rows, options);
  return { state, transcript: formatMeetTranscript(state) };
}

/** Exported for tests — snapshot identity helper. */
export function captionSnapshotKey(rows: CaptionRow[]): string {
  return snapshotKey(rows.map(normalizeRow));
}

/** Exported for tests — row identity. */
export function captionRowKey(row: CaptionRow | null): string {
  return rowKey(row ? normalizeRow(row) : null);
}
