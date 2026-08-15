import type { PipelineRequest, PipelineInitiator } from "@/lib/triggers/types";
import { runPipeline } from "./orchestrate";
import type { PipelineContext } from "./types";

export type CommandPipelineCredentials = {
  apiKey: string;
  githubAccessToken?: string;
  startingRef?: string;
  /** Used when PipelineRequest.linkedRepo is missing. */
  defaultRepoUrl?: string;
};

/**
 * Turn `owner/repo` or a full GitHub URL into a clone URL for runPipeline.
 * Sample sessions use `acme-corp/platform-api`; live meetings pass full URLs.
 */
export function resolveRepoUrl(linkedRepo?: string, fallback?: string): string | null {
  const raw = linkedRepo?.trim() || fallback?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[^/\s]+\/[^/\s]+$/.test(raw)) return `https://github.com/${raw}`;
  return null;
}

/** Map a trigger-scanner PipelineRequest into runPipeline input fields. */
export function pipelineInputFromTrigger(
  request: PipelineRequest,
  creds: CommandPipelineCredentials,
): Omit<PipelineContext, "log" | "intent" | "matchedIssues" | "issueDecision" | "agent"> {
  const repoUrl = resolveRepoUrl(request.linkedRepo, creds.defaultRepoUrl);
  if (!repoUrl) {
    throw new Error(
      `No repo URL for trigger from ${request.sourceId} (linkedRepo=${request.linkedRepo ?? "none"})`,
    );
  }

  return {
    meetingId: request.sourceId,
    kind: request.kind,
    phrase: request.phrase,
    transcriptWindow: request.transcriptWindow,
    repoUrl,
    startingRef: creds.startingRef,
    apiKey: creds.apiKey,
    githubAccessToken: creds.githubAccessToken,
  };
}

/**
 * Live PipelineInitiator: hands trigger-scanner requests into the stage pipeline.
 * Use LoggingPipelineInitiator in src/lib/triggers for dry-run sample scans.
 */
export class CommandPipelineInitiator implements PipelineInitiator {
  readonly results: PipelineContext[] = [];

  constructor(private readonly creds: CommandPipelineCredentials) {}

  async initiate(request: PipelineRequest): Promise<void> {
    const result = await runPipeline(pipelineInputFromTrigger(request, this.creds));
    this.results.push(result);
  }
}
