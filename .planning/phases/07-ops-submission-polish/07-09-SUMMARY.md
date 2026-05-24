---
phase: "07"
plan: "07-09"
subsystem: build-tooling
tags: [chore, build, typecheck, WR-03, OPS-02, OPS-04]
dependency_graph:
  requires: []
  provides: [apps/web scripts.build without redundant typecheck]
  affects: [pnpm verify chain walltime]
tech_stack:
  added: []
  patterns: [typecheck-before-build ordering via pnpm -r typecheck in verify chain]
key_files:
  created: []
  modified:
    - apps/web/package.json
decisions:
  - "D-129 typecheck-before-build ordering (verify chain) is the single TypeScript contract owner for apps/web; the build script no longer needs to re-assert it"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-24"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 07 Plan 09: Drop Redundant Typecheck Summary

**One-liner:** Removed `tsc --noEmit &&` prefix from `apps/web/package.json` scripts.build so `pnpm verify` typechecks apps/web exactly once (via the `pnpm -r typecheck` step) instead of twice.

## What Was Built

Single-line edit to `apps/web/package.json` closing WR-03 from `07-VERIFICATION.md`:

**Before:**
```json
"build": "tsc --noEmit && vite build",
```

**After:**
```json
"build": "vite build",
```

The `pnpm verify` chain (`pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build`) already invokes `apps/web/package.json` scripts.typecheck (`tsc --noEmit`) via `pnpm -r typecheck` before the build step runs. The second `tsc --noEmit` inside the build script was a redundant assertion of the same invariant.

## Exact Diff

```diff
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -7,7 +7,7 @@
     "dev": "vite",
-    "build": "tsc --noEmit && vite build",
+    "build": "vite build",
     "preview": "vite preview --host 0.0.0.0 --port 5173",
```

Net change: 1 line modified, -16 characters (`tsc --noEmit && ` removed from value string).

## Commit

| Commit | Message |
|--------|---------|
| 444e016 | chore(07-09): remove redundant tsc --noEmit from apps/web scripts.build (WR-03) |

## Verification Results

| Check | Result |
|-------|--------|
| `node -e` assert: scripts.build === "vite build" | PASSED |
| `node -e` assert: scripts.typecheck === "tsc --noEmit" (unchanged) | PASSED |
| `node -e` assert: other scripts (dev, preview, test) unchanged | PASSED |
| dep count: 24 deps, 16 devDeps (unchanged) | PASSED |
| `pnpm --filter @meditrack/web typecheck` exits 0 | PASSED |
| `pnpm --filter @meditrack/web build` exits 0 | PASSED |
| `pnpm verify` exits 0 end-to-end (lint + typecheck + test + build) | PASSED |

Test suite results during `pnpm verify`:
- apps/web: 15 test files, 94 tests — all passed
- apps/api: 17 test files, 118 tests — all passed

## Walltime Observation (Informational)

The redundant `tsc --noEmit` in the build script was invoked by both `pnpm -r typecheck` (correct) and `pnpm -r build` (redundant). Removing the build-side invocation saves approximately 5-10 seconds per fresh `pnpm verify` run. This is informational — not asserted programmatically per WR-03 specification.

## TypeScript Coverage Preserved

apps/web TypeScript coverage is maintained via:
1. `apps/web/package.json` scripts.typecheck remains `"tsc --noEmit"` (unchanged)
2. Root `package.json` scripts.verify runs `pnpm -r typecheck` **before** `pnpm -r build`
3. Any TypeScript error in apps/web still aborts `pnpm verify` at the typecheck step before the build runs

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. Tooling-only edit; no inputs, no auth code, no DB, no network, no new attack surface. Threat model T-07-14 / T-07-15 / T-07-16 dispositions confirmed as mitigated:
- T-07-14 (Tampering): verify chain ordering `pnpm -r typecheck` before `pnpm -r build` confirmed intact in root package.json
- T-07-15 (Repudiation): single owner for apps/web typecheck is now `pnpm -r typecheck` / scripts.typecheck — no two-location ambiguity

## Self-Check: PASSED

- [x] `apps/web/package.json` scripts.build is exactly `"vite build"` — confirmed by node -e assert
- [x] `apps/web/package.json` scripts.typecheck is `"tsc --noEmit"` — unchanged, confirmed
- [x] Commit 444e016 exists: `git log --oneline | grep 444e016` confirms
- [x] `pnpm --filter @meditrack/web typecheck` exited 0
- [x] `pnpm --filter @meditrack/web build` exited 0
- [x] `pnpm verify` exited 0
- [x] No modifications to STATE.md or ROADMAP.md by this executor
