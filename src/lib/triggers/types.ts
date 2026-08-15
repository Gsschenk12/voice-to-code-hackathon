import type { CommandKind } from "@/types/meeting";

export type TranscriptSession = {
  id: string;
  linkedRepo?: string;
};

export type TranscriptDocument = {
  id: string;
  text: string;
  linkedRepo?: string;
};

/**
 * Swappable transcript reader. FileTranscriptSource implements this now;
 * WisprMcpSource will later call Wispr Flow MCP (get_transcript / subscribe).
 */
export interface TranscriptSource {
  listSessions(): Promise<TranscriptSession[]>;
  read(ref: TranscriptSession): Promise<TranscriptDocument>;
}

export type ScannedTrigger = {
  kind: CommandKind;
  phrase: string;
  transcriptWindow: string;
};

export type PipelineRequest = {
  kind: CommandKind;
  phrase: string;
  transcriptWindow: string;
  sourceId: string;
  linkedRepo?: string;
};

export interface PipelineInitiator {
  initiate(request: PipelineRequest): Promise<void>;
}
