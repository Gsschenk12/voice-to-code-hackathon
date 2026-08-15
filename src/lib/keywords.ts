import type { CommandKind, KeywordMatch } from "@/types/meeting";

/** Known STT / phonetic stand-ins for the "grok" wake token. */
const GROK_ALIASES = new Set([
  "grok",
  "grock",
  "groc",
  "groq",
  "grog",
  "rock",
  "rok",
  "brock",
  "broc",
  "brok",
  "croak",
  "croc",
  "crock",
  "gawk",
  "growk",
  "grawk",
]);

/** Normalize transcript for fuzzy wake-phrase matching. */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(um|uh|like|you know|basically|actually)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

/** True when a token is "grok" or a close STT misspelling of it. */
export function isGrokWakeWord(token: string): boolean {
  const t = token.toLowerCase();
  if (GROK_ALIASES.has(t)) return true;
  return t.length >= 3 && t.length <= 6 && editDistance(t, "grok") <= 1;
}

function canonicalizeWakeWords(normalized: string): string {
  return normalized.replace(/\b[\p{L}\p{N}]+\b/gu, (token) =>
    isGrokWakeWord(token) ? "grok" : token,
  );
}

function prepareForMatch(text: string): string {
  const normalized = normalizeTranscript(text);
  if (!normalized) return "";
  return canonicalizeWakeWords(normalized);
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
  const normalized = prepareForMatch(transcriptWindow);
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
  const normalized = prepareForMatch(transcript);
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
