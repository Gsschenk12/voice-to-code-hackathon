export type CommandKind = "issue" | "pr";

export type KeywordMatch = {
  kind: CommandKind;
  phrase: string;
  index: number;
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
