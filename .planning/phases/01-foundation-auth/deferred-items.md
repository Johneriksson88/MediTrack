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
