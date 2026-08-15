"use client";

import type { MeetingAgent } from "@/types/meeting";

export function AgentStatus({
  agents,
  onRefresh,
}: {
  agents: MeetingAgent[];
  onRefresh?: (agentId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Cloud agents
      </h2>
      {agents.length === 0 ? (
        <p className="text-sm text-zinc-500">No agents launched yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {agents.map((agent) => (
            <li
              key={agent.agentId}
              className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold uppercase text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {agent.kind}
                  </span>
                  <span className="text-xs text-zinc-500">{agent.status}</span>
                </div>
                {onRefresh && !agent.pending ? (
                  <button
                    type="button"
                    onClick={() => onRefresh(agent.agentId)}
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Refresh
                  </button>
                ) : null}
              </div>
              {agent.phrase ? (
                <p className="mt-1 text-xs text-zinc-500">“{agent.phrase}”</p>
              ) : null}
              <p className="mt-1 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {agent.pending ? "Starting…" : agent.agentId}
              </p>
              {agent.summary ? (
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{agent.summary}</p>
              ) : null}
              {agent.prUrl ? (
                <a
                  href={agent.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open pull request
                </a>
              ) : null}
              {agent.error ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{agent.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
