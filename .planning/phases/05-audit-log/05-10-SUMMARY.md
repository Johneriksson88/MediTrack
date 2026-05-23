---
phase: 05-audit-log
plan: 10
subsystem: api
tags: [audit, code-comment, documentation, readme, lessons-learned]

# Dependency graph
requires:
  - phase: 05-audit-log plan 02
    provides: listAuditFilters() with 60s module-scope memoization (D-103)
  - phase: 05-audit-log plan 06
    provides: per-concern ALS refactor retiring enterWith in favor of als.run
  - phase: 05-audit-log plan 09
    provides: README §What I'm least proud of section with enterWith prose
provides:
  - Inline JSDoc comment block in audit.service.ts explaining the 60s filter-cache
    staleness window, v1 conscious decision, v2 invalidation candidates, and cross-ref
    to 05-REVIEWS.md MEDIUM #9
  - README §Lessons learned subsection bundling three Phase 5 process retros:
    enterWith (MEDIUM #11), shared-store anti-pattern (HIGH #1), Prisma key-casing trap
affects: [phase-06, phase-07, future contributors to audit.service.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Comment block pattern for documenting cache TTL + staleness window + v2 invalidation candidates"
    - "README §Lessons learned subsection pattern for process retros separate from §What I'm least proud of"

key-files:
  created: []
  modified:
    - apps/api/src/services/audit.service.ts
    - README.md

key-decisions:
  - "Added §Lessons learned as a separate subsection from §What I'm least proud of — technical limitations vs process retros deserve distinct headings"
  - "Moved the enterWith paragraph out of §What I'm least proud of (process retro) and into §Lessons learned — keeps §What I'm least proud of focused on technical limitations"
  - "MEDIUM #9 comment placed above the FiltersCacheEntry interface (not above the function) — matches the file's existing pattern of documenting data structures near their declaration"

patterns-established: []

requirements-completed: [AUD-02]

# Metrics
duration: 12min
completed: 2026-05-23
---

# Phase 05 Plan 10: Comments and Lessons Learned Summary

**Inline 60s-cache-staleness JSDoc in audit.service.ts (MEDIUM #9) and §Lessons learned README subsection bundling three Phase 5 process retros with source-of-truth citations (MEDIUM #11, HIGH #1, Plan 01 Prisma key-casing)**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-23T00:00:00Z
- **Completed:** 2026-05-23T00:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a ~45-line JSDoc block above the `FiltersCacheEntry` interface in `audit.service.ts` explaining the 60s TTL, why 60s is acceptable for a forensics tool, the staleness window when a new entityType lands, and two v2 invalidation candidates. Cites 05-REVIEWS.md MEDIUM #9 explicitly. Zero executable code changes.
- Added a new `### Lessons learned` subsection to README.md between §What I'm least proud of and §Login rate-limiting, capturing three Phase 5 process retros: (1) enterWith vs als.run — Node.js docs warning not consulted (MEDIUM #11), (2) shared-mutable-store anti-pattern caused three of six bugs (HIGH #1), (3) Prisma `$extends` key-casing trap — lowercase modelProps not PascalCase (Plan 05-01 SUMMARY auto-fix #3).
- Refactored §What I'm least proud of: moved the enterWith paragraph (a process retro) into §Lessons learned, so §What I'm least proud of now focuses exclusively on technical limitations.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add inline cache-staleness comment to audit.service.ts listAuditFilters** - `f29fc00` (docs)
2. **Task 2: README — add §Lessons learned subsection with three Phase 5 process retros** - `b8208d1` (docs)

**Plan metadata:** (see final commit)

## Files Created/Modified

- `apps/api/src/services/audit.service.ts` — Added ~45-line JSDoc block above `FiltersCacheEntry` interface documenting the 60s memoization TTL, staleness window, v1 conscious decision, v2 invalidation candidates, and MEDIUM #9 cross-reference
- `README.md` — Added `### Lessons learned` subsection (40 lines) between §What I'm least proud of and §Login rate-limiting; moved enterWith paragraph from §What I'm least proud of into the new subsection

## Decisions Made

- Added `### Lessons learned` as a separate `###` subsection rather than bullets inside §What I'm least proud of. Technical limitations and process retros deserve distinct sections; the interviewer scanning the README can find "what would you do differently" in one dedicated place.
- Moved the enterWith paragraph out of §What I'm least proud of. The plan confirmed this was a process retro (the primitive behavior itself is well-understood; the failure was not consulting the docs). §What I'm least proud of now covers only the `$queryRaw` blind spot.
- Placed the MEDIUM #9 comment above `FiltersCacheEntry` (not above `listAuditFilters()`). The cache variable and its TTL are the implementation details being documented; the interface declaration is the natural anchor.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

The worktree does not have its own `node_modules` — TypeScript and ESLint binaries live in the main repo's `node_modules`. Ran `tsc --noEmit` from `C:\Projekt\MediTrack\apps\api` (which points to the same source files). Exit 0. The comment-only change carries no type risk.

## Known Stubs

None — documentation-only plan, no code stubs.

## Threat Flags

None — documentation-only plan, no new trust boundaries or network endpoints.

## Self-Check: PASSED

- `apps/api/src/services/audit.service.ts` — FOUND
- `README.md` — FOUND
- `.planning/phases/05-audit-log/05-10-SUMMARY.md` — FOUND (this file)
- commit f29fc00 — FOUND
- commit b8208d1 — FOUND

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 5 polish complete: all REVIEWS.md findings from Plans 05-07 through 05-10 are closed or explicitly deferred.
- Phase 6 (AI categorization + low-stock notifications) can begin; the audit hook pattern is fully documented and stable.

---
*Phase: 05-audit-log*
*Completed: 2026-05-23*
