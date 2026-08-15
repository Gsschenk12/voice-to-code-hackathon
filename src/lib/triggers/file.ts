import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTranscriptBody } from "@/lib/triggers/scan";
import type {
  TranscriptDocument,
  TranscriptSession,
  TranscriptSource,
} from "@/lib/triggers/types";

type SessionsFile = {
  sessions: Array<{
    transcript_file: string;
    linked_repo?: string;
  }>;
};

/** Reads meeting transcripts from a local folder (sample-transcripts for this iteration). */
export class FileTranscriptSource implements TranscriptSource {
  constructor(private readonly transcriptsDir: string) {}

  async listSessions(): Promise<TranscriptSession[]> {
    const raw = await readFile(this.sessionsPath(), "utf8");
    const parsed = JSON.parse(raw) as SessionsFile;
    return (parsed.sessions ?? []).map((session) => ({
      id: session.transcript_file,
      linkedRepo: session.linked_repo,
    }));
  }

  async read(ref: TranscriptSession): Promise<TranscriptDocument> {
    const filePath = path.join(this.transcriptsDir, ref.id);
    const raw = await readFile(filePath, "utf8");
    return {
      id: ref.id,
      text: extractTranscriptBody(raw),
      linkedRepo: ref.linkedRepo,
    };
  }

  private sessionsPath(): string {
    return path.join(this.transcriptsDir, "sessions.json");
  }
}
