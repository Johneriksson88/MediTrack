---
phase: 03-draft-orders
plan: 03
type: execute
wave: 3
depends_on: [03-02]
files_modified:
  - apps/api/src/services/order.service.ts
  - apps/api/src/routes/orders/index.ts
  - apps/api/src/routes/orders/get.ts
  - apps/api/src/routes/orders/lines.ts
  - apps/api/src/routes/orders/pickerOptions.ts
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
  - apps/web/src/routes/bestallningar/OrderLineTable.tsx
  - apps/web/src/routes/bestallningar/OrderLineCardList.tsx
  - apps/web/src/routes/bestallningar/OrderLineCard.tsx
  - apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx
  - apps/web/src/components/QuantityStepper.tsx
  - apps/web/src/lib/useIsDesktop.ts
autonomous: false
requirements: [ORD-02]
must_haves:
  truths:
    - "GET /api/orders/:id returns the full order with embedded lines joined to CareUnitMedication + Medication for denormalized name/atcCode/form/strength/currentStock/lowStockThreshold (D-47)"
    - "Cross-careUnit GET /api/orders/:id returns 404 not 403 (D-73) — existence-leak protection"
    - "POST /api/orders/:id/lines (add) on an Utkast order returns 200 with the full updated Order body (D-57 pattern applied to line ops)"
    - "POST /api/orders/:id/lines on a Skickad order returns 409 with body.error.code === 'order_locked' (D-54, D-55)"
    - "PATCH /api/orders/:id/lines/:lineId (quantity update) on Utkast returns 200 with full updated Order; on Skickad returns 409 order_locked"
    - "DELETE /api/orders/:id/lines/:lineId on Utkast returns 200 with full updated Order; on Skickad returns 409 order_locked"
    - "Each line-mutation service function uses an atomic `tx.order.updateMany WHERE id=? AND careUnitId=? AND status='utkast' AND deletedAt IS NULL` inside a `$transaction` as the precondition; `count===1` proceeds with the line write, `count===0` throws OrderLockedError — canonical Postgres compare-and-swap (D-54)"
    - "GET /api/orders/picker-options scopes to req.user.careUnitId CareUnitMedications (deletedAt: null) and uses Prisma's parameterized ILIKE — no raw SQL (D-59, D-66)"
    - "ComposeOrderPage in Mode A (utkast): renders line list (table ≥md / cards <md), 'Lägg till läkemedel' trigger that opens MedicationPickerSheet, sticky footer with line count + total, trash button per line, QuantityStepper per line (D-71, UI-SPEC §5-§9)"
    - "QuantityStepper optimistically updates the local cache via useMutation.onMutate, debounces PATCH at 250 ms, rolls back on error with toast (D-51, D-52, D-60)"
    - "MedicationPickerSheet opens as right-slide ≥md / bottom-sheet <md, autofocuses search input, debounces typeahead at 150 ms, shows LowStockBadge for rows where currentStock < lowStockThreshold (D-58, D-59, D-61)"
    - "All line-op mutations special-case 409 order_locked: toast 'Beställningen kan inte ändras efter att den skickats.' + invalidate ['order', id] so the page re-renders into Mode B (D-55, D-70)"
  artifacts:
    - path: "apps/api/src/services/order.service.ts"
      provides: "getOrderForUnit + addLineToOrder + updateOrderLine + removeOrderLine + searchPickerOptions (each line mutation embeds an atomic `tx.order.updateMany` precondition inside `$transaction`)"
      contains: "tx.order.updateMany"
    - path: "apps/api/src/routes/orders/get.ts"
      provides: "GET /api/orders/:id route"
      contains: "/api/orders/:id"
    - path: "apps/api/src/routes/orders/lines.ts"
      provides: "POST/PATCH/DELETE /api/orders/:id/lines[/:lineId] routes"
      contains: "/api/orders/:id/lines"
    - path: "apps/api/src/routes/orders/pickerOptions.ts"
      provides: "GET /api/orders/picker-options route"
      contains: "/api/orders/picker-options"
    - path: "apps/web/src/components/QuantityStepper.tsx"
      provides: "44x44 −/+ stepper with debounced PATCH + long-press auto-repeat"
      contains: "QuantityStepper"
    - path: "apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx"
      provides: "Sheet-based picker with autofocus + 150 ms debounce + LowStockBadge"
      contains: "MedicationPickerSheet"
    - path: "apps/web/src/routes/bestallningar/ComposeOrderPage.tsx"
      provides: "full Mode A compose view (replaces Slice 2 placeholder)"
      contains: "ComposeOrderPage"
  key_links:
    - from: "apps/web/src/routes/bestallningar/ComposeOrderPage.tsx"
      to: "GET /api/orders/:id"
      via: "useOrderQuery"
      pattern: "useOrderQuery"
    - from: "apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx"
      to: "GET /api/orders/picker-options"
      via: "usePickerOptionsQuery"
      pattern: "usePickerOptionsQuery"
    - from: "apps/web/src/components/QuantityStepper.tsx"
      to: "PATCH /api/orders/:id/lines/:lineId"
      via: "useUpdateOrderLineQuantity optimistic mutation"
      pattern: "useUpdateOrderLineQuantity"
    - from: "apps/web/src/routes/bestallningar/OrderLineTable.tsx"
      to: "DELETE /api/orders/:id/lines/:lineId"
      via: "useRemoveOrderLine pessimistic mutation"
      pattern: "useRemoveOrderLine"
---

<objective>
Ship the compose view — the most interaction-heavy slice of Phase 3. After Slice 3, the user can open an Utkast draft, add lines via a Sheet-based picker (typeahead, LowStockBadge), edit quantities via a 44×44 stepper with optimistic + debounced PATCH, remove lines (pessimistic with toast), and see live line count + total quantity in the sticky footer.

Purpose: ORD-02 (edit a draft: add lines, remove lines, change quantities) lands here. This is also where the canonical 409 `order_locked` contract is wired end-to-end on the FE — if a line op races a submit from another tab, the page snaps to Mode B with a destructive toast. The submit + discard buttons are placed in the sticky footer here as disabled placeholders (Slice 4 wires their handlers).

Output: BE `GET /api/orders/:id` + `POST/PATCH/DELETE /api/orders/:id/lines[/:lineId]` + `GET /api/orders/picker-options`; FE compose-view replacing the Slice 2 placeholder; `<MedicationPickerSheet>` overlay; `<QuantityStepper>` component; full Mode A interaction loop with 409 lock contract surfaced; sticky footer with submit+discard placeholders Slice 4 wires.
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
@CLAUDE.md

<interfaces>
<!-- Key exports the executor needs. Extracted from Slice 1 contracts + Slice 2 hooks + Phase 2 analogs. -->

From packages/shared/src/contracts/order.ts (Slice 1):
- `orderResponse` — full Order with embedded `lines: orderLineResponse[]`
- `orderLineResponse` — `{ id, careUnitMedicationId, quantity, name, atcCode, form, strength, currentStock, lowStockThreshold }`
- `addOrderLineRequest` — `{ careUnitMedicationId: z.string().min(1), quantity: z.number().int().positive() }` (.strict())
- `updateOrderLineRequest` — `{ quantity: z.number().int().positive() }` (.strict())
- `pickerOptionsQuery` — `{ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(20).default(20) }`
- `pickerOption` — `{ careUnitMedicationId, name, atcCode, form, strength, currentStock, lowStockThreshold }`
- `pickerOptionsResponse` — `{ results: pickerOption[] }`

From apps/api/src/plugins/errorHandler.ts (Slice 1):
- `class OrderLockedError extends Error` with `details?: { status?: OrderStatus }`
- `class NotFoundError extends Error` (used for cross-tenant 404)

From apps/api/src/services/order.service.ts (Slice 2):
- `createDraftOrder(careUnitId, createdByUserId)`, `listOrdersForUnit(careUnitId, filters)`, `toOrderResponse`, `toOrderListItem`

From apps/api/src/services/medication.service.ts (analog):
- `searchGlobalMedications(careUnitId, { q, limit })` — pg_trgm reuse + Prisma `contains, mode: 'insensitive'`; mirror for `searchPickerOptions` (INVERTED scope — CareUnitMedication × Medication instead of global)

From apps/web/src/features/orders/useOrderQueries.ts (Slice 2):
- `useOrderQuery(id)`, `usePickerOptionsQuery(q, enabled)`

From apps/web/src/features/medications/useMedicationMutations.ts (analog):
- Optimistic pattern (`useUpdateThresholdOptimistic` lines 106-167) — mirror for `useUpdateOrderLineQuantity`

From apps/web/src/components/LowStockBadge.tsx — reuse verbatim inside picker rows (D-61)
From apps/web/src/components/EmptyStateCard.tsx — reuse for 404 fallback
From apps/web/src/routes/lakemedel/MedicationSheet.tsx — `useIsDesktop` hook + `useDebounce` hook (extract to shared `lib/useIsDesktop.ts` per PATTERNS map decision)
</interfaces>
</context>

## Phase Goal

**As a** nurse (sjuksköterska), **I want to** compose, save, edit, and submit a multi-line medication order, **so that** the order reaches the pharmacist and the medications can be delivered.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — order.service.ts extensions (getOrderForUnit, line CRUD with atomic-touch precondition, picker) + routes/{get,lines,pickerOptions}.ts</name>
  <files>apps/api/src/services/order.service.ts, apps/api/src/routes/orders/index.ts, apps/api/src/routes/orders/get.ts, apps/api/src/routes/orders/lines.ts, apps/api/src/routes/orders/pickerOptions.ts</files>
  <read_first>
    - apps/api/src/services/order.service.ts (Slice 2) — extend; the careUnitId-first contract is already established
    - apps/api/src/services/medication.service.ts — analogs: `findMedicationOrThrow` cross-tenant 404 helper pattern; `searchGlobalMedications` pg_trgm + Prisma `contains, mode: 'insensitive'` pattern; `updateCareUnitMedication`'s `$transaction` wrapping (analog for the line mutations that need atomic UPDATE precondition)
    - apps/api/src/routes/medications/update.ts — params + Zod body + scoped service call pattern; close analog for the lines routes
    - apps/api/src/routes/medications/search.ts — close analog for `pickerOptions.ts`
    - apps/api/src/routes/medications/delete.ts — for `DELETE /api/orders/:id/lines/:lineId` shape (but return 200 + full Order, NOT 204 — D-57 / PATTERNS map line 531)
    - apps/api/src/plugins/errorHandler.ts (Slice 1) — `OrderLockedError`, `NotFoundError`
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`apps/api/src/services/order.service.ts` Atomic-UPDATE section, `routes/orders/get.ts`, `routes/orders/lines.ts`, `routes/orders/pickerOptions.ts` sections)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-47, D-54, D-55, D-57, D-58, D-59, D-66, D-73)
  </read_first>
  <behavior>
    - `order.service.ts` exports `getOrderForUnit(careUnitId, orderId): Promise<OrderResponse>` — runs `prisma.order.findUnique({ where: { id: orderId }, include: { lines: { include: { careUnitMedication: { include: { medication: true } } } }, createdBy: { select: { id, name } }, submittedBy: { select: { id, name } } } })`; if `!row || row.deletedAt !== null || row.careUnitId !== careUnitId` throws `NotFoundError('Beställningen hittades inte.')` (D-73 cross-tenant 404)
    - `order.service.ts` exports `addLineToOrder(careUnitId, orderId, line: { careUnitMedicationId, quantity }): Promise<OrderResponse>` — opens `prisma.$transaction(async (tx) => { ... })`. Inside the tx, executes shape (a) — an atomic Order touch followed by the line write:
        1. Verify `careUnitMedicationId` belongs to the user's careUnit BEFORE entering the precondition touch (separate `tx.careUnitMedication.findFirst({ where: { id: careUnitMedicationId, careUnitId, deletedAt: null } })`; if null throw `NotFoundError('Läkemedlet hittades inte.')` — cross-tenant 404 protection)
        2. Atomic precondition + serialization touch: `const touched = await tx.order.updateMany({ where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null }, data: { updatedAt: new Date() } }); if (touched.count !== 1) throw new OrderLockedError({ status: 'skickad' });` — the matched-row UPDATE takes a Postgres row-level write lock for the duration of the tx, serializing against a concurrent submit's same-row UPDATE
        3. `const line = await tx.orderLine.create({ data: { orderId, careUnitMedicationId, quantity } });`
        4. Re-fetch the full Order with the same include shape as `getOrderForUnit` and return via `toOrderResponse`
    - `order.service.ts` exports `updateOrderLine(careUnitId, orderId, lineId, payload: { quantity }): Promise<OrderResponse>` — opens `prisma.$transaction(async (tx) => { ... })`. Inside the tx, executes shape (a):
        1. Atomic Order touch: `const touched = await tx.order.updateMany({ where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null }, data: { updatedAt: new Date() } }); if (touched.count !== 1) throw new OrderLockedError({ status: 'skickad' });`
        2. Line write: `const lineWrite = await tx.orderLine.updateMany({ where: { id: lineId, orderId }, data: { quantity: payload.quantity } }); if (lineWrite.count !== 1) throw new NotFoundError('Raden hittades inte.');` (the line either doesn't exist or doesn't belong to this order — both surface as 404)
        3. Re-fetch the full Order and return via `toOrderResponse`
    - `order.service.ts` exports `removeOrderLine(careUnitId, orderId, lineId): Promise<OrderResponse>` — opens `prisma.$transaction(async (tx) => { ... })`. Inside the tx, executes shape (a):
        1. Atomic Order touch: `const touched = await tx.order.updateMany({ where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null }, data: { updatedAt: new Date() } }); if (touched.count !== 1) throw new OrderLockedError({ status: 'skickad' });`
        2. Line delete: `const lineDelete = await tx.orderLine.deleteMany({ where: { id: lineId, orderId } }); if (lineDelete.count !== 1) throw new NotFoundError('Raden hittades inte.');`
        3. Re-fetch the full Order and return via `toOrderResponse`
    - NOTE: Slice 3 does NOT export an `assertOrderEditable` helper. The atomic Order touch (step 2 above) IS the precondition; abstracting it into a separate helper that runs `findUnique` first defeats the serialization purpose. Slice 4's `submitOrder` and `softDeleteOrder` use the same shape (their own `updateMany WHERE status='utkast'` calls) and do not import any helper from Slice 3.
    - `order.service.ts` exports `searchPickerOptions(careUnitId, { q, limit }): Promise<PickerOption[]>` — runs `prisma.careUnitMedication.findMany({ where: { careUnitId, deletedAt: null, medication: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { atcCode: { startsWith: q, mode: 'insensitive' } }] } }, include: { medication: true }, take: limit, orderBy: { medication: { name: 'asc' } } })`. Maps to `pickerOption[]`. Uses the Phase 2 pg_trgm GIN index transparently (no raw SQL)
    - `routes/orders/get.ts` — `r.get('/api/orders/:id', { preHandler: [requireSession, requirePermission('order:read')], schema: { params: z.object({ id: z.string().min(1) }), response: { 200: orderResponse } } }, async (req) => getOrderForUnit(req.user!.careUnitId, req.params.id))`
    - `routes/orders/lines.ts` — registers THREE handlers all gated by `requirePermission('order:update')`:
        - `POST /api/orders/:id/lines` — body `addOrderLineRequest`, response `200: orderResponse`. Handler: `return addLineToOrder(req.user!.careUnitId, req.params.id, req.body)`
        - `PATCH /api/orders/:id/lines/:lineId` — params `{ id, lineId }`, body `updateOrderLineRequest`, response `200: orderResponse`. Handler: `return updateOrderLine(req.user!.careUnitId, req.params.id, req.params.lineId, req.body)`
        - `DELETE /api/orders/:id/lines/:lineId` — no body, response `200: orderResponse` (NOT 204 — D-57 / PATTERNS map line 531). Handler: `return removeOrderLine(req.user!.careUnitId, req.params.id, req.params.lineId)`
    - `routes/orders/pickerOptions.ts` — `r.get('/api/orders/picker-options', { preHandler: [requireSession, requirePermission('order:create')], schema: { querystring: pickerOptionsQuery, response: { 200: pickerOptionsResponse } } }, async (req) => ({ results: await searchPickerOptions(req.user!.careUnitId, req.query) }))`
    - `routes/orders/index.ts` updated to register the three new routes (`getOrderRoute`, `linesRoute`, `pickerOptionsRoute`)
    - TDD: extend `apps/api/test/orders.integration.test.ts` with `it` blocks for: (a) GET /api/orders/:id returns the order with embedded lines + denormalized fields (b) GET /api/orders/:id from a user in CareUnit B against an order in CareUnit A returns 404 (NOT 403) (c) POST /api/orders/:id/lines on Utkast returns 200 with `lines.length` incremented and `lines[*].name` populated from the join (d) PATCH /api/orders/:id/lines/:lineId updates quantity and returns full Order (e) DELETE /api/orders/:id/lines/:lineId removes the line and returns full Order with decremented `lines.length` (f) The forced 409 lock contract — Slice 4 will add the canonical "after submit" check, but Slice 3 sets up an order with `prisma.order.update({ data: { status: 'skickad' } })` directly (bypassing the submit route) and asserts POST/PATCH/DELETE on lines returns 409 with `body.error.code === 'order_locked'` (g) GET /api/orders/picker-options scopes to careUnit and filters out soft-deleted CareUnitMedications (h) GET /api/orders/picker-options without a session returns 401
  </behavior>
  <action>
    Extend `apps/api/src/services/order.service.ts` with `getOrderForUnit`, `addLineToOrder`, `updateOrderLine`, `removeOrderLine`, `searchPickerOptions` per `<behavior>`. The atomic-touch-then-write pattern (shape (a)) is Phase 3's signature contribution and has NO existing analog in the codebase. Each of the three line-mutation functions opens a `prisma.$transaction(async (tx) => { ... })`, runs `const touched = await tx.order.updateMany({ where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null }, data: { updatedAt: new Date() } })` as the FIRST write inside the tx, asserts `touched.count === 1` (else throws `OrderLockedError({ status: 'skickad' })`), and only then does the line write. The matched-row UPDATE takes a Postgres row-level write lock for the duration of the tx — a concurrent submit's same-row UPDATE blocks until the line tx commits, then sees `status='skickad'` in its WHERE predicate and matches zero rows (count===0 → submit throws OrderLockedError). This is the canonical Postgres compare-and-swap pattern for "edit only if status hasn't flipped."

    DO NOT introduce an `assertOrderEditable` helper that does a `findUnique` first and then throws. The whole point of the atomic touch is to combine the precondition check with the row-lock acquisition into a single statement; abstracting them apart re-opens the TOCTOU window. The Slice 4 `submitOrder` / `softDeleteOrder` use their own variants of the same atomic-updateMany pattern and do not depend on any Slice 3 helper.

    For `addLineToOrder`: validate `careUnitMedicationId` belongs to the user's careUnit (cross-tenant 404 — `tx.careUnitMedication.findFirst({ where: { id: careUnitMedicationId, careUnitId, deletedAt: null } })`; if null throw `NotFoundError`). Do this BEFORE the order touch so the cross-tenant case surfaces as 404 rather than 409. Quantity is already validated positive int by Zod at the route boundary (Slice 1's `addOrderLineRequest` with `.strict()`).

    For `updateOrderLine` / `removeOrderLine`: after the atomic Order touch succeeds, the line write itself uses `tx.orderLine.updateMany({ where: { id: lineId, orderId }, data: {...} })` / `tx.orderLine.deleteMany({ where: { id: lineId, orderId } })`. Assert `count === 1` and throw `NotFoundError('Raden hittades inte.')` on 0 (line doesn't exist or doesn't belong to the order — both → 404). Re-fetch full Order via `getOrderForUnit`-style include and return.

    For `searchPickerOptions`: mirror `medication.service.ts:252-289` (`searchGlobalMedications`) — invert the scope from "Medication NOT in my careUnit" to "CareUnitMedication IN my careUnit, joined to Medication" per D-59. Use Prisma's `contains, mode: 'insensitive'` for name + `startsWith, mode: 'insensitive'` for atcCode. NO raw SQL — the pg_trgm GIN index Phase 2 added is used transparently by Postgres for ILIKE on `lower(name)`.

    Create `apps/api/src/routes/orders/get.ts`, `apps/api/src/routes/orders/lines.ts` (three handlers in one file), `apps/api/src/routes/orders/pickerOptions.ts`. Register all three (and the existing two from Slice 2) in `routes/orders/index.ts` per D-65 ordering: `createOrderRoute → listOrdersRoute → getOrderRoute → linesRoute → pickerOptionsRoute` (`submitOrderRoute` + `deleteOrderRoute` come in Slice 4).

    TDD before implementation: extend `apps/api/test/orders.integration.test.ts` with the eight `it` blocks from `<behavior>`. Each block sets up via login + `app.inject`. The lock-contract tests (f) seed an order in `skickad` by direct prisma write (bypassing the submit route — Slice 4 covers the canonical submit-then-edit flow). Run failing → implement → run passing.

    Notes on the line endpoints returning the full Order rather than 204: this is intentional per D-57 — the FE cache hydrates from the response in one round-trip via `queryClient.setQueryData(['order', id], response)`, removing the GET round-trip that Phase 2's medications delete required.
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/api typecheck && pnpm --filter @meditrack/api test --run apps/api/test/orders.integration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/services/order.service.ts` exports `getOrderForUnit`, `addLineToOrder`, `updateOrderLine`, `removeOrderLine`, `searchPickerOptions` (Grep `^(export )?(async )?function (getOrderForUnit|addLineToOrder|updateOrderLine|removeOrderLine|searchPickerOptions)` returns 5)
    - `apps/api/src/services/order.service.ts` does NOT export `assertOrderEditable` (Grep `^(export )?(async )?function assertOrderEditable` returns 0) — the atomic-touch pattern is inlined in each line-mutation function, not abstracted
    - `apps/api/src/services/order.service.ts` contains the literal `tx.order.updateMany(` on at least 3 lines (one per line-mutation function — addLineToOrder, updateOrderLine, removeOrderLine). Grep returns ≥3
    - Each occurrence of `tx.order.updateMany(` is followed within 5 lines by a where clause that mentions BOTH `status: 'utkast'` AND `deletedAt: null` (Grep with `-A 5` on `tx.order.updateMany(` — every match's context contains both literals)
    - Each `tx.order.updateMany(` call is followed within 5 lines by a `count !== 1` (or `count === 0`) assertion that throws `OrderLockedError` (Grep `OrderLockedError` near each `tx.order.updateMany`)
    - All three line-mutation functions are wrapped in `prisma.$transaction(async (tx) =>` (Grep returns ≥3 inside the file, scoped to lines containing one of the three function names within 20 lines above)
    - `apps/api/src/routes/orders/get.ts` contains `requirePermission('order:read')` and `params: z.object({ id: z.string().min(1) })` (Grep)
    - `apps/api/src/routes/orders/lines.ts` contains all three of `r.post('/api/orders/:id/lines'`, `r.patch('/api/orders/:id/lines/:lineId'`, `r.delete('/api/orders/:id/lines/:lineId'` (Grep)
    - `apps/api/src/routes/orders/lines.ts` declares `response: { 200: orderResponse }` on ALL THREE handlers (no 204 on DELETE — D-57; Grep for `204:` returns 0)
    - `apps/api/src/routes/orders/pickerOptions.ts` contains `requirePermission('order:create')` and `querystring: pickerOptionsQuery` (Grep)
    - `apps/api/src/routes/orders/index.ts` registers all five Slice 2+3 routes (Grep for `Route);` returns 5)
    - Integration tests pass for the eight Slice 3 `it` blocks (test exit 0)
    - Specific assertion: lock-contract test (f) — body parses to `{ error: { code: 'order_locked', message: 'Beställningen kan inte ändras efter att den skickats.', details: { status: 'skickad' } } }`, status code 409
    - Specific assertion: cross-tenant test (b) — body parses to `{ error: { code: 'not_found', ... } }`, status code 404 (NOT 403)
    - Specific assertion: `searchPickerOptions` filters out CareUnitMedications with `deletedAt !== null` (seed one soft-deleted CUM and confirm it's absent from results)
    - All earlier api tests still pass: `pnpm --filter @meditrack/api test --run` exits 0
  </acceptance_criteria>
  <done>
    All five Slice 3 endpoints are live with RBAC + careUnit scoping + cross-tenant 404 + the 409 `order_locked` contract on every line op + the picker scoped to the caller's CareUnitMedications. Every line mutation uses the inlined atomic-touch precondition pattern that serializes correctly against a concurrent submit via Postgres row-level write locks. The integration test suite proves the lock contract works (and Slice 4 adds the canonical "submit-then-edit" end-to-end test).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Frontend — useOrderMutations extensions + QuantityStepper + MedicationPickerSheet + useIsDesktop helper</name>
  <files>apps/web/src/features/orders/useOrderMutations.ts, apps/web/src/components/QuantityStepper.tsx, apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx, apps/web/src/lib/useIsDesktop.ts</files>
  <read_first>
    - apps/web/src/features/orders/useOrderMutations.ts (Slice 2) — extend; `useCreateDraftOrder` exists; add `useAddOrderLine`, `useUpdateOrderLineQuantity` (optimistic), `useRemoveOrderLine`
    - apps/web/src/features/medications/useMedicationMutations.ts — analogs: pessimistic pattern (`useUpdateMedication` lines 64-86) for add/remove; optimistic pattern (`useUpdateThresholdOptimistic` lines 106-167) for `useUpdateOrderLineQuantity`; the 409 carve-out at lines 49-53
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx — `useIsDesktop` hook (lines 103-114), `useDebounce` hook (lines 92-99), Sheet shell + side prop pattern (lines 718-731), typeahead query + results dropdown render (lines 767-803). Extract `useIsDesktop` to `apps/web/src/lib/useIsDesktop.ts`
    - apps/web/src/components/LowStockBadge.tsx — verbatim reuse inside picker rows (D-61)
    - apps/web/src/components/InlineEditThreshold.tsx — analog for `QuantityStepper`'s debounced + optimistic input shape (closest reference for the debounce + onMutate + rollback wiring)
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`useOrderMutations.ts`, `QuantityStepper.tsx` is implied by `OrderLineTable`, `MedicationPickerSheet.tsx` sections)
    - .planning/phases/03-draft-orders/03-UI-SPEC.md §6 (`<QuantityStepper>` — exact layout, debounce timing, long-press, accessibility, locked mode), §9 (`<MedicationPickerSheet>` — Sheet shell, autofocus, debounce, row layout, on-click pessimistic-close)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-51, D-52, D-55, D-58, D-59, D-60, D-61, D-69, D-70)
  </read_first>
  <behavior>
    - `useOrderMutations.ts` adds:
        - `useAddOrderLine` — variables `{ orderId, careUnitMedicationId, quantity }`. POSTs `/api/orders/:orderId/lines`. On success: `setQueryData(['order', orderId], response)` (D-57 cache hydration). NO toast on success (Phase 2 add-pattern; line appearing is the feedback). On error: 409 carve-out (`order_locked` → toast 'Beställningen kan inte ändras efter att den skickats.' + invalidate `['order', orderId]`), else toast 'Kunde inte spara — försök igen.'
        - `useUpdateOrderLineQuantity` — OPTIMISTIC. Variables `{ orderId, lineId, quantity }`. PATCHes `/api/orders/:orderId/lines/:lineId`. `onMutate`: cancel queries for `['order', orderId]`, snapshot via `getQueriesData`, optimistically mutate `lines[*].quantity` where `id === lineId`. `onError`: rollback snapshot + 409 carve-out + toast. `onSettled`: invalidate `['order', orderId]` (server-authoritative)
        - `useRemoveOrderLine` — PESSIMISTIC. Variables `{ orderId, lineId }`. DELETEs `/api/orders/:orderId/lines/:lineId`. On success: `setQueryData(['order', orderId], response)` + `toast.success('Sparat')` (D-70). On error: 409 carve-out + toast
    - `useIsDesktop()` hook lives in `apps/web/src/lib/useIsDesktop.ts` — `matchMedia('(min-width: 768px)')` with listener cleanup. Verbatim extraction from `MedicationSheet.tsx`. Re-imported by both the picker + any future md-vs-base branching components
    - `QuantityStepper` component (`apps/web/src/components/QuantityStepper.tsx`):
        - Props: `{ value: number; orderId: string; lineId: string; onPersist?: (next: number) => void; min?: number; isLocked: boolean }` (UI-SPEC §6)
        - Layout: three controls in a row — `<Button variant="outline" size="icon" className="h-11 w-11 rounded-r-none border-r-0">−</Button>`, `<Input type="number" inputMode="numeric" min={1} step={1} className="h-11 w-16 rounded-none text-center text-sm font-semibold" />`, `<Button variant="outline" size="icon" className="h-11 w-11 rounded-l-none border-l-0">+</Button>`. 44×44 buttons enforce the touch-target floor (D-60)
        - Interaction: optimistic update via `useUpdateOrderLineQuantity` on click or input change; debounced 250 ms (use the `useDebounce` helper); commits on blur if debounce hasn't fired; long-press auto-repeats (250 ms initial delay, 100 ms repeat interval, released on `pointerup` / `pointercancel`)
        - On `order_locked` 409: hook's onError already handles the toast + invalidate; the stepper doesn't need to re-render anything itself (the parent's useOrderQuery will refetch and ComposeOrderPage will switch to Mode B)
        - `−` disabled when `value === 1`. Typing `0` or below silently coerced to `1` on blur. Negative blocked at input `min={1}` (D-60)
        - Locked mode (`isLocked === true`): renders a single `<span className="text-sm font-semibold">{value}</span>` of the same width (preserves layout)
        - aria-labels: `'Minska antal'` / `'Öka antal'` on buttons, `'Antal'` on input. `e.stopPropagation()` on stepper keydown so wrapping clickables don't fire
    - `MedicationPickerSheet` component (`apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx`):
        - Props: `{ open: boolean; onOpenChange: (open: boolean) => void; orderId: string }`
        - Sheet shell: `side={isDesktop ? 'right' : 'bottom'}` with the same `w-[480px] sm:max-w-xl` / `max-h-[90dvh] rounded-t-2xl` split as `MedicationSheet` (UI-SPEC §9)
        - Header: `<SheetTitle>Lägg till läkemedel</SheetTitle>` (D-70)
        - Search input: `<Input placeholder="Sök läkemedel…" autoFocus value={q} onChange={…} />`, 150 ms debounce (UI-SPEC §9 — matches Phase 2 D-44)
        - Query: `usePickerOptionsQuery(debouncedQ, debouncedQ.length > 0)` (Slice 2 hook)
        - Loading state: `<div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/>Söker…</div>` (D-70)
        - Empty result: `<div className="p-3 text-sm text-muted-foreground">Inget läkemedel matchade.</div>` (D-70). NO "Skapa nytt" button
        - Each result row is a `<button>` (focusable, keyboard-navigable) with `min-h-[56px]` and the layout per UI-SPEC §9: row 1 `{name}` (text-sm font-semibold), row 2 `{atcCode} · {form} · Lager: {currentStock}` (text-xs text-muted-foreground), right-side `<LowStockBadge />` when `currentStock < lowStockThreshold` (D-61)
        - On row click: `setOpen(false)` (optimistic Sheet close) + `useAddOrderLine.mutate({ orderId, careUnitMedicationId: row.careUnitMedicationId, quantity: 1 })` (D-58 default quantity)
        - On error: re-open Sheet + toast (the hook handles the toast)
        - Footer: `<SheetFooter className="border-t border-border p-4"><Button variant="ghost" onClick={() => onOpenChange(false)}>Stäng</Button></SheetFooter>` (D-70)
        - Use `useDebounce` from `MedicationSheet` (extract to `apps/web/src/lib/useDebounce.ts` if not already shared; otherwise inline once per file — pick whichever has the smaller diff)
  </behavior>
  <action>
    Extract `useIsDesktop` from `MedicationSheet.tsx` to a new `apps/web/src/lib/useIsDesktop.ts` so the picker + any future component can re-use it. Update `MedicationSheet.tsx` to import from the new location (single-file diff). Same for `useDebounce` if it's not already shared — either extract to `apps/web/src/lib/useDebounce.ts` or leave inlined in two places (the diff calculus is the criterion).

    Extend `apps/web/src/features/orders/useOrderMutations.ts` with the three new exports per `<behavior>`. The optimistic `useUpdateOrderLineQuantity` mirrors `useUpdateThresholdOptimistic` line-for-line: cancelQueries on `['order', orderId]`, snapshot via `getQueriesData`, optimistic `setQueriesData` that maps `old.lines.map(l => l.id === lineId ? { ...l, quantity } : l)`, rollback in onError, invalidate in onSettled. The 409 carve-out runs BEFORE the generic toast in onError (per UI-SPEC §Toast Feedback row "Any 409 order_locked" + PATTERNS.md lines 949-957) — it MUST appear once per Slice 3 mutation (useAddOrderLine, useUpdateOrderLineQuantity, useRemoveOrderLine), so the file ends up containing the carve-out three times.

    Create `apps/web/src/components/QuantityStepper.tsx` per `<behavior>` + UI-SPEC §6. Use refs for pointer-event tracking on the long-press auto-repeat (start interval on pointerdown after 250 ms, clear on pointerup/pointercancel/pointerleave, 100 ms repeat interval). Use `useDebounce` to delay the PATCH after the local state changes. The component drives `useUpdateOrderLineQuantity` from inside — caller doesn't pass a mutation hook in.

    Create `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx` per `<behavior>` + UI-SPEC §9. Mirror `MedicationSheet`'s Sheet shell + header + search input + results list pattern, but strip everything related to "Skapa nytt", the NPL-selected screen, and the create form. Each row is a `<button>` (NOT inside an absolute-positioned dropdown — UI-SPEC §9 explicitly says results render as a scrollable list inside the Sheet body). Use `useAddOrderLine` from `useOrderMutations`. On click: optimistically close the Sheet, then dispatch the mutation; on error the hook re-opens via — actually, the hook can't re-open the Sheet; the Sheet's parent (ComposeOrderPage in Task 3) owns `setOpen`. So pass `onOpenChange` down and the component calls `onOpenChange(false)` on click, then in the mutation's onError it calls `onOpenChange(true)` again. Document this in a comment.

    NB: the QuantityStepper's optimistic update relies on `useOrderQuery` data being the source of truth. Ensure the snapshot/restore in `useUpdateOrderLineQuantity` correctly handles the case where the cached `OrderResponse` has nested `lines` (`old.lines.map(...)`, not `old.rows.map(...)` from the medication analog).
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build && pnpm --filter @meditrack/web test --run "apps/web/src/components/__tests__/QuantityStepper.test.tsx" "apps/web/src/routes/bestallningar/__tests__/MedicationPickerSheet.test.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/lib/useIsDesktop.ts` exists and exports `useIsDesktop` (Grep)
    - `apps/web/src/features/orders/useOrderMutations.ts` exports `useAddOrderLine`, `useUpdateOrderLineQuantity`, `useRemoveOrderLine` (Grep)
    - `useOrderMutations.ts` contains the `order_locked` carve-out at least 3 times — once per Slice 3 mutation (`useAddOrderLine`, `useUpdateOrderLineQuantity`, `useRemoveOrderLine`): Grep `'order_locked'` (the literal inside an `err.envelope.error.code === 'order_locked'` branch) returns ≥3. Slice 4 will add 2 more occurrences (useSubmitOrder, useDiscardOrder) so the end-of-phase count is ≥5
    - `useUpdateOrderLineQuantity` has `onMutate`, `onError`, `onSettled` (optimistic shape — Grep returns 3 callback names)
    - `apps/web/src/components/QuantityStepper.tsx` contains `h-11 w-11` for both `−` and `+` buttons (Grep returns ≥2)
    - `QuantityStepper.tsx` contains `inputMode="numeric"` and `min={1}` (Grep)
    - `QuantityStepper.tsx` contains a long-press auto-repeat (search for `setInterval` and `clearInterval` and `pointerdown` and `pointerup`)
    - `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx` contains `autoFocus` on the Input (Grep)
    - `MedicationPickerSheet.tsx` contains the literals `'Sök läkemedel…'`, `'Söker…'`, `'Inget läkemedel matchade.'`, `'Stäng'`, `'Lägg till läkemedel'` (Grep — each present ≥1 time)
    - `MedicationPickerSheet.tsx` imports `LowStockBadge` (Grep) and renders it conditionally (`currentStock < lowStockThreshold`)
    - FE component test `QuantityStepper.test.tsx`: (a) clicking + 3 times only fires ONE PATCH (debounce coalescing); (b) the local state shows the optimistic value before the PATCH resolves; (c) on simulated `order_locked` error, hook fires invalidate; (d) `isLocked={true}` renders the locked span and no buttons
    - FE component test `MedicationPickerSheet.test.tsx`: (a) Sheet open autofocuses search input; (b) typing "para" → after 150 ms, query fires with `q=para`; (c) clicking a row calls `onOpenChange(false)` and dispatches `useAddOrderLine` with `quantity: 1`; (d) zero-result state renders 'Inget läkemedel matchade.'
    - `pnpm --filter @meditrack/web typecheck` exits 0
  </acceptance_criteria>
  <done>
    The picker + stepper + the three line mutations are battle-tested in isolation. Task 3 wires them into the page.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Frontend — ComposeOrderPage full Mode A body + OrderLineTable + OrderLineCardList + OrderLineCard (vertical slice completion)</name>
  <files>apps/web/src/routes/bestallningar/ComposeOrderPage.tsx, apps/web/src/routes/bestallningar/OrderLineTable.tsx, apps/web/src/routes/bestallningar/OrderLineCardList.tsx, apps/web/src/routes/bestallningar/OrderLineCard.tsx, apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx</files>
  <read_first>
    - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx (Slice 2 placeholder) — replace the body completely; keep the page title effect
    - apps/web/src/routes/lakemedel/LakemedelPage.tsx — page chrome + branch-on-loading + branch-on-status (analog for Mode A vs Mode B switch — Mode B is owned by Slice 4 but the branch scaffolding goes in here)
    - apps/web/src/routes/lakemedel/MedicationTable.tsx — analog for `OrderLineTable` (table shell, headers, row styling, the LowStockBadge cell pattern at lines 105-121)
    - apps/web/src/routes/lakemedel/MedicationCard.tsx — analog for `OrderLineCard` (but `OrderLineCard` is NOT clickable as a card — the interactives are nested per UI-SPEC §7)
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx — the `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]` trick for the sticky footer's mobile padding
    - apps/web/src/auth/Can.tsx — `<Can action="order:update">` for trash + stepper hide, `<Can action="order:submit">` for submit button, `<Can action="order:delete">` for discard button
    - apps/web/src/components/EmptyStateCard.tsx — reuse for 404 fallback
    - apps/web/src/components/LowStockBadge.tsx — Lager cell + picker rows
    - apps/web/src/components/QuantityStepper.tsx (Task 2)
    - apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx (Task 2)
    - apps/web/src/features/orders/useOrderQueries.ts (Slice 2) — `useOrderQuery`
    - apps/web/src/features/orders/useOrderMutations.ts (Task 2) — `useAddOrderLine`, `useUpdateOrderLineQuantity`, `useRemoveOrderLine`
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`ComposeOrderPage.tsx`, `OrderLineTable.tsx`, `OrderLineCardList.tsx + OrderLineCard.tsx`, `ComposeStickyFooter.tsx` sections)
    - .planning/phases/03-draft-orders/03-UI-SPEC.md §4 (ComposeOrderPage), §5 (OrderLineTable), §7 (OrderLineCardList + OrderLineCard), §8 (ComposeStickyFooter)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-67, D-68, D-71, D-72)
  </read_first>
  <behavior>
    - `ComposeOrderPage` branches on `useOrderQuery(id)` state:
        - Loading: header chrome renders immediately (back link, `<Skeleton h-8 w-48 />` for title, `<Skeleton h-5 w-16 rounded-full />` for status pill, 3 `<Skeleton>` blocks for the line list area). Sticky footer hidden during loading
        - Error 404 (`useOrderQuery` returns error with code `not_found`): renders centered `<EmptyStateCard icon={ClipboardList} heading="Beställning hittades inte.">` with a `<Link to="/bestallningar"><Button variant="link">Tillbaka till beställningar</Button></Link>`
        - Loaded `order.status === 'utkast'`: Mode A — full editable body (this slice)
        - Loaded `order.status === 'skickad'` or anything non-utkast: Mode B placeholder for now — render the header + a placeholder banner "Slice 4 fyller i Mode B visuellt." and the read-only line list (Slice 4 will wire `<SubmitConfirmationBanner>` + remove the sticky footer). The Mode B placeholder MUST hide the sticky footer + the picker trigger + the trash buttons + the stepper (use isLocked={true} on QuantityStepper)
    - Document title effect: `useEffect` setting `'Nytt utkast — MediTrack'` for utkast, `'Beställning · Skickad — MediTrack'` for skickad; restore to `'MediTrack'` on unmount
    - Header (both modes): `<Link to="/bestallningar"><ChevronLeft className="h-4 w-4" /> Tillbaka till beställningar</Link>` in `text-sm text-muted-foreground hover:text-foreground`, then `<h1>` (`Nytt utkast` for utkast, `Beställning · Skickad` for skickad) + `<OrderStatusPill status={order.status} />` — NB: `OrderStatusPill` is owned by Slice 4. For Slice 3, render an inline `<span className="bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-xs font-semibold">Utkast</span>` placeholder with a `// TODO Slice 4: swap for <OrderStatusPill>` comment
    - Mode A body: `<OrderLineTable items={order.lines} orderId={order.id} className="hidden md:block" isLocked={false} />` + `<OrderLineCardList items={order.lines} orderId={order.id} className="block md:hidden" isLocked={false} />`. Empty state inside the table/cards: 'Lägg till läkemedel för att börja.' (D-70). Below the lines, an inline "Lägg till läkemedel" button (`<Button variant="outline">`) opens the picker on desktop; on mobile the trigger lives in the sticky footer
    - Mode A sticky footer (`<ComposeStickyFooter>`):
        - Mobile (`<md`): `<footer className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-[0_-1px_3px_rgba(0,0,0,0.05)] p-4 pb-[calc(1rem+56px+env(safe-area-inset-bottom))] md:hidden">` with: summary text top line `{N} rader · totalt {sum}` in `text-sm text-muted-foreground`; button row `[Kasta] [Lägg till läkemedel] [Skicka beställning]` (the last takes `flex-1`)
        - Desktop (`≥md`): `<footer className="hidden md:flex items-center justify-between gap-4 sticky bottom-0 bg-background border-t border-border p-4">` with `[Kasta]` left, summary middle, `[Lägg till läkemedel] [Skicka beställning]` right
        - Submit button DISABLED predicate (D-56): `lines.length === 0 || lines.some(l => l.quantity <= 0)`. Tooltip on disabled state: `Lägg till minst en rad för att skicka.` (UI-SPEC §8). HANDLER for Submit and Kasta is wired in SLICE 4 — Slice 3 wires the buttons as inert (`onClick={() => {}}`) with a `// TODO Slice 4: wire useSubmitOrder` comment. Submit + Discard remain visually present and disabled-correctly so this slice still ships a complete Mode A layout
        - Main content area gets `pb-[calc(56px+56px+env(safe-area-inset-bottom))]` on mobile when in Mode A so the line list never hides behind the footer (UI-SPEC §8 + D-71)
    - `OrderLineTable`: 6 columns per UI-SPEC §5 — `Namn` / `ATC-kod` / `Form` / `Lager` (LowStockBadge + currentStock cell from `MedicationTable.tsx:105-121` reused verbatim) / `Antal` (`<QuantityStepper>`) / `Åtgärd` (trash button `<Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label="Ta bort rad">`). Empty state row: single colSpan={6} cell with `Lägg till läkemedel för att börja.`. `isLocked` prop: when true, replace stepper with static text + hide trash button (keep the cell width — don't collapse columns)
    - `OrderLineCardList` + `OrderLineCard`: per UI-SPEC §7 layout — top row name + trash button (44×44), then ATC-kod / Form line, then Lager line with LowStockBadge, then `<hr />`, then `<QuantityStepper>`. Card is NOT a button (no role="button" / tabIndex / onClick). `isLocked` prop hides trash + locks the stepper
    - Trash button onClick: `useRemoveOrderLine.mutate({ orderId, lineId })`. Pessimistic — line vanishes after the mutation resolves. `e.stopPropagation()` to prevent any wrapping click
    - Picker open state: `const [pickerOpen, setPickerOpen] = useState(false)` lives in ComposeOrderPage; "Lägg till läkemedel" buttons call `setPickerOpen(true)`; `<MedicationPickerSheet open={pickerOpen} onOpenChange={setPickerOpen} orderId={order.id} />` rendered conditionally
  </behavior>
  <action>
    Replace the Slice 2 placeholder in `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`. State: `useParams<{ id: string }>()`, `useOrderQuery(id)`, `useState` for `pickerOpen`. Branch per `<behavior>`. The Mode B placeholder is intentional — Slice 4 will replace it. The OrderStatusPill placeholder span (with the TODO comment) is intentional — Slice 4 introduces `<OrderStatusPill>`.

    Create `apps/web/src/routes/bestallningar/OrderLineTable.tsx` mirroring `MedicationTable.tsx`. 6 columns per UI-SPEC §5. Reuse the Lager cell from `MedicationTable.tsx:105-121` verbatim. Empty-state row goes inside `<TableBody>` (single `<TableRow>` with one `<TableCell colSpan={6}>`).

    Create `apps/web/src/routes/bestallningar/OrderLineCardList.tsx` (thin barrel) + `OrderLineCard.tsx` (single card). Card is NOT clickable. Trash button + QuantityStepper are the interactives. Layout per UI-SPEC §7.

    Create `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx`. Mobile/desktop branches per UI-SPEC §8. Submit + Discard buttons render with inert `onClick={() => {}}` (Slice 4 wires them). Submit's disabled predicate + tooltip are wired now. The mobile main-content offset (`pb-[calc(56px+56px+env(safe-area-inset-bottom))]`) is applied via the ComposeOrderPage's wrapper className when the footer is present (Slice 4 will keep this wiring consistent when it removes the footer for Mode B).

    Notes on RBAC gating: per D-64 all three roles can perform every order:* action — but defense-in-depth still applies. Wrap the trash button in `<Can action="order:update">`, the "Lägg till läkemedel" button in `<Can action="order:update">`, the Submit button in `<Can action="order:submit">`, the Discard button in `<Can action="order:delete">`. The current permission matrix grants all three roles for all four, so this is no-op visually today but future-proof for Phase 4's `order:confirm` / `order:deliver` differentiation.

    FE component tests (vitest) for `ComposeOrderPage`:
    1. Mode A renders: shows back link, "Nytt utkast" heading, line list, "Lägg till läkemedel", "Kasta", "Skicka beställning"
    2. Empty Mode A renders empty-state copy 'Lägg till läkemedel för att börja.'
    3. Submit button disabled when `lines.length === 0` (with tooltip on disabled)
    4. 404 state renders "Beställning hittades inte." + back-link button
    5. Trash button click fires `useRemoveOrderLine.mutate`
    6. "Lägg till läkemedel" click opens the picker (`setPickerOpen(true)`)
    7. Mode B placeholder renders when `order.status === 'skickad'` and hides sticky footer + trash + picker trigger
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build && pnpm --filter @meditrack/web test --run "apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx"</automated>
    <what-built>
      ComposeOrderPage Mode A: full editable compose view with line list (table ≥md / cards <md), QuantityStepper per line (optimistic + debounced PATCH), MedicationPickerSheet (Sheet-based typeahead with LowStockBadge), trash per line (pessimistic), sticky footer with disabled Submit + Discard placeholders. Slice 1's seeded draft for sjukskoterska is the demo target. 409 order_locked contract verified by forcing status to 'skickad' via prisma in dev DB and confirming any line op surfaces the destructive toast + page re-renders.
    </what-built>
    <how-to-verify>
      1. `docker compose up` and log in as `sjukskoterska@example.test`
      2. Open `/bestallningar` and click into the seeded Utkast draft (the row should link to `/bestallningar/<id>`)
      3. Page renders Mode A: "Nytt utkast" heading, OrderStatusPill placeholder showing "Utkast", line list with 3 seeded lines (each with name, ATC, form, Lager + LowStockBadge if applicable, QuantityStepper, trash icon)
      4. Click "Lägg till läkemedel" → Sheet slides up (mobile) or in from right (desktop ≥768 px). Search input is autofocused. Type "p" → results stream in after 150 ms; each row shows name · atcCode · form · Lager: N + optional LowStockBadge
      5. Click a result row → Sheet closes optimistically, the new line appears in the list with quantity = 1
      6. Click `+` on a line's stepper 3 times rapidly → local value updates instantly to N+3, only ONE PATCH fires after 250 ms (check Network tab)
      7. Click trash on a line → button shows spinner, line vanishes after the response, "Sparat" toast appears
      8. Resize to 360 px → list re-renders as stacked cards; trash button is 44×44; QuantityStepper is 44×44; sticky footer pinned at bottom above the tab bar with safe-area padding (no overlap with iOS home indicator on a real mobile preview)
      9. Submit button is disabled when lines.length === 0 (remove all 3 seeded lines); tooltip on hover reads "Lägg till minst en rad för att skicka."
      10. (Synthetic lock test) In a second terminal: `docker compose exec -T postgres psql -U postgres meditrack -c "UPDATE \"Order\" SET status = 'skickad' WHERE id = '<the-id>';"`. Back in the browser, try to add a line or edit a quantity → destructive toast "Beställningen kan inte ändras efter att den skickats." appears + page re-renders into Mode B placeholder
    </how-to-verify>
    <resume-signal>Type "approved" or describe issues</resume-signal>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` no longer contains the Slice 2 placeholder literal "Slice 3 fyller i denna vy." (Grep — replaced)
    - `ComposeOrderPage.tsx` contains `useOrderQuery` import (Grep)
    - `ComposeOrderPage.tsx` contains the literal `'Tillbaka till beställningar'`, `'Nytt utkast'`, `'Beställning hittades inte.'` (Grep)
    - `ComposeOrderPage.tsx` contains `MedicationPickerSheet` import and renders it conditionally with `pickerOpen` state (Grep)
    - `ComposeOrderPage.tsx` contains `<Can action="order:update">`, `<Can action="order:submit">`, `<Can action="order:delete">` (Grep — defense-in-depth gates)
    - `apps/web/src/routes/bestallningar/OrderLineTable.tsx` contains column headers `Namn`, `ATC-kod`, `Form`, `Lager`, `Antal`, `Åtgärd` (Grep)
    - `OrderLineTable.tsx` renders the empty-state row with `'Lägg till läkemedel för att börja.'` (Grep)
    - `apps/web/src/routes/bestallningar/OrderLineCard.tsx` does NOT contain `role="button"` (Grep — confirms the card isn't a clickable wrapper)
    - `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx` contains `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]` on the mobile wrapper (Grep)
    - `ComposeStickyFooter.tsx` contains the literal `'Lägg till minst en rad för att skicka.'` (tooltip — Grep)
    - `ComposeStickyFooter.tsx` Submit button disabled predicate references `lines.length === 0` (Grep)
    - FE component tests for `ComposeOrderPage` (7 `it` blocks) pass: `pnpm --filter @meditrack/web test --run apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` exits 0
    - All earlier FE tests still pass: `pnpm --filter @meditrack/web test --run` exits 0
    - Human-check passes for all 10 steps in the verify block
  </acceptance_criteria>
  <done>
    ORD-02 is end-to-end demoable. The user can open an Utkast draft, add/edit/remove lines via the full UI loop, and the 409 lock contract is surfaced in real time. Submit + Discard are visible-but-inert; Slice 4 wires them.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → API | Bodies for line POST/PATCH and query for picker cross from untrusted client |
| Cross-careUnit | All five new endpoints scope via `req.user.careUnitId`; cross-tenant access returns 404 (D-73) |
| Order status precondition | All line mutations check `status === 'utkast'` via an atomic `tx.order.updateMany` inside `$transaction` (canonical Postgres compare-and-swap, D-54) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | Cross-careUnit `GET /api/orders/:id` (T1) | mitigate | `getOrderForUnit` returns `NotFoundError` (404) when `row.careUnitId !== careUnitId` per D-73 — verified by integration test (b). Body says "not_found" never "forbidden", so the existence of an Order in another careUnit is not probable from outside |
| T-03-02 | Tampering | Mass-assignment on `addOrderLineRequest` / `updateOrderLineRequest` (T2) | mitigate | Both contracts (Slice 1) use `.strict()`; any `orderId`, `status`, `createdAt` injected into the body is rejected at the Zod boundary |
| T-03-03 | Tampering / Race | TOCTOU on edit-during-submit (T3) | mitigate | Each line-mutation function runs an atomic `tx.order.updateMany({ where: { id, careUnitId, status: 'utkast', deletedAt: null }, data: { updatedAt: new Date() } })` inside `prisma.$transaction` as the FIRST write — Postgres takes a row-level write lock on the matched Order row for the duration of the tx. A concurrent submit's same-row `updateMany WHERE status='utkast'` blocks on that lock until the line tx commits; then its `WHERE status='utkast'` predicate sees the now-`skickad` row and matches zero rows, so the submit's `count` assertion throws `OrderLockedError`. This is the canonical Postgres compare-and-swap pattern — race-free without explicit `SELECT … FOR UPDATE` or higher isolation levels. Integration test (f) seeds `status='skickad'` directly and verifies all three line endpoints throw 409 `order_locked` |
| T-03-04 | Elevation of Privilege | Permission bypass on line mutations (T4) | mitigate | Every line route declares `requirePermission('order:update')`; the picker requires `order:create` (only users authorized to create new orders can search the picker — restricts surface area). `<Can>` wraps every FE trigger |
| T-03-05 | Injection | SQL injection on picker `q` (T5) | mitigate | `pickerOptionsQuery.q = z.string().min(1)` validates non-empty string; Prisma's `contains, mode: 'insensitive'` parameterizes the value — NO raw SQL. The pg_trgm GIN index is used transparently by Postgres for ILIKE on lower(name) |
| T-03-XSS | Information Disclosure | Reflected XSS via line `name` / `atcCode` in the FE table | mitigate | React's default text-node escaping prevents HTML injection from line fields; no `dangerouslySetInnerHTML` is used anywhere in Slice 3 components |
| T-03-SC | Tampering | Supply chain — new npm/pnpm packages | accept | No new external npm packages introduced in this slice — all shadcn primitives (`Sheet`, `Tooltip`, `Input`, `Button`) are already installed (UI-SPEC Design System section). If `date-fns` needs the `sv` locale and that subpath isn't yet imported, it's still the same already-installed package, no install required |
</threat_model>

<verification>
- BE typechecks + tests pass for all eight new `it` blocks
- FE typechecks + builds pass
- FE component tests for `QuantityStepper`, `MedicationPickerSheet`, `ComposeOrderPage` all pass
- Human-check (10 steps) confirms the full Mode A loop including the synthetic 409 lock test
- All Phase 1-2 tests still pass: `pnpm -r test --run` exits 0
</verification>

<success_criteria>
- All five new BE endpoints live and integration-tested: GET /api/orders/:id, POST/PATCH/DELETE /api/orders/:id/lines[/:lineId], GET /api/orders/picker-options
- Cross-careUnit access returns 404 (not 403) per D-73
- Every line mutation on a non-utkast order returns 409 `order_locked` with `details.status` populated
- ComposeOrderPage Mode A renders the full editable compose view: line list (table ≥md / cards <md), QuantityStepper per line (optimistic + 250 ms debounce + long-press), trash per line (pessimistic), MedicationPickerSheet trigger, sticky footer with disabled Submit + Discard placeholders
- MedicationPickerSheet: right-slide ≥md / bottom-sheet <md, autofocus, 150 ms typeahead debounce, LowStockBadge on rows where currentStock < threshold, "Inget läkemedel matchade." empty state
- 409 order_locked round-trip works end-to-end in the browser (synthetic lock via direct prisma write → toast + Mode B switch)
- ORD-02 is end-to-end demoable
</success_criteria>

<output>
Create `.planning/phases/03-draft-orders/03-03-SUMMARY.md` when done — record the line-endpoint URLs + the debounce/long-press timings actually shipped + any deviations from UI-SPEC §5-§9. Note that Submit + Discard buttons are visible-but-inert pending Slice 4.
</output>
</content>
</invoke>