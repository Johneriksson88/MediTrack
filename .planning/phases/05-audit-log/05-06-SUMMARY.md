---
phase: 05-audit-log
plan: 06
subsystem: api
tags: [audit, als, asynclocalstorage, fastify, prisma, transactions, concurrency, regression-test]

# Dependency graph
requires:
  - phase: 05-audit-log
    provides: "Plan 05-04 activeTx slot + patchTransactionForAudit; Plan 05-05 test infrastructure and D-91/D-92/D-94 contracts"
provides:
  - "Three independent per-concern ALS instances (actorALS, activeTxStackALS, actionOverrideALS) replacing the single shared RequestContext store"
  - "withActiveTx push/pop via immutable .run() stack frames — structurally eliminates CR-01 nested + parallel tx cross-attribution"
  - "actorALS.run in Fastify 3-arg onRequest hook — eliminates CR-04 keep-alive TCP frame leakage"
  - "withActionOverride async wrapper fix for PrismaPromise lazy evaluation"
  - "Regression tests 12-14 guarding nested tx, parallel tx, and keep-alive frame isolation"
affects: [any future phase touching audit pipeline, request context, or $transaction usage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-concern AsyncLocalStorage — three independent ALS instances, each owned exclusively via .run(value, fn); no shared mutable object; no .enterWith"
    - "activeTxStack via immutable .run([...prev, tx], fn) — push/pop without mutating a shared slot"
    - "Fastify 3-arg onRequest hook with actorALS.run(scope, () => done()) for request-scoped ALS frames"
    - "async closure inside actionOverrideALS.run to preserve ALS frame through PrismaPromise lazy evaluation"

key-files:
  created: []
  modified:
    - apps/api/src/plugins/requestContext.ts
    - apps/api/src/db/auditExtension.ts
    - apps/api/src/services/auth.service.ts
    - apps/api/test/audit.integration.test.ts
    - README.md

key-decisions:
  - "Per-concern ALS (HIGH #1): three independent AsyncLocalStorage instances replace the single shared RequestContext; each concern gets exactly the lifetime it needs via .run() stack frames"
  - "activeTxStack shipped as default (HIGH #2): .run([...prev, tx], fn) push/pop pattern — nested txs get independent stack frames; parallel txs get independent ALS frames from the start; no race condition possible"
  - "withActionOverride uses async () => fn() wrapper inside .run(): PrismaPromise is lazy — without the async wrapper, the ALS frame is gone by the time the $extends handler fires"
  - "Fastify 3-arg hook: actorALS.run(scope, () => done()) replaces als.enterWith() — done() propagates the ALS frame through the full request pipeline; per-request isolation on keep-alive TCP connections"
  - "Test 12 corrected: Prisma nested $transaction creates INDEPENDENT Postgres transactions (not savepoints); inner tx commits before outer throws; correct assertion is outerOrphanRows=0 AND innerCommittedRows=1"

patterns-established:
  - "Per-concern ALS pattern: each cross-cutting concern (actor identity, active tx, action override) owns its own AsyncLocalStorage instance; value set exclusively via .run()"
  - "ALS stack for resource scope: push with .run([...stack, item], fn); pop is implicit on fn return; reads via stack.at(-1)"
  - "async wrapper for PrismaPromise: actionOverrideALS.run(action, async () => fn()) — the async closure starts executing within the ALS frame; its continuation chain inherits the frame"

requirements-completed: [AUD-01]

# Metrics
duration: 90min
completed: 2026-05-23
---

# Phase 05 Plan 06: Per-Concern ALS Refactor Summary

**Replaced the single shared `RequestContext` store with three per-concern `AsyncLocalStorage` instances (actorALS, activeTxStackALS, actionOverrideALS) using `.run()` stack frames, structurally eliminating CR-01 nested/parallel tx cross-attribution and CR-04 keep-alive frame leakage**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-05-23T00:00:00Z
- **Completed:** 2026-05-23T01:13:33Z
- **Tasks:** 6 of 6
- **Files modified:** 5

## Accomplishments

- Three independent ALS instances replace the single `RequestContext` store; no shared mutable object; no `.enterWith`; every value set via `.run(value, fn)` with implicit save/restore via Node.js stack frames
- `activeTxStackALS` with immutable push/pop pattern (`withActiveTx`) replaces the `store.activeTx = tx; finally { store.activeTx = undefined }` asymmetric clear that caused CR-01
- `actorALS.run(scope, () => done())` in Fastify's 3-arg `onRequest` hook replaces `als.enterWith()`, eliminating CR-04 keep-alive TCP frame leakage; per-request ALS isolation holds under concurrent keep-alive load
- `withActionOverride` wraps `fn()` in an `async` closure inside `.run()` to preserve the ALS frame through Prisma's lazy `PrismaPromise` evaluation (the extension handler fires at `.then()` time, not at method-call time)
- Three regression tests (12: nested tx, 13: parallel tx with `setImmediate` interleaving, 14: keep-alive frame isolation) guard all three concurrency scenarios; all 95 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace shared RequestContext with three per-concern ALS instances** - `17e8ffe` (refactor)
2. **Task 2: Migrate auditExtension.ts to per-concern ALS + withActiveTx stack** - `d9e1105` (refactor)
3. **Task 3: Migrate auth.service.ts to per-concern ALS helpers** - `767d052` (refactor)
4. **Task 4: Verification (all 95 tests pass)** - no commit (verification-only task)
5. **Task 5: Migrate audit integration tests + add CR-01/CR-04 regression tests** - `b7fd5bd` (test) + `84bc6ce` (fix: async closure)
6. **Task 6: Update README audit hook section for per-concern ALS design** - `33c23b8` (docs)

**Note on Task 5:** Two commits — the initial test migration commit (`b7fd5bd`) and a subsequent fix commit (`84bc6ce`) when Test 1 failed because `actionOverrideALS.run(action, fn)` didn't propagate through Prisma's lazy PrismaPromise. Fixed by changing `withActionOverride` to use `actionOverrideALS.run(action, async () => fn())`.

## Files Created/Modified

- `apps/api/src/plugins/requestContext.ts` — Complete rewrite: three per-concern ALS instances, five new helper exports (`currentActor`, `currentRequestId`, `currentActionOverride`, `currentActiveTx`, `withActiveTx`), Fastify 3-arg hook, removed `als` + `RequestContext`
- `apps/api/src/db/auditExtension.ts` — `patchTransactionForAudit` now uses `withActiveTx` (stack push/pop); per-model handlers read `actorALS.getStore()` + `currentActiveTx()` + `currentActionOverride()` instead of `als.getStore()` + `store.activeTx`
- `apps/api/src/services/auth.service.ts` — Login path uses `setActor(user.id, user.careUnitId)` + `withActionOverride('auth.login', () => createSession(...))`; auth.login_failed branches use `actorALS.getStore()` for actor
- `apps/api/test/audit.integration.test.ts` — Imports `actorALS` instead of `als`; Test 2 uses `actorALS.run`; three new regression tests (12, 13, 14) for nested tx, parallel tx with setImmediate, keep-alive frame isolation
- `README.md` — §"How the audit hook works" rewritten to document three-ALS architecture; §"What I'm proud of" extended with ALS refactor narrative; §"What I'm least proud of" extended with enterWith lesson and shared-store retro

## Decisions Made

- **Per-concern ALS instances (HIGH #1 from 05-REVIEWS.md):** Three independent `AsyncLocalStorage` instances instead of one shared `RequestContext` object. Each concern (`actorALS`, `activeTxStackALS`, `actionOverrideALS`) has exactly the lifetime appropriate to it: request scope, tx scope, and call scope respectively. The structural fix eliminates the entire class of "shared mutable slot leaks across concurrency boundaries" bugs — not just the specific CR-01/CR-04 cases.

- **activeTxStack shipped as default (HIGH #2 from 05-REVIEWS.md):** Original plan had a stack as a fallback "if the parallel test fails." The reviews report recommended shipping the stack from day 1. Done. Cost is O(depth) array allocation per `$transaction` call — negligible vs Prisma round-trip latency.

- **withActionOverride async wrapper:** `actionOverrideALS.run(action, async () => fn())` rather than `actionOverrideALS.run(action, fn)`. This was discovered empirically during Task 5 — Test 1 failed because Prisma's `PrismaPromise` is lazy. The plan's suggested `run(action, fn)` only activates the ALS frame during the synchronous `fn()` call; since `fn()` just returns a lazy Promise without triggering execution, the frame was gone when the `$extends` handler fired. The `async` wrapper starts executing within the ALS context and its continuation chain inherits the frame.

- **Test 12 correction (Prisma nested transaction semantics):** The plan's test expectation was wrong — it assumed Prisma uses savepoints for nested `$transaction` calls. Prisma 5 does NOT support savepoints in interactive `$transaction` mode. Calling `prisma.$transaction(inner)` on the ROOT client from inside an outer `$transaction` callback creates a NEW INDEPENDENT Postgres transaction. The inner tx commits before the outer throws, so its audit row persists. Correct assertion: `outerOrphanRows=0` (CR-01 fixed) AND `innerCommittedRows=1` (inner tx committed independently — expected).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] actionOverrideALS not propagating through PrismaPromise lazy evaluation**
- **Found during:** Task 5 (audit integration test migration + regression tests)
- **Issue:** Test 1 ("order.submit audit row has action='order.submit'") failed. Debug logging showed `overrideAction=undefined` inside the `$extends` updateMany handler when invoked from inside a `$transaction` callback. Root cause: Prisma's `PrismaPromise` is lazy — `actionOverrideALS.run(action, fn)` where `fn = () => tx.order.updateMany(args)` only activates the ALS frame during the synchronous `fn()` call. `fn()` just returns a lazy `PrismaPromise` without triggering execution; the ALS frame is gone by the time the handler fires at `.then()` time.
- **Fix:** Changed `withActionOverride` from `return actionOverrideALS.run(action, fn)` to `return actionOverrideALS.run(action, async () => { return fn(); })`. The `async` wrapper starts executing within the ALS context; Node.js tracks the async context through the wrapper's promise chain.
- **Files modified:** `apps/api/src/plugins/requestContext.ts`
- **Verification:** All 95 tests pass; Test 1 confirms `order.submit` audit rows have `action='order.submit'`
- **Committed in:** `84bc6ce`

**2. [Rule 1 - Bug] Test 12 assertion wrong: plan assumed Prisma savepoints, but Prisma 5 uses independent transactions**
- **Found during:** Task 5 (regression test for nested $transaction CR-01)
- **Issue:** Test 12 failed with `expected 1 to have length 0`. Plan's assertion was `expect(orphanRows).toHaveLength(0)` for ALL mutations (both outer and inner tx). But the inner `prisma.$transaction(inner)` called on the ROOT client creates an INDEPENDENT Postgres transaction. The inner tx commits before the outer throws, so its audit row persists.
- **Fix:** Split into two assertions: `outerOrphanRows.toHaveLength(0)` (CR-01 fix verified — outer tx rolled back) and `innerCommittedRows.toHaveLength(1)` (inner tx committed independently — expected). Updated test name and docstring to explain Prisma nested transaction semantics.
- **Files modified:** `apps/api/test/audit.integration.test.ts`
- **Verification:** Test 12 passes; behavior is correct per Prisma 5 semantics
- **Committed in:** `b7fd5bd`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 — Bug)
**Impact on plan:** Both auto-fixes required for correctness. The async wrapper fix is a genuine correctness fix (tests would fail without it). The Test 12 fix corrects a plan assumption about Prisma behavior that was wrong. No scope creep.

## Issues Encountered

- **AsyncResource.bind exploration (reverted):** Initially investigated whether `actorALS.run(scope, () => done())` in a Fastify 3-arg hook correctly propagated the ALS frame. Added `AsyncResource.bind(done)` wrapping as a defensive measure, then wrote a debug test confirming simple `() => done()` DOES work correctly. Reverted to the simpler form. The 3-arg Fastify hook with `actorALS.run(scope, () => done())` is both correct and sufficient.

## Known Stubs

None.

## Threat Flags

None — this plan is a pure internal refactor of ALS wiring. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Next Phase Readiness

- Per-concern ALS layer is stable and regression-tested under all three concurrency scenarios (nested tx, parallel tx, keep-alive TCP)
- The `actorALS` / `activeTxStackALS` / `actionOverrideALS` pattern is documented in README and is the established pattern for any future phases that add audit attribution or new action overrides
- No blockers for subsequent plans in Phase 05 or later phases

---
*Phase: 05-audit-log*
*Completed: 2026-05-23*
