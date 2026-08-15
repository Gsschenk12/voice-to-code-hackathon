/**
 * Stage: execute
 *
 * Reads:  intent, issueDecision, transcriptWindow, repoUrl, startingRef,
 *         apiKey, githubAccessToken, meetingId, kind
 * Writes: agent
 *
 * Now: launch the existing Cursor cloud agent (issue or PR via kind).
 * Later: use intent + issueDecision to decide issue-only vs PR work,
 *        and pass matched issue numbers into the agent prompt.
 */
import { launchCloudAgent } from "@/lib/cursor";
import type { PipelineStage, StageResult } from "../types";

export const executeStage: PipelineStage = {
  id: "execute",
  description: "Launch Cursor cloud agent for issue and/or PR work",
  async run(ctx): Promise<StageResult> {
    const kind = ctx.intent?.kind ?? ctx.kind;
    const result = await launchCloudAgent({
      apiKey: ctx.apiKey,
      githubAccessToken: ctx.githubAccessToken,
      kind,
      transcriptWindow: ctx.transcriptWindow,
      repoUrl: ctx.repoUrl,
      startingRef: ctx.startingRef,
      meetingId: ctx.meetingId,
    });

    return {
      status: "continue",
      context: {
        ...ctx,
        agent: {
          agentId: result.agentId,
          runId: result.runId,
        },
      },
      reason: `launched agent ${result.agentId}`,
    };
  },
};
