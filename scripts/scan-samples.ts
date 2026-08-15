import path from "node:path";
import { FileTranscriptSource } from "../src/lib/triggers/file";
import { LoggingPipelineInitiator, runTriggerPipeline } from "../src/lib/triggers/pipeline";

const DEFAULT_DIR = path.join(process.cwd(), "sample-transcripts", "transcripts");

async function main() {
  const transcriptsDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR;
  const source = new FileTranscriptSource(transcriptsDir);
  const initiator = new LoggingPipelineInitiator();
  const requests = await runTriggerPipeline(source, initiator);

  if (requests.length === 0) {
    console.error(`No trigger phrases found in ${transcriptsDir}`);
    process.exitCode = 1;
    return;
  }

  console.error(`Scanned ${requests.length} trigger(s) (dry-run, pipeline not launched)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
