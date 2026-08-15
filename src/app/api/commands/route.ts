import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { PipelineStageError, runPipeline } from "@/lib/pipeline";

/** Cloud issue draft + create can exceed the default serverless budget. */
export const maxDuration = 300;

const bodySchema = z.object({
  meetingId: z.string().min(1),
  kind: z.enum(["issue", "pr"]),
  phrase: z.string().optional(),
  transcriptWindow: z.string(),
  repoUrl: z.string().url(),
  startingRef: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.cursorApiKey) {
    return NextResponse.json({ error: "Cursor API key not set" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { meetingId, kind, phrase, transcriptWindow, repoUrl, startingRef } = parsed.data;

  try {
    const result = await runPipeline({
      meetingId,
      kind,
      phrase,
      transcriptWindow,
      repoUrl,
      startingRef,
      apiKey: session.cursorApiKey,
      githubAccessToken: session.githubAccessToken,
    });

    const responseKind = result.intent?.kind ?? kind;
    const createdIssue =
      result.issueDecision?.action === "create" &&
      result.issueDecision.issueNumber != null &&
      result.issueDecision.issueUrl
        ? {
            number: result.issueDecision.issueNumber,
            url: result.issueDecision.issueUrl,
          }
        : undefined;

    if (!result.agent && !createdIssue) {
      const last = result.log.at(-1);
      const setupHalt = last?.stage === "matchIssues";
      return NextResponse.json(
        {
          error:
            last?.message ??
            "Pipeline finished without launching an agent or creating an issue",
          code: setupHalt ? "setup" : "pipeline",
          log: result.log,
        },
        { status: setupHalt ? 400 : 502 },
      );
    }

    return NextResponse.json({
      kind: responseKind,
      ...(result.agent
        ? { agentId: result.agent.agentId, runId: result.agent.runId }
        : {}),
      ...(createdIssue ? { issue: createdIssue } : {}),
    });
  } catch (err) {
    const message =
      err instanceof PipelineStageError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to run pipeline";
    console.error("[commands]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
