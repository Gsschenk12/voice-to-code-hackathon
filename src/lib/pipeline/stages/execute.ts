/**
 * Stage: execute
 *
 * Reads:  intent, issueDecision, transcriptWindow, repoUrl, startingRef,
 *         apiKey, githubAccessToken, meetingId, kind
 * Writes: agent
 *
 * Skip when an issue was already created in resolveIssue (avoid duplicate
 * gh issue create via a second agent). Otherwise launch the Cursor cloud agent.
 */
import { launchCloudAgent } from "@/lib/cursor";
import type { PipelineStage, StageResult } from "../types";

export const executeStage: PipelineStage = {
  id: "execute",
  description: "Launch Cursor cloud agent for issue and/or PR work",
  async run(ctx): Promise<StageResult> {
    const kind = ctx.intent?.kind ?? ctx.kind;

    if (kind === "issue" && ctx.issueDecision?.action === "create") {
      return {
        status: "skip",
        context: ctx,
        reason: `issue #${ctx.issueDecision.issueNumber ?? "?"} already created; skipping agent`,
      };
    }

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
