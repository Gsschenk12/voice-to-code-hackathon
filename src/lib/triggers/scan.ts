import { detectAllKeywords } from "@/lib/keywords";
import { buildFocusedTranscript } from "@/lib/pipeline/trigger-focus";
import type { ScannedTrigger } from "@/lib/triggers/types";

const TRANSCRIPT_MARKER = "## Transcript";

/** Drop meeting metadata so summary text cannot false-positive as a wake phrase. */
export function extractTranscriptBody(raw: string): string {
  const idx = raw.indexOf(TRANSCRIPT_MARKER);
  if (idx === -1) return raw.trim();
  return raw.slice(idx + TRANSCRIPT_MARKER.length).trim();
}

/**
 * Find every wake phrase in order. Each hit gets a focused transcript window
 * pinned to that mention (tagged phrase + labeled earlier discussion).
 */
export function scanTriggers(text: string, maxWindowChars = 800): ScannedTrigger[] {
  const body = extractTranscriptBody(text);
  const matches = detectAllKeywords(body);
  const triggers: ScannedTrigger[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const previousMatches = matches.slice(0, i).map((m) => ({
      phrase: m.phrase,
      sourceStart: m.sourceStart,
      sourceEnd: m.sourceEnd,
    }));

    triggers.push({
      kind: match.kind,
      phrase: match.phrase,
      transcriptWindow: buildFocusedTranscript({
        transcript: body,
        match: {
          phrase: match.phrase,
          sourceStart: match.sourceStart,
          sourceEnd: match.sourceEnd,
        },
        previousMatches,
        maxChars: maxWindowChars,
      }),
    });
  }

  return triggers;
}
