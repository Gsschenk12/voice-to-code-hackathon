"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectAllKeywords } from "@/lib/keywords";
import { buildFocusedTranscript } from "@/lib/pipeline/trigger-focus";
import type { CommandKind } from "@/types/meeting";

/** Debounce only: avoid re-firing the same mention while ASR is still settling. */
const COOLDOWN_MS = 1_500;

export type DetectedCommand = {
  kind: CommandKind;
  phrase: string;
  transcriptWindow: string;
  at: number;
};

export type KeywordFireState = {
  firedCount: number;
  lastFiredAt: number;
};

type UseKeywordDetectorOptions = {
  transcript: string;
  enabled?: boolean;
  onDetect?: (command: DetectedCommand) => void;
  cooldownMs?: number;
  /**
   * Skip the first N keyword matches already present in a restored transcript
   * so refresh does not re-launch commands.
   */
  initialFiredCount?: number;
};

/**
 * Fire the next unmatched wake phrase when cooldown allows.
 * Returns null when nothing is ready (no matches left, or still cooling down).
 * When cooling down with pending matches, `retryAfterMs` is set so the caller
 * can schedule a drain without waiting for more transcript.
 */
export function tryFireNextKeyword(params: {
  transcript: string;
  state: KeywordFireState;
  now: number;
  cooldownMs: number;
}): {
  command: DetectedCommand | null;
  state: KeywordFireState;
  remaining: number;
  retryAfterMs: number | null;
} {
  const { transcript, now, cooldownMs } = params;
  let { firedCount, lastFiredAt } = params.state;

  const matches = detectAllKeywords(transcript);
  const remaining = Math.max(0, matches.length - firedCount);
  if (remaining === 0) {
    return { command: null, state: { firedCount, lastFiredAt }, remaining: 0, retryAfterMs: null };
  }

  const elapsed = now - lastFiredAt;
  if (lastFiredAt > 0 && elapsed < cooldownMs) {
    return {
      command: null,
      state: { firedCount, lastFiredAt },
      remaining,
      retryAfterMs: cooldownMs - elapsed,
    };
  }

  const nextIndex = firedCount;
  const match = matches[nextIndex];
  if (!match) {
    return { command: null, state: { firedCount, lastFiredAt }, remaining: 0, retryAfterMs: null };
  }

  firedCount = nextIndex + 1;
  lastFiredAt = now;

  const previousMatches = matches.slice(0, nextIndex).map((m) => ({
    phrase: m.phrase,
    sourceStart: m.sourceStart,
    sourceEnd: m.sourceEnd,
  }));

  const command: DetectedCommand = {
    kind: match.kind,
    phrase: match.phrase,
    transcriptWindow: buildFocusedTranscript({
      transcript,
      match: {
        phrase: match.phrase,
        sourceStart: match.sourceStart,
        sourceEnd: match.sourceEnd,
      },
      previousMatches,
    }),
    at: now,
  };

  const stillRemaining = Math.max(0, matches.length - firedCount);
  return {
    command,
    state: { firedCount, lastFiredAt },
    remaining: stillRemaining,
    retryAfterMs: stillRemaining > 0 ? cooldownMs : null,
  };
}

export function useKeywordDetector({
  transcript,
  enabled = true,
  onDetect,
  cooldownMs = COOLDOWN_MS,
  initialFiredCount = 0,
}: UseKeywordDetectorOptions) {
  const [lastMatch, setLastMatch] = useState<DetectedCommand | null>(null);
  const firedCount = useRef(initialFiredCount);
  const lastFiredAt = useRef(0);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialFiredCount > firedCount.current) {
      firedCount.current = initialFiredCount;
    }
  }, [initialFiredCount]);

  const clearDrainTimer = useCallback(() => {
    if (drainTimerRef.current != null) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearDrainTimer();
    firedCount.current = 0;
    lastFiredAt.current = 0;
    setLastMatch(null);
  }, [clearDrainTimer]);

  useEffect(() => {
    if (!enabled || !transcript) {
      clearDrainTimer();
      return;
    }

    const fireOnce = () => {
      const result = tryFireNextKeyword({
        transcript: transcriptRef.current,
        state: {
          firedCount: firedCount.current,
          lastFiredAt: lastFiredAt.current,
        },
        now: Date.now(),
        cooldownMs,
      });

      firedCount.current = result.state.firedCount;
      lastFiredAt.current = result.state.lastFiredAt;

      if (result.command) {
        setLastMatch(result.command);
        onDetectRef.current?.(result.command);
      }

      clearDrainTimer();
      if (result.retryAfterMs != null && result.retryAfterMs > 0) {
        drainTimerRef.current = setTimeout(fireOnce, result.retryAfterMs);
      }
    };

    fireOnce();

    return () => {
      clearDrainTimer();
    };
  }, [transcript, enabled, cooldownMs, clearDrainTimer]);

  return { lastMatch, reset };
}

/** Pure helper for tests and hydrate seeding. */
export function keywordMatchCount(transcript: string): number {
  return detectAllKeywords(transcript).length;
}
