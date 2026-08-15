import { scanTriggers } from "@/lib/triggers/scan";
import type {
  PipelineInitiator,
  PipelineRequest,
  TranscriptSource,
} from "@/lib/triggers/types";

/**
 * Trigger → handoff layer (scan sample/live transcripts, then initiate).
 * Dry-run uses LoggingPipelineInitiator; live agent work uses
 * CommandPipelineInitiator from src/lib/pipeline (stage runner).
 */

/** Dry-run initiator: records requests and prints one line per trigger. */
export class LoggingPipelineInitiator implements PipelineInitiator {
  readonly requests: PipelineRequest[] = [];

  constructor(private readonly log: (line: string) => void = console.log) {}

  async initiate(request: PipelineRequest): Promise<void> {
    this.requests.push(request);
    this.log(`${request.sourceId}\t${request.kind}\t${request.phrase}`);
  }
}

/** list → read → scan → initiate. Source and initiator are swappable. */
export async function runTriggerPipeline(
  source: TranscriptSource,
  initiator: PipelineInitiator,
): Promise<PipelineRequest[]> {
  const sessions = await source.listSessions();
  const requests: PipelineRequest[] = [];

  for (const session of sessions) {
    const doc = await source.read(session);
    for (const trigger of scanTriggers(doc.text)) {
      const request: PipelineRequest = {
        kind: trigger.kind,
        phrase: trigger.phrase,
        transcriptWindow: trigger.transcriptWindow,
        sourceId: doc.id,
        linkedRepo: doc.linkedRepo,
      };
      await initiator.initiate(request);
      requests.push(request);
    }
  }

  return requests;
}
