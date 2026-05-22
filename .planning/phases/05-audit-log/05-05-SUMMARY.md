---
phase: 05-audit-log
plan: 05
subsystem: api
tags: [audit, error-taxonomy, auth-logout, als, actor-attribution, entity-type, regression-tests]

# Dependency graph
requires:
  - phase: 05-audit-log
    provides: "Plans 01-04 shipped audit extension, ALS plugin, integration tests, D-91 fix, ESLint rule, DB triggers"
provides:
  - "CR-02 closed: decodeCursor() throws ValidationFailedError with details.reason='invalid_cursor' (was 'invalid_quantity')"
  - "CR-04 closed: DELETE /api/auth/session resolves session.userId before destroySession; auth.logout audit rows carry actorUserId"
  - "WR-07 closed: AUDIT_ENTITY_TYPES extended with 'auth_attempt'; unknown-email failed-login writes entityType='auth_attempt', entityId=attemptedEmail"
  - "Four regression tests in audit.integration.test.ts (Tests 8-11) covering all three gap closures"
affects: [phase-06, any-code-switching-on-details-reason, audit-forensics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lookup-before-destroy: resolve session actor via findSessionById BEFORE destroySession so ALS store carries actorUserId at $extends write time"
    - "open-shape const-list extension: append to AUDIT_ENTITY_TYPES + matching label; TS exhaustiveness on Record<AuditEntityType, string> forces paired label addition at build time"

key-files:
  created: []
  modified:
    - apps/api/src/services/audit.service.ts
    - apps/api/src/plugins/errorHandler.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/services/auth.service.ts
    - packages/shared/src/constants/auditEntityType.ts
    - apps/api/test/audit.integration.test.ts

key-decisions:
  - "ValidationFailedError.details.reason union extended with 'invalid_cursor' in errorHandler.ts — the plan specified only changing the literal in audit.service.ts but the TS type constraint required extending the union too (Rule 1 auto-fix)"
  - "lookup-before-destroy over adding requireSession preHandler for logout: D-01 idempotency preserved; findSessionById called before logout(); setActor() skipped when session is null or absent"
  - "auth_attempt entityType for unknown-email failed-login: semantically distinct from 'session' (no Session row exists); attemptedEmail as entityId enables forensic filter ?entityType=auth_attempt&entityId=X"

patterns-established:
  - "Cursor error envelope: details.reason='invalid_cursor' for cursor decode failures — distinct from order-domain 'invalid_quantity'"

requirements-completed: [AUD-01, AUD-02]

# Metrics
duration: 30min
completed: 2026-05-22
---

# Phase 5 Plan 05: Three Backend Hygiene Fixes (CR-02 / CR-04 / WR-07) Summary

**Cursor-error taxonomy corrected ('invalid_cursor' not 'invalid_quantity'), logout audit actor attribution restored (findSessionById before destroySession), and unknown-email failed-login rows retyped as 'auth_attempt' with attempted email as entityId — all three backed by regression tests**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-22T22:28Z
- **Completed:** 2026-05-22T22:50Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Closed CR-02: `decodeCursor()` in audit.service.ts now throws `ValidationFailedError` with `details.reason: 'invalid_cursor'` instead of the copy-pasted order-domain `'invalid_quantity'` — FE error-toast localization switching on `details.reason` will no longer mis-localize cursor failures
- Closed CR-04: `DELETE /api/auth/session` now calls `findSessionById(unsigned.value)` before `logout()`, then `setActor(session.userId, session.careUnitId, req.ip)` so the ALS store carries the actor at the moment `$extends` writes the `auth.logout` audit row — "who logged out user X" is now answerable
- Closed WR-07: `AUDIT_ENTITY_TYPES` extended from 6 to 7 entries with `'auth_attempt'` (Swedish label: `'inloggningsförsök'`); unknown-email failed-login rows now write `entityType='auth_attempt'` and `entityId=email` — admin brute-force filter `?entityType=auth_attempt&entityId=alice@example.com` is now semantically meaningful
- Added 4 regression tests (Tests 8-11): CR-02 cursor envelope, CR-04 logout actor, WR-07 unknown-email branch, WR-07 known-user-wrong-password branch protection; all 11 audit integration tests + all 92 workspace tests pass

## Task Commits

1. **Task 1: CR-02 — replace cursor decode error reason code with 'invalid_cursor'** — `af15979` (fix)
2. **Task 2: CR-04 — DELETE /api/auth/session resolves session actor before logout** — `d2ce395` (fix)
3. **Task 3: WR-07 — extend AUDIT_ENTITY_TYPES with auth_attempt** — `d7bd8ae` (fix)
4. **Task 4: Add regression tests for CR-02, CR-04, WR-07** — `9c6a8f2` (test)

## Files Created/Modified

- `apps/api/src/services/audit.service.ts` — `decodeCursor()` catch branch: `reason: 'invalid_cursor'`; docstring updated
- `apps/api/src/plugins/errorHandler.ts` — `ValidationFailedError.details.reason` union extended with `'invalid_cursor'`
- `apps/api/src/routes/auth.ts` — imports `findSessionById`, `setActor`; DELETE handler resolves session before logout; docstring updated
- `apps/api/src/services/auth.service.ts` — unknown-email branch: `entityType: 'auth_attempt'`, `entityId: email`; comment updated
- `packages/shared/src/constants/auditEntityType.ts` — `AUDIT_ENTITY_TYPES` gets `'auth_attempt'`; `AUDIT_ENTITY_TYPE_LABELS` gets `'auth_attempt': 'inloggningsförsök'`; docstring updated
- `apps/api/test/audit.integration.test.ts` — 4 new tests (8-11); Test 7 comment updated; top-level docstring updated

## Decisions Made

- **Extended ValidationFailedError.details.reason union (errorHandler.ts):** The plan only specified changing the literal string in `audit.service.ts`, but TypeScript's strict type union on `details.reason` rejected `'invalid_cursor'` at build time. Extended the union in `errorHandler.ts` to include `'invalid_cursor'` — this is a necessary correctness fix that also documents the new reason code at its authoritative source.

- **lookup-before-destroy pattern for CR-04:** Phase 1 D-01 locks logout as idempotent — `requireSession` preHandler was not added. Instead, `findSessionById` is called inside the existing `if (unsigned.valid && unsigned.value)` guard before `logout()`. If the session is null (already expired / stale cookie), `setActor()` is skipped, logout still returns 204.

- **'auth_attempt' over 'session' for unknown-email failed-login:** The "no User exists" path is semantically an authentication attempt, not a session operation. Using `'auth_attempt'` makes the entityType structurally distinct. The known-user-wrong-password branch stays as `entityType: 'session'` (unchanged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ValidationFailedError.details.reason union required extension**
- **Found during:** Task 1 (CR-02 cursor reason code fix)
- **Issue:** The plan specified only changing the literal string `'invalid_quantity'` to `'invalid_cursor'` in `audit.service.ts:89`. At build time, `tsc` rejected the literal: `Type '"invalid_cursor"' is not assignable to type '"empty_order" | "invalid_quantity" | "medication_removed"'`. The union in `errorHandler.ts:100` needed to include the new reason code.
- **Fix:** Added `'invalid_cursor'` to the `reason` union in `ValidationFailedError`'s constructor parameter type in `errorHandler.ts`.
- **Files modified:** `apps/api/src/plugins/errorHandler.ts`
- **Verification:** `pnpm --filter "@meditrack/api" build` exits 0; `pnpm --filter "@meditrack/api" test` exits 0 (92 tests pass).
- **Committed in:** `af15979` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — TypeScript type constraint not reflected in plan's action spec)
**Impact on plan:** The fix is necessary for correctness and also improves documentation by making `'invalid_cursor'` explicit in the authoritative error-type definition. No scope creep.

## Known Stubs

None — all three gap closures deliver complete functionality. No placeholder data flows.

## Threat Flags

None — T-05-16, T-05-17, T-05-18, T-05-19, T-05-SC from the plan's threat model are all addressed by the four tasks. No new security-relevant surface introduced.

## Issues Encountered

None beyond the Rule 1 auto-fix above.

## Next Phase Readiness

- All four Phase 5 BLOCKERs from VERIFICATION.md are now closed: CR-01 (Plan 04), CR-02 (Plan 05 Task 1), CR-04 (Plan 05 Task 2), WR-07 (Plan 05 Task 3).
- Phase 5 audit log surface is complete: AUD-01, AUD-02, AUD-03 all satisfied with regression test coverage.
- Phase 6 (AI categorization + low-stock notifications) can proceed.

---
*Phase: 05-audit-log*
*Completed: 2026-05-22*
