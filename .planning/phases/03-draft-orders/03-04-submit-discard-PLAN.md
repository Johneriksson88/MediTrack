---
phase: 03-draft-orders
plan: 04
type: execute
wave: 4
depends_on: [03-03]
files_modified:
  - apps/api/src/services/order.service.ts
  - apps/api/src/routes/orders/index.ts
  - apps/api/src/routes/orders/submit.ts
  - apps/api/src/routes/orders/delete.ts
  - apps/api/test/orders.integration.test.ts
  - apps/web/src/components/OrderStatusPill.tsx
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
  - apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx
  - apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx
  - apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx
  - apps/web/src/routes/bestallningar/OrderLineTable.tsx
  - apps/web/src/routes/bestallningar/OrderLineCard.tsx
autonomous: false
requirements: [ORD-03]
must_haves:
  truths:
    - "POST /api/orders/:id/submit validates non-empty lines + positive quantities server-side and returns 422 validation_failed with details: { reason: 'empty_order' | 'invalid_quantity', lineId? } (D-56)"
    - "POST /api/orders/:id/submit runs an atomic UPDATE WHERE id = ? AND careUnitId = ? AND status = 'utkast' AND deletedAt IS NULL; on count===0 throws OrderLockedError (D-54)"
    - "POST /api/orders/:id/submit on success stamps submittedAt + submittedByUserId and returns the full updated Order (D-49, D-57)"
    - "DELETE /api/orders/:id soft-deletes via deletedAt=now() on Utkast; returns 409 order_locked on non-Utkast (D-67)"
    - "Submit + Discard buttons in ComposeStickyFooter are wired to useSubmitOrder + useDiscardOrder mutations; Discard opens DiscardDraftDialog AlertDialog before confirming (D-67)"
    - "<OrderStatusPill> component renders all four ORDER_STATUS_LABELS with the locked color map (UI-SPEC §Color)"
    - "Mode B (skickad) renders <SubmitConfirmationBanner> + read-only line list + hides sticky footer + hides trash + locks QuantityStepper (D-68, UI-SPEC §IA Mode B)"
    - "BE integration test covers the canonical end-to-end loop: create → add-line → patch-quantity → submit → 409 on edit-after-submit (D-73 test 1+2)"
    - "BE integration test covers 422 validation_failed on submit with empty lines (D-73 test 3)"
    - "BE integration test covers cross-careUnit access returning 404 not 403 for GET/PATCH/DELETE on a foreign careUnit's Order (D-73 test 4)"
    - "BE integration test covers list-scoping returning only the caller's careUnit's Utkast Orders (D-73 test 5)"
    - "FE component tests cover Submit success → Mode B switch, Submit-disabled predicate, Discard AlertDialog confirm → DELETE + navigate"
  artifacts:
    - path: "apps/api/src/services/order.service.ts"
      provides: "submitOrder + softDeleteOrder service functions"
      contains: "submitOrder"
    - path: "apps/api/src/routes/orders/submit.ts"
      provides: "POST /api/orders/:id/submit route"
      contains: "/api/orders/:id/submit"
    - path: "apps/api/src/routes/orders/delete.ts"
      provides: "DELETE /api/orders/:id route (soft-delete)"
      contains: "/api/orders/:id"
    - path: "apps/api/test/orders.integration.test.ts"
      provides: "canonical D-73 test suite (5 scenarios)"
      contains: "describe('Draft orders integration"
    - path: "apps/web/src/components/OrderStatusPill.tsx"
      provides: "Status chip primitive with all four ORDER_STATUS_LABELS"
      contains: "OrderStatusPill"
    - path: "apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx"
      provides: "Mode B banner: 'Beställningen är skickad till apotekare.'"
      contains: "Beställningen är skickad till apotekare."
    - path: "apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx"
      provides: "AlertDialog for Kasta with destructive confirm"
      contains: "Kasta detta utkast?"
  key_links:
    - from: "apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx"
      to: "POST /api/orders/:id/submit"
      via: "useSubmitOrder pessimistic mutation"
      pattern: "useSubmitOrder"
    - from: "apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx"
      to: "DELETE /api/orders/:id"
      via: "useDiscardOrder pessimistic mutation"
      pattern: "useDiscardOrder"
    - from: "apps/api/src/routes/orders/submit.ts"
      to: "apps/api/src/services/order.service.ts submitOrder"
      via: "preHandler chain → service call with careUnitId + orderId + actorUserId"
      pattern: "submitOrder\\(req\\.user!\\.careUnitId"
---

<objective>
Close the loop. ORD-03 (submit a draft, transitioning Utkast → Skickad with the BE rejecting subsequent edits with 409) ships here, along with the Discard affordance (D-67) and the canonical end-to-end test suite (D-73) that proves the full happy path + 409 + 422 + 404 + careUnit scoping contracts work together.

Purpose: This is the slice where Slice 3's "visible-but-inert" Submit + Discard buttons become real. The atomic-UPDATE-with-precondition pattern (D-54) is fully exercised on the submit transition — the most race-sensitive operation in Phase 3. The OrderStatusPill primitive lands here (Slice 3 used a placeholder span) and powers both Mode B (skickad) rendering this phase and Phase 4's bekraftad/levererad transitions without further work. The Submit Confirmation Banner + Mode B read-only line list complete the post-submit experience per UI-SPEC §IA Mode B.

Output: BE `POST /api/orders/:id/submit` + `DELETE /api/orders/:id` (soft-delete); FE `<OrderStatusPill>` + `<SubmitConfirmationBanner>` + `<DiscardDraftDialog>` + wired Submit/Discard handlers; the comprehensive D-73 BE integration test suite (5 scenarios); FE component tests for the new components.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-draft-orders/03-CONTEXT.md
@.planning/phases/03-draft-orders/03-PATTERNS.md
@.planning/phases/03-draft-orders/03-UI-SPEC.md
@.planning/phases/03-draft-orders/03-01-SUMMARY.md
@.planning/phases/03-draft-orders/03-02-SUMMARY.md
@.planning/phases/03-draft-orders/03-03-SUMMARY.md
@CLAUDE.md

<interfaces>
<!-- Key exports the executor needs. -->

From packages/shared/src/contracts/order.ts (Slice 1):
- `orderResponse` — full Order shape; submit response returns this
- `orderStatusEnum` — used by OrderStatusPill prop

From packages/shared/src/constants/orderStatus.ts (pre-Phase 3):
- `ORDER_STATUS_LABELS: Record<OrderStatus, string>` — `utkast → 'Utkast'`, `skickad → 'Skickad'`, `bekraftad → 'Bekräftad'`, `levererad → 'Levererad'`

From apps/api/src/plugins/errorHandler.ts (Slice 1):
- `class OrderLockedError` — thrown on submit-race or delete-on-non-Utkast
- `class ValidationFailedError` — thrown on empty/invalid submit
- `class NotFoundError` — cross-tenant 404 + missing order

From apps/api/src/services/order.service.ts (Slices 2+3):
- `getOrderForUnit`, `toOrderResponse` mapper — reuse for re-fetch + response shape
- NO `assertOrderEditable` helper exists. Slice 3 intentionally inlines the atomic precondition per D-54 to close the TOCTOU window. `softDeleteOrder` here uses the same inline pattern: `findUnique` for 404/409 disambiguation, then atomic `prisma.order.updateMany WHERE status='utkast' AND deletedAt IS NULL` as the precondition+write.

From apps/web/src/auth/Can.tsx + useCan.ts:
- `<Can action="order:submit">`, `<Can action="order:delete">`

From apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx (Slice 3):
- Buttons exist but `onClick={() => {}}` — wire them here

From apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx (analog for DiscardDraftDialog):
- AlertDialog shape: AlertDialogTitle / Description / Cancel (default-focused) / Action (destructive)
</interfaces>
</context>

## Phase Goal

**As a** nurse (sjuksköterska), **I want to** compose, save, edit, and submit a multi-line medication order, **so that** the order reaches the pharmacist and the medications can be delivered.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — submitOrder + softDeleteOrder services, routes/{submit,delete}.ts, full D-73 integration test suite</name>
  <files>apps/api/src/services/order.service.ts, apps/api/src/routes/orders/index.ts, apps/api/src/routes/orders/submit.ts, apps/api/src/routes/orders/delete.ts, apps/api/test/orders.integration.test.ts</files>
  <read_first>
    - apps/api/src/services/order.service.ts (Slices 2+3) — extend; Slice 3 deliberately did NOT export `assertOrderEditable` (the atomic-touch precondition is inlined inside each `$transaction` per D-54). `softDeleteOrder` and `submitOrder` follow the same inline pattern: `findUnique` for existence + 404/409 disambiguation, then atomic `prisma.order.updateMany WHERE status='utkast' AND deletedAt IS NULL` as the precondition+write. The `$transaction` wrapping pattern Slice 3 uses for line ops is the analog for `submitOrder`.
    - apps/api/src/services/medication.service.ts — analog: `createCareUnitMedication`'s `$transaction` pattern (lines 312-377); `softDeleteCareUnitMedication` (lines 493-513) for the delete-with-precondition shape
    - apps/api/src/routes/medications/update.ts — PATCH-with-params shape; close analog for the submit route (POST with params + atomic UPDATE)
    - apps/api/src/routes/medications/delete.ts — DELETE route shape, but Phase 3 returns 200 + full Order (NOT 204) per UI-SPEC §10 Discard behavior (the FE navigates after success — same posture as the medication delete)... actually checking: UI-SPEC §10 says "navigate('/bestallningar')" so a 204 OR a 200 with payload both work. Use 204 + null reply to mirror the medication-delete analog exactly (the FE has no use for the soft-deleted Order body — it's navigating away)
    - apps/api/src/plugins/errorHandler.ts (Slice 1) — OrderLockedError, ValidationFailedError, NotFoundError
    - apps/api/test/auth.flow.smoke.test.ts — full pipeline harness (buildTestApp, ensureAllRolesSeeded, app.inject, captureSessionCookie); analog for `orders.integration.test.ts`
    - apps/api/test/orders.integration.test.ts (Slices 2+3) — extend; the canonical 5-scenario D-73 suite gets ADDED here, not replaced
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`apps/api/src/services/order.service.ts` Atomic-UPDATE + submitOrder $transaction section, `routes/orders/submit.ts`, `routes/orders/delete.ts`, `orders.integration.test.ts` sections)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-49, D-54, D-55, D-56, D-57, D-67, D-73)
  </read_first>
  <behavior>
    - `order.service.ts` exports `submitOrder(careUnitId, orderId, actorUserId): Promise<OrderResponse>` — runs entirely inside `prisma.$transaction(async (tx) => {...})`:
        1. `tx.order.findUnique({ where: { id: orderId }, include: { lines: true } })` — assert existence + careUnitId match (else NotFoundError 'Beställningen hittades inte.')
        2. Validate: `if (order.lines.length === 0) throw new ValidationFailedError('Beställningen måste ha minst en rad.', { reason: 'empty_order' })`. Then `const badLine = order.lines.find(l => l.quantity <= 0); if (badLine) throw new ValidationFailedError(...{ reason: 'invalid_quantity', lineId: badLine.id })`
        3. Atomic transition: `const { count } = await tx.order.updateMany({ where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null }, data: { status: 'skickad', submittedAt: new Date(), submittedByUserId: actorUserId } });`. If `count === 0` throw `OrderLockedError({ status: order.status })` (D-54)
        4. Re-fetch the full Order with the same include shape as `getOrderForUnit` and return via `toOrderResponse`
    - `order.service.ts` exports `softDeleteOrder(careUnitId, orderId): Promise<void>` — mirrors `softDeleteCareUnitMedication`:
        1. `findUnique`, assert existence + careUnitId match (else NotFoundError)
        2. If `row.status !== 'utkast' || row.deletedAt !== null` throw `OrderLockedError({ status: row.status })`
        3. Atomic UPDATE: `prisma.order.updateMany({ where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null }, data: { deletedAt: new Date() } })` and assert count===1 (else `OrderLockedError`)
    - `routes/orders/submit.ts` — `r.post('/api/orders/:id/submit', { preHandler: [requireSession, requirePermission('order:submit')], schema: { params: z.object({ id: z.string().min(1) }), response: { 200: orderResponse } } }, async (req) => submitOrder(req.user!.careUnitId, req.params.id, req.user!.id))`
    - `routes/orders/delete.ts` — `r.delete('/api/orders/:id', { preHandler: [requireSession, requirePermission('order:delete')], schema: { params: z.object({ id: z.string().min(1) }), response: { 204: z.null() } } }, async (req, reply) => { await softDeleteOrder(req.user!.careUnitId, req.params.id); reply.status(204); return null; })`
    - `routes/orders/index.ts` registers both new routes per D-65: full order is `createOrderRoute → listOrdersRoute → getOrderRoute → linesRoute → submitOrderRoute → deleteOrderRoute → pickerOptionsRoute`
    - Integration test extension covers the canonical D-73 5-scenario suite. Each scenario gets its own `describe` block within the top-level `describe('Draft orders integration')`:
        1. **Happy path** — login as `sjukskoterska`, `POST /api/orders` → 201 utkast; `POST /api/orders/:id/lines` → 200 with 1 line; `PATCH /api/orders/:id/lines/:lineId` with `quantity: 5` → 200; `POST /api/orders/:id/submit` → 200 with `status: 'skickad'`, `submittedAt` non-null, `submittedByUserId === sjukskoterska.id`. Verify the response body is parseable by `orderResponse.parse(...)`
        2. **409 order_locked after submit** — happy path through submit, then every following call returns 409 with `body.error.code === 'order_locked'` and `body.error.details.status === 'skickad'`: `POST /lines`, `PATCH /lines/:lineId`, `DELETE /lines/:lineId`, `POST /submit` (idempotent submit also 409), `DELETE /` (soft-delete)
        3. **422 validation_failed on submit** — sub-test (a) create empty draft + submit → 422 with `body.error.details.reason === 'empty_order'`. Sub-test (b) create draft, poison via direct prisma write to set `quantity: 0`, submit → 422 with `body.error.details.reason === 'invalid_quantity'` and `details.lineId === <the bad line's id>`. (Why direct poison? Slice 1's `updateOrderLineRequest` uses `.positive()` so the public PATCH route can't set quantity ≤ 0 — the test seeds the invalid state through prisma to verify the BE belt-and-suspenders submit-time check)
        4. **Cross-careUnit 404** — needs a second CareUnit + second user. Extend `apps/api/test/helpers/buildTestApp.ts` or directly seed via prisma inside the test. Login as user from CareUnit A; against orderId from CareUnit B: `GET /api/orders/:id` → 404 not_found; `POST /api/orders/:id/lines` → 404; `PATCH /lines/:lineId` → 404; `DELETE /lines/:lineId` → 404; `POST /:id/submit` → 404; `DELETE /:id` → 404. Body MUST say `code: 'not_found'`, NEVER `code: 'forbidden'`
        5. **Draft list scoping** — seed mixed: CareUnit A 2× Utkast + 1× Skickad (via direct prisma write); CareUnit B 1× Utkast. Login as A's user, `GET /api/orders?status=utkast` → only A's 2 Utkast rows (Skickad excluded, B's Utkast excluded). All rows have populated `lineCount`, `totalQuantity`, `createdBy.name`
  </behavior>
  <action>
    Extend `apps/api/src/services/order.service.ts` with `submitOrder` and `softDeleteOrder` per `<behavior>`. The submit path runs validation BEFORE the atomic UPDATE (per D-56: "don't burn a TX on a doomed submit"). Validation throws `ValidationFailedError` with the appropriate `details.reason` and (for invalid_quantity) `details.lineId`. The atomic UPDATE precondition uses `updateMany` so Prisma returns `{ count }` and we can detect the race-lost case. On `count === 0`, the order EXISTS (we just read it in step 1 of the same tx) — but its status changed → throw `OrderLockedError({ status: order.status })`. The pre-read `order.status` is stale in race scenarios; for the lock toast to report the correct losing status, re-fetch inside the catch path OR use `order.status` as a best-effort hint (it's `details`, not the contract guarantee).

    Create `apps/api/src/routes/orders/submit.ts` and `apps/api/src/routes/orders/delete.ts` per `<behavior>`. Register both in `routes/orders/index.ts` in the D-65 order.

    TDD: extend `apps/api/test/orders.integration.test.ts` with the 5 canonical scenarios. For scenario 4 (cross-careUnit), either (a) extend `helpers/buildTestApp.ts` with an `ensureSecondCareUnitSeeded()` helper or (b) inline a `prisma.careUnit.create` + `prisma.user.create` directly in the test setup. Pick (a) if the helper file is already structured for additive seed helpers; otherwise (b) is fine and keeps the diff smaller.

    Run all scenarios — RED to start, GREEN after the service + routes land. Then ensure the existing Slice 2-3 integration tests still pass.

    Notes:
    - The Phase 4 hook for `confirmedAt/By` + `deliveredAt/By` is identical to `submittedAt/By` here — Phase 4 will mirror this service shape for `confirmOrder` and `deliverOrder`. Keep helpers reusable (e.g., the validation + atomic-UPDATE block could one day be extracted to a `transitionOrderStatus(careUnitId, orderId, from, to, stampedFields)` helper — but only do so if Phase 4 explicitly calls for it; Phase 3 ships the concrete `submitOrder` per CONTEXT)
    - submitOrder MUST also reject if `deletedAt !== null` (a discarded draft can't be submitted; race window is small but possible). The `where: { ..., deletedAt: null }` clause handles this in the atomic UPDATE
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/api typecheck && pnpm --filter @meditrack/api test --run apps/api/test/orders.integration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/services/order.service.ts` exports `submitOrder` and `softDeleteOrder` (Grep `^export async function (submitOrder|softDeleteOrder)`)
    - `submitOrder` wraps its work in `prisma.$transaction` (Grep `prisma\.\$transaction` near submitOrder, or inspect)
    - `submitOrder` writes via `updateMany` with `status: 'utkast'` in the where-clause AND `submittedAt` + `submittedByUserId` in the data clause (Grep both literals near the function body)
    - `submitOrder` throws `ValidationFailedError` for empty lines + invalid quantity (Grep both `reason: 'empty_order'` and `reason: 'invalid_quantity'`)
    - `submitOrder` throws `OrderLockedError({ status: ... })` on count===0 (Grep)
    - `apps/api/src/routes/orders/submit.ts` contains `requirePermission('order:submit')` (Grep)
    - `apps/api/src/routes/orders/delete.ts` contains `requirePermission('order:delete')` and `reply.status(204)` (Grep both)
    - `apps/api/src/routes/orders/index.ts` registers `submitOrderRoute` and `deleteOrderRoute` (Grep — total route registrations now 7)
    - All 5 D-73 scenarios pass: integration test exits 0; the file contains ≥5 `describe(` or ≥5 top-level `it(` blocks named per the scenarios (Grep one of `'happy path'`, `'order_locked'`, `'validation_failed'`, `'cross-careUnit'`, `'drafts list'`)
    - Scenario 2: response body for any post-submit line op parses to `{ error: { code: 'order_locked', details: { status: 'skickad' } } }` with status code 409
    - Scenario 3 sub-test (a): response body parses to `{ error: { code: 'validation_failed', details: { reason: 'empty_order' } } }` with status code 422
    - Scenario 4: response status for cross-careUnit access is 404, body's code is `'not_found'`, body's code is NEVER `'forbidden'` (assert both)
    - Scenario 5: list response from User A excludes both User B's Utkast rows and User A's Skickad rows
    - `submittedAt` is set to a non-null ISO string after submit + `submittedByUserId` equals the session user's id (asserted in scenario 1)
    - `pnpm --filter @meditrack/api typecheck` exits 0
    - All earlier api tests still pass: `pnpm --filter @meditrack/api test --run` exits 0
  </acceptance_criteria>
  <done>
    The full BE side of ORD-03 (and the soft-delete of ORD-01-style drafts) is implemented and the canonical D-73 integration suite proves the happy path, 409 contract, 422 contract, 404 contract, and list-scoping all work together — under one process, with one DB, in CI.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Frontend — OrderStatusPill primitive + SubmitConfirmationBanner + DiscardDraftDialog + useSubmitOrder/useDiscardOrder mutations</name>
  <files>apps/web/src/components/OrderStatusPill.tsx, apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx, apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx, apps/web/src/features/orders/useOrderMutations.ts</files>
  <read_first>
    - apps/web/src/components/RoleBadge.tsx — analog for `OrderStatusPill` (NOT for direct reuse — different value set, different semantics, but identical geometry: `rounded-full px-3 py-1 text-xs font-semibold`)
    - apps/web/src/components/LowStockBadge.tsx — analog for `SubmitConfirmationBanner` geometry (informational accent variant rather than destructive)
    - apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx — analog for `DiscardDraftDialog` AlertDialog shape (title, description, cancel default-focused, action destructive)
    - apps/web/src/features/orders/useOrderMutations.ts (Slices 2+3) — extend; adds `useSubmitOrder` (pessimistic + cache hydration + invalidate drafts list) and `useDiscardOrder` (pessimistic + invalidate drafts list + navigate). 409 carve-out from earlier mutations is the template
    - apps/web/src/features/medications/useMedicationMutations.ts — `useUpdateMedication` (lines 64-86) is the pessimistic-mutation template
    - packages/shared/src/constants/orderStatus.ts — `ORDER_STATUS_LABELS` for OrderStatusPill label text
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`OrderStatusPill.tsx`, `SubmitConfirmationBanner.tsx`, `DiscardDraftDialog.tsx`, `useOrderMutations.ts` sections)
    - .planning/phases/03-draft-orders/03-UI-SPEC.md §Color OrderStatusPill color map, §11 (OrderStatusPill component), §12 (SubmitConfirmationBanner), §10 (DiscardDraftDialog)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-55, D-57, D-67, D-68, D-69, D-70)
  </read_first>
  <behavior>
    - `OrderStatusPill` (`apps/web/src/components/OrderStatusPill.tsx`):
        - Props: `{ status: OrderStatus }` (import `OrderStatus` from `@meditrack/shared`)
        - Implementation: `<span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', STATUS_CLASS[status])}>{ORDER_STATUS_LABELS[status]}</span>`
        - STATUS_CLASS map (UI-SPEC §Color):
            - `utkast: 'bg-slate-100 text-slate-700'`
            - `skickad: 'bg-blue-100 text-blue-800'`
            - `bekraftad: 'bg-amber-100 text-amber-800'` (Phase 4 visual readiness)
            - `levererad: 'bg-emerald-100 text-emerald-800'` (Phase 4 visual readiness)
        - No icon. Text + color is the accessible label
    - `SubmitConfirmationBanner` (`apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx`):
        - Props: none (it's a presentational component)
        - Implementation: `<div role="status" className="mt-4 mx-4 sm:mx-0 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Beställningen är skickad till apotekare.</div>` (UI-SPEC §12, D-70)
        - `role="status"` triggers screen-reader announcement on mount (non-interrupting). Not dismissible
    - `DiscardDraftDialog` (`apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx`):
        - Props: `{ open, onOpenChange, onConfirm, isDeleting }`
        - AlertDialog shape: `<AlertDialogTitle>Kasta detta utkast?</AlertDialogTitle>` (D-70), `<AlertDialogDescription>Utkastet tas bort permanent.</AlertDialogDescription>` (D-70), `<AlertDialogCancel>Avbryt</AlertDialogCancel>` (default-focused), `<AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Kastar…</> : 'Kasta'}</AlertDialogAction>` (D-70)
        - `<AlertDialogCancel>` default-focused per shadcn default
        - Action button disabled while `isDeleting` (prevents double-confirm)
    - `useOrderMutations.ts` adds:
        - `useSubmitOrder` — PESSIMISTIC. Variable: `{ orderId }`. POSTs `/api/orders/:orderId/submit`. On success: `setQueryData(['order', orderId], response)` + `invalidateQueries(['orders', { status: 'utkast' }])` (D-57). No toast on success (UI-SPEC §Toast Feedback — banner + status flip is the feedback). On error: standard 409 carve-out (`order_locked` → invalidate + destructive toast); 422 `validation_failed` → toast 'Kunde inte spara — försök igen.' (rare — disabled predicate catches this); generic → 'Kunde inte spara — försök igen.'
        - `useDiscardOrder` — PESSIMISTIC. Variable: `{ orderId }`. DELETEs `/api/orders/:orderId`. On success: `invalidateQueries(['orders', { status: 'utkast' }])`. No toast on success (navigation is the feedback — the caller navigates). On error: 409 carve-out (`order_locked` → invalidate `['order', orderId]` + destructive toast — switches page to Mode B); generic → 'Kunde inte spara — försök igen.' (D-70)
  </behavior>
  <action>
    Create `apps/web/src/components/OrderStatusPill.tsx` per `<behavior>`. The STATUS_CLASS map declares all four statuses even though only `utkast` and `skickad` render in Phase 3 — Phase 4 will pick up `bekraftad` and `levererad` without modification. Use `cn` from `apps/web/src/lib/utils.ts` (already wired by shadcn) for className composition.

    Create `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` per `<behavior>`. Import `CheckCircle2` from `lucide-react`. Mounting the component triggers the screen-reader announcement via `role="status"` — no state machinery needed.

    Create `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx` per `<behavior>`. Mirror `DeleteMedicationDialog.tsx`'s AlertDialog structure exactly. The destructive style on the confirm button uses the inline className `bg-destructive text-destructive-foreground hover:bg-destructive/90` (shadcn's `AlertDialogAction` is a styled `<Button>` whose variant prop isn't directly destructive — apply the styling inline).

    Extend `apps/web/src/features/orders/useOrderMutations.ts` with `useSubmitOrder` and `useDiscardOrder` per `<behavior>`. Both follow the pessimistic pattern from Slice 2's `useCreateDraftOrder`. The 409 carve-out logic is identical to the line mutations: `if (err.envelope.error.code === 'order_locked') { toast.error('Beställningen kan inte ändras efter att den skickats.'); void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] }); return; }` BEFORE the generic toast.

    NB: per UI-SPEC §8 there is no AlertDialog confirmation before submit — the disabled-predicate + the verb spelled out is the safety net. Only Discard gets an AlertDialog.

    FE unit tests (vitest):
    1. `apps/web/src/components/__tests__/OrderStatusPill.test.tsx`: renders all four statuses with correct labels + className contains the expected `bg-*` token
    2. `apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx`: renders with `role="status"` and the literal body
    3. `apps/web/src/routes/bestallningar/__tests__/DiscardDraftDialog.test.tsx`: opens when `open={true}`; clicking Avbryt closes; clicking Kasta fires `onConfirm`; when `isDeleting={true}` action is disabled + shows `Kastar…` spinner
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web test --run "apps/web/src/components/__tests__/OrderStatusPill.test.tsx" "apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx" "apps/web/src/routes/bestallningar/__tests__/DiscardDraftDialog.test.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/components/OrderStatusPill.tsx` exports `OrderStatusPill` (Grep)
    - `OrderStatusPill.tsx` references all four labels via `ORDER_STATUS_LABELS` from shared (Grep `ORDER_STATUS_LABELS`)
    - `OrderStatusPill.tsx` declares STATUS_CLASS with all four statuses including `bekraftad` and `levererad` (Grep `bekraftad:` and `levererad:`)
    - `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` contains the literal `'Beställningen är skickad till apotekare.'` (Grep)
    - `SubmitConfirmationBanner.tsx` contains `role="status"` and `bg-primary/10` (Grep both)
    - `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx` contains literals `'Kasta detta utkast?'`, `'Utkastet tas bort permanent.'`, `'Avbryt'`, `'Kasta'` (Grep — each ≥1)
    - `apps/web/src/features/orders/useOrderMutations.ts` exports `useSubmitOrder` and `useDiscardOrder` (Grep)
    - `useOrderMutations.ts` 409 carve-out for `order_locked` appears at least 5 times (once per mutation: add/update/remove/submit/discard) — Grep returns ≥5
    - 3 FE component tests pass: vitest exit 0 for the three test file paths
    - `pnpm --filter @meditrack/web typecheck` exits 0
  </acceptance_criteria>
  <done>
    All four reusable primitives for the post-submit experience are in place. Task 3 wires them into the page + the sticky footer.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Frontend — Wire Submit + Discard handlers, replace OrderStatusPill placeholder, implement full Mode B (post-submit) UI</name>
  <files>apps/web/src/routes/bestallningar/ComposeOrderPage.tsx, apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx, apps/web/src/routes/bestallningar/OrderLineTable.tsx, apps/web/src/routes/bestallningar/OrderLineCard.tsx</files>
  <read_first>
    - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx (Slice 3) — has the Mode B placeholder + the OrderStatusPill placeholder span; replace both
    - apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx (Slice 3) — Submit + Discard buttons exist with `onClick={() => {}}`; wire them here
    - apps/web/src/routes/bestallningar/OrderLineTable.tsx (Slice 3) — already accepts an `isLocked` prop; verify it actually hides trash + locks the stepper when true
    - apps/web/src/routes/bestallningar/OrderLineCard.tsx (Slice 3) — same
    - apps/web/src/components/OrderStatusPill.tsx (Task 2) — replaces the placeholder span
    - apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx (Task 2) — renders in Mode B
    - apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx (Task 2) — opens via the Kasta button
    - apps/web/src/features/orders/useOrderMutations.ts (Task 2) — `useSubmitOrder`, `useDiscardOrder`
    - .planning/phases/03-draft-orders/03-UI-SPEC.md §IA Mode B layout, §8 Submit interaction, §8 Kasta interaction, §10 Discard onConfirm flow
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-67, D-68)
  </read_first>
  <behavior>
    - `ComposeOrderPage`:
        - Replace the placeholder OrderStatusPill span (Slice 3 TODO comment) with `<OrderStatusPill status={order.status} />` (import from `@/components/OrderStatusPill`)
        - Replace the Mode B placeholder body with: `<SubmitConfirmationBanner />`, then the read-only line list (`<OrderLineTable items={order.lines} orderId={order.id} className="hidden md:block" isLocked={true} />` + `<OrderLineCardList items={order.lines} orderId={order.id} className="block md:hidden" isLocked={true} />`). NO sticky footer in Mode B
        - State management: add `const [discardOpen, setDiscardOpen] = useState(false)` next to the existing `pickerOpen`. Pass `discardOpen` / `setDiscardOpen` down to `<DiscardDraftDialog>` (rendered as a sibling overlay)
        - Add `useSubmitOrder()` and `useDiscardOrder()` hooks; pass `submitMutation.mutate({ orderId: order.id })` and `discardMutation.mutate({ orderId: order.id })` callbacks
        - On discard success the page navigates to `/bestallningar` — use `useNavigate()` inside ComposeOrderPage, pass `onSuccess` callback to `useDiscardOrder().mutateAsync` OR let the hook do the navigate (hook is page-agnostic; pick the cleaner integration). RECOMMENDATION: page handles navigation. Discard mutation hook returns the response; page awaits `mutateAsync` and on resolve calls `navigate('/bestallningar')` + `setDiscardOpen(false)`
        - Mode B page title: `'Beställning · Skickad — MediTrack'`. The title effect already branches on status in Slice 3
        - Main content wrapper's mobile `pb-[calc(...)]` offset is REMOVED in Mode B (no sticky footer means no overlap concern) — branch on `order.status === 'utkast'` for the className
    - `ComposeStickyFooter`:
        - Submit button onClick (wired): `await submitMutation.mutateAsync({ orderId })` — on success the page re-renders into Mode B via cache hydration. On error the hook handles the toast; the button just re-enables
        - Discard button onClick (wired): `setDiscardOpen(true)` (opens the AlertDialog) — actual deletion happens in `<DiscardDraftDialog>`'s onConfirm
        - Submit button label: `Skicka beställning` idle, `Skickar…` while `submitMutation.isPending`. Loader2 spinner same shape as `MedicationSheet.tsx:413-421`
        - Discard button is NOT loading-state-aware; the AlertDialog owns the in-flight state via `isDeleting`
    - `DiscardDraftDialog` integration: parent `ComposeOrderPage` renders `<DiscardDraftDialog open={discardOpen} onOpenChange={setDiscardOpen} onConfirm={async () => { await discardMutation.mutateAsync({ orderId: order.id }); navigate('/bestallningar'); }} isDeleting={discardMutation.isPending} />`
    - `OrderLineTable` + `OrderLineCard`:
        - Verify `isLocked` prop correctly hides the trash button column (preserve column width to avoid layout shift — render an empty `<td>` of the same width instead of removing the column) and replaces `<QuantityStepper>` with the locked static span
        - In `OrderLineCard`, `isLocked` hides the trash button (drop from the top-row flex) and locks the stepper
  </behavior>
  <action>
    Edit `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`:
      - Replace the placeholder OrderStatusPill `<span>` with `<OrderStatusPill status={order.status} />`
      - Replace the Mode B placeholder ("Slice 4 fyller i Mode B visuellt.") with a real Mode B body: `<SubmitConfirmationBanner />` followed by the locked line list (table + card-list with `isLocked={true}`)
      - Add `discardOpen` state, the two new mutation hooks, and `<DiscardDraftDialog>` overlay component
      - Wire `onSubmit` and `onDiscard` callbacks that flow to `<ComposeStickyFooter>`; on discard mutation success call `navigate('/bestallningar')` + `setDiscardOpen(false)`
      - Branch the main wrapper's mobile bottom padding on status — `pb-[calc(56px+56px+env(safe-area-inset-bottom))]` in Mode A only

    Edit `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx`:
      - Accept new props `{ onSubmit, onDiscard, isSubmitting }` (Slice 3's signature was inert; widen it)
      - Wire the Submit button onClick to `onSubmit` and show the `Skickar…` spinner when `isSubmitting`
      - Wire the Discard button onClick to `onDiscard` (which sets the page-level `discardOpen` state in the parent)

    Verify `apps/web/src/routes/bestallningar/OrderLineTable.tsx` and `OrderLineCard.tsx` correctly honor `isLocked={true}`:
      - In `OrderLineTable`: when `isLocked`, the trash cell renders an empty `<td className="w-[60px]">` (preserve width) and the `Antal` cell renders `<span className="text-sm font-semibold">{line.quantity}</span>` instead of `<QuantityStepper>`
      - In `OrderLineCard`: when `isLocked`, drop the trash button from the top row; replace `<QuantityStepper>` with the locked span

    FE component tests extension (`apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx`):
    1. Mode B renders: when `useOrderQuery` returns `{ status: 'skickad', ... }`, the page shows `<SubmitConfirmationBanner>` ("Beställningen är skickad till apotekare."), `<OrderStatusPill status="skickad">` ("Skickad"), the locked line list (no trash, no stepper buttons), no sticky footer
    2. Submit click flow: with mocked `useSubmitOrder` resolving with a `skickad` order, clicking Submit triggers `mutateAsync({ orderId: order.id })` and the page re-renders into Mode B (via cache update)
    3. Submit-disabled persists: with `lines: []`, Submit button has `disabled` attribute and `Lägg till minst en rad för att skicka.` tooltip on hover
    4. Discard flow: clicking Kasta opens the AlertDialog; clicking Kasta in dialog fires `useDiscardOrder.mutateAsync` then `navigate('/bestallningar')` (mock useNavigate); clicking Avbryt closes without firing
    5. Discard 409: when `useDiscardOrder` rejects with `order_locked`, page is invalidated and re-renders into Mode B (the hook handles this; assert the page now renders Mode B chrome)
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build && pnpm --filter @meditrack/web test --run apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx</automated>
    <what-built>
      ComposeOrderPage Mode A→B transition complete. Submit and Discard buttons in the sticky footer are wired to real mutations. Submit success → page re-renders with OrderStatusPill="Skickad", SubmitConfirmationBanner visible, line list locked (no trash, no stepper), no sticky footer. Discard opens AlertDialog with Kasta confirmation; confirming soft-deletes + navigates back to /bestallningar. The 409 lock contract works on submit-race AND discard-race (synthetic test via direct prisma write). Phase 3 ships ORD-01/02/03 end-to-end.
    </what-built>
    <how-to-verify>
      1. `docker compose up` and log in as `sjukskoterska@example.test`
      2. Open `/bestallningar` → see seeded Utkast draft. Click into it → ComposeOrderPage Mode A with OrderStatusPill = "Utkast" (slate)
      3. Click "Skicka beställning" with empty lines (first remove the 3 seeded lines) → button is disabled, hover tooltip: "Lägg till minst en rad för att skicka."
      4. Add a line via the picker (any one). Submit button enables. Click → button shows spinner "Skickar…", then page re-renders. Heading changes to "Beställning · Skickad". OrderStatusPill is now blue "Skickad". Banner visible: "Beställningen är skickad till apotekare." Line list shows the lines as read-only (no trash icons, no stepper buttons — just static text). No sticky footer
      5. Refresh the page → still in Mode B (the change persisted)
      6. Back to /bestallningar → the just-submitted draft is GONE from the drafts list (status filter excludes Skickad)
      7. Click "Ny beställning" → new Utkast draft. Click "Kasta" → AlertDialog opens: "Kasta detta utkast?" / "Utkastet tas bort permanent." / Avbryt + Kasta. Click Avbryt → closes. Click Kasta again → confirm → spinner "Kastar…" briefly, then navigate to /bestallningar (the discarded draft is absent)
      8. (Synthetic 409 lock test) In a second terminal: `docker compose exec -T postgres psql -U postgres meditrack -c "UPDATE \"Order\" SET status = 'skickad' WHERE id = '<id>' AND status = 'utkast';"`. In the browser, open the Utkast draft in question and immediately click Submit OR Kasta → destructive toast "Beställningen kan inte ändras efter att den skickats." appears + page re-renders into Mode B (Skickad banner shown). NO double-submit succeeds — the lock contract holds
      9. Verify `git log --oneline` shows atomic commits across all four Slices (per CLAUDE.md "atomic commits matter as much as the code"). The git history should narrate: schema + contracts → drafts list → compose view → submit/discard. Each commit should be focused
      10. Mobile preview (Chrome devtools, iPhone 14 viewport): Submit + Discard reachable in sticky footer, sticky footer doesn't overlap bottom tab bar or iOS home indicator, AlertDialog renders correctly as overlay, OrderStatusPill in header is legible
    </how-to-verify>
    <resume-signal>Type "approved" or describe issues</resume-signal>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` imports `OrderStatusPill` and uses `<OrderStatusPill status={order.status} />` (Grep — no inline `bg-slate-100 text-slate-700` placeholder span remains)
    - `ComposeOrderPage.tsx` imports `SubmitConfirmationBanner` and renders it conditionally on `order.status === 'skickad'` (Grep)
    - `ComposeOrderPage.tsx` imports `DiscardDraftDialog` and passes `isDeleting={discardMutation.isPending}` (Grep)
    - `ComposeOrderPage.tsx` calls `useSubmitOrder()` and `useDiscardOrder()` (Grep both hook names)
    - `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx` Submit button onClick is no longer `() => {}` — refers to a prop like `onSubmit` or `submitMutation.mutate` (Grep — confirms wiring)
    - `ComposeStickyFooter.tsx` contains the literal `'Skickar…'` (loading state) (Grep)
    - `apps/web/src/routes/bestallningar/OrderLineTable.tsx` honors `isLocked` — branches to remove trash + lock stepper (inspect; pattern check: presence of `{isLocked ? ... : ...}` near the trash cell and stepper cell)
    - 5 new FE component tests for `ComposeOrderPage` pass (in addition to Slice 3's 7) — total ≥12 it blocks; `pnpm --filter @meditrack/web test --run apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` exits 0
    - `pnpm --filter @meditrack/web typecheck` exits 0
    - `pnpm --filter @meditrack/web build` exits 0
    - `pnpm -r test --run` exits 0 (all phase 1+2+3 tests still pass)
    - Human-check passes all 10 steps including the synthetic 409 lock test
  </acceptance_criteria>
  <done>
    Phase 3 success criteria 1-4 (ROADMAP.md) are met:
    1. Draft persists with status Utkast — Slice 2 + Slice 3 + Slice 4
    2. User can edit a draft (lines, quantities) — Slice 3
    3. Submit transitions to Skickad; subsequent edits 409 — Slice 4
    4. Compose form usable on mobile (sticky footer, 44px touch targets, totals visible) — Slice 3 + Slice 4

    ORD-01, ORD-02, ORD-03 are all demoable end-to-end.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → API | Submit + Delete endpoints accept only the `:id` param; no body cross |
| Cross-careUnit | Submit + Delete scope via `req.user.careUnitId`; cross-tenant returns 404 |
| Status precondition (TOCTOU) | Submit + Delete both use atomic `updateMany WHERE status = 'utkast'` to close the race window |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | Cross-careUnit `POST /api/orders/:id/submit` or `DELETE /api/orders/:id` (T1) | mitigate | Service-layer existence check returns `NotFoundError` (404) when `row.careUnitId !== careUnitId` per D-73 — verified by integration scenario 4 against both submit and delete endpoints. Body code is `'not_found'`, never `'forbidden'` |
| T-03-02 | Tampering | Mass-assignment via submit/delete (T2) | mitigate | Neither endpoint accepts a body. Schema declares only `params: z.object({ id: z.string().min(1) })`. Submit response payload is server-generated only (status/submittedAt/submittedByUserId all assigned by the service from session) |
| T-03-03 | Tampering / Race | TOCTOU on submit-after-submit or submit-during-delete (T3) | mitigate | `submitOrder` uses `prisma.order.updateMany WHERE id = ? AND careUnitId = ? AND status = 'utkast' AND deletedAt IS NULL`. If two tabs submit, only one's UPDATE succeeds (count===1); the other's count===0 throws `OrderLockedError`. Integration scenario 2 verifies this works for back-to-back submit attempts. Same pattern for soft-delete: simultaneous delete-vs-submit will resolve with exactly one winner |
| T-03-04 | Elevation of Privilege | Bypass of `order:submit` or `order:delete` (T4) | mitigate | Route preHandlers: submit → `requirePermission('order:submit')`, delete → `requirePermission('order:delete')`. FE wraps buttons in `<Can action="order:submit">` and `<Can action="order:delete">`. Permission map (Slice 1) grants all three roles per D-64 — defense in depth still applies; Phase 4 will tighten `order:confirm` / `order:deliver` |
| T-03-05 | Injection | n/a — no user-controlled string flows into a query in this slice | accept | Submit + Delete take only the path `:id` (Zod-validated non-empty string); the value is passed to Prisma's `where: { id }` which is fully parameterized |
| T-03-06 | Repudiation | Audit of who submitted what | accept | Phase 3 stamps `submittedAt` + `submittedByUserId` on the Order — Phase 5's audit middleware will read these and write to `audit_events` without touching Phase 3 code. Phase 3 alone does not guarantee tamper-evidence (admins could in principle UPDATE the Order table directly), but the stamping is the foundation Phase 5 builds on |
| T-03-SC | Tampering | Supply chain — new npm/pnpm packages | accept | No new external npm packages introduced in this slice. `lucide-react` (`CheckCircle2`, `ChevronLeft`, `Trash2`, `Loader2`) is already installed Phase 1+2. shadcn `AlertDialog` is already installed (UI-SPEC Design System section confirms "already-installed" inventory) |
</threat_model>

<verification>
- BE typechecks: `pnpm --filter @meditrack/api typecheck` exits 0
- BE integration test (full D-73 5-scenario suite) passes: `pnpm --filter @meditrack/api test --run apps/api/test/orders.integration.test.ts` exits 0
- FE typechecks + builds: `pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build` exits 0
- FE component tests (OrderStatusPill, SubmitConfirmationBanner, DiscardDraftDialog, ComposeOrderPage) all pass
- All Phase 1+2+3 tests still pass: `pnpm -r test --run` exits 0
- Human-check passes all 10 steps including synthetic 409 lock test
</verification>

<success_criteria>
- `POST /api/orders/:id/submit` returns 200 + full Order with `status: 'skickad'` and stamped `submittedAt` + `submittedByUserId`; 422 on empty/invalid; 409 on race; 404 on cross-careUnit
- `DELETE /api/orders/:id` returns 204 on Utkast soft-delete; 409 on non-Utkast; 404 on cross-careUnit
- `<OrderStatusPill>` renders all four status values with the locked color map (Phase 4 ready)
- `<SubmitConfirmationBanner>` + Mode B body render correctly post-submit
- `<DiscardDraftDialog>` opens via the Kasta button, confirms via Kasta action, navigates back on success
- Phase 3 ROADMAP success criteria 1-4 are met
- ORD-01, ORD-02, ORD-03 are demoable end-to-end
</success_criteria>

<output>
Create `.planning/phases/03-draft-orders/03-04-SUMMARY.md` when done — record the integration-test-file final shape (number of `it` blocks per scenario), the exact submittedAt timestamping decision (UTC ISO string via `new Date().toISOString()`), any deviations from UI-SPEC §IA Mode B, and a "Phase 3 complete — ORD-01/02/03 demoable" closing note. Also include the 30-second demo script (per 03-CONTEXT.md `<specifics>` Demo path) the user can run on first `docker compose up` to verify the phase end-to-end.
</output>
</output>
