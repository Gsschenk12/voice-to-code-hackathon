import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mintWisprClientToken, wisprClientWsUrl } from "@/lib/wispr";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clientId = session.user.id ?? session.user.email ?? "anonymous";
    const token = await mintWisprClientToken(clientId, 3600);
    return NextResponse.json({
      accessToken: token.accessToken,
      expiresIn: token.expiresIn,
      wsUrl: wisprClientWsUrl(token.accessToken),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mint Wispr token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
