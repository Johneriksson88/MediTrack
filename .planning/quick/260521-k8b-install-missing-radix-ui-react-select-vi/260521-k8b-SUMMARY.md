---
quick_id: 260521-k8b
slug: install-missing-radix-ui-react-select-vi
date: 2026-05-21
status: complete
mode: quick
one_liner: Synced host node_modules and added shared-build step to apps/web/Dockerfile so both `pnpm --filter @meditrack/web build` and `docker compose up --build` succeed on a fresh clone.
files_modified:
  - apps/web/Dockerfile
files_unchanged:
  - package.json
  - pnpm-lock.yaml
commits:
  - chore(quick-260521-k8b): unblock web build for fresh clone (Dockerfile)
---

# Quick Task 260521-k8b — Summary

## What Was Done

### Task 1 — Host `pnpm install`

Ran `pnpm install` from repo root. pnpm reported `Lockfile is up to date, resolution step is skipped` and added 5 previously-not-materialized packages to `node_modules`. **No committed file changed.** Verified by `git status --porcelain` showing only the pre-existing `apps/web/Dockerfile` modification (Task 2) — `pnpm-lock.yaml` did not regenerate.

`pnpm --filter @meditrack/web build` now exits 0:

```
> tsc --noEmit && vite build
✓ 1738 modules transformed.
dist/index.html              0.44 kB │ gzip: 0.29 kB
dist/assets/index-...css    33.39 kB │ gzip: 6.79 kB
dist/assets/index-...js    594.83 kB │ gzip: 181.99 kB
✓ built in 2.24s
```

(The 500 kB chunk warning is a Vite splitter advisory, not a build failure. Acceptable for the interview demo; address in Phase 7 if time.)

### Task 2 — Dockerfile shared-build step

Committed the pre-existing working-tree modification of `apps/web/Dockerfile`:

```diff
 COPY packages/shared ./packages/shared
 COPY apps/web ./apps/web

+# Build shared first — web imports `@meditrack/shared` via the package's
+# `exports` field which points at `./dist/index.js`. The repo's
+# `.dockerignore` excludes `**/dist`, so the host's prebuilt dist never
+# reaches the image; without this step vite's commonjs--resolver fails with
+# "Failed to resolve entry for package @meditrack/shared".
+RUN pnpm --filter @meditrack/shared run build
+
 # Build the SPA to apps/web/dist.
 RUN pnpm --filter @meditrack/web run build
```

The inline comment explains the failure mode for anyone reading the Dockerfile later.

## Verification

- `pnpm --filter @meditrack/web build` → exit 0, dist artifacts produced.
- No changes to `package.json` or `pnpm-lock.yaml` — the dependency declaration and lockfile were always correct; the BLOCKER flag in `02-VERIFICATION.md` was triggered by a stale host `node_modules`, not by missing repository state.

## Resolves

- 02-VERIFICATION.md anti-patterns table row 1: `@radix-ui/react-select` BLOCKER.
- A parallel `docker compose up --build` failure that wasn't logged in 02-VERIFICATION.md but would have surfaced on first reviewer run.

## Surprises / Notes

- The BLOCKER framing in `02-VERIFICATION.md` was technically correct ("`pnpm --filter @meditrack/web build` exits 2") but misleading on root cause. The committed lockfile was always sufficient; the failure mode is purely a stale dev environment. Worth a one-liner in the README's "Setup" section: "run `pnpm install` after clone before `docker compose up`."
- The Dockerfile fix is the more reviewer-visible issue. Without it, the README's `docker compose up` "golden command" (brief §3.3) breaks on a fresh clone, which would be the first thing an interviewer notices.

## Follow-ups

- Consider a `postinstall` script or pre-build hook that runs `pnpm --filter @meditrack/shared build` automatically so neither the host nor the Dockerfile needs to remember it. Track as a Phase 7 polish item if not already in scope.
