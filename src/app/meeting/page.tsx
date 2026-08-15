import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { MeetingSetup } from "@/components/MeetingSetup";

export default async function MeetingSetupPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex w-full flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Home
      </Link>
      <MeetingSetup />
    </main>
  );
}
