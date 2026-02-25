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

Smoke tests are not yet implemented. Once added they will live in `tests/` and can be run with:

```bash
npm test
```

This section will be updated when the first tests land.

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
