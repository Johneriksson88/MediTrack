# Phase 01 — Deferred items (out-of-scope discoveries)

This file tracks items discovered during plan execution that fall **outside the
current plan's scope** (per the executor's scope-boundary rule). They are not
bugs in the current plan — they're either pre-existing issues or work that
belongs to a later plan/phase.

---

## Plan 03 (RBAC end-to-end)

### `pnpm --filter @meditrack/shared build` fails with "Cannot find type definition file for 'node'"

- **Discovered:** Plan 03, Task 1 GREEN step (running `pnpm -r build`)
- **Reproduction:**
  ```
  $ pnpm --filter @meditrack/shared build
  error TS2688: Cannot find type definition file for 'node'.
    The file is in the program because:
      Entry point of type library 'node' specified in compilerOptions
  ```
- **Pre-existing:** Verified on Plan 02 HEAD (commit `e07941b`) — same error.
- **Why deferred:** Plan 03 does not modify `packages/shared`'s build target.
  `tsc -p .` in shared pulls in `@types/node` via `tsconfig.base.json`'s
  `types: ['node']`, but `@meditrack/shared` does not declare `@types/node`
  as a devDependency. The `@meditrack/api` and `@meditrack/web` builds
  succeed because they each install `@types/node` themselves.
- **Impact:** `pnpm -r build` (full-monorepo build) fails. The single-app
  builds (`pnpm --filter @meditrack/api build`, `pnpm --filter @meditrack/web build`)
  succeed. `apps/api`'s build consumes shared via TS-source imports (the
  `exports` field in `packages/shared/package.json` points at
  `./src/index.ts`), so the api build still typechecks shared transitively.
- **Suggested fix (deferred):** Either add `"@types/node": "^20.14.13"`
  to `packages/shared/devDependencies`, or remove `node` from the shared
  package's `types` resolution (set `"types": []` in
  `packages/shared/tsconfig.json`). Shared has no node-specific code so
  the latter is cleaner. To be picked up by Plan 04 or a Phase 7 polish task.

---

## Plan 04 (App Shell + stub pages)

### Docker compose `api` container fails at `prisma migrate deploy` (Prisma 5 + Alpine OpenSSL)

- **Discovered:** Plan 04, Task 4 UX-01 verification preflight (attempted `docker compose up --build`)
- **Reproduction:**
  ```
  $ docker compose up --build
  ...
  api-1 | Error: Unable to require(`/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node`)
  api-1 | Prisma cannot find the required `libssl` system library in your system
  api-1 | exited with code 1
  ```
- **Root cause:** `apps/api/Dockerfile` uses `node:20-alpine` (musl + OpenSSL 3) but the
  Prisma 5 query engine binary downloaded into `node_modules/.prisma/client` does not
  consistently match the Alpine OpenSSL ABI in the runtime stage. Multi-stage copy
  drops the matching `.so.node` file.
- **Why deferred:** UX-01 verification was unblocked by falling back to native dev
  (`pnpm --filter @meditrack/api dev` + `pnpm --filter @meditrack/web dev` against a
  local Postgres container). All 6 routes returned HTTP 200; the 4-breakpoint UX
  protocol was executed and approved by the user. Fixing the Docker image is a
  Plan 05 concern — see "Plan 05 must-fixes" below.
- **Impact:** README's golden command `docker compose up` is broken. This is one of
  the brief's "ett plus" points (§3.3) so it MUST work before the phase ships.
- **Suggested fix (Plan 05):** Switch `apps/api/Dockerfile` (and likely the
  builder/runtime stages) from `node:20-alpine` to `node:20-bookworm-slim`. Debian's
  glibc + OpenSSL 3 has stable, well-supported Prisma binary targets
  (`debian-openssl-3.0.x`). Verify with `docker compose up --build` end-to-end and
  re-run the Plan 02 walking-skeleton smoke (login → /me → /admin/ping).

### UX-01 step 9 (non-admin role visibility) deferred to Plan 05

- **Discovered:** Plan 04, Task 4 checkpoint
- **What's deferred:** Verification step 9 — log in as `sjukskoterska@example.test`
  and confirm the `Admin` nav item is hidden + the `Konto` page renders the
  `Denna åtgärd kräver adminrättigheter.` note.
- **Why deferred:** Plan 02's seed only creates the admin user (`admin@example.test`).
  Non-admin users (`apotekare`, `sjukskoterska`) are not seeded yet. The plan's
  checkpoint explicitly notes this is acceptable to defer if seeds aren't ready.
- **Suggested fix (Plan 05):** Extend `apps/api/prisma/seed.ts` to add at minimum
  one `apotekare` and one `sjukskoterska` user against the same care unit; then
  re-run step 9 of the Plan 04 UX-01 protocol as part of Plan 05's checkpoint.
