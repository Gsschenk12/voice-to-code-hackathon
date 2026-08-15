import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { launchCloudAgent } from "@/lib/cursor";

const bodySchema = z.object({
  meetingId: z.string().min(1),
  kind: z.enum(["issue", "pr"]),
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

  const { meetingId, kind, transcriptWindow, repoUrl, startingRef } = parsed.data;

  try {
    const result = await launchCloudAgent({
      apiKey: session.cursorApiKey,
      githubAccessToken: session.githubAccessToken,
      kind,
      transcriptWindow,
      repoUrl,
      startingRef,
      meetingId,
    });

    return NextResponse.json({
      agentId: result.agentId,
      runId: result.runId,
      kind,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to launch agent";
    console.error("[commands]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
