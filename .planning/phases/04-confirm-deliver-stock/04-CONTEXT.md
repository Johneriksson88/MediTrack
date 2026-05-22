# Phase 4: Confirm, Deliver & Stock - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Pharmacist (`apotekare`, `admin`) advances submitted orders through `Skickad → Bekräftad → Levererad`. On the `Levererad` transition, each line's quantity is added to the medication's current stock inside a single Postgres transaction protected by `SELECT … FOR UPDATE` row-level locks on the affected `CareUnitMedication` rows. `/bestallningar` evolves from a drafts-only list into a per-vårdenhet history surface with a status-tab filter. One integration test exercises the full `create → submit → confirm → deliver` pipeline AND deliberately serializes two concurrent deliveries on the same order to demonstrate the §6 concurrency answer.

**In scope (Phase 4 only — REQ-IDs ORD-04, ORD-05, ORD-06, ORD-07, STK-01, STK-02, OPS-03):**

- Prisma migration adding `confirmedAt (DateTime?)`, `confirmedByUserId (String?)`, `deliveredAt (DateTime?)`, `deliveredByUserId (String?)` to `Order` — mirrors the D-49 column-pair convention (`@relation(name:"OrderConfirmedBy"/"OrderDeliveredBy")`, `onDelete: Restrict`). No new indexes — `@@index([careUnitId, createdAt])` (D-62) already covers history sort.
- New shared error code `order_transition_invalid` (HTTP 409, D-19 envelope) with `details: { from: OrderStatus, to: OrderStatus, expected: OrderStatus }`. Phase 3's `order_locked` stays narrow to "line mutation on a non-utkast order" (D-77).
- New `OrderTransitionError` class in `apps/api/src/plugins/errorHandler.ts`, registered BEFORE the generic Zod 400 branch (mirrors D-56 OrderLockedError placement).
- `POST /api/orders/:id/confirm` — RBAC `order:confirm`; atomic UPDATE `WHERE id = ? AND careUnitId = ? AND status = 'skickad' AND deletedAt IS NULL` flips to `bekraftad`, stamps `confirmedAt + confirmedByUserId`. Returns full `OrderResponse` (D-57). 404 on cross-careUnit / not-found / soft-deleted (D-73); 409 `order_transition_invalid` on wrong status.
- `POST /api/orders/:id/deliver` — RBAC `order:deliver`; the full stock-update transaction (see Decisions §Stock). Returns full `OrderResponse`. 404 on cross-careUnit; 409 on wrong status; 422 `validation_failed` with `reason: 'medication_removed'` if any line references a soft-deleted CUM (D-81).
- `GET /api/orders` extended to accept `status` query param as a single value OR comma-list (e.g., `?status=skickad,bekraftad,levererad,utkast` for the "Alla" tab). Default stays `?status=utkast` for Phase 3 back-compat. `OrderListItem` schema widens to include `status` plus optional `submittedBy`, `confirmedBy`, `deliveredBy` for the non-utkast columns.
- `order.service.ts` adds `confirmOrder(careUnitId, orderId, actorUserId)`, `deliverOrder(careUnitId, orderId, actorUserId)`. Mutating service signature mirrors D-16 (careUnitId first, actor second).
- Permission map widening: `'order:confirm'` and `'order:deliver'` appended to `ACTION_KEYS` and `PERMISSIONS`, both restricted to `['apotekare', 'admin']` (D-15 drift-prevention enforces the map entry).
- `/bestallningar` status-tab filter at top of page (`Utkast | Skickade | Bekräftade | Levererade | Alla`); URL: `/bestallningar?status=skickad`. Tab is the source of truth for the list query; URL is deep-linkable. Drafts list (D-72) still renders inside the `Utkast` tab unchanged; the other tabs render a slightly wider table/card (extra columns for the relevant transition's actor + timestamp).
- `/bestallningar/:id` extends ComposeOrderPage with Mode C (Bekräftad) and Mode D (Levererad) — same component, status-driven branches. Skickad now shows a `Bekräfta beställning` button gated by `<Can action="order:confirm">`. Bekräftad shows `Markera som levererad` gated by `<Can action="order:deliver">`, opening an `<AlertDialog>` (D-83) before firing the mutation (stock changes are irreversible). Levererad shows the final state with the actor trail.
- Seed extension: in addition to the existing Utkast draft (D-23 / current seed), produce one Skickad + one Bekräftad + one Levererad order for `sjukskoterska@example.test`'s vårdenhet. Idempotent per status via `findFirst` existence check before each `create`. The Levererad order's stock additions are baked into the per-`nplId` deterministic stock generator OR applied as a post-step `UPDATE` after seeding the order (Claude's discretion).
- Integration test `apps/api/test/orders.deliver.integration.test.ts` (mirrors Phase 3 D-73 file). Two `it` blocks: (1) full pipeline `create → submit → confirm → deliver` via `app.inject`, asserts final status `levererad` + stock incremented by exact line totals + every actor stamp present; (2) deliberate concurrency: two `prisma.$transaction` calls in parallel against a Bekräftad order; assert exactly one commits, the other receives `order_transition_invalid` (409), final stock incremented exactly once, AND `pg_locks` showed tx-B blocked on tx-A's row lock during the barrier window.
- README known-gap line: "Order line fields (name/form/strength) live-join from CareUnitMedication × Medication at read time. If an `apotekare` PATCHes a user-created medication after a Skickad order references it, the order's historic line will render with the new metadata. NPL meds are locked from edits (D-32) so the demo path is unaffected. Snapshot columns are a v2 improvement."

**Out of scope (other phases):**

- Backward transitions / undoing a confirmation (Bekräftad → Skickad) — deferred, not in REQUIREMENTS.md.
- Bulk apotekare actions ("Bekräfta valda" multi-select from the Skickade tab) — deferred (deadlock risk, not asked for).
- Dedicated apotekare queue page (`/apoteket`) — deferred; `/bestallningar` Skickade tab covers this.
- OrderLine snapshot columns (D-47 deferred to "when stock is decremented") — explicitly NOT shipping in Phase 4 (D-80); live-join is the v1 contract.
- Audit log writes for confirm/deliver — Phase 5 retrofits middleware that records every mutation in this phase without touching Phase 4 code.
- AI categorization + dashboard low-stock banner (NTF-01) → Phase 6 (the banner refetches on deliver per NTF-02; Phase 4 must invalidate `['medications', …]` query keys on deliver so Phase 6's banner just works).
- README, docker-compose polish, full git-history review (OPS-01, OPS-02, OPS-04) → Phase 7.
- Email / push notifications on transitions → out-of-scope per PROJECT.md (in-app banner is Phase 6, email is v2 NTF-03).
- Different-orders / same-CUM concurrency test (two vårdenheter's deliveries on overlapping meds) — deferred to Phase 7 README §6 if time allows; Phase 4 ships only the same-order case (D-89).
- Re-deliver / void-delivery flow — Levererad is terminal by design (D-76).

</domain>

<decisions>
## Implementation Decisions

### Status Transition Contract

- **D-74:** **New error code `order_transition_invalid` (HTTP 409).** Body: `{ error: { code: 'order_transition_invalid', message: 'Beställningen kan inte gå från {from} till {to}.', details: { from: OrderStatus, to: OrderStatus, expected: OrderStatus } } }`. The FE branches once on `code` and renders a status-aware Swedish toast (uses `ORDER_STATUS_LABELS` from `packages/shared/src/constants/orderStatus.ts`). One code scales cleanly: when a future status arrives, the contract diff is zero. Phase 3 D-55's "narrow per-status codes" option is rejected here; the generalized code is the canonical answer.

- **D-75:** **Two narrow transition endpoints.** `POST /api/orders/:id/confirm` and `POST /api/orders/:id/deliver`, mirroring `POST /api/orders/:id/submit` (D-54 / D-65). Each endpoint binds its own RBAC preHandler (`order:confirm` / `order:deliver`), guards its own status precondition (`'skickad'` / `'bekraftad'`), and stamps its own actor + timestamp pair. File layout: `apps/api/src/routes/orders/{confirm,deliver}.ts` extends the existing `orders/` directory. A generic `/transition` endpoint is rejected — it forces RBAC checks to read the body before deciding, and the stock-update side-effect on deliver becomes a switch statement in one handler.

- **D-76:** **Strictly linear, forward-only transitions.** `Skickad → Bekräftad → Levererad`, no reversal. ROADMAP.md SC #1 says invalid jumps return 409 — that includes backward jumps (`Bekräftad → Skickad`) and skips (`Skickad → Levererad`). Apotekare mistakes are handled by the `<AlertDialog>` on deliver (UX gate, not API gate). This decision keeps the test matrix small and the §6 correctness story clean: "all transitions are linear and final."

- **D-77:** **`order_locked` stays narrow to Phase 3's line-mutation contract.** Line CRUD endpoints (`POST/PATCH/DELETE /api/orders/:id/lines[/:lineId]`) continue to throw `OrderLockedError` (409, code `'order_locked'`) when `status !== 'utkast'` — D-54 / D-55 verbatim. The new `order_transition_invalid` is only thrown by the confirm/deliver endpoints. Two codes, two semantically distinct user errors: "you can't edit a sent order" vs "you can't take this transition from this status." Phase 3's tests + FE 409 toast handler are unchanged.

### Stock Update Semantics

- **D-78:** **Delivery is replenishment — quantity is ADDED to `CareUnitMedication.currentStock`.** Matches ROADMAP.md SC #2 verbatim and the brief's hospital-pharmacy workflow (nurse orders → pharmacy fulfills → vårdenhet receives stock). `consumption` semantics (subtract) is rejected as inverting the spec. The Levererad order is the only path that mutates stock in v1; manual stock edits (Phase 2 Sheet) remain available but the demo path runs through delivery to showcase the audit-friendly flow.

- **D-79:** **Aggregate same-CUM lines, lock once, update once.** Inside the deliver `prisma.$transaction`:
  1. Load the order with lines (read inside the tx for consistency).
  2. Build `Map<careUnitMedicationId, totalQty>` by summing line quantities per CUM.
  3. `SELECT id FROM "CareUnitMedication" WHERE id = ANY($1) ORDER BY id FOR UPDATE` — the sorted-id lock ordering is the deadlock-prevention story for the §6 concurrency answer. (Lock the Order row first, exactly as `submitOrder` does today via `$queryRaw … FOR UPDATE`, then lock the CUM batch.)
  4. For each `[cumId, totalQty]`: `UPDATE "CareUnitMedication" SET "currentStock" = "currentStock" + $1, "updatedAt" = now() WHERE id = $2` (one Prisma `update` per CUM, all inside the same tx). Using row-lock-then-update means concurrent deliveries serialize at the CUM granularity.
  5. Atomic Order-row UPDATE with precondition `status = 'bekraftad'` flips to `'levererad'`, stamps `deliveredAt + deliveredByUserId`. `count === 0` → `OrderTransitionError`.
  6. Return the full updated Order (D-57).
  D-63 explicitly allows the same CUM on two lines, so aggregation matters: locking once-per-distinct-CUM minimizes the lock footprint and gives a clean "we lock distinct stock rows in sorted order" answer.

- **D-80:** **Skip OrderLine snapshot columns — live-join is the v1 contract.** D-47 deferred snapshots to "when stock is decremented," but with `onDelete: Restrict` on `OrderLine.careUnitMedicationId` + `CareUnitMedication.medicationId`, the join can't break for deletion. NPL meds are locked from edits (D-32), so the demo path's metadata is stable. The only drift is PATCH on user-created Medication.name/atcCode/form/strength → historic orders re-render with the new metadata. This is documented in the README as a known gap with "v2: snapshot at deliver" as the future fix. The trade is intentional: zero schema churn, simpler reads, fewer tests, and the demo never hits the drift case.

- **D-81:** **Soft-deleted CUM at deliver time → 422 `validation_failed` with `reason: 'medication_removed'`.** Mirrors Phase 3 D-56's 422 shape verbatim (`ValidationFailedError`, but extend the `reason` union to `'empty_order' | 'invalid_quantity' | 'medication_removed'`). The deliver tx loads lines+CUMs inside step 1; if any CUM has `deletedAt !== null` the tx aborts with the 422 before issuing any UPDATE. FE surfaces a toast: `{medication name} har tagits bort — återställ läkemedlet i registret innan leverans.` The fix path (Phase 2 D-30 transparent restore via re-add) is one apotekare click in `/lakemedel`. Auto-restore on deliver is rejected — coupling stock + catalog mutation in one user action makes the audit story muddier.

### History Surface + Pharmacist UX

- **D-82:** **Status-tab filter at the top of `/bestallningar`.** Five tabs: `Utkast | Skickade | Bekräftade | Levererade | Alla`. URL: `/bestallningar?status=skickad` (single value) or `/bestallningar?status=skickad,bekraftad` (comma-list, mostly used internally for the "Alla" tab which sends all four). The current drafts list (D-72) renders inside `Utkast` unchanged. The other tabs render the same table/cards with extra columns depending on status: Skickade adds `Skickad av` + `Skickad`; Bekräftade adds `Bekräftad av` + `Bekräftad`; Levererade adds `Levererad av` + `Levererad`; Alla just shows status pill + creation date. Reuses Phase 2's URL-as-state pattern (D-39 / D-42). Mobile-first: tabs collapse to a horizontally-scrollable strip on `<sm`. shadcn `<Tabs>` is the recommended primitive; the `value` prop is bound to the URL search-param via `useSearchParams`.

- **D-83:** **Inline apotekare action buttons on `/bestallningar/:id`.** `ComposeOrderPage` extends from Mode A (Utkast — Phase 3) / Mode B (Skickad — Phase 3) into:
  - **Mode C (Skickad, viewer is apotekare/admin):** Renders the line list read-only + a `Bekräfta beställning` button (right-aligned in desktop header / sticky-footer left on mobile) gated by `<Can action="order:confirm">`. Click → `useConfirmOrder` mutation → on success TanStack `setQueryData(['order', id], response)` + invalidate `['orders', {status: 'skickad'}]` and `['orders', {status: 'bekraftad'}]`. Page re-renders in Mode D.
  - **Mode D (Bekräftad, viewer is apotekare/admin):** Read-only lines + a `Markera som levererad` button gated by `<Can action="order:deliver">`. Click opens `<AlertDialog>` titled `Markera som levererad?` with body `Stocken uppdateras direkt. Detta kan inte ångras.` and confirm/cancel actions. Confirm → `useDeliverOrder` mutation → on success `setQueryData(['order', id], response)` + invalidate `['orders', …]` lists AND `['medications', …]` lists (Phase 6 NTF-01 banner depends on this). Page re-renders in Mode E.
  - **Mode E (Levererad):** Read-only final view; banner `Beställningen är levererad — lagret uppdaterat.` + the full actor/timestamp trail (`Skapad av Anna · Skickad av Anna 14:02 · Bekräftad av Bo 14:18 · Levererad av Bo 16:30`).
  - **Sjuksköterska view of Skickad/Bekräftad/Levererad** → read-only; no action buttons (RBAC double-defense + `<Can>` UI gate).
  Mobile sticky-footer (D-71) extends with the apotekare buttons in Mode C/D.

- **D-84:** **Mirror D-49 verbatim for actor columns.** `Order` adds `confirmedAt (DateTime?)`, `confirmedByUserId (String?)`, `deliveredAt (DateTime?)`, `deliveredByUserId (String?)`. Both `*ByUserId` are FK to `User.id` with `onDelete: Restrict` (preserve order history if a user is deleted). Prisma `@relation(name: "OrderConfirmedBy")` + `@relation(name: "OrderDeliveredBy")` to disambiguate the four FKs to User (createdBy, submittedBy, confirmedBy, deliveredBy). Service stamps both fields inside the same tx as the status flip — atomicity via `prisma.$transaction` (confirm) or the existing tx (deliver). `orderResponse` schema in `packages/shared/src/contracts/order.ts` widens with `confirmedAt: z.string().datetime().nullable()`, `confirmedByUserId: z.string().nullable()`, `confirmedBy: z.object({...}).nullable()`, and the parallel deliver trio. Single `lastTransitionedAt/By` (which would overwrite on every transition) is rejected — it loses the trail the history page must render. Deferring to Phase 5 audit log is rejected — ORD-07 must work standalone.

- **D-85:** **Seed extends to one of each status.** `apps/api/prisma/seed.ts`'s `seedDraftOrder` becomes `seedDemoOrders` (or four sibling functions). Idempotency: each status seed runs a `findFirst` keyed on `(careUnitId, createdByUserId, status, deletedAt: null)` and skips if a row exists. Each demo order has 3 lines (the existing Utkast logic — 3 low-stock CUMs). The Skickad order is created with `status: 'skickad', submittedAt + submittedByUserId` stamped. Bekräftad adds `confirmedAt + confirmedByUserId` (use the seeded apotekare user). Levererad adds `deliveredAt + deliveredByUserId` AND applies the per-line stock increment to the affected CUMs as a post-step `UPDATE` so the Levererad order's effect on stock is observable in `/lakemedel`. (Alternative: skip the stock post-step on seed and document that "the Levererad seed represents historic state — the deterministic seed-stock numbers already include those additions.") Claude's discretion on the post-step. 30-second demo path: `apotekare@example.test` logs in, opens `/bestallningar?status=skickad`, clicks into the Skickad row, clicks `Bekräfta`, sees the page flip to Bekräftad, clicks `Markera som levererad`, confirms in AlertDialog, sees the page flip to Levererad, navigates to `/lakemedel`, sees stock numbers for those three meds risen by the line quantities.

### Concurrency Test Strategy

- **D-86:** **Two real `prisma.$transaction` calls in parallel.** The test imports the `deliverOrder` service function directly (bypassing `app.inject` for this `it` block). Two `Promise.all([deliverOrder(...), deliverOrder(...)])` calls hit the same Bekräftad order against the real test Postgres. The `FOR UPDATE` on the Order row + CUM rows forces serialization at the DB layer. `app.inject` Promise.all is rejected — Fastify's inject runs on a single event-loop and serializes at the JS layer, so it wouldn't actually exercise concurrent DB writes (a sequential implementation would false-pass). Log-assertion-only is rejected — it proves the SQL was emitted, not that the lock actually fired.

- **D-87:** **One test file `orders.deliver.integration.test.ts` with two `it` blocks.** Mirrors Phase 3 D-73's `orders.integration.test.ts` layout. First `it`: full pipeline `create → submit → confirm → deliver` via `app.inject`, asserting final status `levererad` + per-CUM stock delta + every actor stamp populated correctly. Second `it`: same-order concurrency (see D-89). The two helpers from Phase 3 (`buildTestApp`, `loginAs`, `captureSessionCookie`, `findTestCareUnitMedication`, `createEmptyOrder`) are imported from `helpers/buildTestApp.js` unchanged. New helper `progressOrderToBekraftad(cookie, orderId, lineCount)` composes existing helpers. Keeps related deliver assertions together; easy to grep for "OPS-03"; matches the existing test-file convention.

- **D-88:** **Two-phase barrier with `pg_locks` proof.** The concurrency `it` block uses:
  1. Tx-A starts a `prisma.$transaction(async (tx) => { … })` and inside the callback acquires its FOR UPDATE on the Order row, then `await`s a Promise gate exposed to the test scope.
  2. Tx-B (started ~50 ms later via `setTimeout`) attempts its own `prisma.$transaction` against the same Order; the `SELECT … FOR UPDATE` blocks waiting on tx-A.
  3. Test polls `pg_locks` (or `pg_stat_activity` filtered to `wait_event_type = 'Lock'`) and asserts tx-B is in `Lock` wait state.
  4. Test resolves tx-A's gate; tx-A completes its UPDATE + status flip, commits.
  5. Tx-B unblocks, observes `status = 'levererad'`, throws `OrderTransitionError`. Test catches and asserts code `order_transition_invalid`.
  6. Final assertions: tx-A succeeded, tx-B failed with the expected code, stock incremented exactly once, `pg_locks` history shows tx-B was blocked. Total test duration target: <500 ms. Naive `Promise.all` without synchronization is rejected as flaky; skipping the lock proof is rejected as a weaker §6 story.

- **D-89:** **Race shape = same order, two concurrent deliver calls.** Two apotekare tabs click `Markera som levererad` on the same Bekräftad order — exactly one wins, stock increments once, the other receives `order_transition_invalid`. This directly answers brief §6 ("two simultaneous nurses" / "two simultaneous apotekare"). The deadlock-prevention story (sorted CUM-id lock ordering, D-79) covers the cross-order same-CUM case implicitly; an explicit test of that case is deferred to Phase 7 README §6 polish if time allows.

### Claude's Discretion

- Exact migration name (recommend `0006_order_confirm_deliver` for sortable ordering after Phase 3's 0004/0005).
- Whether to seed the Levererad order's stock-delta as a post-step UPDATE on the affected CUMs OR adjust the deterministic `nplId → stock` PRNG to pre-bake those values. The post-step approach is more transparent; either is acceptable.
- Toast wording variants beyond the locked copy in Specifics — recommend `sonner` `toast.success`, `toast.error` with `description` for the detail line.
- shadcn `<Tabs>` styling specifics (icon vs no-icon; pill vs underlined). Recommend underlined tabs to match the existing list/filter aesthetic from Phase 2.
- Whether to ship a Skickade-tab badge count (`Skickade (3)`) to signal apotekare attention. Reasonable polish; not required.
- Order of preHandlers on confirm/deliver routes (`[requireSession, requirePermission('order:confirm')]` — Phase 1 D-15 pattern).
- Whether to add a `/me`-response-widening test that asserts `order:confirm` and `order:deliver` appear in the apotekare's `permissions` array (recommended; ~5 lines).
- Whether to add an inline "snabbåtgärd" button on the Skickade tab's row (mobile card variant) so apotekare can Bekräfta without opening the detail page. Reasonable polish; recommend keeping the detail-page path as the only affordance in v1 (one path, easier to test).
- Whether the `Alla` tab queries all four statuses or all-except-utkast (to keep historical separation from drafts). Recommend all four — "Alla" means literally all.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing & scope
- `.planning/PROJECT.md` — Locked stack + Key Decisions table (TS+React+Vite+TanStack Query+Tailwind+shadcn, Node+TS+Fastify, Postgres+Prisma, Vitest, Docker Compose; **"Stock decrement uses Postgres transaction + SELECT … FOR UPDATE on medication row"** Key Decisions row is binding — this phase implements that decision).
- `.planning/REQUIREMENTS.md` §"Order Flow" + §"Stock Logic" + §"Ops / Deliverables" — REQ-IDs ORD-04, ORD-05, ORD-06, ORD-07, STK-01, STK-02, OPS-03 with full acceptance language. **The reviewable acceptance criteria for this phase.**
- `.planning/ROADMAP.md` §"Phase 4: Confirm, Deliver & Stock" — Goal (user-story form), the 5 success criteria, mode (mvp), Requirements list.

### Phase 1 decisions inherited (carry forward, do not re-decide)
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-01..D-19 — **all locked**. Especially:
  - **D-08:** Zod schemas in `packages/shared/src/contracts/*.ts` are the FE↔BE contract. `order.ts` widens with confirm/deliver shapes.
  - **D-15:** `PERMISSIONS: Record<ActionKey, Role[]>` map. Phase 4 appends `'order:confirm'` and `'order:deliver'`, both restricted to `['apotekare', 'admin']`.
  - **D-16:** Service-layer Prisma access; `careUnitId` is the FIRST argument on every service function. Phase 4's `confirmOrder` and `deliverOrder` follow this signature.
  - **D-17:** `useAuth()` + `<Can action="…">` + `useCan(action)` on the FE. All apotekare buttons gated by `<Can>`.
  - **D-19:** Canonical error envelope `{ error: { code, message, details? } }`. Phase 4 introduces code `order_transition_invalid` (409) and extends `validation_failed` (422) reason union with `'medication_removed'`. Reuses: `unauthenticated`, `forbidden`, `not_found`.
- `.planning/phases/01-foundation-auth/01-UI-SPEC.md` — Design system (shadcn `new-york` + slate), spacing scale, touch targets (≥44 px), bottom-tab-bar dimensions. Mode C/D sticky-footer must clear the 56 px tab bar + safe-area-inset.

### Phase 2 decisions inherited (carry forward, do not re-decide)
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-20..D-45 — **all locked**. Especially:
  - **D-27 / D-28:** `Medication` (global NPL) + `CareUnitMedication` (per-vårdenhet stock + threshold). Phase 4 mutates `CareUnitMedication.currentStock` inside the deliver tx.
  - **D-30:** Soft-deleted CUMs transparently restore on re-add — gives the apotekare a one-click fix path when D-81's 422 fires.
  - **D-32:** NPL-sourced meds have locked name/atcCode/form/strength. This is what makes D-80's "skip snapshot" decision defensible on the demo path.
  - **D-33:** Always-soft-delete pattern. Live-join in D-80 is safe because soft-delete never breaks the FK.
  - **D-42:** Mixed optimistic/pessimistic split — Phase 4's transitions are **pessimistic** (wait for server response before re-rendering; status flip is too important to optimistically lie about). Toast on rollback.

### Phase 3 decisions inherited (carry forward, do not re-decide)
- `.planning/phases/03-draft-orders/03-CONTEXT.md` D-46..D-73 — **all locked**. Especially:
  - **D-46:** `OrderStatus` enum already declares all four values; Phase 4 needs zero enum schema work.
  - **D-47:** OrderLine has no snapshot columns; D-80 confirms this stays the v1 contract.
  - **D-48 / D-49:** Single Order table, status column distinguishes; `submittedAt/By` column-pair establishes the precedent D-84 mirrors (`confirmedAt/By`, `deliveredAt/By`).
  - **D-54:** Atomic UPDATE-with-precondition pattern. Phase 4's confirm/deliver service functions follow this verbatim.
  - **D-55:** `order_locked` error envelope. D-77 keeps this narrow to line mutations; D-74 introduces `order_transition_invalid` as the parallel transition-failure code.
  - **D-57:** Mutating endpoints return the full updated Order. Phase 4's confirm/deliver follow this — FE cache hydrates atomically via `setQueryData(['order', id], response)`.
  - **D-62 / D-63:** Order/OrderLine schema. Phase 4 ADDS columns to Order (D-84); OrderLine unchanged.
  - **D-66:** `assertOrderEditable(careUnitId, orderId)` helper — Phase 4 mirrors with `assertOrderInStatus(careUnitId, orderId, expectedStatus)` for confirm/deliver preconditions (or just inlines the pattern per service function — Claude's discretion).
  - **D-69:** TanStack Query keys — `['order', id]` for detail, `['orders', { status }]` for lists. Phase 4 invalidates `['medications', …]` on deliver (Phase 6 NTF-01 dependency).
  - **D-71:** Mobile sticky-footer pattern — Phase 4 extends with apotekare action buttons.
  - **D-73:** 404-not-403 on cross-careUnit access — Phase 4 follows this on confirm/deliver/get/list.

### Existing code patterns (Phase 1+2+3 lay the foundation Phase 4 builds on)
- `apps/api/prisma/schema.prisma` — Existing models include `Order` with `submittedAt/By` columns + `OrderStatus` enum already declaring all four values. Phase 4 adds 4 columns + 2 `@relation(name:...)` directives + 2 inverse fields on User.
- `apps/api/src/services/order.service.ts` — Existing functions: `createDraftOrder`, `listOrdersForUnit`, `getOrderForUnit`, line ops, `submitOrder`, `softDeleteOrder`, `searchPickerOptions`, `assertOrderEditable`. Phase 4 ADDS `confirmOrder`, `deliverOrder` (and extends `listOrdersForUnit` to accept a comma-list of statuses). `submitOrder` already demonstrates the `$queryRaw … FOR UPDATE` + atomic `updateMany` pattern verbatim — Phase 4 follows this template literally for confirm and the Order-row lock half of deliver.
- `apps/api/src/plugins/errorHandler.ts` — Existing classes: `InvalidCredentialsError`, `UnauthenticatedError`, `NotFoundError`, `ConflictDuplicateMedicationError`, `ForbiddenScopeError`, `OrderLockedError`, `ValidationFailedError`. Phase 4 ADDS `OrderTransitionError` (registered before the Zod 400 branch, per D-56 precedent). The `ValidationFailedError.details.reason` union widens to include `'medication_removed'`.
- `apps/api/src/routes/orders/{create,delete,get,index,lines,list,pickerOptions,submit}.ts` — File-per-endpoint pattern (D-65). Phase 4 ADDS `confirm.ts` and `deliver.ts`. `index.ts` registers them after the existing routes.
- `apps/api/src/auth/permissions.ts` — `PERMISSIONS` map. Phase 4 appends two entries; `Record<ActionKey, Role[]>` enforces drift-prevention (D-15) — adding the keys in `packages/shared` without updating this map is a compile error.
- `apps/api/src/auth/requireSession.ts` and `requirePermission.ts` — preHandlers reused as-is on `confirm.ts` and `deliver.ts`.
- `apps/api/prisma/seed.ts` `seedDraftOrder` (lines 340–423) — Phase 4 extends to seed one of each status. Idempotency check pattern (`findFirst` + skip) is the template.
- `apps/api/test/orders.integration.test.ts` — D-73's 5-scenario suite + `helpers/buildTestApp.ts` (`buildTestApp`, `ensureAllRolesSeeded`, `resetSessions`, `prisma`, `TEST_SJUKSKOTERSKA`). Phase 4's new test file imports these unchanged.
- `packages/shared/src/contracts/permissions.ts` — `ACTION_KEYS` literal tuple. Phase 4 appends `'order:confirm'`, `'order:deliver'`; `actionKey` Zod enum auto-updates.
- `packages/shared/src/contracts/order.ts` — Existing schemas. Phase 4 widens `orderResponse` with `confirmedAt`, `confirmedByUserId`, `confirmedBy`, `deliveredAt`, `deliveredByUserId`, `deliveredBy` (all nullable). Widens `orderListItem` with `submittedBy`, `confirmedBy`, `deliveredBy` (all nullable). Widens `orderListQuery.status` to accept a single status OR a comma-list (parsing helper in the route). Adds new schemas: `confirmOrderRequest = z.object({}).strict()`, `deliverOrderRequest = z.object({}).strict()`.
- `packages/shared/src/constants/orderStatus.ts` — `ORDER_STATUSES` + `ORDER_STATUS_LABELS` already declare all four values. Phase 4 imports `ORDER_STATUS_LABELS` for the new transition-error toast (`Beställningen kan inte gå från ${ORDER_STATUS_LABELS[from]} till ${ORDER_STATUS_LABELS[to]}.`).
- `apps/web/src/components/OrderStatusPill.tsx` — Already renders all four statuses with the locked color map. No changes needed; Phase 4 just uses it more widely.
- `apps/web/src/routes/bestallningar/BestallningarPage.tsx` — Currently lists only utkast via `useDraftsQuery()`. Phase 4 introduces status-tab state (URL-backed) and a wider query that branches on the tab.
- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — Currently handles Mode A (utkast) + Mode B (skickad) — has `isUtkast` branches. Phase 4 widens to a switch over `order.status` and adds Mode C/D/E paths with action buttons.
- `apps/web/src/routes/bestallningar/{DraftsTable.tsx, DraftsCardList.tsx}` — Mobile-first table/card pair. Phase 4 either parameterizes these with column config OR forks into `OrdersTable.tsx` / `OrdersCardList.tsx` (Claude's discretion based on table column drift).
- `apps/web/src/features/orders/{useOrderQueries.ts, useOrderMutations.ts}` — TanStack Query hook file. Phase 4 adds `useConfirmOrder`, `useDeliverOrder` mutations and widens `useDraftsQuery` (or adds a parallel `useOrdersQuery(status)`).
- `apps/web/src/components/ui/{tabs, alert-dialog}.tsx` — shadcn primitives. `Tabs` powers D-82's status filter; `AlertDialog` powers D-83's deliver-confirm. Verify both are installed in `components/ui/`; if not, add via `pnpm dlx shadcn add tabs alert-dialog`.

### Brief (interview source-of-truth — local only, not in repo CI)
- `local/intervju-testcase-1-1-.pdf` §2.1 (mandatory: order status machine + stock decrement on delivery), §3 (deliverables — "ett plus" for atomic stock + delivery flow), §5 (evaluation weights — code quality + data model + system design ★★★★★/★★★★/★★★★), §6 (live-interview questions — "two simultaneous nurses ordering" is answered by Phase 4's same-order concurrency test D-88/D-89; "50 vårdenheter" is answered architecturally; "retrofit auth" is answered by Phase 4 plugging into Phase 1's RBAC with two new permission keys and zero infrastructure churn). **Local-only PDF; PROJECT.md + REQUIREMENTS.md are the committed mirror.**

### Tooling / harness
- `CLAUDE.md` — Tooling rules, GSD workflow expectations, stack constraints.
- `.planning/STATE.md` — Current phase progress.
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled).

No external ADRs or SPEC.md exist for Phase 4 — implementation decisions captured above (D-74..D-89) are the canonical record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1+2+3 shipped a working monorepo with auth, RBAC, medication catalog, draft orders, and the submit-lock pattern. Phase 4 extends, doesn't rebuild:

- **`order.service.ts`** — extend with `confirmOrder` and `deliverOrder`; widen `listOrdersForUnit` to accept multiple statuses. `submitOrder`'s `$queryRaw … FOR UPDATE` + atomic `updateMany` pattern is the verbatim template for `confirmOrder` (and the Order-row lock half of `deliverOrder`).
- **`OrderLockedError`** pattern in `errorHandler.ts` — clone for `OrderTransitionError` (different code, same shape).
- **`ValidationFailedError`** — extend `reason` union with `'medication_removed'`; no new class.
- **`OrderStatusPill`** — already renders Bekräftad (amber) + Levererad (emerald). Zero changes needed.
- **`<Can>` / `useCan`** — wire the two new action keys through. UI gating works the moment `PERMISSIONS` map is updated.
- **`AlertDialog`** — Phase 2 / Phase 3 precedent (Phase 2 D-37 delete confirm, Phase 3 D-67 discard draft). Phase 4 D-83 deliver confirm follows the same component shape.
- **`Tabs`** — first use in the project; install via shadcn if not already present.
- **TanStack Query keys** — extend `['orders', {status}]` to support comma-list status; add `useConfirmOrder`, `useDeliverOrder` mutations following `useSubmitOrder`'s template.
- **`ComposeOrderPage`** Mode A/B branches — extend to Mode C/D/E; same component, status-driven render.
- **`DraftsTable`/`DraftsCardList`** — parameterize for the wider status views OR fork (Claude's discretion).
- **`helpers/buildTestApp.ts`** — Phase 3 test harness reused verbatim; new helper `progressOrderToBekraftad` composes existing helpers.

### Established Patterns (Phase 1+2+3 → Phase 4 inheritance)

- **Service-layer Prisma access, `careUnitId` first arg** (D-16). `confirmOrder(careUnitId, orderId, actorUserId)` + `deliverOrder(careUnitId, orderId, actorUserId)` follow this exactly.
- **Atomic UPDATE-with-precondition** (D-54). Phase 4 transitions use the same pattern: `updateMany` with `WHERE id = ? AND careUnitId = ? AND status = '<expected>' AND deletedAt IS NULL`; `count === 0` → reload + throw `NotFoundError | OrderTransitionError`.
- **`$queryRaw … FOR UPDATE` Order-row lock** (CR-02 / `submitOrder` step 0). `deliverOrder` reuses this verbatim; `confirmOrder` may optionally use it for symmetry (no concurrent submitter to race against, but the pattern matches).
- **404-not-403 on cross-careUnit** (D-73). Confirm/deliver throw `NotFoundError` not `ForbiddenScopeError` for cross-tenant.
- **Zod schemas in shared, inferred TS types** (D-08). `confirmOrderRequest`, `deliverOrderRequest` mirror `createOrderRequest`'s `.strict()` empty-body shape.
- **Canonical error envelope** (D-19). Two-line addition: `order_transition_invalid` (409) and `medication_removed` reason variant of 422.
- **Mixed optimistic/pessimistic** (D-42 / D-52). Phase 4 transitions are pessimistic — the FE waits for the server response before re-rendering. Stock changes are too important to lie about.
- **Mobile-first responsive switching** (D-10, D-71). Status tabs collapse to scrollable strip on `<sm`; apotekare action buttons land in the sticky footer on mobile.
- **Permission map drift-prevention** (D-15). `Record<ActionKey, Role[]>` forces an entry in `apps/api/src/auth/permissions.ts` the moment the keys land in `packages/shared`.
- **Full-Order response on mutation** (D-57). Confirm/deliver return the updated Order; FE `setQueryData(['order', id], response)` hydrates atomically.

### Integration Points

- **`/me` response widens** — `permissions: ActionKey[]` includes `'order:confirm'` and `'order:deliver'` for apotekare + admin. Existing `useAuth().can(action)` works without changes.
- **Bottom tab bar / sidebar nav** — `<NavItem to="/bestallningar" icon={ClipboardList} label="Beställningar" />` already wired; no nav changes.
- **`prisma migrate dev`** — Phase 4 ships migration `0006_order_confirm_deliver` (Claude's discretion on exact name) adding 4 columns to `Order`. Migration is additive; existing data remains valid (all four new columns default to NULL).
- **Seed script** — `seedDraftOrder` extends to `seedDemoOrders` covering all four statuses. Idempotent via `findFirst` per status. Levererad seed includes a post-step stock UPDATE on the affected CUMs (Claude's discretion on shape).
- **Docker Compose** — no service changes; api still runs migrations + seed on start. First `docker compose up` after Phase 4 lands shows all four order statuses live.
- **Phase 5 hook:** Service-layer pattern means Phase 5's audit middleware retrofits confirm/deliver mutations without touching Phase 4 code.
- **Phase 6 hook:** `useDeliverOrder.onSuccess` invalidates `['medications', …]` — the future NTF-01 dashboard banner refetches on every delivery automatically (NTF-02 satisfied by Phase 4's cache invalidation).

</code_context>

<specifics>
## Specific Ideas

- **Swedish UI vocabulary (continued from Phase 1 D-13 / Phase 2 / Phase 3 D-70, locked here):**
  - Status tabs (left-to-right): `Utkast` / `Skickade` / `Bekräftade` / `Levererade` / `Alla`.
  - Page heading per status (mode-aware): `Nytt utkast` (utkast, kept), `Beställning · Skickad` (skickad, kept), `Beställning · Bekräftad` (new), `Beställning · Levererad` (new).
  - Apotekare action buttons: `Bekräfta beställning` (Mode C / Skickad), `Markera som levererad` (Mode D / Bekräftad).
  - Deliver-confirm `<AlertDialog>`:
    - Title: `Markera som levererad?`
    - Body: `Stocken uppdateras direkt. Detta kan inte ångras.`
    - Confirm button: `Markera levererad`
    - Cancel button: `Avbryt`
  - Confirmation banners (post-transition):
    - Mode D: `Beställningen är bekräftad — väntar på leverans.`
    - Mode E: `Beställningen är levererad — lagret uppdaterat.`
  - Actor + timestamp footer line (Mode D/E): `Skapad av {createdBy.name} · Skickad av {submittedBy.name} {time} · Bekräftad av {confirmedBy.name} {time} · Levererad av {deliveredBy.name} {time}` (only the populated steps render).
  - Toasts:
    - Confirm success: `Bekräftad`
    - Deliver success: `Levererad — lagret uppdaterat`
    - 409 `order_transition_invalid` race: `Beställningen har redan {ORDER_STATUS_LABELS[details.from]}.`
    - 422 `medication_removed`: `{med.name} har tagits bort — återställ läkemedlet i registret innan leverans.`
  - Empty states (per status tab):
    - Skickade empty: `Inga skickade beställningar.`
    - Bekräftade empty: `Inga bekräftade beställningar.`
    - Levererade empty: `Inga levererade beställningar ännu.`
    - Alla empty: same as Utkast empty (existing).
- **Demo path on first `docker compose up` (Phase 4)** — `apotekare@example.test` logs in, lands on `/bestallningar?status=skickad`, sees the seeded Skickad order. Clicks the row → Mode C. Clicks `Bekräfta beställning` → page flips to Mode D + banner. Clicks `Markera som levererad` → AlertDialog → confirms → page flips to Mode E + banner with full actor trail. Navigates to `/lakemedel` → sees the three relevant rows with their stock numbers risen by the line quantities (existing Phase 2 low-stock badges may now be cleared if the new totals crossed threshold). 60-second demo covers ORD-04, ORD-05, ORD-06 (via the race in the test), ORD-07, STK-01, STK-02 (proved by the test), and exercises the full §2.1 status machine.
- **§6 prep notes (Phase 4 closes these answers):**
  - **"Two nurses ordering simultaneously"** → Phase 4 directly answers: the deliver tx locks the Order row with `$queryRaw … FOR UPDATE`, then locks affected `CareUnitMedication` rows with `SELECT … FROM "CareUnitMedication" WHERE id = ANY($1) ORDER BY id FOR UPDATE` (sorted-id ordering eliminates deadlocks across orders). Two concurrent delivers on the same order: exactly one commits, the other receives `order_transition_invalid`. The deliberate concurrency test (D-88) proves this against real Postgres with `pg_locks` instrumentation. README quotes the test.
  - **"Scale to 50 vårdenheter"** → Phase 4 inherits Phase 1+2+3's `careUnitId`-scoped data model verbatim. No per-vårdenhet schema work; new units inherit confirm/deliver on day 1. `@@index([careUnitId, status])` (D-62) keeps the history-tab queries fast.
  - **"Retrofitting auth"** → Phase 4 plugs two new action keys (`order:confirm`, `order:deliver`) into Phase 1's `PERMISSIONS` map with zero infrastructure churn. README points to this as the exemplar: "we did RBAC from day 1, and every later phase only adds keys — no middleware retrofits, no auth scaffolding rewrites."
  - **"What I'm least proud of"** → README candidate: live-join (D-80) means historic order rendering drifts if a user-created medication is renamed after a Skickad order references it. NPL meds are immune (D-32 locked fields) so the demo path is unaffected, but it's a v2 gap worth naming.
- **`docker compose up` is still the golden command.** Phase 4 must not break it; migration is additive, seed extension is <100 ms additional cost.

</specifics>

<deferred>
## Deferred Ideas

- **Bekräftad → Skickad reversal** — apotekare can't undo a confirmation in v1. v2 idea (D-76 rejected for v1).
- **Bulk apotekare actions** — multi-select Skickade orders and `Bekräfta valda`. Deadlock risk on Order locks; not asked for; v2 candidate.
- **Dedicated apotekare queue page (`/apoteket`)** — separate workspace for non-Utkast orders. `/bestallningar` Skickade tab covers the v1 use case; v2 candidate if apotekare workload grows.
- **OrderLine snapshot columns (`nameSnapshot`, `formSnapshot`, etc.)** — D-80 stays with live-join indefinitely; v2 improvement at the deliver-transition point.
- **Different-orders / same-CUM concurrency test** — two vårdenheter's deliveries on overlapping meds. The sorted-id lock ordering (D-79) handles it implicitly; an explicit test of that case is a Phase 7 README §6 polish candidate if time allows.
- **Stock cap / integer overflow guard** — `currentStock` is `Int` (Postgres `INTEGER`, signed 32-bit). 2 billion units / med is fine for v1; an explicit upper bound is a v2 nicety.
- **Re-deliver / void-delivery flow** — Levererad is terminal by design (D-76). Mistakes are corrected by manual stock edits via Phase 2's Sheet + a follow-up audit-log row (Phase 5).
- **Email / push notification to nurse on delivery** — out-of-scope per PROJECT.md; v2 idea NTF-03.
- **Inline "snabbåtgärd" Bekräfta button on the Skickade tab row** — bulk-ish without bulk. Recommend keeping detail-page-only in v1 for tightness; v2 candidate.
- **Apotekare's order-detail link from `/lakemedel` low-stock badge** — "see open orders for this med." Cross-cutting feature; v2 candidate.
- **Skickade-tab badge count (`Skickade (3)`)** to signal apotekare attention — reasonable Phase 7 polish if time allows.
- **Audit-event writes for confirm/deliver** — Phase 5 retrofits middleware that records every Phase 4 mutation without touching Phase 4 code.
- **Dashboard low-stock banner refresh post-deliver (NTF-02)** — Phase 4 invalidates `['medications', …]` query keys on deliver so Phase 6's banner just works; the banner itself is Phase 6.

</deferred>

---

*Phase: 4-Confirm, Deliver & Stock*
*Context gathered: 2026-05-22*
