import {
  Agent,
  Cursor,
  CursorAgentError,
  IntegrationNotConnectedError,
} from "@cursor/sdk";
import type { CommandKind } from "@/types/meeting";
import { buildAgentPrompt } from "@/lib/prompts";

const FALLBACK_MODEL = "composer-2.5";

export type LaunchAgentParams = {
  apiKey: string;
  githubAccessToken?: string;
  kind: CommandKind;
  transcriptWindow: string;
  repoUrl: string;
  startingRef?: string;
  meetingId: string;
};

export type LaunchAgentResult = {
  agentId: string;
  runId: string;
};

/** Prefer a grok-named model when available; otherwise fall back. */
export async function resolveModelId(apiKey: string): Promise<string> {
  try {
    const models = await Cursor.models.list({ apiKey });
    const grok = models.find(
      (m) => /grok/i.test(m.id) || /grok/i.test(m.displayName ?? ""),
    );
    if (grok) return grok.id;
    if (models[0]?.id) return models[0].id;
  } catch (err) {
    console.warn("[cursor] models.list failed, using fallback", err);
  }
  return FALLBACK_MODEL;
}

export async function listCursorRepositories(apiKey: string): Promise<Array<{ url: string }>> {
  try {
    const repos = await Cursor.repositories.list({ apiKey });
    const list = Array.isArray(repos) ? repos : [];
    return list.map((r) => ({ url: r.url }));
  } catch (err) {
    if (err instanceof IntegrationNotConnectedError) {
      throw new Error(
        "GitHub is not connected to your Cursor account. Install the Cursor GitHub App, then retry.",
      );
    }
    throw err;
  }
}

export async function launchCloudAgent(params: LaunchAgentParams): Promise<LaunchAgentResult> {
  const {
    apiKey,
    githubAccessToken,
    kind,
    transcriptWindow,
    repoUrl,
    startingRef = "main",
    meetingId,
  } = params;

  const modelId = await resolveModelId(apiKey);
  const prompt = buildAgentPrompt(kind, transcriptWindow, repoUrl);

  const envVars: Record<string, string> = {};
  if (githubAccessToken) {
    envVars.GITHUB_TOKEN = githubAccessToken;
    envVars.GH_TOKEN = githubAccessToken;
  }

  try {
    await using agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      cloud: {
        repos: [{ url: repoUrl, startingRef }],
        autoCreatePR: kind === "pr",
        skipReviewerRequest: true,
        ...(Object.keys(envVars).length > 0 ? { envVars } : {}),
        metadata: {
          meeting_id: meetingId,
          command: kind,
        },
      },
    });

    const run = await agent.send(prompt);
    console.info("[cursor] launched", {
      agentId: agent.agentId,
      runId: run.id,
      kind,
      meetingId,
    });

    // Cloud run continues after the SDK handle is disposed; poll via Agent.get.
    void run
      .wait()
      .then((result) => {
        console.info("[cursor] run finished", {
          agentId: agent.agentId,
          runId: run.id,
          status: result.status,
        });
      })
      .catch((err) => {
        console.error("[cursor] run.wait failed", { agentId: agent.agentId, runId: run.id, err });
      });

    return {
      agentId: agent.agentId,
      runId: run.id,
    };
  } catch (err) {
    if (err instanceof IntegrationNotConnectedError) {
      throw new Error(
        "GitHub integration is not connected for this Cursor key. Open Cursor Integrations and reconnect GitHub.",
      );
    }
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor agent failed to start: ${err.message}`);
    }
    throw err;
  }
}

export async function getCloudAgentInfo(apiKey: string, agentId: string) {
  return Agent.get(agentId, { apiKey });
}
