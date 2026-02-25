# Contributing to Mi Casa Es Su Casa

## Prerequisites

- **Node.js** 20 or later
- **npm** (ships with Node) or **pnpm**

## Local development setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd mi-casa-es-su-casa
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your Vercel KV credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and supply values for:

- `KV_URL` — Vercel KV connection string
- `KV_REST_API_URL` — Vercel KV REST API endpoint
- `KV_REST_API_TOKEN` — read/write token
- `KV_REST_API_READ_ONLY_TOKEN` — read-only token

**Tip:** If you have the Vercel CLI installed and the project is linked, run `vercel dev` instead of `npm run dev`. Vercel Dev automatically injects the KV environment variables from your Vercel project, so you can skip the manual `.env.local` step.

To link the project to Vercel (one-time, requires Vercel auth):

```bash
vercel link
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Linting

```bash
npm run lint
```

ESLint runs automatically on every PR via CI. All warnings must be resolved before merging.

## Smoke tests

Smoke tests live in `tests/smoke/` and are written with Node's built-in `node:test` module. Run them against a locally-running server:

```bash
# In one terminal, build and start the production server
npm run build && npm start

# In another terminal, run the smoke tests
npm run test:smoke
```

You can override the target URL with the `BASE_URL` environment variable:

```bash
BASE_URL=https://my-preview.vercel.app npm run test:smoke
```

## Deployment

### Production

Pushing to `main` triggers an automatic production deployment via the Vercel GitHub integration. No manual steps are required once the Vercel project is linked to this GitHub repository.

### Preview deployments

Every pull request automatically gets a Vercel preview deployment. Vercel posts the preview URL as a comment on the PR. This allows reviewers to test changes in a live environment before merging.

### Setup (one-time, per developer)

Both auto-deploy and preview deploys are configured in the **Vercel dashboard**, not via files in this repository. To enable them:

1. Create a Vercel project (or use an existing one) and link it to this GitHub repository: **Vercel Dashboard → Project → Settings → Git**.
2. Vercel will automatically enable production deploys on `main` and preview deploys on all branches/PRs.

The `vercel.json` file at the repo root declares `"framework": "nextjs"` so Vercel uses the correct build preset.

## Project structure

```
src/
  app/            Next.js App Router pages and API routes
  game/           Three.js game renderer (canvas-based)
  components/     React UI components (Tailwind-styled chrome)
  lib/            Shared utilities
Docs/             Game design documents
```

## Coding conventions

- TypeScript strict mode is enforced — no `any` without a comment explaining why.
- Prettier formatting is enforced. Run `npx prettier --write .` before committing or configure your editor to format on save.
- Tailwind CSS is for UI chrome only (boot screen, forms, overlays). Do not add Tailwind classes inside `src/game/`.
