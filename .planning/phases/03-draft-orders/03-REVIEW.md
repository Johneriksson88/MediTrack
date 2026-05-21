---
phase: 03-draft-orders
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 49
files_reviewed_list:
  - apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/seed.ts
  - apps/api/src/app.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/plugins/errorHandler.ts
  - apps/api/src/routes/orders/create.ts
  - apps/api/src/routes/orders/delete.ts
  - apps/api/src/routes/orders/get.ts
  - apps/api/src/routes/orders/index.ts
  - apps/api/src/routes/orders/lines.ts
  - apps/api/src/routes/orders/list.ts
  - apps/api/src/routes/orders/pickerOptions.ts
  - apps/api/src/routes/orders/submit.ts
  - apps/api/src/services/order.service.ts
  - apps/api/test/admin.ping.test.ts
  - apps/api/test/auth.flow.smoke.test.ts
  - apps/api/test/auth.me.test.ts
  - apps/api/test/contracts.orderEnvelope.test.ts
  - apps/api/test/orders.integration.test.ts
  - apps/web/src/components/OrderStatusPill.tsx
  - apps/web/src/components/QuantityStepper.tsx
  - apps/web/src/components/__tests__/OrderStatusPill.test.tsx
  - apps/web/src/components/__tests__/QuantityStepper.test.tsx
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/features/orders/useOrderQueries.ts
  - apps/web/src/lib/useIsDesktop.ts
  - apps/web/src/router.tsx
  - apps/web/src/routes/bestallningar/BestallningarPage.tsx
  - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
  - apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx
  - apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx
  - apps/web/src/routes/bestallningar/DraftCard.tsx
  - apps/web/src/routes/bestallningar/DraftsCardList.tsx
  - apps/web/src/routes/bestallningar/DraftsTable.tsx
  - apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx
  - apps/web/src/routes/bestallningar/OrderLineCard.tsx
  - apps/web/src/routes/bestallningar/OrderLineCardList.tsx
  - apps/web/src/routes/bestallningar/OrderLineTable.tsx
  - apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx
  - apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx
  - apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx
  - apps/web/src/routes/bestallningar/__tests__/DiscardDraftDialog.test.tsx
  - apps/web/src/routes/bestallningar/__tests__/MedicationPickerSheet.test.tsx
  - apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx
  - apps/web/vitest.setup.ts
  - packages/shared/src/contracts/order.ts
  - packages/shared/src/contracts/permissions.ts
  - packages/shared/src/index.ts
findings:
  critical: 3
  warning: 9
  info: 6
  total: 18
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Summary

Phase 3 ships the draft-order vertical (schema migration, draft list, compose view, submit + discard). The implementation is largely well-structured: a careUnitId-first service layer, a single error-envelope plugin, Zod contracts shared FE/BE, and an exhaustive integration test (Slice 4). However, an adversarial pass surfaces three blockers and several warnings:

- **CR-01** — `POST /api/orders/:id/lines` does not validate that `careUnitMedicationId` belongs to the caller's `careUnitId`. A user from CareUnit A who knows or guesses a CareUnitMedication id from CareUnit B can add it to their own draft order. The FK constraint accepts it, the picker filter is bypassed because the body is trusted directly, and the subsequent GET denormalises the foreign medication's name/stock into the response — a silent cross-tenant data leak (also a data-integrity bug because `orderResponse.lines[*].currentStock` and `lowStockThreshold` now belong to the wrong vårdenhet's row).
- **CR-02** — `submitOrder` is a Prisma `$transaction` that does no row-level locking (no `SELECT … FOR UPDATE`). Two concurrent submit calls can both pass the `status !== 'utkast'` guard within their snapshots; the atomic `updateMany` with `WHERE status='utkast'` saves us from double-submitting, BUT the same race lets a concurrent `addLineToOrder` / `updateOrderLine` interleave and produce a Skickad order with lines that were never seen by `validateNonEmpty` / `quantity > 0` step 4. The "concurrent updates from two nurses" interview answer the project explicitly designs for (CLAUDE.md §6) is therefore weaker than the comments claim.
- **CR-03** — `softDeleteOrder` performs a non-atomic check-then-act (findUnique → update with `where: { id }` only). Between the read and the write, another request can submit the order (utkast → skickad); the second request's update succeeds anyway and silently soft-deletes a Skickad order — violating D-67 ("only Utkast can be discarded"). Same race as CR-02 but with a confirmed, demonstrable wrong outcome rather than an architectural weakness.

Three warnings touch real correctness (orderResponse contract drift via Prisma poisoning, missing AddOrderLine error-recovery wiring in MedicationPickerSheet, stale-closure bug in QuantityStepper long-press). The remaining warnings/info are quality, drift-prevention, and naming.

## Critical Issues

### CR-01: addLineToOrder does not verify careUnitMedicationId belongs to the caller's careUnit (cross-tenant data leak)

**File:** `apps/api/src/services/order.service.ts:255-271`
**Issue:**

```ts
export async function addLineToOrder(
  careUnitId: string,
  orderId: string,
  lineData: { careUnitMedicationId: string; quantity: number },
): Promise<OrderResponse> {
  await assertOrderEditable(careUnitId, orderId);

  await prisma.orderLine.create({
    data: {
      orderId,
      careUnitMedicationId: lineData.careUnitMedicationId,   // ⚠️ never scope-checked
      quantity: lineData.quantity,
    },
  });

  return getOrderForUnit(careUnitId, orderId);
}
```

`assertOrderEditable` only validates the Order's careUnitId. The body-supplied `careUnitMedicationId` is forwarded directly to Prisma; the FK constraint accepts any existing CareUnitMedication id, including rows owned by other vårdenheter. The integration test suite never exercises a cross-tenant `careUnitMedicationId` (`orders.integration.test.ts:741-757` covers cross-tenant order ids only).

Downstream impact:
- `toOrderLineResponse` denormalises the foreign medication's name / atcCode / form / strength / currentStock / lowStockThreshold into the response — cross-tenant data is read on every subsequent GET.
- Stock numbers from the wrong unit will mislead nurses; "low stock" badges will fire on the wrong inventory.
- Phase 4's deliver transition would decrement stock on the wrong CareUnitMedication if this is not closed first (the line FK points to it).

The class of bug is exactly the one D-16 / T-03-01 are designed to prevent, and it's the explicit scaling-question backstop in CLAUDE.md §6 ("scaling from 1 to 50 vårdenheter").

**Fix:** Validate the CareUnitMedication exists, is not soft-deleted, and belongs to `careUnitId` before creating the line:

```ts
export async function addLineToOrder(
  careUnitId: string,
  orderId: string,
  lineData: { careUnitMedicationId: string; quantity: number },
): Promise<OrderResponse> {
  await assertOrderEditable(careUnitId, orderId);

  const cum = await prisma.careUnitMedication.findUnique({
    where: { id: lineData.careUnitMedicationId },
    select: { careUnitId: true, deletedAt: true },
  });
  if (!cum || cum.deletedAt !== null || cum.careUnitId !== careUnitId) {
    // D-73: 404 to avoid existence-probing across tenants.
    throw new NotFoundError('Läkemedlet hittades inte i din vårdenhets register.');
  }

  await prisma.orderLine.create({
    data: {
      orderId,
      careUnitMedicationId: lineData.careUnitMedicationId,
      quantity: lineData.quantity,
    },
  });

  return getOrderForUnit(careUnitId, orderId);
}
```

Add a corresponding integration test case (cross-tenant cum id → 404).

---

### CR-02: submitOrder transaction does not lock the row — concurrent edits can submit an Order with state that bypassed validation

**File:** `apps/api/src/services/order.service.ts:339-411`
**Issue:** Inside the `$transaction`, the order is read with `findUnique` (no `FOR UPDATE`), validated, then `updateMany` flips status to 'skickad'. Postgres' default isolation is READ COMMITTED, so a concurrent transaction running `addLineToOrder` / `updateOrderLine` / `removeOrderLine` can interleave between Step 1 (read) and Step 5 (UPDATE). The atomic `updateMany` with `WHERE status='utkast'` prevents double-submission, but it does NOT prevent this sequence:

1. T1 (submit): reads order with 1 valid line, passes Step 4 validation.
2. T2 (line CRUD): assertOrderEditable() sees status='utkast' (T1 hasn't UPDATEd yet), inserts/updates a line with quantity=N that wasn't validated.
3. T1: UPDATEs status='skickad', updated.count === 1.
4. T2: commits — the new/updated line is now attached to a Skickad order, never seen by Step 4.

Step 6 reloads, so the returned response reflects T2's writes; the client sees an order it thinks was validated but wasn't. With the production careUnitMedicationId scope-check (CR-01) added, this becomes the dominant concurrency hole. The interview brief explicitly designs for this scenario (CLAUDE.md §6 "concurrent updates from two nurses").

**Fix:** Use `SELECT … FOR UPDATE` on the order inside the transaction. Prisma exposes this via `$queryRawUnsafe` or, on newer versions, via the `lock` argument; the established Phase 4 pattern (STK-02) is `SELECT id FROM "Order" WHERE id = $1 FOR UPDATE`. Pre-Phase-4 minimum:

```ts
await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
```

Then `assertOrderEditable` in line CRUD must also run inside a transaction that takes the same FOR UPDATE lock — or, simpler for v1: do the line-mutation `prisma.orderLine.create/update/delete` inside a `$transaction` whose first statement is `SELECT … FOR UPDATE` on the parent Order. The current architecture comment in the schema (line 119) already promises this — implement it.

If this is deliberately deferred to Phase 4, document it explicitly in the README "Known gaps" section because the brief grades on §6 directly.

---

### CR-03: softDeleteOrder is non-atomic — a Skickad order can be soft-deleted

**File:** `apps/api/src/services/order.service.ts:424-444`
**Issue:**

```ts
export async function softDeleteOrder(careUnitId, orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  // ... validates status === 'utkast' ...
  await prisma.order.update({
    where: { id: orderId },
    data: { deletedAt: new Date() },
  });
}
```

Between the `findUnique` (where status='utkast') and the `update`, another tab can submit the order (status → 'skickad'). The `update` then succeeds because `where: { id: orderId }` has no status precondition. Result: a Skickad order is soft-deleted, violating D-67. The 5-scenario integration test (`orders.integration.test.ts:605-647`) tests the inverse (delete-after-submit returns 409) but only because the single-process sequential nature of `app.inject` removes the race — production behavior under two-tab concurrency is wrong.

**Fix:** Use the same atomic UPDATE-with-precondition pattern that submitOrder uses:

```ts
export async function softDeleteOrder(careUnitId: string, orderId: string): Promise<void> {
  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      careUnitId,
      status: 'utkast',
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) {
    // Disambiguate not-found vs status-changed
    const reload = await prisma.order.findUnique({ where: { id: orderId } });
    if (!reload || reload.deletedAt !== null || reload.careUnitId !== careUnitId) {
      throw new NotFoundError('Beställningen hittades inte.');
    }
    throw new OrderLockedError({ status: reload.status as 'skickad' | 'bekraftad' | 'levererad' });
  }
}
```

This mirrors D-54 exactly and matches the comment on line 27-30 of the service file.

## Warnings

### WR-01: orderResponse contract can be violated by the server's own response — Zod assertion will fail in dev/prod when quantity is poisoned

**File:** `packages/shared/src/contracts/order.ts:44` and `apps/api/src/services/order.service.ts:339-411`
**Issue:** `orderLineResponse.quantity = z.number().int().positive()`. The integration test at `orders.integration.test.ts:686-693` explicitly sets `quantity = 0` via Prisma to exercise the 422 path. That succeeds because the submit endpoint returns 422 before serialising the order. But:
- `GET /api/orders/:id` on the same poisoned draft is wired with `response: { 200: orderResponse }` (`get.ts:24-28`). Loading a draft that has a 0-quantity line will fail the response serializer with a 500. Any administrative repair flow that pokes the DB will brick the compose page until the line is fixed.
- Phase 4's deliver flow may legitimately want quantity=0 (cancelled line). The contract should match server reality (`z.number().int().nonnegative()`) and the submit endpoint should validate `positive` at the boundary it owns.

**Fix:** Either (a) tighten the DB schema (add `CHECK (quantity > 0)` in the migration) and trust the contract, or (b) loosen `orderLineResponse.quantity` to `nonnegative()` and keep the submit-time validation. Option (a) is the right answer; the only writer is the API, which already validates at Zod (`addOrderLineRequest.quantity = z.number().int().positive()`).

---

### WR-02: MedicationPickerSheet closes the sheet before the mutation resolves and never re-opens on error — silent data loss UX

**File:** `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx:85-91`
**Issue:** The comment on lines 35-39 acknowledges the limitation explicitly: "this component calls onOpenChange(false) first; the hook cannot re-open it. ComposeOrderPage should observe mutation error state to conditionally re-open — left as a 'fail silently' UX for Phase 3 (the error toast is the feedback)." That's not a bug-free design: on a 409 order_locked the page re-renders to Mode B (good), but on a transient 500 / network error the user's only feedback is a toast — the line they thought they added simply isn't there, and they have no idea which medication they were trying to pick. This is exactly the failure-mode the project's evaluation criteria (UX ★★★) marks against.

**Fix:** Switch to pessimistic close — wait for mutateAsync before closing. The hook is already pessimistic on success (cache hydration). Minimal change:

```ts
async function handleRowClick(careUnitMedicationId: string) {
  try {
    await addLineMutation.mutateAsync({ orderId, careUnitMedicationId, quantity: 1 });
    onOpenChange(false);
    setQ('');
  } catch {
    // Stay open; hook fires toast. User can retry or pick a different row.
  }
}
```

The 409 lock path will still close because the hook invalidates `['order', id]` and the parent re-renders Mode B (which unmounts the sheet via conditional render).

---

### WR-03: QuantityStepper long-press uses stale `scheduledCommit` closure inside setInterval callback

**File:** `apps/web/src/components/QuantityStepper.tsx:123-133`
**Issue:**

```ts
function startLongPress(step: 1 | -1) {
  longPressInitRef.current = setTimeout(() => {
    longPressRepeatRef.current = setInterval(() => {
      setLocalValue((prev) => {
        const next = step === 1 ? prev + 1 : Math.max(min, prev - 1);
        scheduledCommit(next);   // ← closes over the render-time scheduledCommit
        return next;
      });
    }, 100);
  }, 250);
}
```

`scheduledCommit` is a function defined in the render scope; the long-press callback is captured once via the setTimeout. Each tick calls `scheduledCommit(next)`, which calls the still-mounted `commit(next)` (useCallback over `mutation`). `mutation.mutate` references the React-Query mutation object via the same closure. If the line is removed and the user is still long-pressing, the optimistic update fires for a non-existent lineId; the PATCH 404s. More commonly, the issue is that calling `scheduledCommit(next)` 10× per second installs and clears a 250ms timer 10× per second — the debounce never actually fires until the user releases. That's "intended" by the debounce semantics, but combined with `setLocalValue(prev => prev + 1)` and `mutate` being closure-captured, holding +/- for >3 s without release means the user sees a runaway number with no PATCHes; on release, the final commit fires once. If the user navigates away or the order goes Mode B mid-press, mutate fires against the unmount.

Also: `stopLongPress` does NOT call `flushCommit(localValue)` — so on pointer-up, the debounce timer left in place by the last `scheduledCommit` continues to fire. This is fine for steady-state, but on rapid press-release the cleanup is asymmetric vs. handleIncrement (which calls `scheduledCommit`).

**Fix:** Call `flushCommit` on `stopLongPress`, and call `mutation.mutateAsync` (await + catch) inside `commit` so unmount-races don't throw. Minimum:

```ts
function stopLongPress() {
  if (longPressInitRef.current) { clearTimeout(longPressInitRef.current); longPressInitRef.current = null; }
  if (longPressRepeatRef.current) {
    clearInterval(longPressRepeatRef.current);
    longPressRepeatRef.current = null;
    flushCommit(localValue); // commit the held value immediately on release
  }
}
```

---

### WR-04: useDiscardOrder onSuccess + caller navigate() race — the page can render with a removed cache entry for one frame before navigation runs

**File:** `apps/web/src/features/orders/useOrderMutations.ts:286-291` and `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx:228-237`
**Issue:** `useDiscardOrder.onSuccess` calls `queryClient.removeQueries({ queryKey: ['order', vars.orderId] })`. The caller awaits `mutateAsync` then calls `navigate('/bestallningar')`. Between `removeQueries` (synchronous within React Query's notifier) and the navigate, React can flush a render in which `useOrderQuery(id).data` is now `undefined` — i.e., the ComposeOrderPage renders the "Beställning hittades inte" EmptyStateCard for one paint frame because `data` is undefined and `isError` is false. Cosmetic, but visible flash.

**Fix:** Either (a) navigate first then remove the cache, or (b) don't remove the cache — let it stay until the next list refresh. Option (a) is simplest:

```ts
onConfirm={async () => {
  try {
    navigate('/bestallningar');                  // navigate first
    await discardMutation.mutateAsync({ orderId: order.id });
  } catch { /* hook handles toast */ }
}}
```

ComposeOrderPage unmounts before the cache removal happens, so the user never sees the gap.

---

### WR-05: ComposeOrderPage useEffect cleanup leaks document.title to "MediTrack" on every order.status change

**File:** `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx:65-75`
**Issue:**

```ts
useEffect(() => {
  if (!order) return;
  if (order.status === 'utkast') document.title = 'Nytt utkast — MediTrack';
  else document.title = 'Beställning · Skickad — MediTrack';
  return () => { document.title = 'MediTrack'; };
}, [order?.status]);
```

When order transitions utkast → skickad, the cleanup of the previous effect runs (`document.title = 'MediTrack'`) BEFORE the new effect sets it again. There's no visible flash because React batches this synchronously, but the cleanup also runs on the first render where `!order` and order then arrives — the cleanup of a no-op effect runs, restoring the title to 'MediTrack' before the next render sets it correctly. The bigger issue: on unmount, the title is restored to 'MediTrack', but the user may have come from `/bestallningar` (title was 'Beställningar — MediTrack'). The cleanup is therefore wrong — it should not assume the parent title.

**Fix:** Capture the previous title and restore it:

```ts
useEffect(() => {
  if (!order) return;
  const prev = document.title;
  document.title = order.status === 'utkast'
    ? 'Nytt utkast — MediTrack'
    : 'Beställning · Skickad — MediTrack';
  return () => { document.title = prev; };
}, [order?.status]);
```

Or, more robustly, hoist into a small `useDocumentTitle(title)` hook with proper save/restore.

---

### WR-06: Two TooltipProviders mounted simultaneously when ComposeStickyFooter is rendered alongside OrderLineTable

**File:** `apps/web/src/routes/bestallningar/OrderLineTable.tsx:48-49` and `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx:72`
**Issue:** Both components wrap themselves in `<TooltipProvider>`. Radix tolerates nested providers, but each provider creates its own delayDuration context. The result is two tooltip portals, two scroll-lock observers, and unnecessary subscriber overhead per row. Phase 4 will add a third (RowConfirmDialog?) — the established pattern from Phase 2's MedicationTable hoists TooltipProvider into the page (or the AppShell). This isn't strictly a bug, but it is a maintainability regression.

**Fix:** Hoist `<TooltipProvider>` to ComposeOrderPage (wrapping the whole route) and remove from children.

---

### WR-07: Picker query key does not include `enabled`/`debouncedQ.length === 0` — empty-string query is cached

**File:** `apps/web/src/features/orders/useOrderQueries.ts:72-82`
**Issue:** `queryKey: ['order-picker', q]` with `enabled: q.length > 0`. When `q` is `''`, the query is disabled, but if the user types then deletes, the cache retains the latest non-empty result keyed by the last `q` value. When they reopen the sheet, the search input is reset to `''` (`MedicationPickerSheet.tsx:80-83`), but `usePickerOptionsQuery('', false)` is called — the disabled query short-circuits, so the stale results from the last `q` are NOT shown. However, if any caller passes `q=' '` (whitespace), the schema's `z.string().min(1)` accepts it, and a useless query fires. There's no client-side trim.

**Fix:** Trim the debounced query and tighten the picker schema to `z.string().trim().min(1)` (server) and trim on the FE before passing to `usePickerOptionsQuery`. Also consider `staleTime: 30_000` so revisits within 30 s don't re-fetch.

---

### WR-08: SubmitConfirmationBanner uses role="status" but the page is re-rendered with the banner already present after refresh — no announcement

**File:** `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx:17-27`
**Issue:** The comment says "role='status' triggers a non-interrupting screen-reader announcement when the component mounts (i.e., when the page transitions into Mode B after submit)." That works on the submit transition (cache hydration causes re-render which mounts the banner). But on F5/navigate-direct-to-`/bestallningar/<skickad-order-id>`, the banner is in the initial DOM and many screen readers do NOT announce role="status" content that's present on initial page load. The result: keyboard/AT users who deep-link to a Skickad order miss the confirmation entirely.

The same banner is shown for all post-utkast statuses ("Beställningen är skickad till apotekare.") even though `order.status === 'bekraftad'` or `levererad` are not shown via this banner in Phase 3, but the Mode B code path renders it for ANY non-utkast (`isLocked = !isUtkast`) — Phase 4's bekraftad will inherit "Skickad till apotekare" copy that no longer matches reality.

**Fix:** (a) Use `aria-live="polite"` on a wrapper that's mounted only via the submit transition, OR keep role="status" but render it conditionally only when the page just transitioned (e.g., via a `useEffect` that flips a "justSubmitted" flag based on submitMutation.isSuccess). (b) Branch banner copy on `order.status` — Phase 3 only shows for `skickad`; Phase 4 reuses the slot.

---

### WR-09: useEffect in BestallningarPage / ComposeOrderPage does not restore previous document.title

**File:** `apps/web/src/routes/bestallningar/BestallningarPage.tsx:38-43`
**Issue:** Same pattern as WR-05; `document.title = 'MediTrack'` on cleanup hard-codes the parent. If the route is mounted via SPA navigation from `/lakemedel` (title was 'Läkemedel — MediTrack'), unmounting `/bestallningar` resets to 'MediTrack' rather than restoring the previous title.

**Fix:** Same pattern — capture and restore.

## Info

### IN-01: Seed assumes `belowThreshold > 0` and `cumTotal > 0` — division by zero crashes seed on empty CSV

**File:** `apps/api/prisma/seed.ts:319-324`
**Issue:** `const pct = ((belowThreshold / cumTotal) * 100).toFixed(1)`. If the CSV is empty or all rows are filtered (e.g., bad `nplid` column), `cumTotal === 0` and `pct === 'NaN'`. The seed continues, but the log is meaningless. Not a security issue but a robustness gap.

**Fix:** Guard the divide and log "0 rows seeded" cleanly.

---

### IN-02: createOrderRoute returns the row but does not call `reply.send` — depends on Fastify implicit serialization

**File:** `apps/api/src/routes/orders/create.ts:38-43`
**Issue:** Pattern is fine, but `reply.status(201); return row;` is brittle — if a future maintainer adds `await` between them, the reply may not have its status updated before the handler returns and Fastify's serializer can run on a default 200. Established pattern across the rest of the codebase uses `return reply.status(201).send(row)`.

**Fix:** `return reply.status(201).send(row);` for consistency.

---

### IN-03: orders/index.ts comment claims pickerOptions must be registered BEFORE get — but BOTH are GETs and Fastify's router is a radix tree, not order-dependent

**File:** `apps/api/src/routes/orders/index.ts:13-21`
**Issue:** The comment "must come BEFORE get (:id) to avoid 'picker-options' being parsed as an :id param value" is plausible-sounding but incorrect — Fastify uses find-my-way, which routes static segments before parametric segments regardless of registration order. The current registration works, but the comment will mislead a future maintainer who refactors the file.

**Fix:** Remove the misleading comment or replace with "register order is not significant; find-my-way prefers static `/picker-options` over `/:id`."

---

### IN-04: Unused `OrderResponse` import-as-cast in toOrderListItem mapper

**File:** `apps/api/src/services/order.service.ts:115`
**Issue:** `row.status as OrderListItem['status']` performs an unsound cast — Prisma returns a `OrderStatus` enum literal; the cast loses type information. Same on line 71, 358, 437, 516. The cast is unnecessary because the Prisma enum literal IS one of `'utkast' | 'skickad' | 'bekraftad' | 'levererad'` (matching `orderStatusEnum`). Remove the cast; if the inferred type doesn't line up, the schema/contract drifted and you want a compile error.

**Fix:** Drop `as OrderResponse['status']` / `as OrderListItem['status']` casts and align the shared enum with the Prisma enum (they already share names).

---

### IN-05: orderListResponse.total = rows.length is misleading when pagination is wired

**File:** `apps/api/src/services/order.service.ts:198-202`
**Issue:** `total: rows.length` is correct only because pagination is stubbed (`listOrdersForUnit` ignores `page` / `pageSize` from `orderListQuery`). Phase 7 will wire pagination; if a future maintainer adds `take/skip`, `total` will silently become "rows on this page" instead of "total matching rows" — a classic pagination bug.

**Fix:** Either (a) issue a `prisma.order.count` alongside the `findMany`, or (b) add a TODO comment that explicitly says "when wiring pagination, replace with prisma.order.count". The existing comment ("Pagination is stubbed — Phase 7 will wire pageSize/page properly") doesn't surface in `total`'s callsite.

---

### IN-06: formatRelative ignores future dates — returns "just nu" for clock-skewed createdAt values

**File:** `apps/web/src/routes/bestallningar/DraftCard.tsx:27-45`
**Issue:** If `createdAt` is in the future (server clock ahead of client), `diffMs < 0` and `Math.floor(diffSec / 60) < 1` returns `'just nu'`. Probably fine, but it also masks a real bug if the server-client clocks diverge by >5 minutes. The same function is exported and reused by DraftsTable; a buggy time render is hard to spot.

**Fix:** Clamp `diffMs = Math.max(0, Date.now() - d.getTime())` and surface a single-line warning to dev console if the future-skew is >60 s.

---

_Reviewed: 2026-05-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
