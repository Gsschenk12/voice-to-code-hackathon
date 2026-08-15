# Voice to Code

Live meeting transcription that launches Cursor cloud agents when you say:

- **“grok make an issue”** — create a GitHub issue from the spoken context
- **“grok make a PR”** / **“grok make a pull request”** — implement the request and open a PR

Transcript sources (pick one on meeting setup):

- **Google Meet captions (free)** — Chrome extension reads Meet’s live captions from the DOM (no ASR key)
- **Wispr Flow (mic)** — browser mic streamed to Wispr (optional `WISPR_API_KEY`)

## How it works

1. Sign in with GitHub (OAuth scopes: `read:user`, `repo`).
2. On meeting setup, paste your **Cursor API key**, pick a repo, and choose a transcript source.
3. Start the meeting and click **Start listening**.
4. Keyword detection posts to the server, which launches a **cloud** agent via `@cursor/sdk`.

## Prerequisites

- Node.js **≥ 22.13** (`@cursor/sdk` requirement)
- A GitHub account (for OAuth sign-in)
- A Cursor account (API key + GitHub App on your test repos)
- For **Meet captions**: Chrome + the unpacked extension in [`extension/`](extension/)
- Optional: a [Wispr Flow](https://wisprflow.ai/developers) org API key (`fl-...`) for mic streaming

## Local development setup

Env vars live in a gitignored **`.env`** file at the repo root (Next.js loads it automatically). Do not commit secrets. The Cursor API key is **not** stored in `.env` — you paste it in the meeting setup UI.

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env` (if you do not already have one)

```bash
cp .env.example .env
openssl rand -base64 32
```

Paste the generated value into `AUTH_SECRET` in `.env`. Your file should include:

```
AUTH_SECRET=<generated>
AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
WISPR_API_KEY=
```

### 3. GitHub OAuth App

1. Open [GitHub → Developer settings → OAuth Apps](https://github.com/settings/developers) and create a new OAuth App.
2. Set:
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
3. Copy the **Client ID** and **Client secret** into `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. The app requests scopes `read:user`, `user:email`, and `repo` (configured in `src/lib/auth.ts`). The `repo` scope lets cloud agents create issues via your OAuth token.

### 4. Cursor (UI key, not in `.env`)

1. Create an API key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations).
2. Install the [Cursor GitHub App](https://cursor.com/docs/integrations/github) on the repository you will discuss. Cloud agents can only clone repos already authorized for that app.
3. After signing in, open **Meeting setup** (`/meeting`), paste the Cursor API key, click **Save key**, then **Load from Cursor** to pick a repo.

### 5. Google Meet captions (free path)

1. Load the unpacked extension — see [`extension/README.md`](extension/README.md):
   - `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`
2. On meeting setup, choose **Google Meet captions (free)** → **Start meeting**
3. Open a Meet tab in the same Chrome profile and turn on captions (**CC**)
4. Click **Start listening** in the app — speaker-attributed captions appear in the transcript pane

No `WISPR_API_KEY` required for this path.

### 6. Wispr Flow (optional mic path)

1. Get an org API key from [Wispr Flow developers](https://wisprflow.ai/developers) (`fl-...`).
2. Set `WISPR_API_KEY` in `.env`.
3. On meeting setup, choose **Wispr Flow (mic)**.
4. This is required only for live mic streaming (`POST /api/wispr/token`). To test GitHub + Cursor agent launch without audio, a placeholder value is enough.

### 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then:

1. **Sign in with GitHub**
2. **Set up meeting** → save Cursor API key → load repos → pick repo → choose transcript source → **Start meeting**
3. Click **Start listening** (Meet captions extension, or Wispr with a real `WISPR_API_KEY`) or exercise `/api/commands` with a synthetic transcript while signed in

### Verify checklist

- [ ] GitHub sign-in redirects back to the app and shows your username
- [ ] Meeting setup accepts a Cursor API key and **Load from Cursor** lists repos
- [ ] Starting a meeting opens the live page for the selected repo
- [ ] **Meet captions:** extension loaded, Meet CC on, **Start listening** shows caption text
- [ ] **Wispr:** **Start listening** connects to Wispr (skip if you are not testing mic audio)

## Notes

- Cloud agents can only clone repos already authorized for the Cursor GitHub App. The repo picker uses `Cursor.repositories.list`, not GitHub’s `/user/repos`.
- Cursor’s agent sandbox token cannot create issues; issue commands inject your GitHub OAuth token as `GITHUB_TOKEN` so the agent can run `gh issue create`.
- PR commands plan from the associated GitHub issue (matched or just created), then execute that plan on a Cursor cloud agent with `autoCreatePR: true` (branch, atomic commits, PR body linking the issue).
- Meeting state (transcript, launched agents) lives in the browser for this hackathon scaffold — no database.
- Meet caption scraping is best-effort: Google’s DOM is not a public API and may change.

## Scripts

| Command         | Description                 |
| --------------- | --------------------------- |
| `npm run dev`   | Next.js dev server          |
| `npm run build` | Production build            |
| `npm run test`  | Unit tests (Vitest)         |
| `npm run scan:samples` | Dry-run trigger scan on sample transcripts |
