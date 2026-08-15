import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { MeetingLive } from "@/components/MeetingLive";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ repo?: string; ref?: string }>;
};

export default async function MeetingLivePage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const { id } = await params;
  const query = await searchParams;
  const repoUrl = query.repo;
  const startingRef = query.ref || "main";

  if (!repoUrl) {
    redirect("/meeting");
  }

  return (
    <main className="mx-auto flex w-full flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/meeting" className="text-sm text-zinc-500 hover:underline">
        ← Meeting setup
      </Link>
      <MeetingLive
        meetingId={id}
        repoUrl={repoUrl}
        startingRef={startingRef}
      />
    </main>
  );
}
