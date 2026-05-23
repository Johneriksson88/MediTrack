---
phase: 05-audit-log
plan: 07
subsystem: database
tags: [audit, postgres, named-role, defense-in-depth, d-98, reviews-high-3, docker-compose, prisma, migration]

# Dependency graph
requires:
  - phase: 05-audit-log/05-01
    provides: Migration 0008 OWNER-binding trigger (Layer 2a) — this plan adds Layer 2b on top
  - phase: 05-audit-log/05-03
    provides: Test 4 (DB-layer rejection assertion) — this plan extends it with role identity assertions
  - phase: 05-audit-log/05-06
    provides: activeTxStack + three-ALS refactor — ensures audit rows write correctly through meditrack_app role

provides:
  - "Named Postgres role meditrack_app created by migration 0010 with REVOKE UPDATE/DELETE/TRUNCATE on AuditEvent"
  - "docker-compose.yml splits DATABASE_URL (meditrack_app, runtime) from DIRECT_URL (meditrack, migrations)"
  - "schema.prisma datasource block has directUrl = env('DIRECT_URL') for Prisma's migration/seed runner"
  - "D-98 Layer 2b: REVOKE is now bound to a named role, not CURRENT_USER — architectural decision is durable"
  - "Integration test #4 extended: asserts current_user === meditrack_app + privilege check + optional owner-trigger test"
  - "README §Database roles documents the two-role split, env-var convention, and §6 interview narrative"

affects:
  - "Phase 6/7 — any future table added gets meditrack_app grants automatically via DEFAULT PRIVILEGES"
  - "docker-compose.yml API service now connects as meditrack_app at runtime"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner role (meditrack) for migrations/seed via DIRECT_URL; app role (meditrack_app) for runtime queries via DATABASE_URL"
    - "Prisma datasource directUrl for owner-vs-app-role URL split"
    - "DEFAULT PRIVILEGES IN SCHEMA public: new tables automatically inherit meditrack_app grants"

key-files:
  created:
    - apps/api/prisma/migrations/20260523000000_0010_audit_events_named_app_role/migration.sql
  modified:
    - docker-compose.yml
    - apps/api/prisma/schema.prisma
    - apps/api/test/helpers/buildTestApp.ts
    - apps/api/test/audit.integration.test.ts
    - .env.example
    - README.md

key-decisions:
  - "Named role meditrack_app over CURRENT_USER: REVOKE binds durably to a role name, not migration runtime; future role swap must consciously regrant (HIGH #3)"
  - "Migration 0008 SQL intentionally NOT modified: Prisma stores SHA-256 checksums of applied migrations — any byte change causes prisma migrate status to report drift"
  - "Cross-reference between migrations placed in 0010 header (forward-pointing) rather than editing 0008 (backward-pointing) to preserve the checksum invariant"
  - "Hardcoded password meditrack_app_dev in migration + docker-compose — explicitly non-production; README documents production substitution pattern"
  - "DEFAULT PRIVILEGES in migration 0010 ensures Phase 6/7 tables get meditrack_app grants automatically without a follow-up migration"

requirements-completed: [AUD-01, AUD-03]

# Metrics
duration: 35min
completed: 2026-05-23
---

# Phase 05 Plan 07: Named App Role + Append-Only Layer 2b Summary

**Named Postgres role `meditrack_app` with REVOKE on AuditEvent, wired via docker-compose DATABASE_URL / DIRECT_URL split, closing 05-REVIEWS.md HIGH #3 — the append-only REVOKE is now bound to a durable named role, not to CURRENT_USER**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-23T03:20:00Z
- **Completed:** 2026-05-23T03:56:00Z
- **Tasks:** 5
- **Files modified:** 6

## Accomplishments

- Migration 0010 creates `meditrack_app` with LOGIN privileges, broad GRANTs on all tables, DEFAULT PRIVILEGES for future tables, and explicit REVOKE of UPDATE/DELETE/TRUNCATE on AuditEvent — the D-98 Layer 2b contract
- docker-compose.yml and schema.prisma wired with the owner/app role URL split; `prisma migrate deploy` uses DIRECT_URL (owner), PrismaClient uses DATABASE_URL (app role)
- Migration 0010 applied cleanly; `prisma migrate status` reports no drift; migration 0008 SQL is untouched
- Integration test #4 extended with three new assertions: runtime role identity, privilege check, and optional owner-role trigger test — both enforcement layers are now backed by tests
- README §Database roles documents the two-role split, the env-var convention, the §6 interview narrative, and a roles/privileges table

## Task Commits

1. **Task 1: Create migration 0010** - `7a412c5` (feat)
2. **Task 2: Wire docker-compose + schema.prisma** - `f1bb26b` (feat)
3. **Task 3: Document 0008 → 0010 sequence in README** - `3bf39f4` (docs)
4. **Task 4: Extend audit Test 4** - `91cbe29` (test)
5. **Task 5: README §Database roles subsection** - `7454381` (docs)

## Files Created/Modified

- `apps/api/prisma/migrations/20260523000000_0010_audit_events_named_app_role/migration.sql` — New migration: CREATE ROLE meditrack_app + GRANTs + REVOKE on AuditEvent (Layer 2b)
- `docker-compose.yml` — API service: DATABASE_URL → meditrack_app, DIRECT_URL → meditrack (owner)
- `apps/api/prisma/schema.prisma` — Datasource block: added `directUrl = env("DIRECT_URL")`
- `apps/api/test/helpers/buildTestApp.ts` — DATABASE_URL stub updated to meditrack_app + added DIRECT_URL stub
- `apps/api/test/audit.integration.test.ts` — Test 4 extended: current_user, has_table_privilege, owner-trigger assertions
- `.env.example` — Both DATABASE_URL (app role) and DIRECT_URL (owner role) documented
- `README.md` — §Database roles subsection + Layer 2b narrative + two-migration sequence paragraph

## Decisions Made

- **Named role over CURRENT_USER.** CURRENT_USER at migration runtime evaluated to the table owner — Postgres bypasses GRANT/REVOKE for owners, making the Plan 01 REVOKE a no-op. A named role binds durably; future deployments must consciously regrant to relax the constraint.
- **Migration 0008 SQL left untouched.** Prisma stores a SHA-256 checksum of every applied migration. Comment-only edits change the checksum and cause drift. The 0008→0010 cross-reference lives in 0010's header (forward-pointing, safe) and in README.
- **Hardcoded password in migration.** `meditrack_app_dev` is unmistakably non-production. Interview demo context; README documents production substitution pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built @meditrack/shared before running tests**
- **Found during:** Task 2 verification (`pnpm test`)
- **Issue:** Worktree had node_modules installed but `@meditrack/shared` dist/ directory was missing (packages need to be built separately from install). Vitest reported "Failed to resolve entry for package @meditrack/shared".
- **Fix:** Ran `pnpm --filter @meditrack/shared run build` to compile the shared package TypeScript before the test run.
- **Files modified:** packages/shared/dist/ (generated, not committed)
- **Verification:** `pnpm --filter @meditrack/api test` then passed (95/95).
- **Committed in:** Not committed separately (build artifact, generated at runtime).

---

**Total deviations:** 1 auto-fixed (blocking — missing build artifact)
**Impact on plan:** No scope creep. Worktree-specific setup step not blocking any plan logic.

## Issues Encountered

None beyond the @meditrack/shared build step documented above.

## Known Stubs

None. All wiring is live: migration applied to the running DB, docker-compose env vars reference the actual role, test stubs use the actual meditrack_app credentials.

## Threat Flags

No new threat surface introduced beyond the T-05-28/T-05-29/T-05-30/T-05-31 entries already in the plan's `<threat_model>`. The hardcoded role password is T-05-31 (accepted for demo scope).

## Self-Check

### Created files exist
- [x] `apps/api/prisma/migrations/20260523000000_0010_audit_events_named_app_role/migration.sql` — verified
- [x] `.planning/phases/05-audit-log/05-07-SUMMARY.md` — this file

### Commits exist
- [x] `7a412c5` — feat(05-07): migration 0010
- [x] `f1bb26b` — feat(05-07): docker-compose + schema.prisma
- [x] `3bf39f4` — docs(05-07): README migration sequence
- [x] `91cbe29` — test(05-07): Test 4 extended
- [x] `7454381` — docs(05-07): README §Database roles

### Verification results
- `meditrack_app` role exists in Postgres: PASS
- `has_table_privilege('meditrack_app', '"AuditEvent"', 'UPDATE')` = `f`: PASS
- `has_table_privilege('meditrack_app', '"AuditEvent"', 'SELECT')` = `t`: PASS
- `prisma migrate status` → "Database schema is up to date!": PASS
- `git diff apps/api/prisma/migrations/.../0008.../migration.sql` → no changes: PASS
- All 95 tests pass: PASS

## Self-Check: PASSED

All files created, all commits verified, all DB assertions confirmed, migration 0008 untouched.

## Next Phase Readiness

- Plan 05-07 fully closes HIGH #3 from 05-REVIEWS.md
- The named-role pattern is documented and tested — Phase 6/7 tables get meditrack_app grants automatically via DEFAULT PRIVILEGES
- No blockers for subsequent plans

---
*Phase: 05-audit-log*
*Completed: 2026-05-23*
