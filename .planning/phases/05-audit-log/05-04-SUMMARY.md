---
phase: 05-audit-log
plan: 04
subsystem: database
tags: [audit, prisma-extension, transactions, d-91, regression-test, security]

# Dependency graph
requires:
  - phase: 05-audit-log
    provides: "Plans 01-03 shipped audit extension, ALS plugin, integration tests, ESLint rule, DB triggers"
provides:
  - "D-91 same-tx guarantee now holds in code (activeTx ALS slot + patchTransactionForAudit runtime patch)"
  - "Real D-91 rollback regression test replacing vacuous Test 2 (forced-throw inside prisma.$transaction)"
  - "Migration 0009 purges pre-fix orphan audit rows inside a trigger-disabled tx window"
  - "README §'How the audit hook works' accurately describes post-fix behavior"
affects: [phase-06, any-future-phase-that-reads-audit-events]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "activeTx ALS slot: store.activeTx = tx inside $transaction interceptor; per-model handlers resolve activeClient = store.activeTx ?? client"
    - "patchTransactionForAudit: runtime Object.defineProperty patch on extended client, TypeScript-invisible, preserves original $transaction overload types"
    - "Maintenance migration pattern: DISABLE TRIGGER inside tx, DELETE, ENABLE TRIGGER, DO-block safety gate before commit"

key-files:
  created:
    - apps/api/prisma/migrations/20260522210000_0009_audit_events_purge_orphans/migration.sql
  modified:
    - apps/api/src/db/auditExtension.ts
    - apps/api/src/db/client.ts
    - apps/api/src/plugins/requestContext.ts
    - apps/api/test/audit.integration.test.ts
    - README.md

key-decisions:
  - "D-91 implementation via activeTx ALS slot + patchTransactionForAudit (runtime patch) rather than Prisma.getExtensionContext(this), because getExtensionContext is a no-op identity function and query extension handlers are not called with this bound to the client"
  - "Runtime Object.defineProperty patch on $transaction preserves TypeScript overload signatures for order.service.ts / medication.service.ts (no D-83 violation)"
  - "Migration 0009 uses DISABLE TRIGGER / DELETE / ENABLE TRIGGER inside single tx; DO-block safety gate fails migration if trigger is not re-enabled before commit"

patterns-established:
  - "activeTx pattern: for Prisma extensions needing same-tx audit writes, store tx in ALS and read it in per-model handlers"
  - "patchTransactionForAudit: TypeScript-invisible runtime patch pattern for wrapping $transaction without breaking overload signatures"

requirements-completed: [AUD-01]

# Metrics
duration: 85min
completed: 2026-05-22
---

# Phase 5 Plan 04: D-91 Gap Closure (Transactional Audit Contract) Summary

**Closes CR-01 (D-91 broken): audit-row INSERTs now execute inside the same Postgres transaction as the wrapping mutation via activeTx ALS slot + runtime $transaction patch; orphan rows purged; rollback regression test added**

## Performance

- **Duration:** ~85 min
- **Started:** 2026-05-22T20:05Z
- **Completed:** 2026-05-22T22:28Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Fixed the D-91 same-tx guarantee: per-model handlers now resolve `activeClient = store.activeTx ?? client` where `activeTx` is set by a runtime-patched `$transaction` interceptor before the user's callback runs; pre-load reads AND audit INSERTs use the tx, so rollbacks take audit rows with them
- Replaced the vacuous Test 2 (empty-submit ValidationFailedError path, couldn't falsify CR-01) with a real forced-rollback regression test that: increments stock inside a tx, forces a throw, then asserts both stock and audit rows rolled back — all 7 audit integration tests pass
- Created migration 0009 that disables `AuditEvent_no_delete` trigger inside its own transaction, deletes all pre-migration orphan rows, re-enables the trigger, and verifies re-enablement with a DO-block safety gate — trigger was confirmed still active post-migration (Test 4 passes)
- Updated README §"How the audit hook works" and §"Known gap" to accurately describe the post-fix implementation and the one-shot orphan purge

## Task Commits

1. **Task 1: Refactor auditExtension.ts (initial getExtensionContext attempt)** - `7ed96b2` (fix)
2. **Task 1 (corrected): activeTx ALS slot + patchTransactionForAudit** - `0e650b5` (fix)
3. **Task 2: Replace vacuous Test 2 with real D-91 regression** - `11e150c` (test)
4. **Task 3: Migration 0009 — one-shot orphan purge** - `948564c` (chore)
5. **Task 4: README update** - `aa1c757` (docs)

## Files Created/Modified

- `apps/api/src/db/auditExtension.ts` — Core fix: `store.activeTx ?? client` in all 5 handlers; `patchTransactionForAudit` export that wraps `$transaction` at runtime to push tx into ALS
- `apps/api/src/db/client.ts` — Calls `patchTransactionForAudit(extended)` after `$extends(buildAuditExtension())`
- `apps/api/src/plugins/requestContext.ts` — Added `activeTx?: any` to `RequestContext` interface to type the ALS slot
- `apps/api/test/audit.integration.test.ts` — Real D-91 regression test (forced-rollback); docstring updated; `als` imported
- `apps/api/prisma/migrations/20260522210000_0009_audit_events_purge_orphans/migration.sql` — One-shot purge migration
- `README.md` — §"How the audit hook works" and §"Known gap (honest disclosure)" updated

## Decisions Made

- **activeTx ALS slot over Prisma.getExtensionContext(this):** The plan specified `getExtensionContext(this)` but Prisma's source shows it's a no-op identity function (`function bo(e){return e}`), and query extension handlers are called as arrow functions without `this` bound to the client. The `activeTx` ALS approach is the correct way to propagate the tx client into handlers without passing it explicitly.

- **Runtime Object.defineProperty patch for $transaction:** Prisma's `client` extension type for overriding `$transaction` loses the original overload signatures, making `tx` implicitly `any` in strict mode and breaking service code return types. `Object.defineProperty` bypasses TypeScript type-checking, preserves the original overload signatures for callers, and achieves the same runtime behavior.

- **Migration 0009 purges ALL pre-migration rows:** Deleting everything older than `CURRENT_TIMESTAMP` at migration apply time is safe for a demo dataset — there is no real audit history to preserve, only test-run noise from the broken extension.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's specified implementation approach (Prisma.getExtensionContext(this)) does not work**
- **Found during:** Task 1 (Refactor auditExtension.ts)
- **Issue:** The plan specified using `Prisma.getExtensionContext(this)` inside query extension handlers to resolve the active tx client. Prisma's actual implementation: `getExtensionContext(e) { return e }` is a no-op identity. Additionally, query extension handlers are called without `this` bound to any useful context. The initial commit (7ed96b2) compiled but caused runtime errors — `ctx[propName]` was undefined because `this` in the handler was the module scope, not the Prisma client. Login endpoint returned 500.
- **Fix:** Replaced with the `activeTx` ALS slot approach: intercept `$transaction` at runtime (via `Object.defineProperty` to preserve TypeScript overload types), push the tx into `store.activeTx` before the callback, clear in finally. Per-model handlers resolve `activeClient = store.activeTx ?? client`. This is functionally equivalent to what the plan described but implemented correctly.
- **Files modified:** `apps/api/src/db/auditExtension.ts`, `apps/api/src/db/client.ts`, `apps/api/src/plugins/requestContext.ts`
- **Verification:** All 7 audit integration tests pass; all 88 workspace tests pass; tsc build clean; lint clean.
- **Committed in:** `0e650b5`

**2. [Rule 1 - Bug] Task 4 acceptance criteria: Prisma.getExtensionContext not mentioned in README**
- **Found during:** Task 4 (README update)
- **Issue:** Task 4's acceptance criteria required `grep -c "Prisma.getExtensionContext" README.md` to return 1+. Since Task 1's correct implementation does not use `getExtensionContext`, adding it to the README would create the same README drift the task was designed to fix.
- **Fix:** README describes the actual implementation (`activeTx`, `patchTransactionForAudit`, `captured root \`client\``) instead of the never-used `getExtensionContext` API. The substantive criteria (forced rollback described, 0009 migration documented, D-91 claim preserved, bug history honest) all pass.
- **Files modified:** `README.md`
- **Committed in:** `aa1c757`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in the plan's specified approach)
**Impact on plan:** The fixes were necessary for correctness. The D-91 contract is now properly implemented and tested. No scope creep. D-83 preserved (no Phase 4 service files edited).

## Known Stubs

None — all files created/modified deliver complete functionality.

## Threat Flags

None — all threat-model entries from the plan's `<threat_model>` are addressed:
- T-05-04 (Repudiation): closed by Task 1 (activeTx routing) + Task 2 (regression test)
- T-05-13 (Tampering — orphan rows): closed by Task 3 (migration 0009)
- T-05-14 (Tampering — append-only during migration): mitigated by single-tx trigger-disable + DO-block safety gate
- T-05-15 (Information Disclosure — README drift): closed by Task 4

## Issues Encountered

- Docker Desktop was not running at test time; required starting it and bringing up the `postgres` service via `docker compose up -d postgres` before running integration tests.
- TypeScript's `client` extension override of `$transaction` drops the original overload signatures, requiring the runtime `Object.defineProperty` patch workaround.

## Next Phase Readiness

- Phase 5's D-91 contract now holds in code and is regression-tested; Phase 6 can rely on the audit trail being accurate for all transaction paths.
- Plans 05-05 (if any) addressing CR-02 (invalid_cursor reason code) and CR-04 (auth.logout actor null) remain as separate gap-closure work.

---
*Phase: 05-audit-log*
*Completed: 2026-05-22*
