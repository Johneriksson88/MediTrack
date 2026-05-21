---
phase: 03-draft-orders
plan: 04
subsystem: ui, api, testing
tags: [react, fastify, prisma, tanstack-query, shadcn, vitest, typescript]

# Dependency graph
requires:
  - phase: 03-01
    provides: Order/OrderLine schema + contracts (orderResponse, OrderLockedError, ValidationFailedError), RBAC order:* keys
  - phase: 03-02
    provides: createDraftOrder + listOrdersForUnit services, POST/GET /api/orders routes, useCreateDraftOrder, BestallningarPage
  - phase: 03-03
    provides: getOrderForUnit + addLineToOrder + updateOrderLine + removeOrderLine + searchPickerOptions services; GET/lines/picker routes; ComposeOrderPage Mode A + OrderLineTable + OrderLineCard + ComposeStickyFooter (inert submit/discard) + QuantityStepper + MedicationPickerSheet; 63 FE tests + 11 BE tests
provides:
  - POST /api/orders/:id/submit (Utkast → Skickad, atomic updateMany precondition, 422/409/404 contracts)
  - DELETE /api/orders/:id soft-delete route (204, 409 on non-utkast, 404 cross-tenant)
  - submitOrder + softDeleteOrder service functions (already in order.service.ts from Slice 1 pre-work)
  - OrderStatusPill component (all four statuses with locked color map — Phase 4 ready)
  - SubmitConfirmationBanner (role=status, Swedish copy, bg-primary/10)
  - DiscardDraftDialog (AlertDialog with Cancel-first focus, isDeleting spinner)
  - useSubmitOrder + useDiscardOrder mutation hooks (pessimistic, 409 carve-out, cache hydration)
  - Wired ComposeOrderPage Mode A→B: OrderStatusPill replaces span, SubmitConfirmationBanner replaces placeholder, discardOpen state, DiscardDraftDialog overlay
  - D-73 canonical 5-scenario BE integration test suite (16 tests total)
  - 78 FE component tests passing (12 ComposeOrderPage + 10 primitives + 56 prior)
affects: [03-04, phase-4, phase-5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - D-73 5-scenario BE integration suite: happy path, 409-after-submit, 422-on-empty, cross-careUnit-404, draft-list-scoping
    - Submit flow: mutateAsync on button click; cache hydration (setQueryData) flips page to Mode B without refetch
    - Discard flow: AlertDialog confirm → mutateAsync → navigate('/bestallningar'); 409 causes hook to invalidate + Mode B re-render
    - OrderStatusPill: STATUS_CLASS Record<OrderStatus, string> map covers all four statuses; ORDER_STATUS_LABELS from shared
    - DiscardDraftDialog: e.preventDefault() on AlertDialogAction prevents Radix auto-dismiss before mutation resolves

key-files:
  created:
    - apps/web/src/components/OrderStatusPill.tsx
    - apps/web/src/components/__tests__/OrderStatusPill.test.tsx
    - apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx
    - apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx
    - apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx
    - apps/web/src/routes/bestallningar/__tests__/DiscardDraftDialog.test.tsx
  modified:
    - apps/api/test/orders.integration.test.ts (D-73 5-scenario suite appended — 16 total)
    - apps/web/src/features/orders/useOrderMutations.ts (added useSubmitOrder + useDiscardOrder)
    - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx (Slice 4 wiring — OrderStatusPill, SubmitConfirmationBanner, DiscardDraftDialog, submit/discard hooks)
    - apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx (5 Slice 4 tests — 12 total)

key-decisions:
  - "TDD Task 1 was GREEN-direct (no RED phase) — BE submit/delete services and routes were already fully implemented in Slice 1 pre-work; tests passed on first run (consistent with Slice 3's precedent)"
  - "ComposeOrderPage handles navigation on discard success (page calls navigate after mutateAsync resolves) — hook is page-agnostic"
  - "DiscardDraftDialog onConfirm wraps mutateAsync in try/catch; on 409 the hook invalidates ['order', id] triggering Mode B re-render; dialog closes on any terminal state"
  - "useSubmitOrder success is silent (no toast) — OrderStatusPill flip + SubmitConfirmationBanner banner is the feedback per UI-SPEC §Toast Feedback"
  - "useDiscardOrder success is silent (no toast) — navigation back to /bestallningar is the feedback per UI-SPEC §Toast Feedback"
  - "D-73 scenario 3b uses direct prisma.orderLine.update to set quantity=0 (poisoning) — the public PATCH route uses .positive() Zod validation which would reject this, so the direct DB write is the only way to test the BE's belt-and-suspenders submit-time validation"

patterns-established:
  - "OrderStatusPill STATUS_CLASS map covers all four statuses — Phase 4 adds bekraftad/levererad transitions without modifying this component"
  - "submit/discard mutation 409 carve-out: toast.error + invalidateQueries(['order', id]) in onError before generic toast — same pattern as all prior line mutations"
  - "AlertDialogAction e.preventDefault() + disabled={isDeleting} prevents double-confirm and Radix auto-dismiss race"

requirements-completed: [ORD-03]

# Metrics
duration: ~45min
completed: 2026-05-22
---

# Phase 3 Plan 04: Submit & Discard (Slice 4) Summary

**ORD-03 ships: Utkast → Skickad atomic transition with D-73 5-scenario integration suite, OrderStatusPill + SubmitConfirmationBanner + DiscardDraftDialog primitives, and wired ComposeOrderPage Mode A→B UX**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-22T00:20:00Z (approximately)
- **Completed:** 2026-05-22T00:45:00Z
- **Tasks:** 3 (Task 1 BE integration tests + Task 2 FE primitives + Task 3 Page wiring)
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments

- Canonical D-73 5-scenario BE integration test suite: happy path (create→add-line→patch-quantity→submit, asserts submittedAt + submittedByUserId), 409-after-submit on all 5 follow-on ops, 422-validation-failed (empty_order + invalid_quantity via prisma poison), cross-careUnit 404 on 6 endpoints (never 403), draft-list scoping excludes skickad + other careUnit
- OrderStatusPill with all four statuses (Phase 4 ready), SubmitConfirmationBanner (role=status), DiscardDraftDialog (AlertDialog with Cancel-first focus + isDeleting spinner) — all with passing tests
- useSubmitOrder + useDiscardOrder pessimistic mutation hooks with 409 carve-out, cache hydration, and draft-list invalidation
- ComposeOrderPage fully wired: OrderStatusPill replaces placeholder span, SubmitConfirmationBanner replaces Mode B placeholder div, discardOpen state, DiscardDraftDialog overlay, real submit/discard callbacks
- All 59 BE tests + 78 FE tests passing; typecheck + build clean

## Task Commits

1. **Task 1 (D-73 integration tests):** `cfa19c1` (test: canonical 5-scenario suite)
2. **Task 2 (FE primitives + hooks):** `5800a92` (feat: OrderStatusPill + Banner + Dialog + useSubmitOrder/useDiscardOrder)
3. **Task 3 (Page wiring):** `c79effa` (feat: wire Submit/Discard + Mode B UI)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/api/test/orders.integration.test.ts` — extended with D-73 5-scenario `describe('Draft orders integration')` block; total 16 it blocks
- `apps/web/src/components/OrderStatusPill.tsx` — all four statuses; STATUS_CLASS map; ORDER_STATUS_LABELS from shared
- `apps/web/src/components/__tests__/OrderStatusPill.test.tsx` — 4 tests (one per status, label + bg-* class)
- `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` — role=status, CheckCircle2 icon, locked copy
- `apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx` — 2 tests (role=status + bg-primary/10)
- `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx` — AlertDialog; Cancel-first focus; isDeleting spinner; e.preventDefault() on action
- `apps/web/src/routes/bestallningar/__tests__/DiscardDraftDialog.test.tsx` — 4 tests (open, cancel, confirm, isDeleting)
- `apps/web/src/features/orders/useOrderMutations.ts` — added useSubmitOrder + useDiscardOrder
- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — full Slice 4 wiring; all TODO stubs resolved
- `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` — 5 Slice 4 tests added (12 total)

## Decisions Made

- TDD Task 1 was GREEN-direct (no RED phase) — BE submit/delete services and routes were already fully implemented in Slice 1 pre-work, consistent with Slice 3's TDD deviation
- ComposeOrderPage handles navigation on discard (calls navigate after mutateAsync resolves); hook is page-agnostic
- DiscardDraftDialog onConfirm wraps mutateAsync in try/catch; on 409 the hook handles toast + invalidation → Mode B re-render; dialog closes via setDiscardOpen(false) on any terminal state
- D-73 scenario 3b uses direct prisma.orderLine.update (quantity=0 poison) because the public PATCH route uses .positive() Zod validation

## Deviations from Plan

### TDD Process Deviation

**1. [Deviation] TDD Task 1 was GREEN-direct (no RED phase)**
- **Context:** Plan Task 1 is tagged `tdd="true"` and calls for extending `orders.integration.test.ts` with the 5 D-73 scenarios. The BE implementation (`submitOrder`, `softDeleteOrder` services, `submit.ts`, `delete.ts` routes) was already fully in place from Slice 1 pre-work.
- **Deviation:** Writing the failing tests first was not possible — they passed on first run (all 16 tests pass immediately).
- **Decision:** Proceeded GREEN-direct. Documented here and consistent with Slice 3's same pattern. Full behavior coverage is confirmed by 16 passing integration tests.

None - all other code followed the plan exactly as specified.

**Total deviations:** 1 (TDD process deviation — no production scope impact)

## Integration Test Suite Shape (D-73)

The `describe('Draft orders integration')` block contains 5 `it` blocks:

| # | Name | Key Assertions |
|---|------|---------------|
| 1 | happy path: create → add-line → patch-quantity → submit | status='skickad', submittedAt non-null ISO, submittedByUserId set, parseable by orderResponse schema |
| 2 | returns 409 order_locked on all line ops + re-submit + delete after submit | 5 subsequent ops all 409 with order_locked + details.status='skickad' |
| 3 | returns 422 validation_failed on empty or poisoned lines | (a) empty_order on empty draft; (b) invalid_quantity + lineId on prisma-poisoned quantity=0 |
| 4 | cross-careUnit access returns 404 not_found | 6 endpoints × CareUnit B user → all 404 not_found, never 403 |
| 5 | drafts list returns only caller's careUnit utkast orders | A's 2 utkast present; A's skickad absent; C's utkast absent |

## `submittedAt` Timestamping Decision

`submittedAt` is stamped as `new Date()` inside the `prisma.$transaction` body in `submitOrder` — Prisma serializes it to UTC ISO string via `toISOString()` in the `toOrderResponse` mapper. The FE receives a valid ISO 8601 string (e.g. `"2026-05-22T00:30:00.000Z"`). Phase 5's audit middleware will read this field without modification.

## Phase 3 Complete — ORD-01/02/03 Demoable

Phase 3 success criteria (ROADMAP.md) are all met:

1. **Draft persists with status Utkast** — Slice 2 (POST /api/orders) + Slice 3 (compose view) + Slice 4 (OrderStatusPill)
2. **User can edit a draft** (lines, quantities) — Slice 3 (add/remove/patch lines, QuantityStepper)
3. **Submit transitions to Skickad; subsequent edits 409** — Slice 4 (submitOrder + Mode B + D-73 test suite)
4. **Compose form usable on mobile** (sticky footer, 44px touch targets, totals visible) — Slice 3 (sticky footer) + Slice 4 (Mode B hides footer)

ORD-01, ORD-02, ORD-03 are all demoable end-to-end.

## 30-Second Demo Script (first `docker compose up`)

1. Open `http://localhost:5173` and log in as `sjukskoterska@example.test` / `demo1234`
2. Navigate to `/bestallningar` → see the seeded Utkast draft (3 lines, all on low-stock items)
3. Click into the draft → ComposeOrderPage Mode A: OrderStatusPill = "Utkast" (slate), sticky footer visible
4. Remove all 3 lines → Submit button disables with tooltip "Lägg till minst en rad för att skicka."
5. Click "Lägg till läkemedel" → MedicationPickerSheet opens → search for "para" → pick Paracetamol
6. Click "Skicka beställning" → spinner "Skickar…" briefly → page flips to Mode B:
   - OrderStatusPill = "Skickad" (blue)
   - Banner: "Beställningen är skickad till apotekare."
   - Line list read-only (no trash, no stepper buttons)
   - Sticky footer gone
7. Refresh → still Mode B (persisted in DB)
8. Back to `/bestallningar` → submitted order absent from drafts list
9. Create "Ny beställning" → new Utkast draft → click "Kasta":
   - AlertDialog opens: "Kasta detta utkast?" / "Utkastet tas bort permanent."
   - Click Avbryt → closes
   - Click Kasta again → confirm → spinner → navigate to /bestallningar (draft gone)
10. (409 synthetic test) Directly update order status in DB: `UPDATE "Order" SET status = 'skickad' WHERE id = '<id>'`. Open that draft in browser → click Submit or Kasta → toast "Beställningen kan inte ändras efter att den skickats." + page flips to Mode B

## Known Stubs

None — all Slice 3 TODO stubs have been resolved in this slice:
- ~~`ComposeOrderPage.tsx`: inline `<span>` status pill placeholder~~ → replaced with `<OrderStatusPill>`
- ~~`ComposeOrderPage.tsx`: Mode B placeholder `<div>` banner~~ → replaced with `<SubmitConfirmationBanner>`
- ~~`ComposeStickyFooter.tsx`: `onClick={() => {}}` inert handlers~~ → wired via props from ComposeOrderPage

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes beyond the plan's `<threat_model>`:
- T-03-01 (cross-careUnit 404): verified by D-73 scenario 4 against both submit and delete endpoints
- T-03-02 (mass-assignment): neither endpoint accepts a body; params-only routes
- T-03-03 (TOCTOU): `tx.order.updateMany WHERE status='utkast' AND deletedAt=null` — verified by scenario 2 (back-to-back submit attempts)
- T-03-04 (elevation of privilege): `requirePermission('order:submit')` + `requirePermission('order:delete')` preHandlers; `<Can>` gates on FE

## Self-Check: PASSED

All key files exist. All task commits verified in git log:
- cfa19c1: test(03-04) — D-73 integration suite
- 5800a92: feat(03-04) — FE primitives + hooks
- c79effa: feat(03-04) — Page wiring + Mode B UI

---
*Phase: 03-draft-orders*
*Completed: 2026-05-22*
