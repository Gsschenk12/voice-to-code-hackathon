import type {
  TranscriptDocument,
  TranscriptSession,
  TranscriptSource,
} from "@/lib/triggers/types";

/**
 * Placeholder for a Wispr Flow MCP transcript source.
 *
 * Later this should call MCP tools (e.g. get_transcript / subscribe) and
 * return the same TranscriptDocument shape as FileTranscriptSource.
 * scanTriggers and PipelineInitiator stay unchanged.
 */
export class WisprMcpSource implements TranscriptSource {
  async listSessions(): Promise<TranscriptSession[]> {
    throw new Error("WisprMcpSource is not implemented yet");
  }

  async read(_ref: TranscriptSession): Promise<TranscriptDocument> {
    throw new Error("WisprMcpSource is not implemented yet");
  }
}
