---
phase: "07"
plan: "07-03"
subsystem: tooling
tags: [pnpm-verify, typecheck, scripts, readme, tester, phase7]
dependency_graph:
  requires:
    - "07-01: canonical-readme-structure (## Tester section)"
  provides:
    - "root scripts.verify = pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build"
    - "root scripts.typecheck = pnpm -r typecheck"
    - "apps/api scripts.typecheck = tsc --noEmit -p ."
    - "README ## Tester documents pnpm verify + SC#4 cross-reference"
  affects:
    - package.json
    - apps/api/package.json
    - README.md
tech_stack:
  added: []
  patterns:
    - "pnpm -r recursive scripts for monorepo orchestration (Pattern D)"
    - "per-workspace tsc --noEmit typecheck (Pattern E)"
    - "direct root lint (non-recursive eslint pass, Pattern E rationale (a))"
key_files:
  created: []
  modified:
    - package.json
    - apps/api/package.json
    - README.md
decisions:
  - "D-129: verify chain is pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build; root lint stays direct (non-recursive) per PATTERNS.md recommendation (a)"
  - "apps/api typecheck uses tsc --noEmit -p . scoped to src/ per existing tsconfig.json include:[src]; tests get typecheck coverage via vitest (Pattern E rationale (a))"
metrics:
  duration: "5 minutes"
  completed: "2026-05-24"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 07 Plan 03: pnpm verify Script Summary

Root `pnpm verify` wired as `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` per D-129. `apps/api/package.json` gains the missing `typecheck` script. README `## Tester` augmented with SC#4 Playwright cross-reference.

## What Was Built

### Task 1: Root `pnpm verify` + `apps/api` typecheck script

**Exact `scripts.verify` string committed to `package.json` (root):**
```
"verify": "pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build"
```

**Exact `scripts.typecheck` string committed to `package.json` (root):**
```
"typecheck": "pnpm -r typecheck"
```

Both added after the existing `"test": "pnpm -r test"` line; alphabetical placement (typecheck/verify after test, before lint per JSON key order in file).

**Exact `scripts.typecheck` string committed to `apps/api/package.json`:**
```
"typecheck": "tsc --noEmit -p ."
```

Added after `"build": "tsc -p ."` — direct analog of `apps/web/package.json` `"typecheck": "tsc --noEmit"` and `packages/shared/package.json` `"typecheck": "tsc -p . --noEmit"` (Pattern E).

**Root lint stays direct (non-recursive):** `"lint": "eslint . --ext .ts,.tsx,.cts,.cjs --max-warnings=0"` — unchanged from prior state. The `verify` chain uses `pnpm lint` (which invokes this direct pass) rather than `pnpm -r lint` because no per-workspace lint script exists. This is the PATTERNS.md recommendation (a) choice: minimum-surface-change consistent with the existing direct-eslint setup.

### Task 2: README `## Tester` SC#4 cross-reference

The `## Tester` section already had from Slice 1:
- Per-app vitest commands
- `pnpm verify` code-fence
- Walltime expectation (ca 5–6 minuter)
- Full chain citation

Task 2 added one paragraph immediately after the chain citation:

> SC#4 Playwright-layoutverifieringen ingår **inte** i `pnpm verify` — den kräver att `docker compose up` körs lokalt (api + web måste vara uppe). Dess dedikerade kommando och genomföranderesultat finns under [§ Mobil-först verifiering](#mobil-först-verifiering).

This satisfies D-129's requirement that README `## Tester` document that SC#4 Playwright is NOT chained into `pnpm verify` (separate concern; documented separately).

## Verification Results

| Check | Result |
|-------|--------|
| `scripts.verify` contains `pnpm lint` | PASS |
| `scripts.verify` contains `pnpm -r typecheck` | PASS |
| `scripts.verify` contains `pnpm -r test` | PASS |
| `scripts.verify` contains `pnpm -r build` | PASS |
| Root `scripts.typecheck` exists | PASS |
| `apps/api/scripts.typecheck` contains `tsc` | PASS |
| `apps/web/scripts.typecheck` exists (unchanged) | PASS |
| `packages/shared/scripts.typecheck` exists (unchanged) | PASS |
| `pnpm -r typecheck` exits 0 (all 3 workspaces) | PASS |
| README `## Tester` has `pnpm verify` | PASS |
| README `## Tester` has full chain `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` | PASS |
| README `## Tester` has walltime expectation (5–6 min) | PASS |
| README `## Tester` has `Mobil-först` cross-reference | PASS |
| Root `scripts.lint` is direct (non-recursive) | PASS |

## walltime Observed on `pnpm -r typecheck` (proxy — full verify requires running Postgres)

`pnpm -r typecheck` across all 3 workspaces: under 10 seconds (cold). The documented walltime of ~5–6 min for `pnpm verify` accounts for `pnpm -r test` which requires Postgres and runs the full integration suite.

## Deviations from Plan

None — plan executed exactly as written.

The README `## Tester` section already contained a `pnpm verify` mention, walltime, and chain citation from Slice 1. Task 2 added only the SC#4 cross-reference paragraph as directed. No duplication introduced.

## Known Stubs

None — this plan's goals are fully achieved. The `<!-- Populated by Slice 4 -->` placeholder in `## Mobil-först verifiering` belongs to plan 07-04 and is intentional.

## Threat Flags

None — tooling-only edit. Scripts execute local toolchain only (`eslint`, `tsc`, `vitest`, `tsc`/`vite build`). No new remote endpoints, no new dependencies, no new attack surface. T-07-06, T-07-07, T-07-08 all accepted per plan threat model.

## Self-Check

- [x] `package.json` modified: confirmed (scripts.verify + scripts.typecheck added)
- [x] `apps/api/package.json` modified: confirmed (scripts.typecheck added)
- [x] `README.md` modified: confirmed (SC#4 cross-reference paragraph added)
- [x] Commit `42094e6` exists: Task 1 (chore(07-03): wire root pnpm verify...)
- [x] Commit `ddd7a18` exists: Task 2 (docs(07-03): document pnpm verify...)
- [x] No unexpected file deletions in either commit: confirmed

## Self-Check: PASSED
