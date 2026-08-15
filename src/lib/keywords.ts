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

const FILLER = /\b(um|uh|like|you know|basically|actually)\b/g;

export type NormalizedAlignment = {
  normalized: string;
  /** sourceIndex[i] = original index of normalized[i]. */
  sourceIndex: number[];
};

/**
 * Same normalization as normalizeTranscript, plus a map from each normalized
 * character back to its index in the original string.
 */
export function normalizeWithAlignment(text: string): NormalizedAlignment {
  const chars: string[] = [];
  const indices: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const lower = text[i]!.toLowerCase();
    if (/[\p{L}\p{N}\s]/u.test(lower)) {
      chars.push(lower);
      indices.push(i);
    } else {
      chars.push(" ");
      indices.push(i);
    }
  }

  const joined = chars.join("");
  const filled = chars.slice();
  FILLER.lastIndex = 0;
  let fillerMatch: RegExpExecArray | null;
  while ((fillerMatch = FILLER.exec(joined)) !== null) {
    for (let j = fillerMatch.index; j < fillerMatch.index + fillerMatch[0].length; j++) {
      filled[j] = " ";
    }
  }

  const outChars: string[] = [];
  const outIndices: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < filled.length; i++) {
    const c = filled[i]!;
    if (/\s/.test(c)) {
      if (lastWasSpace) continue;
      lastWasSpace = true;
      outChars.push(" ");
      outIndices.push(indices[i]!);
    } else {
      lastWasSpace = false;
      outChars.push(c);
      outIndices.push(indices[i]!);
    }
  }
  while (outChars.length > 0 && outChars[outChars.length - 1] === " ") {
    outChars.pop();
    outIndices.pop();
  }

  return { normalized: outChars.join(""), sourceIndex: outIndices };
}

/** Normalize transcript for fuzzy wake-phrase matching. */
export function normalizeTranscript(text: string): string {
  return normalizeWithAlignment(text).normalized;
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

/**
 * Rewrite STT wake-word aliases to "grok" while keeping source indices that
 * still span the original spoken token (so tags cover "rock" / "brock").
 */
function canonicalizeWakeWordsWithAlignment(
  alignment: NormalizedAlignment,
): NormalizedAlignment {
  const { normalized, sourceIndex } = alignment;
  if (!normalized) return alignment;

  const outChars: string[] = [];
  const outIndices: number[] = [];
  const tokenRe = /\b[\p{L}\p{N}]+\b/gu;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(normalized)) !== null) {
    for (let i = last; i < match.index; i++) {
      outChars.push(normalized[i]!);
      outIndices.push(sourceIndex[i]!);
    }

    const token = match[0];
    const tokenStart = match.index;
    const tokenEnd = match.index + token.length;
    const replacement = isGrokWakeWord(token) ? "grok" : token;

    for (let i = 0; i < replacement.length; i++) {
      const srcPos =
        i === replacement.length - 1
          ? tokenEnd - 1
          : tokenStart + Math.min(i, token.length - 1);
      outChars.push(replacement[i]!);
      outIndices.push(sourceIndex[srcPos]!);
    }

    last = tokenEnd;
  }

  for (let i = last; i < normalized.length; i++) {
    outChars.push(normalized[i]!);
    outIndices.push(sourceIndex[i]!);
  }

  return { normalized: outChars.join(""), sourceIndex: outIndices };
}

function prepareForMatchWithAlignment(text: string): NormalizedAlignment {
  return canonicalizeWakeWordsWithAlignment(normalizeWithAlignment(text));
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

function spanFromAlignment(
  alignment: NormalizedAlignment,
  normalizedStart: number,
  phraseLength: number,
): { sourceStart: number; sourceEnd: number } {
  const last = normalizedStart + phraseLength - 1;
  const sourceStart = alignment.sourceIndex[normalizedStart] ?? 0;
  const sourceEnd =
    last >= 0 && last < alignment.sourceIndex.length
      ? alignment.sourceIndex[last]! + 1
      : sourceStart;
  return { sourceStart, sourceEnd };
}

function nextMatch(
  alignment: NormalizedAlignment,
  fromIndex: number,
): KeywordMatch | null {
  const slice = alignment.normalized.slice(fromIndex);
  if (!slice) return null;

  let best: { kind: CommandKind; phrase: string; index: number } | null = null;
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

  const index = fromIndex + best.index;
  const { sourceStart, sourceEnd } = spanFromAlignment(alignment, index, best.phrase.length);
  return {
    kind: best.kind,
    phrase: best.phrase,
    index,
    sourceStart,
    sourceEnd,
  };
}

/**
 * Scan a rolling transcript window for wake phrases.
 * Prefers PR matches when both could apply (more specific patterns listed first).
 */
export function detectKeyword(transcriptWindow: string): KeywordMatch | null {
  const matches = detectAllKeywords(transcriptWindow);
  return matches[0] ?? null;
}

/**
 * Find every wake phrase left-to-right. Matches do not overlap.
 * At the same position, PR patterns win (listed first, more specific).
 * sourceStart/sourceEnd are spans in the original `transcript` string.
 * STT aliases for "grok" are canonicalized before matching.
 */
export function detectAllKeywords(transcript: string): KeywordMatch[] {
  const alignment = prepareForMatchWithAlignment(transcript);
  if (!alignment.normalized) return [];

  const matches: KeywordMatch[] = [];
  let fromIndex = 0;
  while (fromIndex < alignment.normalized.length) {
    const match = nextMatch(alignment, fromIndex);
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
