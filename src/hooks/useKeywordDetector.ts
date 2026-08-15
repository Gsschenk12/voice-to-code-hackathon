"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectAllKeywords } from "@/lib/keywords";
import { buildFocusedTranscript } from "@/lib/pipeline/trigger-focus";
import type { CommandKind } from "@/types/meeting";

/** Debounce only: avoid re-firing the same mention while ASR is still settling. */
const COOLDOWN_MS = 1_500;

type DetectedCommand = {
  kind: CommandKind;
  phrase: string;
  transcriptWindow: string;
  at: number;
};

type UseKeywordDetectorOptions = {
  transcript: string;
  enabled?: boolean;
  onDetect?: (command: DetectedCommand) => void;
  cooldownMs?: number;
};

export function useKeywordDetector({
  transcript,
  enabled = true,
  onDetect,
  cooldownMs = COOLDOWN_MS,
}: UseKeywordDetectorOptions) {
  const [lastMatch, setLastMatch] = useState<DetectedCommand | null>(null);
  const firedCount = useRef(0);
  const lastFiredAt = useRef(0);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const reset = useCallback(() => {
    firedCount.current = 0;
    lastFiredAt.current = 0;
    setLastMatch(null);
  }, []);

  useEffect(() => {
    if (!enabled || !transcript) return;

    const matches = detectAllKeywords(transcript);
    if (matches.length <= firedCount.current) return;

    const now = Date.now();
    if (now - lastFiredAt.current < cooldownMs) return;

    const nextIndex = firedCount.current;
    const match = matches[nextIndex];
    if (!match) return;

    firedCount.current = nextIndex + 1;
    lastFiredAt.current = now;

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
    setLastMatch(command);
    onDetectRef.current?.(command);
  }, [transcript, enabled, cooldownMs]);

  return { lastMatch, reset };
}
