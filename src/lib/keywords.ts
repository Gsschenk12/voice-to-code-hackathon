import type { CommandKind, KeywordMatch } from "@/types/meeting";

/** Normalize transcript for fuzzy wake-phrase matching. */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(um|uh|like|you know|basically|actually)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PHRASES: Array<{ kind: CommandKind; patterns: RegExp[] }> = [
  {
    kind: "pr",
    patterns: [
      /\bgrok\s+make\s+a\s+pull\s+request\b/,
      /\bgrok\s+make\s+a\s+pr\b/,
      /\bgrok\s+make\s+pr\b/,
    ],
  },
  {
    kind: "issue",
    patterns: [/\bgrok\s+make\s+an\s+issue\b/, /\bgrok\s+make\s+a\s+issue\b/, /\bgrok\s+make\s+issue\b/],
  },
];

function nextMatch(normalized: string, fromIndex: number): KeywordMatch | null {
  const slice = normalized.slice(fromIndex);
  if (!slice) return null;

  let best: KeywordMatch | null = null;
  for (const { kind, patterns } of PHRASES) {
    for (const pattern of patterns) {
      const match = slice.match(pattern);
      if (match?.index == null) continue;
      if (best && match.index >= best.index) continue;
      best = {
        kind,
        phrase: match[0],
        index: match.index,
      };
    }
  }
  if (!best) return null;
  return { ...best, index: fromIndex + best.index };
}

/**
 * Scan a rolling transcript window for wake phrases.
 * Prefers PR matches when both could apply (more specific patterns listed first).
 */
export function detectKeyword(transcriptWindow: string): KeywordMatch | null {
  const normalized = normalizeTranscript(transcriptWindow);
  if (!normalized) return null;

  for (const { kind, patterns } of PHRASES) {
    for (const pattern of patterns) {
      const match = pattern.exec(normalized);
      if (match) {
        return {
          kind,
          phrase: match[0],
          index: match.index,
        };
      }
    }
  }
  return null;
}

/**
 * Find every wake phrase left-to-right. Matches do not overlap.
 * At the same position, PR patterns win (listed first, more specific).
 */
export function detectAllKeywords(transcript: string): KeywordMatch[] {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return [];

  const matches: KeywordMatch[] = [];
  let fromIndex = 0;
  while (fromIndex < normalized.length) {
    const match = nextMatch(normalized, fromIndex);
    if (!match) break;
    matches.push(match);
    fromIndex = match.index + match.phrase.length;
  }
  return matches;
}

/** Keep the last N characters of transcript for keyword scanning. */
export function rollingWindow(fullTranscript: string, maxChars = 800): string {
  if (fullTranscript.length <= maxChars) return fullTranscript;
  return fullTranscript.slice(-maxChars);
}
