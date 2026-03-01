# Mi Casa Es Su Casa — Agent Instructions

## Stack

- **Next.js** (App Router, TypeScript strict mode)
- **Three.js** — voxel 3D game renderer, runs client-side only
- **Tailwind CSS** — UI chrome only (not game canvas)
- **Vercel KV** (Upstash Redis) — character state persistence
- **Playwright** — E2E and visual regression tests

## Unit Tests

Tests live in `tests/unit/`. No server needed — run directly:

```bash
npm run test:unit
```

### Rules for agents

- **Always run `npm run test:unit` after any change to:**
  - `src/game/character/pathfinder.ts` (movement, position interpolation)
  - `src/game/rooms.ts` (room positions, floor heights, adjacency graph)
- Unit tests verify **physical invariants** (character stays on the floor,
  no teleporting between rooms, stairs climb monotonically). If a test fails,
  fix the code — do not weaken the assertion.

## E2E Tests (Playwright)

Tests live in `tests/e2e/`. Run them with a server already running:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run test:e2e
```

### Rules for agents

- **Always run `npm run test:e2e` after any change to:**
  - `src/game/` (house geometry, renderer, character, palette)
  - `src/components/GameCanvas.tsx` or `ThoughtBubble.tsx`
  - `src/app/[name]/page.tsx`
  - `src/app/page.tsx` or `src/components/BootScreen.tsx`
  - `src/app/api/` routes
- **Do NOT run tests** after changes to `.dots/`, `Docs/`, or `AGENTS.md` itself.

### Updating the visual snapshot

The `game view matches visual snapshot` test compares against a committed baseline PNG. If you make an **intentional** visual change (camera, geometry, lighting, character), update the snapshot:

```bash
npm run test:e2e:update-snapshots
```

Then commit the updated PNG alongside the code change. **Never update snapshots to silence a failing test caused by a bug** — fix the bug instead.

### WebGL in headless Playwright

The Playwright config (`playwright.config.ts`) uses `--use-angle=swiftshader` for software-rendered WebGL. This works on macOS and Linux CI. Do not change these flags without verifying WebGL still initialises in headless mode.

### What each test catches

| Test | What it detects |
|------|----------------|
| `canvas is present with non-zero dimensions` | Canvas not mounting, React crash |
| `canvas renders non-background pixels` | House geometry not rendering, wrong camera |
| `thought bubble appears within 40 seconds` | Thought bubble system broken |
| `thought bubble is within the viewport bounds` | Bubble detached from game container |
| `game view matches visual snapshot` | Camera angle, geometry, character size, furniture, lighting regressions |
| `valid name navigates to /[name]` | Name entry flow, routing broken |
| `invalid name shows error alert` | Validation broken |
| Boot screen tests | CRT animation, name prompt, input focus |

## Version String

The app version must be kept in sync in two places:

- `package.json` — the `"version"` field (e.g. `"0.4.19"`)
- `src/components/BootScreen.tsx` — the `BOOT_LINES` array, first element (e.g. `'MI CASA ES SU CASA v0.4.19'`)

**Always bump the patch version** (the last number) with every code change.
Update both files together. The boot screen uses the same `vX.Y.Z` format as `package.json`.

## Persistence Version Guard

`src/lib/persistenceVersion.ts` exports a `PERSISTENCE_VERSION` integer. The
POST `/api/character/[name]` route rejects saves from clients whose baked-in
version doesn't match the server's, preventing stale browser tabs from
overwriting state after a deploy.

**Bump `PERSISTENCE_VERSION`** whenever a deploy includes changes to:

- `src/lib/characterSchema.ts` (field additions, removals, enum changes)
- `src/game/rooms.ts` (room list, positions, floor heights)
- `src/lib/simulateOffline.ts` (simulation logic that affects persisted fields)

A mismatch shows an "update available" banner with a refresh button.

## TypeScript

Always run `npx tsc --noEmit` after code changes. All code must compile with zero errors — strict mode is on.

## Commits

- One logical unit of work per commit
- Do not push unless explicitly instructed
- Do not include AI attribution in commit messages
