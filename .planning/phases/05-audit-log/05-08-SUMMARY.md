---
phase: 05-audit-log
plan: "08"
subsystem: audit
tags: [audit, eslint, no-restricted-syntax, createMany, executeRaw, before-insert-trigger, ci-grep, d-93, d-99, defense-in-depth, reviews-high-4, reviews-medium-5, reviews-low-12]
dependency_graph:
  requires: [05-07]
  provides: [createMany-ban, executeRaw-ci-allowlist, empty-entityId-trigger]
  affects: [.eslintrc.cjs, apps/api/test/audit.integration.test.ts, apps/api/prisma/migrations, README.md]
tech_stack:
  added: []
  patterns: [ESLint no-restricted-syntax overrides, git-grep CI allowlist test, plpgsql BEFORE INSERT trigger, SQLSTATE 23514]
key_files:
  created:
    - apps/api/prisma/migrations/20260523001000_0011_audit_events_reject_empty_entity_id/migration.sql
  modified:
    - .eslintrc.cjs
    - apps/api/test/audit.integration.test.ts
    - README.md
decisions:
  - "D-93 operationalised via ESLint overrides block: seed.ts is the sole createMany exception; all other files get a PR-time lint error citing D-93 + HIGH #4"
  - "$executeRaw allowlist starts empty: Phase 4 D-79 FOR UPDATE uses $queryRaw (READ form), not subject to the ban"
  - "BEFORE INSERT trigger chosen over CHECK constraint for pattern consistency with migration 0008's existing BEFORE trigger idiom"
  - "REPO_ROOT resolved via fileURLToPath(__filename) to avoid vitest cwd ambiguity when git grep targets apps/ and packages/"
  - "Test 16 excludes migration SQL files and comment-only lines from production-code match filtering"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-23"
  tasks: 4
  files: 4
---

# Phase 05 Plan 08: Defense-in-Depth Audit Guards Summary

Three gap-closure guards from 05-REVIEWS.md (HIGH #4, MEDIUM #5, LOW #12) applied as a single cohesive plan: ESLint createMany ban, $executeRaw CI allowlist, and a BEFORE INSERT trigger rejecting empty-string entityId.

## What Was Built

### Task 1 — ESLint createMany ban (.eslintrc.cjs)

Extended the existing `no-restricted-syntax` rule with a third selector banning `MemberExpression[property.name='createMany']` on any model. The rule message cites D-93 and 05-REVIEWS.md HIGH #4 and directs contributors to two valid alternatives: decompose into individual `prisma.<model>.create()` calls (intercepted by the audit extension) or reopen D-93 to intercept createMany. An `overrides` block exempts `apps/api/prisma/seed.ts` (the sole D-93 consumer). A header block comment documents the extension.

Verification: scratch file `_scratch_eslint_createMany.ts` confirmed the rule fires (exit 1 with the error message); file was deleted after verification. Full monorepo lint passes (exit 0).

### Task 2 — Test 15: $executeRaw CI allowlist (audit.integration.test.ts)

Added Test 15 in a new `AUD-03 — defense-in-depth guards (Plan 05-08)` describe block. Uses `execFileSync` + `git grep` from `REPO_ROOT` (resolved via `fileURLToPath(import.meta.url)` to avoid `process.cwd()` ambiguity when vitest runs from `apps/api`). The allowlist is empty at Phase 5 close — confirmed by pre-task grep showing zero `$executeRaw/$executeRawUnsafe` production-code matches (only comment lines and test-file assertions).

Filters exclude: test files, migration `.sql` files, and comment-only lines (starting with `//`, `*`, `/*`).

Also stubbed Test 16 (DB-layer empty-entityId trigger rejection) in this task so the full test shape is committed before the migration lands in Task 3.

### Task 3 — Migration 0011: BEFORE INSERT trigger (migration.sql)

Created `20260523001000_0011_audit_events_reject_empty_entity_id/migration.sql` with a `plpgsql` BEFORE INSERT trigger that raises SQLSTATE 23514 when `NEW."entityId" = '' OR NEW."entityId" IS NULL`. Column name verified against `information_schema.columns` — Prisma uses camelCase `"entityId"` (no `@map` directive). Migration applied via `prisma migrate deploy` with owner credentials. Trigger presence confirmed via `pg_trigger` catalog query.

Pre-flight verification: `git grep -nE "entityId:\s*['\"]\\s*['\"]" apps/api/src/ packages/` returned zero matches — no existing production path writes an empty-string entityId literal.

Test 16 (added in Task 2) now passes: `ownerPrisma.auditEvent.create({ entityId: '' })` is rejected with an error matching `/non-empty string/`.

### Task 4 — README update

Added `### Defense-in-depth guards (Plan 05-08)` section listing all three guards with cross-references to HIGH #4, MEDIUM #5, LOW #12 and the implementing artifacts. Updated:
- "Known gap" → gap is now guarded by Test 15 CI grep (not just documented)
- "What I'm proud of" → references Tests 15+16 joining the existing Tests 3+4
- "What I'm least proud of" → CI grep shipped; gap is guarded not just disclosed
- v2 candidates → removed `$executeRaw allowlist CI grep` (now shipped)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] REPO_ROOT resolution for git-grep cwd**
- **Found during:** Task 2 test run
- **Issue:** `process.cwd()` in vitest context is `apps/api`, not the repo root. Running `git grep ... apps packages` from `apps/api` fails with `fatal: ambiguous argument 'apps'`.
- **Fix:** Added `const REPO_ROOT = path.resolve(__dirname, '../../..')` using `fileURLToPath(import.meta.url)` for stable resolution from the test file's location.
- **Files modified:** `apps/api/test/audit.integration.test.ts`
- **Commit:** a960497

**2. [Rule 1 - Bug] Migration SQL comments matched by $executeRaw grep**
- **Found during:** Task 2 test run (first pass)
- **Issue:** `apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql` contains a `-- D-100 test #3 asserts that \`prisma.$executeRawUnsafe(...)\`` comment that matched the grep pattern, triggering a false positive.
- **Fix:** Extended the production-match filter to also exclude `.sql` migration files and comment-only lines (starting with `//`, `*`, `/*`).
- **Files modified:** `apps/api/test/audit.integration.test.ts`
- **Commit:** a960497

**3. [Rule 3 - Blocking] node_modules not present in worktree**
- **Found during:** Task 2 verification
- **Issue:** The worktree at `agent-a62b89e4a739ac01f` doesn't have its own `node_modules`; the vitest binary in the main repo's `apps/api/node_modules` resolved from the main path only.
- **Fix:** Created a Windows NTFS junction `worktree/apps/api/node_modules → main/apps/api/node_modules` so the worktree's vitest config can resolve the `vitest/config` import.
- **Impact:** Test execution proceeds. The junction is a per-session worktree artifact (not committed).

## Known Stubs

None. All three guards are fully wired:
- ESLint rule fires (verified via scratch file)
- Test 15 passes against current codebase (zero off-allowlist matches)
- Test 16 passes against deployed trigger (SQLSTATE 23514 returned)

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. The migration adds a DB trigger (server-side only, no new API surface). The ESLint rule and CI grep are tooling only.

## Self-Check: PASSED

All created files exist and all commits are present:
- `.eslintrc.cjs` — FOUND
- `apps/api/test/audit.integration.test.ts` — FOUND
- `apps/api/prisma/migrations/20260523001000_0011_audit_events_reject_empty_entity_id/migration.sql` — FOUND
- `README.md` — FOUND
- `.planning/phases/05-audit-log/05-08-SUMMARY.md` — FOUND

Commits:
- a611777: feat(05-08): ban createMany outside seed.ts via ESLint no-restricted-syntax
- a960497: feat(05-08): add Test 15 ($executeRaw allowlist) and Test 16 (empty-entityId trigger)
- c94efec: feat(05-08): migration 0011 — BEFORE INSERT trigger rejecting empty entityId
- fa7e531: docs(05-08): README — document three new defense-in-depth audit guards
