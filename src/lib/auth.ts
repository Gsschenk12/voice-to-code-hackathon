import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    githubAccessToken?: string;
    cursorApiKey?: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      id?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubAccessToken?: string;
    cursorApiKey?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, trigger, session }) {
      if (account?.access_token) {
        token.githubAccessToken = account.access_token;
      }

      // Client calls session.update({ cursorApiKey }) from meeting setup.
      if (trigger === "update" && session && typeof session === "object") {
        const update = session as { cursorApiKey?: string | null };
        if (typeof update.cursorApiKey === "string") {
          token.cursorApiKey = update.cursorApiKey.trim() || undefined;
        } else if (update.cursorApiKey === null) {
          delete token.cursorApiKey;
        }
      }

      return token as JWT;
    },
    async session({ session, token }) {
      session.githubAccessToken = token.githubAccessToken;
      session.cursorApiKey = token.cursorApiKey;
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  trustHost: true,
});
