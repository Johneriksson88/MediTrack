---
phase: "04"
plan: "02"
subsystem: "orders"
tags: ["order-lifecycle", "stock", "rbac", "prisma", "tdd", "fastify", "react", "concurrency"]
dependency_graph:
  requires: ["04-01"]
  provides: ["order:deliver endpoint", "Mode D/E UI", "stock increment transaction", "OPS-03 concurrency proof"]
  affects: ["order.service.ts", "ComposeOrderPage", "useOrderMutations", "CareUnitMedication.currentStock"]
tech_stack:
  added: []
  patterns:
    - "D-78: Delivery is replenishment — line quantities ADDED to CareUnitMedication.currentStock"
    - "D-79: CUM batch lock with sorted-id ordering (SELECT ... FOR UPDATE WHERE id = ANY(...) ORDER BY id)"
    - "D-81: Soft-deleted CUM at deliver time returns 422 validation_failed reason=medication_removed BEFORE any UPDATE"
    - "D-86: Direct service import in concurrency test (NOT via app.inject) for real DB-level parallelism"
    - "D-88: Two-phase barrier with pg_locks observation proves DB-level serialization"
    - "Phase 6 NTF-01 hook: useDeliverOrder.onSuccess invalidates ['medications'] for future low-stock banner"
key_files:
  created:
    - "apps/api/src/routes/orders/deliver.ts"
    - "apps/api/test/orders.deliver.integration.test.ts"
    - "apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx"
    - "apps/web/src/routes/bestallningar/OrderActorTrail.tsx"
  modified:
    - "apps/api/src/services/order.service.ts"
    - "apps/api/src/routes/orders/index.ts"
    - "apps/web/src/features/orders/useOrderMutations.ts"
    - "apps/web/src/routes/bestallningar/ComposeOrderPage.tsx"
    - "apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx"
decisions:
  - "Sorted-id CUM batch lock (ORDER BY id FOR UPDATE) prevents deadlocks across concurrent orders sharing CUM rows (D-79/T-04-08)"
  - "::text[] cast on Prisma $queryRaw ANY() parameter required — Prisma interpolates as text[], not String[]"
  - "OrderActorTrail uses Intl.DateTimeFormat sv-SE for HH:mm instead of date-fns (T-03-SC no-new-packages precedent)"
  - "DeliverConfirmDialog uses default (not destructive) AlertDialog styling per UI-SPEC §4 — stock additions are not deletions"
  - "D-88 concurrency test uses Promise.allSettled + noop .catch() on each promise to prevent unhandled rejection before allSettled captures results"
  - "pg_locks poll in concurrency test: best-effort timing proof; stock assertion is the primary correctness check"
metrics:
  duration: "~9 minutes"
  completed_date: "2026-05-22"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 9
---

# Phase 04 Plan 02: Slice B — Deliver Order Lifecycle Summary

Delivered the full deliver half of the Phase 4 order lifecycle end-to-end: the CUM-batch lock transaction (D-79), the deliberate pg_locks-instrumented concurrency proof (D-88/OPS-03), and the React Mode D/E surfaces with AlertDialog gate, actor trail, and medications cache invalidation.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing deliver integration tests (7-case) | `5bc7822` | orders.deliver.integration.test.ts |
| 1 (GREEN) | deliverOrder service + POST /deliver route | `8a77170` | order.service.ts, deliver.ts, orders/index.ts |
| 2 | Concurrency test OPS-03 (pg_locks proof, Test 8) | `12be7ae` | orders.deliver.integration.test.ts |
| 3 | FE deliver flow (useDeliverOrder + DeliverConfirmDialog + Mode D/E + actor trail) | `174c8ff` | useOrderMutations.ts, ComposeOrderPage.tsx, DeliverConfirmDialog.tsx, OrderActorTrail.tsx, ComposeOrderPage.test.tsx |

## What Was Built

**deliverOrder service (Task 1):** 10-step D-79 transaction:
1. Order-row `FOR UPDATE` lock (same pattern as submitOrder/confirmOrder)
2. Load order+lines+nested CUMs+medication (need deletedAt for D-81 + medication.name for toast)
3. Existence+scope check → 404 on cross-careUnit (D-73)
4. Status precondition → 409 `order_transition_invalid` if not `bekraftad` (D-74)
5. D-81 soft-deleted CUM check → 422 `validation_failed` reason=`medication_removed` BEFORE any UPDATE
6. Aggregate same-CUM lines via `Map<cumId, totalQty>` keyed on `careUnitMedicationId`
7. Sorted CUM batch `FOR UPDATE` with `::text[]` cast (deadlock prevention STK-02)
8. Per-CUM `{ increment: qty }` updates (one per distinct CUM, inside the tx)
9. Atomic `updateMany WHERE status='bekraftad'` → count=0 throws `OrderTransitionError` (D-54)
10. Reload + return `toOrderResponse` (D-57)

**Route (Task 1):** `POST /api/orders/:id/deliver` with `[requireSession, requirePermission('order:deliver')]`. Registered after `confirmOrderRoute` in `index.ts`.

**Integration tests (Tasks 1+2):** 8 scenarios:
1. Happy path: full pipeline with two CUMs and line aggregation; stock incremented correctly
2. Wrong-status 409: deliver on Skickad (not Bekräftad)
3. Double-deliver 409: stock incremented exactly once
4. Cross-careUnit 404: D-73 existence-probe protection
5. Sjuksköterska 403: requirePermission preHandler
6. Soft-deleted CUM 422: medication_removed; tx rollback; no stock change
7. Line aggregation: same CUM on 3 lines; stock += sum
8. Concurrency (D-88/OPS-03): two parallel `deliverOrder()` calls via direct import; pg_locks proof; exactly one commit; stock +5 not +10

**useDeliverOrder hook (Task 3):** POST `/deliver`. onSuccess: cache hydration + invalidate `['orders',{status:'bekraftad'}]`, `['orders',{status:'levererad'}]`, `['medications']` (Phase 6 NTF-01 hook). onError: branches for `order_transition_invalid`, `validation_failed`/`medication_removed`, `not_found`, default. Success toast: `'Levererad — lagret uppdaterat'`.

**DeliverConfirmDialog (Task 3):** AlertDialog clone of DiscardDraftDialog. Cancel-first focus management. `e.preventDefault()` on Action. Default (not destructive) styling per UI-SPEC §4. Swedish copy verbatim from spec.

**OrderActorTrail (Task 3):** Conditional actor+timestamp trail. Renders only populated trios. HH:mm via `Intl.DateTimeFormat` sv-SE (no date-fns dependency). Used by Mode D (partial) and Mode E (full).

**ComposeOrderPage Mode D/E (Task 3):**
- Mode D (Bekräftad): Clock icon blue banner, read-only lines, `<ApotekareActionFooter label="Markera som levererad">` gated by `<Can action="order:deliver">`, `DeliverConfirmDialog` with 409/422/generic error branching, partial `OrderActorTrail`
- Mode E (Levererad): CheckCircle2 emerald banner, read-only lines, full `OrderActorTrail`, NO action button (terminal state D-76)
- Sjuksköterska on Bekräftad: banner + lines + trail; no button, no dialog
- `useDocumentTitle` extended: `'Beställning · Bekräftad — MediTrack'`, `'Beställning · Levererad — MediTrack'`

## Verification

- API tests: 74/74 pass (8 new in `orders.deliver.integration.test.ts`)
- Web tests: 82/82 pass (1 updated ComposeOrderPage.test.tsx)
- Web build: `tsc --noEmit && vite build` exits 0
- Slice A's confirm suite: 6/6 pass (no regressions)
- Phase 3's D-73 suite: 17/17 pass (no regressions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree node_modules not installed**
- **Found during:** Task 1 RED phase
- **Issue:** Worktree had no node_modules; vitest/prisma binaries not found
- **Fix:** Ran `pnpm install` in worktree root + `npx prisma generate` to generate Prisma client; also built `@meditrack/shared` (missing dist/ for vitest transform)
- **Files modified:** None (dependency install only)
- **Commit:** N/A (no code change)

**2. [Rule 1 - Bug] Unhandled rejection from losing concurrency tx (Test 8)**
- **Found during:** Task 2 — concurrency test run
- **Issue:** `OrderTransitionError` from the losing `deliverOrder()` call surfaced as an unhandled rejection before `Promise.allSettled` could capture it
- **Fix:** Added `.catch(() => {})` noop handlers on both `txAPromise` and `txBPromise` before `Promise.allSettled` — suppresses the warning without affecting the test logic
- **Files modified:** `apps/api/test/orders.deliver.integration.test.ts`
- **Commit:** `12be7ae`

**3. [Rule 3 - Blocking] `date-fns` not in dependency tree**
- **Found during:** Task 3 — typecheck
- **Issue:** `OrderActorTrail.tsx` imported `format` from `date-fns` which is not installed. DraftCard.tsx had an explicit comment (T-03-SC) saying date-fns was intentionally excluded
- **Fix:** Replaced `format(new Date(ts), 'HH:mm')` with `new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))` — same output, no new dependency
- **Files modified:** `apps/web/src/routes/bestallningar/OrderActorTrail.tsx`
- **Commit:** `174c8ff`

## Known Stubs

None — all data flows are wired end-to-end. `deliveredBy`/`deliveredAt` are null in Mode D render (by design — order not yet delivered). `OrderActorTrail` handles null conditionally.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new_endpoint | apps/api/src/routes/orders/deliver.ts | POST /api/orders/:id/deliver — protected by requirePermission('order:deliver'); apotekare+admin only; careUnit ownership + status precondition checked in service; CUM soft-delete check prevents stock corruption (T-04-09) |

## Self-Check

| Check | Result |
|-------|--------|
| deliver.ts route | FOUND |
| orders.deliver.integration.test.ts | FOUND |
| DeliverConfirmDialog.tsx | FOUND |
| OrderActorTrail.tsx | FOUND |
| Commit 5bc7822 (Task 1 RED) | FOUND |
| Commit 8a77170 (Task 1 GREEN) | FOUND |
| Commit 12be7ae (Task 2 concurrency) | FOUND |
| Commit 174c8ff (Task 3 FE) | FOUND |

## Self-Check: PASSED
