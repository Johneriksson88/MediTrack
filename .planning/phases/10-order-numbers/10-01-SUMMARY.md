---
phase: 10-order-numbers
plan: 01
subsystem: api

tags: [prisma, postgres, zod, audit, concurrency, fastify, vitest]

# Dependency graph
requires:
  - phase: 03-draft-orders
    provides: createDraftOrder service path, orderResponse / orderListItem contracts, OrderStatus enum
  - phase: 04-confirm-deliver-stock
    provides: $transaction + row-level write lock primitive on CareUnitMedication (reused on OrderNumberCounter), confirm/deliver transitions that MUST NOT mutate orderNumber
  - phase: 05-audit-log
    provides: $extends middleware (D-90 / D-93), AUDIT_ALLOWLIST per-model allowlist, diff-at-read pipeline (D-95)
  - phase: 09-dashboard-depth-back-nav
    provides: dashboardOrderRow shape, listDashboardOrdersForUser service, dashboardOrdersResponse discriminated union
provides:
  - "OrderNumberCounter table + per-(careUnitId, year) monotonic counter state"
  - "Order.orderNumberCounter + Order.orderNumberYear NOT NULL columns + composite UNIQUE constraint"
  - "Order envelope widening: orderNumber + orderNumberCounter + orderNumberYear on every read"
  - "formatOrderNumber({year, counter}) shared utility — single source of truth for ORD-YYYY-####"
  - "mintOrderNumber() service helper using row-level write-lock UPSERT pattern (concurrency-safe)"
  - "AUDIT_ALLOWLIST.Order extended with the two persisted counter columns (auto-captured via $extends)"
  - "BE end-to-end orderNumber on POST /api/orders, GET /api/orders, GET /api/orders/:id, GET /api/dashboard/orders"
affects: [10-02 FE rendering surfaces, 11-final-prep README and demo path]

# Tech tracking
tech-stack:
  added: []  # Phase 10 ships zero new runtime dependencies
  patterns:
    - "UPDATE-then-INSERT-with-ON-CONFLICT mint pattern (D-160 / D-164) — row-level write-lock primitive analog to Phase 4 STK-02"
    - "Structured storage + derived display utility (D-165) — format changes never require migration"
    - "Test fixtures with mintTestOrderNumber inline helper to satisfy new NOT NULL columns without coupling to runtime service"

key-files:
  created:
    - apps/api/prisma/migrations/20260525000000_0013_order_numbers/migration.sql
    - packages/shared/src/utils/orderNumber.ts
    - packages/shared/src/utils/__tests__/orderNumber.test.ts
    - apps/api/test/orders.orderNumber.integration.test.ts
    - .planning/phases/10-order-numbers/deferred-items.md
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/prisma/seed.ts
    - apps/api/src/services/order.service.ts
    - apps/api/src/services/dashboard.service.ts
    - apps/api/src/db/auditAllowlist.ts
    - packages/shared/src/index.ts
    - packages/shared/src/contracts/order.ts
    - packages/shared/src/contracts/dashboard.ts
    - packages/shared/tsconfig.json
    - apps/api/test/helpers/buildTestApp.ts
    - apps/api/test/contracts.orderEnvelope.test.ts
    - apps/api/test/dashboard.orders.integration.test.ts
    - apps/api/test/orders.confirm.integration.test.ts
    - apps/api/test/orders.deliver.integration.test.ts
    - apps/api/test/orders.integration.test.ts
    - apps/api/test/orders.list.integration.test.ts

key-decisions:
  - "D-160 confirmed live: OrderNumberCounter row + UPDATE-then-INSERT-with-ON-CONFLICT in createDraftOrder $transaction is the row-level write-lock primitive analog to Phase 4 STK-02"
  - "D-161 confirmed live: year derived from Postgres NOW() (EXTRACT(YEAR FROM NOW())::int) inside the mint SQL — no app-vs-DB clock skew"
  - "D-162 confirmed live: orderNumber stamped on createDraftOrder and IMMUTABLE thereafter; submit/confirm/deliver transitions never touch it (asserted by Test 4 lifecycle stability)"
  - "D-163 confirmed live: backfill uses ROW_NUMBER() OVER (PARTITION BY careUnitId, EXTRACT(YEAR FROM createdAt) ORDER BY createdAt ASC, id ASC) — deterministic on the same input"
  - "D-165 confirmed live: structured columns + derived display via formatOrderNumber — format changes are a one-file edit in @meditrack/shared, NOT a migration"
  - "Migration 0013 FK named OrderNumberCounter_careUnitId_fkey with ON UPDATE CASCADE matches Prisma's emit convention — prevents prisma migrate dev from detecting drift and auto-generating a follow-up migration that would silently drop the CR-02 trgm GIN index"
  - "Migration 0013 also re-creates Medication_name_trgm_idx via DROP IF EXISTS + CREATE (mirroring 0007 pattern) so the schema-invisible Phase 2 CR-02 index survives the migrate dev drift detection"
  - "Seed.ts updated to mint orderNumber inline (Rule 2 / not in plan) — required because seed creates orders directly via prisma.order.create which would otherwise fail the new NOT NULL constraint and block every integration-test suite that calls ensureAllRolesSeeded()"
  - "Test fixtures with direct prisma.order.create get a new shared mintTestOrderNumber helper in buildTestApp.ts that mirrors the runtime mint — keeps test code parallel to production code"
  - "ExtendedTx type alias used in mintOrderNumber's signature — Prisma.TransactionClient does NOT match the codebase's audit-extended tx type, because $extends rewrites model-method signatures"

patterns-established:
  - "Mint helper pattern: any future per-(scope, year) counter (e.g. invoices) reuses the same UPDATE-then-INSERT-with-ON-CONFLICT primitive"
  - "Format derivation pattern: single shared utility (formatOrderNumber) consumed by both BE serialization and FE display via @meditrack/shared"
  - "Test fixture mint pattern: when a model gains new required columns minted at runtime, add a shared test helper that mirrors the runtime logic"

requirements-completed: [ORD-11]

# Metrics
duration: ~34 min
completed: 2026-05-25
---

# Phase 10 Plan 01: BE Order Numbers Summary

**Per-(careUnit, year) monotonic order-number mint via Postgres row-level UPSERT, structured columns + derived display utility, BE end-to-end shipped with concurrency-proven 5-scenario integration suite**

## Performance

- **Duration:** ~34 minutes
- **Started:** 2026-05-25T10:55:00Z
- **Completed:** 2026-05-25T11:30:00Z
- **Tasks:** 9 / 9
- **Files modified:** 17 (5 created + 12 modified)
- **Tests:** 83 / 83 green (Phase 10 verification suite)

## Accomplishments

- **Migration 0013 applied cleanly** — `prisma migrate status` reports zero pending migrations. Hand-written 5-step SQL (ADD NULLABLE columns → CREATE TABLE counter → CTE backfill → seed counter rows → SET NOT NULL + UNIQUE). FK named to match Prisma's emit convention (no drift); CR-02 trgm GIN index preserved via DROP IF EXISTS + CREATE in the same migration.
- **Sample seeded orderNumber:** `ORD-2026-0001` through `ORD-2026-0004` (4 seeded orders); after test runs the careunit-karolinska-01 counter has advanced to `nextValue=328` (heavy test load — see Issues).
- **Concurrency proven** — Test 1 fires two parallel `createDraftOrder()` calls on the same vårdenhet; both fulfill with distinct, consecutive counter values. pg_locks polling observes blocked queries on `OrderNumberCounter` while the two txs are in flight (best-effort proof; the counter assertion is the primary correctness gate).
- **Lifecycle stability proven** — Test 4 + extensions to `orders.confirm.integration.test.ts` and `orders.deliver.integration.test.ts` capture `orderNumber` from the draft and assert it equals the value on every subsequent state transition through `levererad` (D-162 / SC#5).
- **Backfill determinism proven** — Test 5 asserts every Order row has non-null counter/year, that counters are bounded by [1, MAX] per (careUnitId, year) partition, and that `createdAt ASC` implies `orderNumberCounter ASC` within each partition (the D-163 ROW_NUMBER invariant).
- **Audit pipeline coverage automatic** — single allowlist edit (`AUDIT_ALLOWLIST.Order` += `orderNumberCounter`, `orderNumberYear`); the Phase 5 `$extends` middleware (D-90 / D-93) writes `after.orderNumberCounter` + `after.orderNumberYear` on every `order.create` event with zero new audit code. `orderNumber` (derived) is intentionally excluded — audit consumers reconstruct it via `formatOrderNumber`.

## Task Commits

1. **Task 1: Add Prisma schema for Order columns + OrderNumberCounter model** — `50c612d` (feat — initial commit, format-only; superseded) and `bb52976` (feat — actual schema additions). First Edit call's content was silently dropped on disk; recovered by re-Edit with identical-looking ASCII-only payload (see Issues / D-10-02).
2. **Task 2: Write migration 0013_order_numbers/migration.sql** — `ee78e92` (feat)
3. **Task 3: [BLOCKING] Apply migration to dev DB + update seed** — `0819e4a` (feat — also adds Rule 2 seed mint logic so the seed survives the new NOT NULL columns)
4. **Task 4: Shared utility formatOrderNumber + barrel export + unit tests** — `d51461d` (test — RED gate) → `6ff613d` (feat — GREEN gate); 5/5 unit tests green
5. **Task 5: Widen shared contracts** — `aded4f6` (feat); api typecheck localized failures to mapper sites as expected
6. **Task 6: Wire mintOrderNumber + integrate into createDraftOrder + update mappers** — `b5390bd` (feat); api typecheck exits 0
7. **Task 7: Extend AUDIT_ALLOWLIST.Order** — `e121ffd` (feat); includes deferred-items.md capture
8. **Task 8: Write 5-scenario orders.orderNumber.integration.test.ts** — `361ffe0` (test); 5/5 green
9. **Task 9: Extend existing BE tests with orderNumber assertions** — `873f27d` (test); 83/83 green across the full Phase 10 verification suite

_Note: Task 1 has two commits because the first Edit silently dropped content on disk; the second commit added the actual schema content. Task 4 follows TDD RED → GREEN sequence._

## Files Created/Modified

**Created:**
- `apps/api/prisma/migrations/20260525000000_0013_order_numbers/migration.sql` — 5-step backfill SQL with header documenting WHY structured columns + derived display + UPSERT mint + ordered backfill
- `packages/shared/src/utils/orderNumber.ts` — `formatOrderNumber({year, counter}) → 'ORD-YYYY-####'`
- `packages/shared/src/utils/__tests__/orderNumber.test.ts` — 5 unit tests (counter 1/42/9999, overflow at 10000/123456, year verbatim across 2025/2030)
- `apps/api/test/orders.orderNumber.integration.test.ts` — 5 integration scenarios
- `.planning/phases/10-order-numbers/deferred-items.md` — captures D-10-01 (pre-existing audit test env mismatch) and D-10-02 (Edit-tool sporadic content drop)

**Modified:**
- `apps/api/prisma/schema.prisma` — `model Order` += `orderNumberCounter Int`, `orderNumberYear Int`, `@@unique([careUnitId, orderNumberYear, orderNumberCounter])`; new `model OrderNumberCounter` with compound `@@id([careUnitId, year])` and CareUnit relation `onDelete: Cascade`; CareUnit gains inverse relation `orderNumberCounters[]`
- `apps/api/prisma/seed.ts` — `seedOrderInStatus` mints orderNumber via UPDATE-then-INSERT-with-ON-CONFLICT (mirrors runtime helper)
- `apps/api/src/services/order.service.ts` — NEW `mintOrderNumber(tx, careUnitId)` helper; `createDraftOrder` wrapped in `$transaction`; `toOrderResponse` and `toOrderListItem` populate orderNumber via `formatOrderNumber`
- `apps/api/src/services/dashboard.service.ts` — `toDashboardOrderRow` populates orderNumber; input type widened to include the two scalar columns
- `apps/api/src/db/auditAllowlist.ts` — `Order` allowlist += `orderNumberCounter`, `orderNumberYear` (with D-165 + D-97 + D-95 attribution comment)
- `packages/shared/src/index.ts` — barrel re-exports `formatOrderNumber`
- `packages/shared/src/contracts/order.ts` — `orderResponse` += `orderNumber`, `orderNumberCounter`, `orderNumberYear` (REQUIRED); `orderListItem` += `orderNumber` only (lean shape)
- `packages/shared/src/contracts/dashboard.ts` — `dashboardOrderRow` += `orderNumber` (REQUIRED)
- `packages/shared/tsconfig.json` — exclude test files from build output (so vitest can live alongside source without dragging vitest types into published `.d.ts`)
- `apps/api/test/helpers/buildTestApp.ts` — NEW `mintTestOrderNumber(careUnitId)` shared helper for test fixtures
- `apps/api/test/contracts.orderEnvelope.test.ts` — sampleOrder gains the trio; 3 new it-blocks lock the contract
- `apps/api/test/dashboard.orders.integration.test.ts` — Tests 1+2 widened with orderNumber row assertions; fixture creates mint inline
- `apps/api/test/orders.confirm.integration.test.ts` — Test 1 captures orderNumber from draft, asserts unchanged post-confirm
- `apps/api/test/orders.deliver.integration.test.ts` — Test 1 same pattern through deliver
- `apps/api/test/orders.integration.test.ts` — POST happy path asserts orderNumber/counter/year trio; bulk fixtures get inline mint
- `apps/api/test/orders.list.integration.test.ts` — Test 1 row-shape assertion + createOrderInStatus helper gets inline mint

## Decisions Made

- **Migration FK naming convention** — used `OrderNumberCounter_careUnitId_fkey` with `ON UPDATE CASCADE` to match Prisma's emit. Without this, `prisma migrate dev` detected drift on the next run and auto-generated a follow-up migration that DROPPED the CR-02 trgm GIN index. Naming the FK explicitly + recreating the trgm index in the same migration (mirroring 0007 pattern) prevents the drift.
- **Seed inline mint** (Rule 2) — `seed.ts` had to be updated to provide the new required NOT NULL columns. Without this, every `prisma migrate reset` followed by `prisma db seed` fails, blocking every integration-test suite that calls `ensureAllRolesSeeded()`. Mirrors the runtime `mintOrderNumber` exactly.
- **Test helper shared mint** — added `mintTestOrderNumber` to `apps/api/test/helpers/buildTestApp.ts` instead of inlining the mint in each test. Six different fixture sites needed the same UPDATE-then-INSERT-with-ON-CONFLICT logic; a shared helper avoids drift and keeps tests parallel to production code.
- **ExtendedTx type alias** — `Prisma.TransactionClient` did NOT match the codebase's audit-extended client. Inferred the right tx type via `Parameters<Parameters<typeof prisma.$transaction>[0]>[0]`. Documented in a code comment so the next maintainer doesn't try to "simplify" by importing the bare Prisma type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Seed script must mint orderNumber inline**
- **Found during:** Task 3 (apply migration to dev DB)
- **Issue:** `prisma db seed` crashes with `Argument 'orderNumberCounter' is missing` because seed creates orders directly via `prisma.order.create({ data: {...} })` and the new NOT NULL columns aren't supplied.
- **Fix:** Added inline UPDATE-then-INSERT-with-ON-CONFLICT to `seedOrderInStatus` in `apps/api/prisma/seed.ts` — mirrors the runtime `mintOrderNumber` exactly.
- **Files modified:** `apps/api/prisma/seed.ts`
- **Verification:** `prisma db seed` runs clean; 4 seeded orders carry counters 1..4 for (karolinska, 2026); idempotent re-run produces no duplicates.
- **Committed in:** `0819e4a` (Task 3 commit)

**2. [Rule 3 - Blocking issue] Migration auto-detected drift dropping CR-02 trgm GIN index**
- **Found during:** Task 3 (first attempt at `prisma migrate dev`)
- **Issue:** Prisma generated a follow-up migration `20260525105948_0013_order_numbers` that dropped `Medication_name_trgm_idx` — the CR-02 index that powers ILIKE name search. The drift was caused by (a) anonymous FK constraint on `OrderNumberCounter.careUnitId` vs Prisma's named convention, and (b) the trgm GIN index being raw-SQL-created and invisible to Prisma's schema diff.
- **Fix:** Deleted the spurious auto-gen migration. Updated 0013 to (i) use named FK `OrderNumberCounter_careUnitId_fkey` with `ON UPDATE CASCADE`, and (ii) drop + recreate `Medication_name_trgm_idx` at the top of the migration (mirroring the 0007_audit_events pattern).
- **Files modified:** `apps/api/prisma/migrations/20260525000000_0013_order_numbers/migration.sql`
- **Verification:** Post-fix `prisma migrate reset` applies cleanly; trgm GIN index present in pg_indexes; `prisma migrate diff` shows only Prisma's `ASC` ordering quirk (cosmetic, no functional drift).
- **Committed in:** `0819e4a` (Task 3 commit)

**3. [Rule 3 - Blocking issue] Test fixtures using prisma.order.create need orderNumberCounter/Year**
- **Found during:** Task 9 (re-running the existing test suite after the schema change)
- **Issue:** Eight different test fixtures across orders.list, orders.integration, and dashboard.orders directly call `prisma.order.create({ data: {...} })` and fail post-migration because the new columns are required.
- **Fix:** Added `mintTestOrderNumber(careUnitId)` shared helper in `apps/api/test/helpers/buildTestApp.ts`. Updated all 8 fixture sites to call it inline and spread the result into the create payload. Test code now mirrors the runtime mint logic.
- **Files modified:** `apps/api/test/helpers/buildTestApp.ts`, `apps/api/test/orders.list.integration.test.ts`, `apps/api/test/orders.integration.test.ts`, `apps/api/test/dashboard.orders.integration.test.ts`
- **Verification:** All 83 tests in the Phase 10 verification suite pass.
- **Committed in:** `873f27d` (Task 9 commit)

**4. [Rule 3 - Blocking issue] @meditrack/shared build broke on co-located vitest test file**
- **Found during:** Task 4 (Shared utility + tests)
- **Issue:** `pnpm --filter @meditrack/shared build` failed with `Cannot find module 'vitest' or its corresponding type declarations` because vitest is not a direct devDep of @meditrack/shared and the test file `orderNumber.test.ts` was being compiled.
- **Fix:** Added `"exclude": ["src/**/__tests__/**", "src/**/*.test.ts", "dist"]` to `packages/shared/tsconfig.json` so tsc skips test files. Vitest runs via the workspace-installed binary; the shared package's published `.d.ts` surface is unchanged.
- **Files modified:** `packages/shared/tsconfig.json`
- **Verification:** `pnpm --filter @meditrack/shared build` exits 0; `dist/utils/orderNumber.{js,d.ts}` emitted; no test files in dist.
- **Committed in:** `6ff613d` (Task 4 GREEN commit)

---

**Total deviations:** 4 auto-fixed (1 missing critical, 3 blocking).
**Impact on plan:** All four were necessary for the plan to complete. None introduced scope creep beyond what the LOCKED contracts in CONTEXT.md required. The seed mint duplicates the runtime mint by design — both share the same SQL pattern (D-160 / D-164) and a future refactor could promote the mint to a shared module if a third caller appears.

## Issues Encountered

- **D-10-02 — Edit-tool sporadic content drop.** Three separate Edit calls during this plan returned "file is current in your context" but left the file unchanged on disk (Tasks 1, 3, 7). The pattern: edits containing non-ASCII glyphs (smart quotes, em-dashes, `→` arrows) were silently dropped. Retrying with identical-meaning ASCII-only payload (`->`, `--`, plain quotes) landed correctly every time. Documented in `deferred-items.md` for future agents. **Mitigation:** every Edit that touches schema/allowlist/contracts is verified via `grep` immediately after.
- **D-10-01 — Pre-existing audit.integration test failure (env mismatch).** When I initially ran `audit.integration.test.ts` directly with `DATABASE_URL=meditrack:meditrack@...` (the owner role), Test #4's `current_user` assertion failed expecting `meditrack_app`. The test correctly stubs `meditrack_app:meditrack_app_dev@...` via `buildTestApp.ts`. Pre-existing failure mode reproduces on the commit immediately prior to this plan — not caused by Phase 10 changes. Surfaced in `deferred-items.md` D-10-01.
- **Test 5 (backfill SQL) tightened for test-order resilience.** First version asserted `counters[i] === i + 1` (contiguous), but earlier tests in the run leave gaps in the counter sequence after cleaning up their synthetic orders. Loosened to assert monotonic ordering (older createdAt → smaller counter) plus min ≥ 1, max ≥ row count — still proves D-163's deterministic backfill, robust to other tests creating + deleting orders.
- **Test 2 (year-boundary) tightened for test-order resilience.** First version asserted the post-mint counter is `< 100` (the seeded 2025 value). After several test runs the live current-year nextValue grew past 100, breaking the assertion. Rewrote to snapshot the live nextValue immediately before the mint and assert `counter === expectedCounter`, proving the mint touched the current-year row (NOT the 2025 row whose nextValue stays 100).

## User Setup Required

None. Phase 10 ships zero new dependencies, zero new env vars, zero Docker Compose changes (confirmed by `<code_context>` line 178). A fresh `docker compose up --build` from this commit boots a healthy stack with the migration applied and the seed minted.

## Known Stubs

None. The plan deliberately leaves FE rendering as id-substring until Plan 02 lands; this is documented in PROJECT.md and the Plan 02 PLAN.md, not a stub.

## TDD Gate Compliance

Plan 10-01 frontmatter is `type: execute` (not `type: tdd`), so the plan-level RED/GREEN/REFACTOR gate does NOT apply. Individual `tdd="true"` tasks (Task 4 — formatOrderNumber) follow the per-task RED → GREEN sequence:
- Task 4 RED: commit `d51461d` (`test(10-01): add failing test for formatOrderNumber (RED gate)`)
- Task 4 GREEN: commit `6ff613d` (`feat(10-01): implement formatOrderNumber shared utility (GREEN gate)`)
No REFACTOR commit needed — the 17-line utility is at its irreducible minimum.

## Verification Commands — Final Run

All 7 commands from the plan's `<verification>` block exit 0:

1. `pnpm --filter @meditrack/api typecheck` — exits 0
2. `pnpm --filter @meditrack/shared build` — exits 0
3. `pnpm --filter @meditrack/api exec prisma migrate status` — exits 0, 13 migrations applied, zero pending
4. `pnpm --filter @meditrack/api exec vitest run test/orders.orderNumber.integration.test.ts test/orders.integration.test.ts test/orders.confirm.integration.test.ts test/orders.deliver.integration.test.ts test/orders.list.integration.test.ts test/dashboard.orders.integration.test.ts test/contracts.orderEnvelope.test.ts test/audit.integration.test.ts` — exits 0, **83/83 green**
5. `pnpm --filter @meditrack/shared test orderNumber` (via direct vitest binary) — exits 0, **5/5 green**
6. Manual sanity check: `SELECT COUNT(*) FROM "Order" WHERE "orderNumberCounter" IS NULL` returns 0 (verified via Prisma raw query)
7. `pnpm lint` — exits 0 (audit allowlist extension does not trip Phase 5's no-restricted-syntax rules)

## AUDIT_ALLOWLIST.Order Before vs After

| Position | Before (Phase 9 state) | After (Phase 10) |
|----------|------------------------|-------------------|
| 1..13 | id, careUnitId, createdByUserId, status, submittedAt, submittedByUserId, confirmedAt, confirmedByUserId, deliveredAt, deliveredByUserId, deletedAt, createdAt, updatedAt | (unchanged) |
| 14 | — | orderNumberCounter (Phase 10 D-165) |
| 15 | — | orderNumberYear (Phase 10 D-165) |

`orderNumber` (the derived display string) is intentionally NOT in the allowlist — it's computed from the two columns via `formatOrderNumber`; the `$extends` middleware writes only persisted columns. Audit consumers reconstruct the display string if needed.

## pg_locks Observation (Concurrency Test)

Test 1 of `orders.orderNumber.integration.test.ts` fires two parallel `createDraftOrder()` calls and polls `pg_locks` for blocked queries against `OrderNumberCounter`. Sample observation from a successful run:

```
[{ "granted": false }, { "granted": false }]
```

— two blocked rows observed at the DB level, proving Postgres serialized the second tx on the `OrderNumberCounter` row's write lock. When the race resolves faster than the 50ms poll cadence the observation array is empty; the counter assertions (`expect(new Set([a.counter, b.counter]).size).toBe(2)` and `expect(Math.abs(a.counter - b.counter)).toBe(1)`) remain the primary correctness check and always hold.

## Next Phase Readiness

- **Plan 10-02 (FE rendering)** can start immediately. Every order envelope on the wire now carries a required `orderNumber: string`; Plan 02's `OrdersTable` / `DraftsTable` / `ComposeOrderPage` H1 / `DashboardOrdersCard` / `SubmitConfirmationBanner` edits are pure FE consumption work.
- The `formatOrderNumber` utility is importable from `@meditrack/shared` for any FE site that needs to render the string from the counter/year pair (e.g. optimistic UI on draft create).
- No blockers; no concerns; the Phase 5 `$extends` audit pipeline + Phase 4 row-lock primitive both gave the right answer to "how does this work in the face of (concurrency / audit) requirements" — both are reused, neither is forked.

## Self-Check: PASSED

All 6 created files exist on disk:
- apps/api/prisma/migrations/20260525000000_0013_order_numbers/migration.sql — FOUND
- packages/shared/src/utils/orderNumber.ts — FOUND
- packages/shared/src/utils/__tests__/orderNumber.test.ts — FOUND
- apps/api/test/orders.orderNumber.integration.test.ts — FOUND
- .planning/phases/10-order-numbers/deferred-items.md — FOUND
- .planning/phases/10-order-numbers/10-01-SUMMARY.md — FOUND

All 11 commits exist in git log:
- 50c612d, bb52976 (Task 1 — schema), ee78e92 (Task 2 — migration), 0819e4a (Task 3 — apply + seed),
- d51461d (Task 4 RED), 6ff613d (Task 4 GREEN),
- aded4f6 (Task 5 — contracts), b5390bd (Task 6 — service), e121ffd (Task 7 — audit allowlist),
- 361ffe0 (Task 8 — integration suite), 873f27d (Task 9 — existing test extensions)

---
*Phase: 10-order-numbers*
*Completed: 2026-05-25*
