import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listCursorRepositories } from "@/lib/cursor";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.cursorApiKey) {
    return NextResponse.json(
      { error: "Cursor API key not set. Save it on the meeting setup page first." },
      { status: 400 },
    );
  }

  try {
    const repos = await listCursorRepositories(session.cursorApiKey);
    return NextResponse.json({ repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list repositories";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
