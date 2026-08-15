import type { CommandKind } from "@/types/meeting";

/** Entry written by stages for debugging / UI command logs. */
export type PipelineLogEntry = {
  stage: string;
  message: string;
  at: number;
};

/** Intent resolved from the wake phrase (enriched by later work). */
export type PipelineIntent = {
  kind: CommandKind;
  phrase?: string;
  /** Optional title/summary inferred from transcript (future). */
  title?: string;
  summary?: string;
};

/** A GitHub issue that may relate to the transcript (future matching). */
export type MatchedIssue = {
  number: number;
  title: string;
  url?: string;
  score?: number;
};

/** Whether to create a new issue or reuse an existing one. */
export type IssueDecision = {
  action: "create" | "reuse";
  issueNumber?: number;
  issueUrl?: string;
};

/** Whether extra meeting context was added to a matched issue. */
export type IssueContextUpdate = {
  issueNumber: number;
  needed: boolean;
  commentUrl?: string;
};

export type PipelineAgentResult = {
  agentId: string;
  runId: string;
};

/**
 * Shared mutable context passed through every stage.
 * Input fields come from POST /api/commands; later stages fill intent, issues, agent.
 */
export type PipelineContext = {
  meetingId: string;
  kind: CommandKind;
  phrase?: string;
  transcriptWindow: string;
  repoUrl: string;
  startingRef?: string;
  /** Session secrets — server-only; never send to the client. */
  apiKey: string;
  githubAccessToken?: string;
  intent?: PipelineIntent;
  matchedIssues?: MatchedIssue[];
  issueDecision?: IssueDecision;
  issueContextUpdate?: IssueContextUpdate;
  agent?: PipelineAgentResult;
  log: PipelineLogEntry[];
};

export type StageStatus = "continue" | "skip" | "halt";

export type StageResult = {
  status: StageStatus;
  context: PipelineContext;
  reason?: string;
};

export type PipelineStage = {
  id: string;
  description: string;
  run: (ctx: PipelineContext) => Promise<StageResult>;
};

/** Error thrown by the runner when a stage fails; includes the stage id. */
export class PipelineStageError extends Error {
  readonly stageId: string;

  constructor(stageId: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`[pipeline:${stageId}] ${message}`);
    this.name = "PipelineStageError";
    this.stageId = stageId;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
