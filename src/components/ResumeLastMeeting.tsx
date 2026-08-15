"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadLastMeeting,
  type PersistedLastMeeting,
} from "@/lib/client-persist";

export function ResumeLastMeeting() {
  const [last, setLast] = useState<PersistedLastMeeting | null>(null);

  useEffect(() => {
    setLast(loadLastMeeting());
  }, []);

  if (!last) return null;

  const params = new URLSearchParams({
    repo: last.repoUrl,
    ref: last.startingRef || "main",
    source: last.captureSource,
  });

  return (
    <Link
      href={`/meeting/${last.id}?${params.toString()}`}
      className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
    >
      Resume last meeting
    </Link>
  );
}
