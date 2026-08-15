import { auth, signIn, signOut } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          Voice → Code
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Speak an issue or PR into existence
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Capture a meeting via{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Google Meet captions
          </span>{" "}
          (free Chrome extension) or Wispr Flow. Say{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            “grok make an issue”
          </span>{" "}
          or{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            “grok make a PR”
          </span>{" "}
          and a Cursor cloud agent gets to work on the repo you selected.
        </p>
      </div>

      {session?.user ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {session.user.name || session.user.email}
            </span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/meeting"
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Set up meeting
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/meeting" });
          }}
        >
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Sign in with GitHub
          </button>
        </form>
      )}

      <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>Auth with GitHub (repo scope for issue creation via cloud agents).</li>
        <li>Enter your Cursor API key and select a Cursor-connected repository.</li>
        <li>
          Choose Meet captions (free extension) or Wispr mic, start listening, then
          say the wake phrase during the meeting.
        </li>
      </ol>
    </main>
  );
}
