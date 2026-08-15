"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectKeyword, rollingWindow } from "@/lib/keywords";
import type { CommandKind } from "@/types/meeting";

const COOLDOWN_MS = 12_000;

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
  const lastFiredAt = useRef(0);
  const lastPhrase = useRef<string | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const reset = useCallback(() => {
    lastFiredAt.current = 0;
    lastPhrase.current = null;
    setLastMatch(null);
  }, []);

  useEffect(() => {
    if (!enabled || !transcript) return;

    const windowText = rollingWindow(transcript);
    const match = detectKeyword(windowText);
    if (!match) return;

    const now = Date.now();
    const samePhrase = lastPhrase.current === match.phrase;
    if (samePhrase && now - lastFiredAt.current < cooldownMs) return;
    if (!samePhrase && now - lastFiredAt.current < cooldownMs / 2) return;

    lastFiredAt.current = now;
    lastPhrase.current = match.phrase;

    const command: DetectedCommand = {
      kind: match.kind,
      phrase: match.phrase,
      transcriptWindow: windowText,
      at: now,
    };
    setLastMatch(command);
    onDetectRef.current?.(command);
  }, [transcript, enabled, cooldownMs]);

  return { lastMatch, reset };
}
