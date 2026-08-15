import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCloudAgentInfo } from "@/lib/cursor";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.cursorApiKey) {
    return NextResponse.json({ error: "Cursor API key not set" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing agent id" }, { status: 400 });
  }

  try {
    const info = await getCloudAgentInfo(session.cursorApiKey, id);
    return NextResponse.json({
      agentId: info.agentId,
      name: info.name,
      summary: info.summary,
      status: info.status ?? "unknown",
      runtime: "runtime" in info ? info.runtime : undefined,
      repos: "repos" in info ? info.repos : undefined,
      metadata: "metadata" in info ? info.metadata : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch agent";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
