const WISPR_BASE = "https://platform-api.wisprflow.ai/api/v1/dash";

export type WisprTokenResult = {
  accessToken: string;
  expiresIn: number;
};

export function getWisprApiKey(): string {
  const key = process.env.WISPR_API_KEY;
  if (!key) {
    throw new Error("WISPR_API_KEY is not configured");
  }
  return key;
}

/** Mint a short-lived Wispr client JWT for browser WebSocket auth. */
export async function mintWisprClientToken(
  clientId: string,
  durationSecs = 3600,
): Promise<WisprTokenResult> {
  const apiKey = getWisprApiKey();

  const res = await fetch(`${WISPR_BASE}/generate_access_token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      duration_secs: durationSecs,
      metadata: {
        app: "voice-to-code",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Wispr token mint failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

export function wisprClientWsUrl(accessToken: string): string {
  return `wss://platform-api.wisprflow.ai/api/v1/dash/client_ws?client_key=${encodeURIComponent(`Bearer ${accessToken}`)}`;
}
