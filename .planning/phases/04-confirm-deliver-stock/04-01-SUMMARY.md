---
phase: "04"
plan: "01"
subsystem: "orders"
tags: ["order-lifecycle", "rbac", "prisma", "tdd", "fastify", "react"]
dependency_graph:
  requires: ["03-01", "03-02", "03-03"]
  provides: ["order:confirm endpoint", "Mode C UI", "actor columns migration"]
  affects: ["order.service.ts", "ComposeOrderPage", "shared contracts", "PERMISSIONS map"]
tech_stack:
  added: []
  patterns:
    - "D-84: Actor columns (confirmedAt/By, deliveredAt/By) mirroring D-49 submittedAt/By"
    - "D-74: OrderTransitionError with code order_transition_invalid + HTTP 409 + details {from,to,expected}"
    - "D-75: Narrow single-action POST endpoints with empty strict body, apotekare+admin only"
    - "D-54: Atomic UPDATE-with-precondition via Prisma updateMany WHERE status precondition"
    - "D-79: SELECT FOR UPDATE pessimistic row locking inside $transaction"
    - "D-15: RBAC drift prevention via Record<ActionKey, Role[]> TypeScript type"
    - "D-83: ApotekareActionFooter sticky-mobile/inline-desktop; Can component FE gate"
key_files:
  created:
    - "apps/api/prisma/migrations/20260522120000_0006_order_confirm_deliver/migration.sql"
    - "apps/api/src/routes/orders/confirm.ts"
    - "apps/api/test/orders.confirm.integration.test.ts"
    - "apps/web/src/routes/bestallningar/ApotekareActionFooter.tsx"
  modified:
    - "apps/api/prisma/schema.prisma"
    - "apps/api/src/auth/permissions.ts"
    - "apps/api/src/plugins/errorHandler.ts"
    - "apps/api/src/routes/orders/index.ts"
    - "apps/api/src/services/order.service.ts"
    - "apps/web/src/features/orders/useOrderMutations.ts"
    - "apps/web/src/routes/bestallningar/ComposeOrderPage.tsx"
    - "apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx"
    - "packages/shared/src/contracts/order.ts"
    - "packages/shared/src/contracts/permissions.ts"
decisions:
  - "Manual migration creation used (prisma migrate dev non-interactive) — SQL created, resolve --applied + db execute applied"
  - "navigate-before-mutate pattern (WR-04) retained in discard flow — no change for confirm"
  - "Cross-careUnit returns 404 not 403 per D-73 to hide order existence from other careUnits"
  - "useCan derives from mocked useAuth — no separate mock needed in test suite"
metrics:
  duration: "~3 hours (includes context recovery)"
  completed_date: "2026-05-22"
  tasks_completed: 4
  tasks_total: 4
  files_changed: 18
---

# Phase 04 Plan 01: Slice A — Confirm Order Lifecycle Summary

Delivered the full confirm half of the Phase 4 order lifecycle end-to-end: DB migration adding actor columns, shared contract widening, RBAC keys, OrderTransitionError, confirmOrder service with 6-step transaction, POST /api/orders/:id/confirm route, 6-scenario TDD integration test suite, and the React Mode C UI (useConfirmOrder hook + ApotekareActionFooter + ComposeOrderPage wiring).

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema + migration + shared contracts + RBAC + error class | `14a6ee8` | schema.prisma, order.ts, permissions.ts (both), errorHandler.ts, permissions.ts (api) |
| 2 | Run Prisma migration 0006_order_confirm_deliver | `3d8d7a1` | migration.sql (created + applied) |
| 3 | confirmOrder service + POST /confirm route + integration test (TDD) | `80699b8` | order.service.ts, confirm.ts, orders/index.ts, orders.confirm.integration.test.ts |
| 4 | useConfirmOrder hook + Mode C wiring + ApotekareActionFooter | `21f9507` | useOrderMutations.ts, ApotekareActionFooter.tsx, ComposeOrderPage.tsx, ComposeOrderPage.test.tsx |

## What Was Built

**Schema (Task 1):** Added 4 nullable columns to Order (`confirmedAt`, `confirmedByUserId`, `deliveredAt`, `deliveredByUserId`) with `@relation` inverse fields on User. Mirrors the D-49 submittedAt/By pattern from Phase 3.

**Shared contracts (Task 1):** Widened `orderResponse` to carry 6 new actor fields (all nullable). Widened `orderListItem` similarly. Added `confirmOrderRequest` and `deliverOrderRequest` (empty strict objects). Extended `ACTION_KEYS` with `order:confirm` and `order:deliver`.

**RBAC (Task 1):** Both new keys added to `PERMISSIONS` map with `['apotekare', 'admin']` — typed as `Record<ActionKey, Role[]>` to catch drift at compile time.

**OrderTransitionError (Task 1):** New error class with `code: 'order_transition_invalid'`, `details: {from, to, expected}`, HTTP 409. Registered in Fastify `setErrorHandler` before the Zod branch.

**Migration (Task 2):** Manually crafted SQL (non-interactive environment prevented `prisma migrate dev`). Applied via `prisma migrate resolve --applied` + `prisma db execute`. All 4 columns + 2 FK constraints correct.

**confirmOrder service (Task 3):** 6-step transaction — (1) careUnit ownership check + 404, (2) SELECT FOR UPDATE row lock, (3) status precondition check + 409 on wrong status, (4) atomic `updateMany WHERE status='skickad'` (0-rows = lost-update guard → 409), (5) reload with all relations, (6) return `toOrderResponse`. Mirrors `submitOrder` structure (D-54 + D-79).

**Route (Task 3):** `POST /api/orders/:id/confirm` with `requireSession + requirePermission('order:confirm')` preHandlers, empty request body, full OrderResponse reply.

**Integration test (Task 3 TDD):** 6 scenarios — happy path, wrong-status 409, double-confirm 409, cross-careUnit 404, RBAC 403, not-found 404. All pass RED→GREEN. Full 66-test API suite passes with 0 regressions.

**useConfirmOrder hook (Task 4):** Mutation targeting `POST /api/orders/:id/confirm`. On success: `setQueryData(['order', orderId], response)` + invalidates `['orders', {status: 'skickad'}]` and `['orders', {status: 'bekraftad'}]` + `toast.success`. On error: branches `order_transition_invalid` (stale-read recovery via invalidate + toast with from-status label), `not_found`, default.

**ApotekareActionFooter (Task 4):** Sticky-mobile / inline-desktop button. `min-h-[44px]` touch target, `variant="default"`, Loader2 spinner with `loadingLabel` when `isPending`. Matches ComposeStickyFooter geometry.

**ComposeOrderPage Mode C wiring (Task 4):** `{isSkickad && canConfirm && (<Can action="order:confirm"><ApotekareActionFooter .../></Can>)}` in the `isLocked` branch. Added `isSkickad`, `isBekraftad`, `isLevererad` booleans. Updated `heading` and `titleForOrder` for all 4 statuses. All 82 web tests pass.

## Verification

- API tests: 66/66 pass (6 new in `orders.confirm.integration.test.ts`, 4 updated for new permissions)
- Web tests: 82/82 pass (1 ComposeOrderPage.test.tsx updated with `useConfirmOrder` mock)
- Web build: `tsc --noEmit && vite build` exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma migrate dev non-interactive**
- **Found during:** Task 2
- **Issue:** `prisma migrate dev --name ...` detected non-interactive shell and refused to run
- **Fix:** Manually created migration SQL file, used `prisma migrate resolve --applied` to register in migration history, then `prisma db execute --file` to apply SQL to DB
- **Files modified:** `apps/api/prisma/migrations/20260522120000_0006_order_confirm_deliver/migration.sql`
- **Commit:** `3d8d7a1`

**2. [Rule 1 - Bug] test orderEnvelope missing 6 new required fields**
- **Found during:** Task 3 regression run
- **Issue:** `contracts.orderEnvelope.test.ts` sampleOrder object missing the 6 new nullable fields added to `orderResponse` schema
- **Fix:** Added `confirmedAt: null, confirmedByUserId: null, confirmedBy: null, deliveredAt: null, deliveredByUserId: null, deliveredBy: null` to sampleOrder
- **Files modified:** `apps/api/test/contracts.orderEnvelope.test.ts`
- **Commit:** `80699b8`

**3. [Rule 1 - Bug] Permission arrays in 4 test files stale after RBAC extension**
- **Found during:** Task 3 regression run
- **Issue:** `admin.ping.test.ts`, `auth.flow.smoke.test.ts`, `auth.me.test.ts` hardcoded permission arrays didn't include `order:confirm` and `order:deliver`
- **Fix:** Updated expected permissions in all 3 files to include both new keys for admin/apotekare
- **Files modified:** `apps/api/test/admin.ping.test.ts`, `apps/api/test/auth.flow.smoke.test.ts`, `apps/api/test/auth.me.test.ts`
- **Commit:** `80699b8`

**4. [Rule 1 - Bug] ComposeOrderPage.test.tsx mock missing useConfirmOrder**
- **Found during:** Task 4 — web test run
- **Issue:** `vi.mock('@/features/orders/useOrderMutations')` factory didn't export `useConfirmOrder`; calling `useConfirmOrder()` from `ComposeOrderPage` threw `[vitest] No "useConfirmOrder" export is defined on the mock`
- **Fix:** Added `useConfirmOrder: vi.fn()` to mock factory; added import, mocked constant, and `setupMutations` line
- **Files modified:** `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx`
- **Commit:** `21f9507`

**5. [Rule 3 - Blocking] Worktree path safety violation (#3099)**
- **Found during:** Task 1 — post-edit verification
- **Issue:** All Task 1 edits went to main repo (`C:\Projekt\MediTrack\`) instead of worktree. Edit/Write tools resolve absolute paths through the main repo's node_modules, not the worktree
- **Fix:** Copied modified files from main repo to worktree with `cp`; reverted main repo with `git checkout --`; committed from within worktree
- **Files modified:** All Task 1 files (post-copy)
- **Commit:** `14a6ee8`

**6. [Rule 1 - Bug] Cross-careUnit test (scenario 4) Prisma unique constraint**
- **Found during:** Task 3 — second integration test run
- **Issue:** `other-apotekare@test.example` already existed in DB from prior test run; `prisma.user.create` threw unique constraint violation
- **Fix:** Added pre-cleanup in test setup to delete the user (and associated session + careUnit) before creating it
- **Files modified:** `apps/api/test/orders.confirm.integration.test.ts`
- **Commit:** `80699b8`

## Known Stubs

None — all data flows are wired end-to-end.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new_endpoint | apps/api/src/routes/orders/confirm.ts | POST /api/orders/:id/confirm — protected by requirePermission('order:confirm'); apotekare+admin only; careUnit ownership checked in service layer |

## Self-Check

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| migration.sql | FOUND |
| confirm.ts route | FOUND |
| orders.confirm.integration.test.ts | FOUND |
| ApotekareActionFooter.tsx | FOUND |
| 04-01-SUMMARY.md | FOUND |
| Commit 14a6ee8 (Task 1) | FOUND |
| Commit 3d8d7a1 (Task 2) | FOUND |
| Commit 80699b8 (Task 3) | FOUND |
| Commit 21f9507 (Task 4) | FOUND |
