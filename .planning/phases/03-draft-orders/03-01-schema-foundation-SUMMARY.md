---
phase: 03-draft-orders
plan: "01"
subsystem: backend
tags: [prisma, schema, migration, contracts, zod, rbac, error-handling, tdd]
dependency_graph:
  requires: []
  provides:
    - Order + OrderLine + OrderStatus Prisma models + migration
    - "@meditrack/shared order Zod schemas (11 exports)"
    - "BE PERMISSIONS map with 5 order:* keys"
    - "OrderLockedError (409) + ValidationFailedError (422) in errorHandler"
    - "Seeded Utkast draft for sjukskoterska@example.test"
  affects:
    - apps/api/prisma/schema.prisma
    - apps/api/prisma/migrations/
    - apps/api/prisma/seed.ts
    - packages/shared/src/contracts/order.ts
    - packages/shared/src/index.ts
    - packages/shared/src/contracts/permissions.ts
    - apps/api/src/auth/permissions.ts
    - apps/api/src/plugins/errorHandler.ts
tech_stack:
  added:
    - "Prisma OrderStatus enum (Postgres ENUM type)"
    - "Order + OrderLine models with careUnitId-scoped indexes"
    - "11 Zod order schemas exported from @meditrack/shared"
    - "OrderLockedError + ValidationFailedError error classes"
  patterns:
    - "TDD RED/GREEN cycle for error classes + Zod contract shapes"
    - "Dynamic import pattern for errorHandler in unit tests (env stub before module load)"
    - "Record<ActionKey, Role[]> compile-time drift prevention extended with order:*"
key_files:
  created:
    - path: apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql
      role: DDL for OrderStatus enum + Order + OrderLine tables + indexes + FKs
    - path: packages/shared/src/contracts/order.ts
      role: 11 Zod schemas + inferred TS types for the FE-BE order contract
    - path: apps/api/test/contracts.orderEnvelope.test.ts
      role: TDD unit tests for error classes + orderResponse round-trip (14 tests)
  modified:
    - path: apps/api/prisma/schema.prisma
      role: Added OrderStatus enum, Order model, OrderLine model, back-relations
    - path: apps/api/prisma/seed.ts
      role: seedDraftOrder() — idempotent Utkast draft for sjukskoterska
    - path: packages/shared/src/contracts/permissions.ts
      role: Added 5 order:* literals to ACTION_KEYS tuple
    - path: packages/shared/src/index.ts
      role: Re-exports 11 order schemas + types from contracts/order.js
    - path: apps/api/src/auth/permissions.ts
      role: 5 order:* entries added to PERMISSIONS map (all 3 roles)
    - path: apps/api/src/plugins/errorHandler.ts
      role: OrderLockedError + ValidationFailedError classes + envelope mappings
decisions:
  - "D-46 confirmed: OrderStatus Postgres enum verbatim mirrors ORDER_STATUSES tuple (utkast/skickad/bekraftad/levererad)"
  - "D-48 confirmed: single Order table, status column distinguishes lifecycle"
  - "D-63 confirmed: no @@unique on OrderLine — same med allowed on two lines in v1"
  - "Deviation: migration dropped Medication trgm GIN index (Prisma doesn't track custom SQL indexes). Fixed inline: DROP+RECREATE in same migration SQL file, then recreated in DB via docker exec psql"
  - "Deviation: three permissions regression tests (admin.ping, auth.flow.smoke, auth.me) updated to include Phase 3 order:* keys — hardcoded arrays needed updating"
  - "TDD pattern: dynamic import of errorHandler.ts needed because it imports env.ts; vi.stubEnv must precede the dynamic import"
metrics:
  duration: "10m 21s"
  completed_date: "2026-05-21"
  tasks_completed: 3
  files_changed: 10
---

# Phase 3 Plan 01: Schema Foundation Summary

Prisma Order/OrderLine schema with migration, 11 Zod order contracts in @meditrack/shared, 5 order:* RBAC keys, and OrderLockedError/ValidationFailedError error classes — the complete schema-and-contract foundation that Slices 2-4 build on.

## Tasks Completed

| # | Task | Commit | Key Output |
|---|------|--------|------------|
| 1 | Extend Prisma schema + migration + seed | fded456 | Migration 20260521203032_0004_order_flow_drafts, seeded draft cmpfy5ke01v6zxlv1gvuy3tsq |
| 2 | Extend ACTION_KEYS + PERMISSIONS with order:* | edc8b44 | 5 order:* keys, all 3 roles, drift-prevention passes |
| 3 | Add order contracts + error classes (TDD) | 6c2f00f (RED), 392806d (GREEN) | 11 Zod schemas, OrderLockedError, ValidationFailedError, 43/43 tests pass |

## What Was Built

### Task 1 — Prisma Schema + Migration + Seed

The Prisma schema now carries:
- `enum OrderStatus { utkast skickad bekraftad levererad }` — all four values declared (D-46); Phase 3 only uses two but Phase 4 needs zero schema work
- `model Order` — careUnitId-scoped, dual FKs to User with `@relation(name:…)` to disambiguate `OrderCreatedBy` / `OrderSubmittedBy`, soft-delete `deletedAt`, three compound indexes per D-62
- `model OrderLine` — `onDelete: Cascade` on `orderId`, `onDelete: Restrict` on `careUnitMedicationId`, two indexes per D-63; no `@@unique` (same med allowed twice per D-63)
- Back-relations on `User` (`createdOrders` / `submittedOrders`), `CareUnit` (`orders`), `CareUnitMedication` (`orderLines`)

Migration `20260521203032_0004_order_flow_drafts` applied and verified via `prisma migrate status`.

Seed extension: idempotent `seedDraftOrder()` creates one Utkast order (ID: `cmpfy5ke01v6zxlv1gvuy3tsq`) for `sjukskoterska@example.test` with 3 low-stock OrderLines. Re-run prints `Draft order already exists — skipping (idempotent).`

### Task 2 — Permission Contract

`ACTION_KEYS` in `packages/shared/src/contracts/permissions.ts` extended with:
```
'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete'
```
`PERMISSIONS` map in `apps/api/src/auth/permissions.ts` extended with all 5 keys → `['apotekare', 'sjukskoterska', 'admin']` per D-64 / ORD-01..03. `Record<ActionKey, Role[]>` exhaustiveness check passes; FE `<Can action="order:create">` autocompletes.

### Task 3 — Order Contracts + Error Classes (TDD)

`packages/shared/src/contracts/order.ts` exports 11 schemas:
- `orderLineResponse` — denormalized line shape with name/atcCode/form/strength/stock (D-47)
- `orderResponse` — full Order with embedded lines, createdBy, nullable submittedBy (D-49)
- `orderListItem` + `orderListQuery` + `orderListResponse` — lean drafts-list shapes (D-72)
- `createOrderRequest` — empty strict body (D-50, T-03-02 mass-assignment mitigation)
- `addOrderLineRequest` + `updateOrderLineRequest` — strict mutation bodies
- `pickerOptionsQuery` + `pickerOption` + `pickerOptionsResponse` — typeahead shapes (D-59, D-61)

`apps/api/src/plugins/errorHandler.ts` gains:
- `OrderLockedError` — `code: 'order_locked'`, default Swedish message, optional `details: { status?: OrderStatus }` (D-55)
- `ValidationFailedError` — `code: 'validation_failed'`, `details: { reason, lineId? }` (D-56)
- Envelope mappings added **before** the Zod fallthrough so D-56's 422 semantics hold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma migration dropped Medication trgm GIN index**
- **Found during:** Task 1 migration run
- **Issue:** Prisma auto-generated `DROP INDEX "Medication_name_trgm_idx"` because the CR-02 GIN index was created outside Prisma's managed schema (custom SQL in a prior migration). Prisma doesn't track raw SQL indexes; on schema comparison it saw an "unexpected" index and dropped it.
- **Fix:** Edited migration SQL file to include the DROP then immediately recreate: `CREATE INDEX "Medication_name_trgm_idx" ON "Medication" USING gin ("name" gin_trgm_ops)`. Also ran the recreate SQL directly in the DB via docker exec since the migration had already been applied.
- **Files modified:** `apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql`
- **Commit:** fded456

**2. [Rule 1 - Bug] Phase 1/2 permissions regression tests failed after order:* keys added**
- **Found during:** Task 3 full test run
- **Issue:** `admin.ping.test.ts`, `auth.flow.smoke.test.ts`, and `auth.me.test.ts` hardcoded the pre-Phase-3 permissions arrays. Adding 5 order:* keys to PERMISSIONS caused 7 test failures across the three files.
- **Fix:** Updated all three test files' permissions array assertions to include the new order:* keys. Consistent with prior quick task `260521-ip1` which did the same for Phase 2 medication:* keys.
- **Files modified:** 3 test files
- **Commit:** 392806d

**3. [Implementation Pattern] Dynamic import needed for errorHandler in unit test**
- **Found during:** Task 3 TDD RED phase
- **Issue:** `vi.stubEnv` placed at module level can't override env vars already read by static imports. errorHandler.ts imports env.ts which validates `process.env` synchronously at module initialization. Static `import` is hoisted before any test file code runs.
- **Fix:** Changed test to use `beforeAll(async () => { const handler = await import(...); })` — dynamic import runs after the `vi.stubEnv` calls have taken effect. Matches the approach used by `buildTestApp.ts`.
- **Files modified:** `apps/api/test/contracts.orderEnvelope.test.ts`
- **Commit:** 6c2f00f, 392806d

## TDD Gate Compliance

- RED commit: `6c2f00f` — `test(03-01): add failing tests for OrderLockedError/ValidationFailedError + orderResponse` (14 tests failing)
- GREEN commit: `392806d` — `feat(03-01): add order contracts, OrderLockedError/ValidationFailedError, envelope mappings` (14 tests passing)
- REFACTOR: not required (implementation was clean)

## Verification Results

| Check | Result |
|-------|--------|
| `prisma migrate status` | 4 migrations, database up to date |
| `prisma validate` | Schema valid |
| `pnpm --filter @meditrack/shared build` | 0 errors |
| `pnpm --filter @meditrack/api exec tsc --noEmit` | 0 errors |
| `pnpm --filter @meditrack/api test` (7 files, 43 tests) | All pass |
| `grep "enum OrderStatus {" schema.prisma` | 1 match |
| `grep "model Order {" schema.prisma` | 1 match |
| `grep "model OrderLine {" schema.prisma` | 1 match |
| 11 schemas exported from order.ts | Confirmed |
| OrderLockedError + ValidationFailedError in errorHandler | Confirmed |
| Seed creates draft for sjukskoterska (idempotent) | Confirmed (ID: cmpfy5ke01v6zxlv1gvuy3tsq) |

## Known Stubs

None — all schemas are fully wired. The Zod schemas correctly reject invalid status values, stray fields, and out-of-range quantities. No placeholder values.

## Threat Flags

No new network endpoints introduced in this plan (error classes and Zod schemas don't open endpoints). T-03-02 mitigation (mass-assignment) confirmed: `createOrderRequest`, `addOrderLineRequest`, and `updateOrderLineRequest` all use `.strict()`.

## Self-Check: PASSED
