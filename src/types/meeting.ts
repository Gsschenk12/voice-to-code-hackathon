export type CommandKind = "issue" | "pr";

/** Live capture source for the meeting page. */
export type CaptureSource = "meet";

export type KeywordMatch = {
  kind: CommandKind;
  phrase: string;
  /** Start index of the phrase in the normalized transcript. */
  index: number;
  /** Inclusive start of the phrase in the original (pre-normalize) text. */
  sourceStart: number;
  /** Exclusive end of the phrase in the original (pre-normalize) text. */
  sourceEnd: number;
};

export type MeetingAgent = {
  agentId: string;
  runId?: string;
  kind: CommandKind;
  status: string;
  summary?: string;
  prUrl?: string;
  branchName?: string;
  error?: string;
  createdAt: string;
  /** True while waiting for POST /api/commands; agentId is a local pending id. */
  pending?: boolean;
  /** Wake phrase that triggered this launch (shown on pending rows). */
  phrase?: string;
};

export type LaunchCommandRequest = {
  meetingId: string;
  kind: CommandKind;
  phrase?: string;
  transcriptWindow: string;
  repoUrl: string;
  startingRef?: string;
};

export type LaunchCommandResponse = {
  kind: CommandKind;
  agentId?: string;
  runId?: string;
  issue?: {
    number: number;
    url: string;
  };
};

export type CursorRepo = {
  url: string;
};
