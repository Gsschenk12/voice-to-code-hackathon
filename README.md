# Voice to Code

Live meeting transcription (Wispr Flow) that launches Cursor cloud agents when you say:

- **“grok make an issue”** — create a GitHub issue from the spoken context
- **“grok make a PR”** / **“grok make a pull request”** — implement the request and open a PR

## How it works

1. Sign in with GitHub (OAuth scopes: `read:user`, `repo`).
2. On meeting setup, paste your **Cursor API key** and pick a repo from Cursor’s connected GitHub App list.
3. Start the meeting: the browser streams mic audio to Wispr Flow and shows a live transcript.
4. Keyword detection posts to the server, which launches a **cloud** agent via `@cursor/sdk`.

## Prerequisites

- Node.js **≥ 22.13** (`@cursor/sdk` requirement)
- [GitHub OAuth App](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback/github`
- [Cursor API key](https://cursor.com/dashboard/integrations) and [Cursor GitHub App](https://cursor.com/docs/integrations/github) installed on target repos
- [Wispr Flow](https://wisprflow.ai/developers) org API key (`fl-...`)

## Setup

```bash
cp .env.example .env.local
# fill AUTH_SECRET, GITHUB_*, WISPR_API_KEY
npm install
npm run dev
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- Cloud agents can only clone repos already authorized for the Cursor GitHub App. The repo picker uses `Cursor.repositories.list`, not GitHub’s `/user/repos`.
- Cursor’s agent sandbox token cannot create issues; issue commands inject your GitHub OAuth token as `GITHUB_TOKEN` so the agent can run `gh issue create`.
- PR commands set `autoCreatePR: true` on the cloud agent.
- Meeting state (transcript, launched agents) lives in the browser for this hackathon scaffold — no database.

## Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm run dev`  | Next.js dev server       |
| `npm run build`| Production build         |
| `npm run test` | Keyword detector unit tests |
