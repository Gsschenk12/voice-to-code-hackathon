import { detectAllKeywords, rollingWindow } from "@/lib/keywords";
import type { ScannedTrigger } from "@/lib/triggers/types";

const TRANSCRIPT_MARKER = "## Transcript";

/** Drop meeting metadata so summary text cannot false-positive as a wake phrase. */
export function extractTranscriptBody(raw: string): string {
  const idx = raw.indexOf(TRANSCRIPT_MARKER);
  if (idx === -1) return raw.trim();
  return raw.slice(idx + TRANSCRIPT_MARKER.length).trim();
}

function splitUtterances(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Find every wake phrase in order. Each hit gets a local window: the utterance
 * that contains it plus preceding text, capped to match rollingWindow.
 */
export function scanTriggers(text: string, maxWindowChars = 800): ScannedTrigger[] {
  const body = extractTranscriptBody(text);
  const utterances = splitUtterances(body);
  const triggers: ScannedTrigger[] = [];

  for (let i = 0; i < utterances.length; i++) {
    const matches = detectAllKeywords(utterances[i]);
    if (matches.length === 0) continue;

    const throughCurrent = utterances.slice(0, i + 1).join("\n\n");
    const transcriptWindow = rollingWindow(throughCurrent, maxWindowChars);

    for (const match of matches) {
      triggers.push({
        kind: match.kind,
        phrase: match.phrase,
        transcriptWindow,
      });
    }
  }

  return triggers;
}
