---
phase: "07"
plan: "07-10"
subsystem: api
tags: [bugfix, sort, collation, dashboard, gap-closure]
dependency_graph:
  requires: []
  provides: ["dashboard-sort-collation-fix"]
  affects: ["apps/api/src/services/dashboard.service.ts"]
tech_stack:
  added: []
  patterns: ["LOWER() for case-insensitive ORDER BY in Postgres"]
key_files:
  created: []
  modified:
    - apps/api/src/services/dashboard.service.ts
decisions:
  - "Use LOWER(m.\"name\") instead of a functional index — low-stock result sets are small (<50 rows); seq-scan-then-sort is adequate; index can be added if profiling shows it matters"
metrics:
  duration: "< 5 minutes"
  completed: "2026-05-24"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 07 Plan 10: Dashboard Sort Collation Fix Summary

**One-liner:** Fixed Postgres C/POSIX vs JS localeCompare collation mismatch in dashboard low-stock ORDER BY by wrapping the secondary sort key in `LOWER()`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Change ORDER BY secondary key to LOWER(m."name") ASC | 1e72484 | apps/api/src/services/dashboard.service.ts |

## Exact One-Line Diff

```diff
-             m."name" ASC
+             LOWER(m."name") ASC
```

File: `apps/api/src/services/dashboard.service.ts` line 77 (inside the `$queryRaw` ORDER BY clause).

Net change: +7 characters, single line edited.

## Verification Results

- `grep -F 'LOWER(m."name") ASC' apps/api/src/services/dashboard.service.ts` — returns one line. PASS.
- `grep -c 'm."name" ASC' apps/api/src/services/dashboard.service.ts` — returns 0. PASS.
- `pnpm --filter @meditrack/api typecheck` — exits 0. PASS.
- `pnpm exec vitest run test/dashboard.integration.test.ts` — all 3 tests pass (Test 1 shape + sort, Test 2 cross-careUnit isolation, Test 3 post-deliver refetch). PASS.
- `pnpm verify` — lint + typecheck + test (118 API + 94 web) + build — exits 0 end-to-end. PASS.

## Why This Slice Was Added Mid-Phase

Post-merge gate failure uncovered during Phase 07 Wave 1 verification run. The bug pre-existed Wave 1 (seeded data mixes ALL-CAPS names with Title-case names) but was only surfaced when `pnpm verify` ran the dashboard integration test suite to its conclusion. This is independent of 07-07/07-08/07-09 (different file) and was required to flip the Phase 07 verifier gate from FAILED to green.

## Root Cause

Postgres default collation is C/POSIX (byte order). `'V'` (0x56) sorts before `'b'` (0x62), so `AVONEX®` appeared before `Abseamed` in query results. The test asserted via JS `String.prototype.localeCompare()` with no explicit locale, which uses locale-aware case-insensitive compare (alphabetical: `Abseamed` < `AVONEX®`). The two orderings diverged whenever a seed row had an ALL-CAPS name adjacent to a Title-case row with the same urgency ratio.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — the change replaces a column reference with `LOWER(column)` in an existing parameterised `$queryRaw`. No new user input enters the query; no injection surface added (T-07-17 deterministic, T-07-18 careUnitId scope unchanged).

## Self-Check

- [x] `apps/api/src/services/dashboard.service.ts` exists and contains `LOWER(m."name") ASC`
- [x] Commit `1e72484` exists in git log
- [x] `pnpm verify` exits 0
- [x] No modifications to STATE.md or ROADMAP.md
