/**
 * Pin a pipeline run to one wake-phrase mention: label earlier speech as
 * background, tag the triggering phrase, and instruct Grok to use only that request.
 */

export const TRIGGER_FOCUS_MAX_CHARS = 800;
export const TRIGGER_FOCUS_LEAD_IN = 300;
export const TRIGGER_FOCUS_TAIL = 120;

/** Shared instruction for match / draft / context / PR plan prompts. */
export const TRIGGER_FOCUS_INSTRUCTION = [
  "The transcript may include earlier discussion and previous wake phrases.",
  "The current command is only the wake phrase wrapped in >>> ... <<< and the",
  '"This request" section. Treat earlier wake phrases as previous commands —',
  "do not mix them into this request. Use earlier discussion only as background.",
].join(" ");

export type FocusMatch = {
  phrase: string;
  sourceStart: number;
  sourceEnd: number;
};

export type BuildFocusedTranscriptParams = {
  transcript: string;
  /** The wake-phrase mention this pipeline run is for. */
  match: FocusMatch;
  /** Prior wake-phrase mentions in the same transcript (earlier only). */
  previousMatches?: FocusMatch[];
  maxChars?: number;
  leadInChars?: number;
  tailChars?: number;
};

/**
 * Build a labeled transcript window for one wake-phrase mention.
 * Tags the phrase with >>> ... <<< and prefers the "This request" section
 * when trimming to maxChars.
 */
export function buildFocusedTranscript(params: BuildFocusedTranscriptParams): string {
  const {
    transcript,
    match,
    previousMatches = [],
    maxChars = TRIGGER_FOCUS_MAX_CHARS,
    leadInChars = TRIGGER_FOCUS_LEAD_IN,
    tailChars = TRIGGER_FOCUS_TAIL,
  } = params;

  const start = Math.max(0, Math.min(match.sourceStart, transcript.length));
  const end = Math.max(start, Math.min(match.sourceEnd, transcript.length));

  const priorWake = previousMatches
    .filter((m) => m.sourceEnd <= start)
    .sort((a, b) => b.sourceEnd - a.sourceEnd)[0];

  const requestStart = priorWake
    ? priorWake.sourceEnd
    : Math.max(0, start - leadInChars);
  const requestEnd = Math.min(transcript.length, end + tailChars);

  const earlierRaw = transcript.slice(0, requestStart).trim();
  const beforePhrase = transcript.slice(requestStart, start);
  const phraseText = transcript.slice(start, end);
  const afterPhrase = transcript.slice(end, requestEnd);
  const thisRequestBody = `${beforePhrase}>>> ${phraseText} <<<${afterPhrase}`.trim();

  const earlierBlock = earlierRaw
    ? [
        "Earlier discussion (background only; previous wake phrases are other requests):",
        earlierRaw,
      ].join("\n")
    : "";

  const thisBlock = ["This request (use this):", thisRequestBody || `(empty; tagged phrase: >>> ${match.phrase} <<<)`].join(
    "\n",
  );

  if (!earlierBlock) {
    return trimThisRequestBlock(thisBlock, maxChars);
  }

  const combined = `${earlierBlock}\n\n${thisBlock}`;
  if (combined.length <= maxChars) return combined;

  // Prefer keeping the full "This request" section; trim earlier from the front.
  const budgetForEarlier = maxChars - thisBlock.length - 2;
  if (budgetForEarlier < 40) {
    return trimThisRequestBlock(thisBlock, maxChars);
  }

  const earlierHeader =
    "Earlier discussion (background only; previous wake phrases are other requests):\n";
  const earlierBudget = budgetForEarlier - earlierHeader.length;
  const trimmedEarlier =
    earlierRaw.length <= earlierBudget
      ? earlierRaw
      : `…${earlierRaw.slice(-(earlierBudget - 1))}`;

  return `${earlierHeader}${trimmedEarlier}\n\n${thisBlock}`;
}

const THIS_REQUEST_HEADER = "This request (use this):\n";

function trimThisRequestBlock(thisBlock: string, maxChars: number): string {
  if (thisBlock.length <= maxChars) return thisBlock;
  if (!thisBlock.startsWith(THIS_REQUEST_HEADER)) {
    return trimPreferringEnd(thisBlock, maxChars);
  }
  const body = thisBlock.slice(THIS_REQUEST_HEADER.length);
  const bodyBudget = maxChars - THIS_REQUEST_HEADER.length;
  if (bodyBudget < 24) return trimPreferringEnd(thisBlock, maxChars);
  const trimmedBody =
    body.length <= bodyBudget ? body : `…${body.slice(-(bodyBudget - 1))}`;
  return `${THIS_REQUEST_HEADER}${trimmedBody}`;
}

function trimPreferringEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `…${text.slice(-(maxChars - 1))}`;
}
