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

/** Keep the last N characters of transcript for keyword scanning. */
export function rollingWindow(fullTranscript: string, maxChars = 800): string {
  if (fullTranscript.length <= maxChars) return fullTranscript;
  return fullTranscript.slice(-maxChars);
}
