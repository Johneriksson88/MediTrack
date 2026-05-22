---
phase: 04-confirm-deliver-stock
verified: 2026-05-22T18:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "code review (04-REVIEW.md): 3 critical + 9 warning + 7 info findings"
  gaps_closed:
    - "CR-01: confirm/deliver endpoints accept arbitrary POST bodies — strict() schemas now wired (b53f719) + .nullish() follow-up (b891b02)"
    - "CR-02: OrderTransitionError race path hardcoded `from` — now reloads actual status (4174012)"
    - "CR-03: Levererad seed split create + stock increment across two non-transactional steps — now wrapped in prisma.$transaction (03235ce)"
    - "WR-02: ?status pre-parser comma-list / 'alla' shorthand normalized in one pass (228c7ef)"
    - "WR-03: OrdersTable Total column hidden on 'alla' tab to match column-spec (8814bf1)"
    - "WR-04: dead seedDraftOrder function deleted (2f26fd1)"
    - "WR-05: BestallningarPage tab change preserves other query params (a2c7b1c)"
    - "WR-06: confirmOrder empty_order check comment corrected (f29d4aa)"
    - "WR-07: Swedish toast 'Beställningen är redan {label.toLowerCase()}' replaces grammatically wrong 'har redan Skickad' (f901a0b)"
    - "WR-08: CareUnit upsert uses update: {} to match the file-header idempotency contract (e513087)"
    - "WR-09: ComposeOrderPage confirm-vs-deliver onClick asymmetry documented (b19ec63)"
  gaps_remaining:
    - "WR-01 (REVERTED — 7f82564): pg_locks assertion remained best-effort. The reverted fix documented that the pg_locks observation was not reliably observable across CI runs. Behavioral correctness is still proved by the allSettled + stock-exactly-once assertions; the test is a true correctness check, not a soft pass."
  regressions: []
---

# Phase 4: Confirm, Deliver & Stock — Verification Report

**Phase Goal:** Pharmacist completes the order lifecycle — `Skickad → Bekräftad → Levererad` — and on delivery, medication stock increments atomically with row-level locking. Order history is visible per `vårdenhet`. One integration test covers the full pipeline.
**Verified:** 2026-05-22T18:30:00Z
**Status:** passed
**Re-verification:** Yes — after 04-REVIEW.md gap closure (16 follow-up commits)

## Goal Achievement

### Observable Truths

These are the 5 Success Criteria from ROADMAP.md (the roadmap contract) — non-negotiable, must be observably true in the codebase.

| # | Truth (from ROADMAP.md SC) | Status | Evidence |
| - | --- | --- | --- |
| 1 | User with role `apotekare` or `admin` advances an order through `Skickad → Bekräftad → Levererad`; invalid jumps (e.g. `Utkast → Bekräftad`) return HTTP 409. | VERIFIED | `confirmOrder` (order.service.ts:508-607) and `deliverOrder` (order.service.ts:633-764) both check `order.status !== 'skickad'` / `!== 'bekraftad'` and throw `OrderTransitionError` (HTTP 409 in errorHandler.ts:174-178). Confirm test 2 (orders.confirm.integration.test.ts:166) and deliver test 2 (orders.deliver.integration.test.ts:220) assert 409 + `details: {from, to, expected}` on invalid jumps. RBAC enforced via `requirePermission('order:confirm'|'order:deliver')` in confirm.ts:28 + deliver.ts:30 with `PERMISSIONS['order:confirm'/'order:deliver'] = ['apotekare','admin']` (auth/permissions.ts:38-39). |
| 2 | On `Levererad`, every line's quantity is added to the medication's current stock in a single DB transaction; the catalog reflects the new totals immediately. | VERIFIED | `deliverOrder` wraps load + lock + per-CUM `{ increment: qty }` updates + status flip in `prisma.$transaction` (order.service.ts:638-761). Step 6 aggregates same-CUM lines via `Map<string, number>`; step 8 issues one `tx.careUnitMedication.update({ data: { currentStock: { increment } } })` per distinct CUM. Test 1 (deliver test happy path, orders.deliver.integration.test.ts:152-218) asserts stock incremented by exactly `before + 5` and `before + 4` for two CUMs (with aggregated 2+3 lines on CUM1). FE invalidates `['medications']` on success (useOrderMutations.ts:358) so catalog refetches. |
| 3 | The delivery handler uses `SELECT … FOR UPDATE` on each affected medication; two concurrent delivery requests on the same order serialize, not race (covered by a deliberate concurrency test). | VERIFIED | Two `$queryRaw … FOR UPDATE` statements in deliverOrder: (a) on `"Order"` (line 641), (b) on `"CareUnitMedication" WHERE id = ANY(...) ORDER BY id FOR UPDATE` (lines 702-707) using sorted-id ordering for deadlock prevention. Test 8 (orders.deliver.integration.test.ts:454-558) issues two parallel `deliverOrder()` calls via direct service import (D-86), polls pg_locks during the barrier window, and asserts exactly one fulfilled + one rejected with `code = 'order_transition_invalid'`, and `currentStock = before + 5` (not +10). Note: pg_locks observation is best-effort timing-proof (WR-01 revert acknowledged); the stock + allSettled assertions are the primary correctness checks. |
| 4 | Order history page lists every order for the current `vårdenhet` with status, lines, timestamps, and the user who made each transition. | VERIFIED | `BestallningarPage` renders 5-tab status filter via shadcn Tabs URL-deep-linked through `useSearchParams` (BestallningarPage.tsx:60-95, 130-157). `listOrdersForUnit` includes `submittedBy/confirmedBy/deliveredBy` actor trios on each row (order.service.ts:228-234). `OrdersTable` (per-tab columns) and `OrdersCardList` (mobile) render the relevant actor name per tab. `OrderActorTrail` (apps/web/src/routes/bestallningar/OrderActorTrail.tsx) shows full audit segments `Skapad av … · Skickad av … · Bekräftad av … · Levererad av …` on detail pages. List test 7 (orders.list.integration.test.ts:419-480) asserts a bekraftad row has `submittedBy + confirmedBy` populated and `deliveredBy: null`. |
| 5 | Integration test exercises the full path `create draft → submit → confirm → deliver` and asserts: order final status is `Levererad`, every medication's stock incremented by the correct line quantity, no race window observable. | VERIFIED | `orders.deliver.integration.test.ts` Test 1 (lines 152-218) executes `createEmptyOrder → progressOrderToBekraftad (nurse adds 3 lines → submit → apotekare confirm) → POST /deliver` and asserts (a) `body.status === 'levererad'`, (b) `body.deliveredByUserId / deliveredBy.name` populated, (c) prior `createdBy + submittedBy + confirmedBy` still populated, (d) `after1.currentStock === before1 + 5` and `after2.currentStock === before2 + 4`. Test 8 covers the no-race-window assertion via pg_locks-instrumented two-phase barrier. |

**Score:** 5/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/api/prisma/migrations/20260522120000_0006_order_confirm_deliver/migration.sql` | Additive migration adding 4 nullable columns + 2 FK constraints to Order | VERIFIED | All 4 columns (confirmedAt, confirmedByUserId, deliveredAt, deliveredByUserId) declared TIMESTAMP(3)/TEXT; both FKs added with ON DELETE RESTRICT (lines 5-15). |
| `apps/api/prisma/schema.prisma` | Order model widened with 4 actor columns + 2 named relations + 2 User inverse fields | VERIFIED | confirmedAt/confirmedByUserId/confirmedBy + deliveredAt/deliveredByUserId/deliveredBy declared at lines 201-213 with `@relation(name: "OrderConfirmedBy" / "OrderDeliveredBy")`. |
| `apps/api/src/services/order.service.ts confirmOrder` | confirmOrder(careUnitId, orderId, actorUserId): Promise<OrderResponse> with FOR UPDATE + atomic updateMany | VERIFIED | Signature at line 508; 6-step transaction with `FOR UPDATE` at line 516, status precondition at 540, atomic updateMany at 562, reload-on-race-loss at 576 (CR-02 fix). |
| `apps/api/src/services/order.service.ts deliverOrder` | deliverOrder(...) with CUM batch lock, aggregation, per-CUM increment | VERIFIED | Signature at line 633; 10-step transaction with Order FOR UPDATE (641), soft-deleted CUM check (675-685), Map aggregation (689-695), CUM batch FOR UPDATE with `::text[]` cast + sorted-id ordering (702-707), per-CUM `{ increment }` (711-716), reload-on-race-loss (733) (CR-02 fix). |
| `apps/api/src/routes/orders/confirm.ts` | POST /api/orders/:id/confirm with requireSession + requirePermission('order:confirm') + body: confirmOrderRequest | VERIFIED | CR-01 fix wired `body: confirmOrderRequest` (line 31). preHandler order correct (line 28). |
| `apps/api/src/routes/orders/deliver.ts` | POST /api/orders/:id/deliver with body: deliverOrderRequest | VERIFIED | CR-01 fix wired `body: deliverOrderRequest` (line 33). |
| `apps/api/src/routes/orders/list.ts` | preValidation hook intercepts ?status; 'alla' expands, comma-list splits | VERIFIED | preValidation at lines 44-75; comma-split-first normalization (WR-02 fix) at lines 63-72; 'alla' shorthand only matches single-token (line 67). |
| `apps/api/src/auth/permissions.ts` | PERMISSIONS map includes 'order:confirm' and 'order:deliver' → [apotekare, admin] | VERIFIED | Lines 38-39. |
| `apps/api/src/plugins/errorHandler.ts OrderTransitionError` | Class with code='order_transition_invalid', 409 branch in setErrorHandler | VERIFIED | Class at line 118; branch at line 174 (registered BEFORE Zod fallback). |
| `packages/shared/src/contracts/order.ts` | orderResponse widened with confirm/deliver trios; confirmOrderRequest + deliverOrderRequest as strict empty schemas | VERIFIED | orderResponse fields at 76-79, 85-87; `confirmOrderRequest = z.object({}).strict().nullish()` at 161 (CR-01 follow-up b891b02); same shape for deliverOrderRequest at 170. |
| `apps/api/test/orders.confirm.integration.test.ts` | 6 it blocks covering happy path, wrong-status 409, double-confirm 409, cross-careUnit 404, RBAC 403, not-found 404 | VERIFIED | All 6 it blocks present at lines 113, 166, 197, 228, 284, 306. |
| `apps/api/test/orders.deliver.integration.test.ts` | 8 it blocks including Test 8 concurrency | VERIFIED | Lines 152, 220, 254, 292, 349, 374, 426, 454. Test 8 is the pg_locks-instrumented concurrency proof. |
| `apps/api/test/orders.list.integration.test.ts` | 7 it blocks covering back-compat, single, comma-list, alla, cross-careUnit, invalid token, actor shape | VERIFIED | Lines 142, 181, 235, 291, 351, 399, 419. |
| `apps/web/src/features/orders/useOrderMutations.ts useConfirmOrder + useDeliverOrder` | Mutations with cache hydration + status-aware error toasts | VERIFIED | useConfirmOrder at line 283; useDeliverOrder at line 343. WR-07 fix: toasts use `'Beställningen är redan ${ORDER_STATUS_LABELS[details.from].toLowerCase()}.'` (lines 306-308, 368-370). |
| `apps/web/src/routes/bestallningar/ApotekareActionFooter.tsx` | Sticky-mobile/inline-desktop button with min-h-[44px] | VERIFIED | File exists; reused by Mode C confirm + Mode D deliver. |
| `apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx` | AlertDialog gate for deliver with Cancel-first | VERIFIED | File present. |
| `apps/web/src/routes/bestallningar/OrderActorTrail.tsx` | Shared actor trail rendering populated segments only | VERIFIED | File renders `Skapad/Skickad/Bekräftad/Levererad av {name} {HH:mm}` segments conditionally (lines 52-70). Uses `Intl.DateTimeFormat sv-SE` (no date-fns dep). |
| `apps/web/src/routes/bestallningar/BestallningarPage.tsx` | 5-tab status filter URL-backed | VERIFIED | useSearchParams at line 60; Tabs at line 130 with 5 triggers (utkast/skickad/bekraftad/levererad/alla). WR-05 fix: handleTabChange preserves other params (lines 86-95). |
| `apps/web/src/routes/bestallningar/OrdersTable.tsx` | Desktop table with per-tab columns; Total column hidden on 'alla' | VERIFIED | tab-aware columns at 92-173; `{tab !== 'alla' && ...}` guards Total cells (lines 113, 156) — WR-03 fix. |
| `apps/web/src/routes/bestallningar/OrdersCardList.tsx` | Mobile card list with per-tab anatomy | VERIFIED | File present; alla-tab omits totalt (consistent with OrdersTable). |
| `apps/web/src/components/ui/tabs.tsx` | shadcn Tabs primitive | VERIFIED | File present; `@radix-ui/react-tabs` in apps/web/package.json. |
| `apps/api/prisma/seed.ts` | seedDemoOrders with 4 idempotent per-status orders + Levererad post-step stock in a transaction | VERIFIED | seedDemoOrders at line 485; per-status idempotency check at 393-407; Levererad order + per-CUM increment wrapped in `prisma.$transaction` at 452-460 — CR-03 fix. WR-04 fix: seedDraftOrder removed (only comments referring to it remain). WR-08 fix: CareUnit upsert uses `update: {}` (line 281). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| confirmOrder | OrderTransitionError | throw inside $transaction when status≠skickad OR updateMany count=0 | WIRED | Lines 540-545 (precondition) + 575-585 (race loss, now reloads actual status) |
| deliverOrder | OrderTransitionError | throw inside $transaction when status≠bekraftad OR updateMany count=0 | WIRED | Lines 665-671 + 729-742 (reload-actual-status race path) |
| deliverOrder | per-CUM stock increment | `tx.careUnitMedication.update({ data: { currentStock: { increment } } })` per distinct CUM | WIRED | Lines 711-716 |
| confirm.ts route | order:confirm RBAC | preHandler [requireSession, requirePermission('order:confirm')] | WIRED | Line 28 |
| deliver.ts route | order:deliver RBAC | preHandler [requireSession, requirePermission('order:deliver')] | WIRED | Line 30 |
| useConfirmOrder | Mode C button (ComposeOrderPage) | mutateAsync on ApotekareActionFooter onClick | WIRED | ComposeOrderPage.tsx:346 |
| useDeliverOrder | DeliverConfirmDialog → ComposeOrderPage Mode D | mutateAsync inside dialog onConfirm | WIRED | DeliverConfirmDialog.tsx + ComposeOrderPage.tsx Mode D branch |
| useDeliverOrder | ['medications'] cache | queryClient.invalidateQueries on success (Phase 6 NTF-01 hook) | WIRED | useOrderMutations.ts:358 |
| BestallningarPage Tabs | useOrdersByStatusQuery | status param drives query key | WIRED | BestallningarPage.tsx:66 |
| list.ts pre-parser | listOrdersForUnit | parsed status array passed via req.query | WIRED | list.ts:54-74 → 83 |
| seedDemoOrders (levererad) | CareUnitMedication.currentStock | prisma.$transaction wraps order.create + per-CUM increment | WIRED | seed.ts:452-460 (CR-03 fix) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| BestallningarPage | activeQuery.data.rows | useDraftsQuery / useOrdersByStatusQuery → GET /api/orders | Yes — listOrdersForUnit issues prisma.order.findMany with all 3 actor includes | FLOWING |
| OrdersTable / OrdersCardList | rows (prop) | BestallningarPage activeQuery | Yes — passes server payload directly | FLOWING |
| ComposeOrderPage Mode D | order (queried) | useOrderQuery → GET /api/orders/:id | Yes — getOrderForUnit returns full OrderResponse with confirmedBy + deliveredBy includes | FLOWING |
| OrderActorTrail | createdBy/submittedBy/confirmedBy/deliveredBy | ComposeOrderPage props from order | Yes — segments conditional on populated trios; empty trios skipped | FLOWING |
| useDeliverOrder.onSuccess | response cache | fetchJson POST /deliver returning full updated OrderResponse | Yes — server returns reloaded row with all 4 actor trios | FLOWING |

### Behavioral Spot-Checks

The user confirms the full test suite passed locally. Per phase prompt:
- apps/api: 81/81 passed (incl. orders.confirm.integration.test.ts 6/6, orders.deliver.integration.test.ts 8/8 including concurrency Test 8, orders.list.integration.test.ts 7/7)
- apps/web: 82/82 passed

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 4 API integration tests | `pnpm --filter @meditrack/api test` | 81/81 passed (per prompt + 04-03-SUMMARY.md) | PASS |
| Phase 4 Web tests | `pnpm --filter @meditrack/web test` | 82/82 passed (per prompt) | PASS |
| Confirm 6-scenario suite | `pnpm --filter @meditrack/api test -- orders.confirm.integration` | 6/6 passed | PASS |
| Deliver 8-scenario suite (incl. concurrency Test 8) | `pnpm --filter @meditrack/api test -- orders.deliver.integration` | 8/8 passed | PASS |
| List API 7-scenario suite | `pnpm --filter @meditrack/api test -- orders.list.integration` | 7/7 passed | PASS |

### Probe Execution

No project-conventional probe scripts under `scripts/*/tests/probe-*.sh` and no probe declarations in PLAN/SUMMARY/REVIEW. Step 7c: SKIPPED (no probes declared for this phase).

### Requirements Coverage

All 7 Phase 4 REQ-IDs claimed by the PLAN frontmatters. Each is mapped to verified truths/artifacts.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ORD-04 | 04-01 | apotekare/admin can confirm a submitted order (Skickad → Bekräftad) | SATISFIED | confirmOrder service + POST /confirm + 6-scenario test (Truth 1) |
| ORD-05 | 04-02 | apotekare/admin can mark Bekräftad → Levererad | SATISFIED | deliverOrder + POST /deliver + 8-scenario test (Truth 1) |
| ORD-06 | 04-01, 04-02 | Backend rejects non-linear transitions with HTTP 409 | SATISFIED | OrderTransitionError + 409 branch + tests cover wrong-status + double-confirm + double-deliver (Truth 1) |
| ORD-07 | 04-03 | Order history per vårdenhet with status, lines, timestamps, transition actors | SATISFIED | BestallningarPage 5-tab UI + listOrdersForUnit actor includes + OrderActorTrail (Truth 4) |
| STK-01 | 04-02 | Stock incremented atomically on Levererad inside DB tx | SATISFIED | deliverOrder $transaction wraps lock + increments + status flip (Truth 2) |
| STK-02 | 04-02 | SELECT … FOR UPDATE on each affected medication | SATISFIED | CUM batch lock with sorted-id ordering at order.service.ts:702-707 (Truth 3) |
| OPS-03 | 04-02 | Integration test covering full pipeline + concurrency | SATISFIED | Test 1 (full pipeline) + Test 8 (pg_locks-instrumented concurrency) in orders.deliver.integration.test.ts (Truth 5) |

REQUIREMENTS.md does not map additional Phase-4 IDs beyond what the plans claim — no orphans.

### Anti-Patterns Found

Scanned files modified in this phase (per SUMMARY key-files lists across all 3 slices).

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| orders.deliver.integration.test.ts | 540-549 | Comment "best-effort timing proof" — pg_locks `if (blockedRowsObserved.length > 0)` soft-gate | Info | Acknowledged in re-verification block. WR-01 fix was reverted (7f82564) because the assertion was not reliably observable across CI runs. The behavioral correctness (one tx commits, the other rejects with order_transition_invalid, stock = before+5 not +10) IS unconditionally asserted (lines 528-553). This is not a stub or false-pass risk for the §6 interview proof. |
| Phase 4 files broadly | n/a | TBD / FIXME / XXX debt markers in modified files | None found | grep across files_reviewed_list returned no unreferenced TBD/FIXME/XXX markers. |
| useOrderMutations.ts | 302, 364 | `as { from: OrderStatus }` unchecked cast | Info | IN-05 from review — defensive paranoia; BE schema is tight. Not a blocker. |
| OrderActorTrail.tsx | 73, 76 | `gap-x-1` parent + literal `' · '` separator | Info | IN-02 from review — minor visual nit, not a blocker. |

No 🛑 Blocker patterns. Info-level only; tracked in 04-REVIEW.md as IN-01..IN-07 — these were explicitly de-prioritized by the reviewer.

### Human Verification Required

Not required for this phase.

The phase ships protected, server-authoritative state transitions whose correctness is fully expressible via integration tests against real Postgres. The user already confirmed locally that all 81 API tests and 82 web tests pass. All visible UI surfaces have unit-test coverage (BestallningarPage.test.tsx + ComposeOrderPage.test.tsx).

Manual exploratory testing (mobile breakpoints, AlertDialog focus management, toast wording on race) is documented as smoke checklists in 04-01-PLAN.md `<verification>` and 04-02-PLAN.md `<verification>` and was acknowledged by the executor SUMMARYs. The PLAN files do NOT contain `<human-check>` blocks deferred to end-of-phase (#3309). No human items harvested.

### Gaps Summary

None — phase goal achieved, all 5 ROADMAP success criteria satisfied, all 7 Phase 4 requirements implemented and tested, all 3 critical review findings closed in commits, 8 of 9 warning findings closed, the one reverted (WR-01) is acknowledged as a known timing limitation that does not affect behavioral correctness.

---

_Verified: 2026-05-22T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
