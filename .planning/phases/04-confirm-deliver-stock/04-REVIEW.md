---
phase: 04-confirm-deliver-stock
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - apps/api/prisma/migrations/20260522120000_0006_order_confirm_deliver/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/seed.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/plugins/errorHandler.ts
  - apps/api/src/routes/orders/confirm.ts
  - apps/api/src/routes/orders/deliver.ts
  - apps/api/src/routes/orders/index.ts
  - apps/api/src/routes/orders/list.ts
  - apps/api/src/services/order.service.ts
  - apps/api/test/orders.confirm.integration.test.ts
  - apps/api/test/orders.deliver.integration.test.ts
  - apps/api/test/orders.list.integration.test.ts
  - apps/web/package.json
  - apps/web/src/components/ui/tabs.tsx
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/features/orders/useOrderQueries.ts
  - apps/web/src/routes/bestallningar/ApotekareActionFooter.tsx
  - apps/web/src/routes/bestallningar/BestallningarPage.tsx
  - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
  - apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx
  - apps/web/src/routes/bestallningar/OrderActorTrail.tsx
  - apps/web/src/routes/bestallningar/OrdersCardList.tsx
  - apps/web/src/routes/bestallningar/OrdersTable.tsx
  - apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx
  - apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx
  - packages/shared/src/contracts/order.ts
  - packages/shared/src/contracts/permissions.ts
findings:
  critical: 3
  warning: 9
  info: 7
  total: 19
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-22
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Phase 4 ships confirm/deliver transitions, the apotekare workflow UI, and a status-tab history surface. The transactional choreography on the API (FOR UPDATE on Order row, sorted CUM batch lock, status-precondition updateMany) is largely solid and the concurrency test in `orders.deliver.integration.test.ts` Test 8 is well-thought-out at a high level. However, several real defects surfaced:

1. The `confirmOrderRequest` / `deliverOrderRequest` strict-empty Zod schemas were defined in shared but never wired into the route `schema.body` — extra fields posted by a hostile or buggy client are silently accepted, defeating the documented T-04-02 mass-assignment mitigation.
2. The `OrderTransitionError` thrown on the race path in both confirmOrder (line 567-573) and deliverOrder (line 717-724) hardcodes `from: 'bekraftad'` (confirm) and `from: 'levererad'` (deliver) even though the actual losing status may differ — the FE's localized toast (`Beställningen har redan ${ORDER_STATUS_LABELS[details.from]}.`) will lie to the user.
3. The Levererad seed (`seedOrderInStatus` with `status === 'levererad'`) creates the order and increments stock in two separate, non-transactional steps. A crash between them leaves the order in `levererad` without stock increments; re-runs short-circuit on the idempotency check and never reconcile. The README's "fresh `docker compose up` always lands on this exact state" promise is broken on partial failure.

Several smaller defects (concurrency-test soft-pass, unhandled JSON-Zod error path on a nullable boundary, dead-code `seedDraftOrder`, inconsistent column spec between OrdersTable and its design comment, an UNCHANGED `update: { name }` upsert that quietly mutates rows the seed comment claims are no-ops) round out the findings.

The fix priorities, in order: lock down mass-assignment on confirm/deliver bodies (CR-01); thread the actual loser status through OrderTransitionError on race paths (CR-02); transactionalize the levererad seed (CR-03).

## Critical Issues

### CR-01: Confirm and deliver endpoints accept arbitrary POST bodies — `confirmOrderRequest` / `deliverOrderRequest` strict schemas defined but never wired

**File:** `apps/api/src/routes/orders/confirm.ts:27-33`, `apps/api/src/routes/orders/deliver.ts:27-35`, `packages/shared/src/contracts/order.ts:157-166`

**Issue:** The shared package defines `confirmOrderRequest = z.object({}).strict()` and `deliverOrderRequest = z.object({}).strict()` with a load-bearing comment "T-04-02 mass-assignment mitigation". Neither schema is imported anywhere in `apps/api/`. The confirm/deliver route options only declare `schema: { params: …, response: { 200: orderResponse } }` — no `body` validator. Fastify therefore accepts any JSON body (including `{ "status": "levererad", "deliveredByUserId": "attacker-id" }`). Today the service handlers ignore the body, so this is latent rather than exploitable — but the moment a future patch threads a body field through the handler (the service signature already takes `actorUserId`, which is currently sourced from `req.user!.id`), the missing strict() schema becomes a live mass-assignment hole. This directly contradicts the documented T-04-02 mitigation and the `createOrderRequest` precedent (`apps/api/src/routes/orders/create.ts` uses the strict schema).

**Fix:**
```typescript
// apps/api/src/routes/orders/confirm.ts
import { orderResponse, confirmOrderRequest } from '@meditrack/shared';
// …
r.post(
  '/api/orders/:id/confirm',
  {
    preHandler: [requireSession, requirePermission('order:confirm')],
    schema: {
      params: z.object({ id: z.string().min(1) }),
      body: confirmOrderRequest, // ← add this
      response: { 200: orderResponse },
    },
  },
  …
);
```

Apply the same change in `deliver.ts` with `deliverOrderRequest`.

### CR-02: `OrderTransitionError` on race path lies about the actual loser status — `from` field hardcoded

**File:** `apps/api/src/services/order.service.ts:567-573, 717-724`

**Issue:** Both `confirmOrder` (lines 567-573) and `deliverOrder` (lines 717-724) handle the `updated.count === 0` race-loss path by throwing a synthetic OrderTransitionError with hardcoded `from`:

```typescript
// confirmOrder race-loss path:
throw new OrderTransitionError({
  from: 'bekraftad',   // ← hardcoded; might actually be 'levererad' or 'utkast'
  to: 'bekraftad',
  expected: 'skickad',
});

// deliverOrder race-loss path:
throw new OrderTransitionError({
  from: 'levererad',   // ← hardcoded
  to: 'levererad',
  expected: 'bekraftad',
});
```

The reality the updateMany observed is "status no longer matches `expected`". The actual value at race-loss time can be `bekraftad`, `levererad`, or even `utkast` (if a hostile actor reverted via SQL — unlikely but possible). The FE consumer `useConfirmOrder` / `useDeliverOrder` `onError` constructs a localized toast from `ORDER_STATUS_LABELS[details.from]` (apps/web/src/features/orders/useOrderMutations.ts:301-307, 358-365). When the toast says "Beställningen har redan bekräftats" but the order is in fact `levererad`, the user sees a stale/wrong message — the user-facing reason the OrderTransitionError carries structured `details` is defeated.

More damning: the integration tests Test 3 of both confirm and deliver pass precisely because the loser's status read inside the FOR UPDATE lock matches the hardcoded value. The hardcoded path is ONLY hit when the race window between step 1's `findUnique` and the step 5/9 `updateMany` resolves between them — which is the exact "lost a race we already had the lock for" path that should not normally happen with FOR UPDATE held. If it does happen (e.g., a separately-acquired connection bypasses the lock), the misreported status is a real defect.

**Fix:** Reload the row after the updateMany returns 0 and use its actual status:
```typescript
if (updated.count === 0) {
  const actual = await tx.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  throw new OrderTransitionError({
    from: actual?.status ?? 'bekraftad', // confirm path
    to: 'bekraftad',                     // or 'levererad' for deliver
    expected: 'skickad',                 // or 'bekraftad' for deliver
  });
}
```

Apply symmetrically in `deliverOrder`.

### CR-03: Levererad demo seed splits Order create + per-CUM stock increment across two non-transactional steps — partial-failure leaves DB inconsistent, idempotency check then prevents recovery

**File:** `apps/api/prisma/seed.ts:539, 547-556`

**Issue:** `seedOrderInStatus('levererad', …)` creates the order (line 539) and then increments stock per CUM in a loop (lines 548-553) outside any transaction. If the process crashes (or Postgres connection drops) between the order create and the loop, the database is left with a Levererad order whose lines never debited/credited stock. On the next seed run, the idempotency check at lines 486-501 short-circuits because the Levererad order EXISTS — but the stock was never incremented. The demo path is permanently wrong until manual cleanup.

The dual-write also opens a TOCTOU window where another seed process running concurrently could observe the just-created order and skip its own stock-increment loop. Less likely in a `docker compose up` ENTRYPOINT context but still a latent correctness issue.

The CLAUDE.md goal of "fresh `docker compose up` always lands on this exact state" is broken on any partial failure.

**Fix:** Wrap order create + stock increments in `prisma.$transaction`:
```typescript
if (status === 'levererad' && apotekare) {
  // Atomic create + increment so a crash mid-loop rolls back the order.
  await prisma.$transaction(async (tx) => {
    await tx.order.create({ data });
    for (const cumId of ids) {
      await tx.careUnitMedication.update({
        where: { id: cumId },
        data: { currentStock: { increment: 5 } },
      });
    }
  });
  console.log(`[seed] Levererad order created + stock incremented.`);
  return;
}

await prisma.order.create({ data });
console.log(`[seed] ${statusLabel} order created.`);
```

Idempotency check stays in place; the transaction ensures that "order exists" and "stock incremented" are observable together or not at all.

## Warnings

### WR-01: Concurrency test 8 is timing-dependent and softly self-disables on fast-resolving races

**File:** `apps/api/test/orders.deliver.integration.test.ts:493-549`

**Issue:** Test 8 ("two concurrent deliveries on same Bekraftad order") starts Tx-A, sleeps 50ms, starts Tx-B, then polls pg_locks for at most 300ms. The pg_locks assertion is wrapped in `if (blockedRowsObserved.length > 0)` (line 543) — if the race resolves under 50ms the assertion is skipped and the test still passes on the stock-incremented-exactly-once invariant. A genuinely sequential implementation (deliverOrder synchronously serialized at the application layer) would ALSO pass the stock check because the second call would see status=`levererad` in its own findUnique read and throw OrderTransitionError. The comment at lines 547-549 acknowledges this but presents the allSettled assertion as a correctness backstop — it isn't, for the reason just stated. The "guards against false passes" claim at line 542 only holds when pg_locks observed a blocked tx, which the test does not require.

**Fix:** Two improvements:
1. Make pg_locks observation mandatory (no `if` gate); fail the test if no blocked tx was seen within the polling window.
2. Drop the 50ms `setTimeout` between Tx-A and Tx-B and let them race genuinely; the FOR UPDATE will produce contention regardless.

```typescript
expect(blockedRowsObserved.length).toBeGreaterThan(0); // unconditional
```

If the polling window proves flaky in CI, increase it before relaxing the assertion.

### WR-02: List endpoint pre-parser overrides Zod's array path with no allowlist — `?status=alla,foo` produces a confusing 400, not a clear validation error

**File:** `apps/api/src/routes/orders/list.ts:53-63`

**Issue:** The `preValidation` hook expands `'alla'` to the full status array when it's the sole token. If the value is `'alla,foo'` (string with comma but starts with 'alla'), the `else if (rawStatus.includes(','))` branch splits it into `['alla', 'foo']` — neither matches `orderStatusEnum`, so Zod 400s. That's correct behavior but the error message will refer to position 0 and 1 of the array, which is confusing UX. More subtly: if someone sends `?status=ALLA` (uppercase), the pre-parser does nothing and Zod 400s. The case-sensitivity is undocumented.

A more robust fix would lowercase + dedupe, or normalize 'alla' to the array AFTER comma-split:
```typescript
const rawStatus = rawQuery['status'];
if (typeof rawStatus === 'string') {
  const tokens = rawStatus.includes(',')
    ? rawStatus.split(',').map((s) => s.trim())
    : [rawStatus.trim()];
  if (tokens.length === 1 && tokens[0] === 'alla') {
    rawQuery['status'] = [...ORDER_STATUSES];
  } else if (tokens.length > 1) {
    rawQuery['status'] = tokens;
  }
  // single non-'alla' token: leave for Zod to validate
}
```

**Fix:** Normalize in one pass per above; document case-sensitivity in the route doc-comment.

### WR-03: OrdersTable renders a "Total" column for the `alla` tab in conflict with its own column-spec comment and with OrdersCardList's row text

**File:** `apps/web/src/routes/bestallningar/OrdersTable.tsx:18-23, 110-115, 153-156`

**Issue:** The header comment (lines 18-24) documents the `alla` column set as `Skapad / Status pill / Rader / Skapad av / Öppna` — no Total. The implementation (lines 110-115, 153-156) unconditionally renders a "Total" header AND `<TableCell>{row.totalQuantity}</TableCell>` for every tab including `alla`. Meanwhile, `OrdersCardList.tsx:113-115` correctly omits `· totalt {totalQuantity}` for the `alla` tab. The desktop and mobile views disagree.

This is a UX/spec defect rather than a logic bug: the table for the alla tab shows a column the spec says it shouldn't, and the per-row totalQuantity for utkast orders is 0 (since drafts don't have submitted quantities — wait, yes they do: `lines.reduce(...)`), which adds noise.

**Fix:** Conditionally render the Total column on non-`alla` tabs only, mirroring the Status column pattern (lines 105-109):
```tsx
{tab !== 'alla' && (
  <TableHead className="…">Total</TableHead>
)}
…
{tab !== 'alla' && (
  <TableCell className="px-4 py-3 text-sm">{row.totalQuantity}</TableCell>
)}
```

### WR-04: `seedDraftOrder` is dead code — declared but never called after Phase 4 replaced it with `seedDemoOrders`

**File:** `apps/api/prisma/seed.ts:341-424`

**Issue:** The async `seedDraftOrder` function is declared and remains in the file, but the only caller it had (the Phase 3 main()) was replaced with `await seedDemoOrders(prisma)` at line 328. Comment at line 327 acknowledges the replacement. The function is ~84 lines of unreachable code that will silently drift from `seedOrderInStatus` over time.

**Fix:** Delete `seedDraftOrder` (lines 341-424) and the docstring; the documentation lives in `pickLowStockCumsFor` and `seedOrderInStatus` already.

### WR-05: BestallningarPage tab change discards other query-string params via `setSearchParams({ status })`

**File:** `apps/web/src/routes/bestallningar/BestallningarPage.tsx:86-88`

**Issue:** `setSearchParams({ status: value })` REPLACES the entire query string with just `?status=…`. Any other params the URL might carry (deep-links from Phase 6+ filters, debug flags, etc.) are wiped on tab switch. Phase 7 plans expand this to ?page/?pageSize/?filter, so the bug will materialize then.

**Fix:** Preserve other params:
```typescript
function handleTabChange(value: string) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('status', value);
    return next;
  });
}
```

### WR-06: Confirm route 422-validation_failed empty_order path can fire on an order that already had a line — defense-in-depth check is racy without holding line read in tx

**File:** `apps/api/src/services/order.service.ts:548-554`

**Issue:** Step 4 of `confirmOrder` validates `order.lines.length === 0` and throws ValidationFailedError. The Order row is locked FOR UPDATE at step 0, but OrderLine rows are NOT (the lines table is not part of the order FOR UPDATE lock — Prisma's row-level lock only applies to the Order row). A concurrent line-delete on this Skickad order (which shouldn't be possible since `assertOrderEditable` rejects non-utkast) is in theory blocked by `OrderLockedError`, but defense-in-depth is the whole reason the check exists. The check is correct given the current rules; it's the comment ("Defense-in-depth") that overstates the protection.

This is more a documentation concern than a defect, but worth noting because the comment misleads future maintainers into thinking the check protects against a race that the implementation doesn't actually serialize.

**Fix:** Tighten the comment, or drop the empty_order check entirely on confirm (submit already enforced it, and lines are immutable after Skickad per `assertOrderEditable`).

### WR-07: `Beställningar har redan ${ORDER_STATUS_LABELS[details.from]}` toast template uses the verb-less label — produces grammatically wrong Swedish like "Beställningen har redan Skickad"

**File:** `apps/web/src/features/orders/useOrderMutations.ts:303-305, 362-364`

**Issue:** `ORDER_STATUS_LABELS[details.from]` resolves to nouns/participles like "Skickad", "Bekräftad", "Levererad" (capitalized). The interpolation produces:
- "Beställningen har redan Skickad." → grammatically wrong (should be "Beställningen har redan skickats" or "är redan skickad")
- "Beställningen har redan Bekräftad." → likewise wrong
- "Beställningen har redan Levererad." → likewise wrong

The toast as shipped is broken Swedish. A native speaker will read this as machine-translated. Given the brief (CLAUDE.md) calls out that domain language fidelity is read by the interviewer, this is more than a minor copy nit.

**Fix:** Either add a `verbForm` map ("har redan skickats" / "har redan bekräftats" / "har redan levererats") or rephrase: `Beställningen är redan ${ORDER_STATUS_LABELS[details.from].toLowerCase()}.`

### WR-08: Seed's `CareUnit.upsert` overwrites `name` on every re-run despite docstring claim of "observably idempotent"

**File:** `apps/api/prisma/seed.ts:277-281`

**Issue:** The User upsert uses `update: {}` (no-op on re-run, explicitly documented at line 289-293 as the idempotency contract). The CareUnit upsert at line 277 uses `update: { name: CARE_UNIT_NAME }` — this will UPDATE the name field on every re-run, bumping any field with `@updatedAt` or trail. While `CareUnit` has no `updatedAt` so the visible behavior is unchanged, the pattern breaks the contract documented in the file header ("re-running does not bump updatedAt, does not re-write the hash, does not rotate anything"). Consistency with the User pattern would be clearer.

**Fix:** Use `update: {}` for CareUnit to match the User upsert idiom.

### WR-09: ComposeOrderPage's confirm button handler discards confirmMutation errors via `void`

**File:** `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx:339`

**Issue:** `onClick={() => void confirmMutation.mutateAsync({ orderId: order.id })}` fires the mutation and discards the Promise via `void`. `useConfirmOrder.onError` handles toasts, but if the mutation throws an error not matching any handled code (`order_transition_invalid` / `not_found`), the fallback `toast.error('Kunde inte spara — försök igen.')` does fire — OK. However, the Promise rejection IS observed because TanStack Query awaits it internally; the `void` is only suppressing TypeScript's `no-floating-promises` rule. This is fine in practice but the deliver path (lines 250-271) uses `try/catch` with explicit close-on-expected-error handling. The asymmetry is jarring: confirm has no dialog and no error UX beyond toast; deliver has a dialog that needs to close on expected errors. Worth documenting why confirm doesn't need the same try/catch (no dialog state to manage).

**Fix:** Either add a comment explaining the asymmetry, or unify both paths (confirm could similarly have an AlertDialog like deliver does, given the apotekare-only audience and the irreversibility — but that's a UX call beyond this review).

## Info

### IN-01: `confirmedByUserId: row.confirmedByUserId ?? null` is redundant — the column type is already `string | null`

**File:** `apps/api/src/services/order.service.ts:84, 89`

**Issue:** Prisma generates `confirmedByUserId: string | null` directly. The `?? null` coalescing is a no-op. Same for `deliveredByUserId`. The earlier (Phase 3) `submittedByUserId: row.submittedByUserId` (line 81) omits the coalescing for the same field shape — inconsistency.

**Fix:** Drop `?? null` for both fields.

### IN-02: OrderActorTrail renders a literal " · " separator INSIDE a span, then the parent flex container also adds `gap-x-1` — double-spaced visually

**File:** `apps/web/src/routes/bestallningar/OrderActorTrail.tsx:73-80`

**Issue:** The `<p>` parent has `flex flex-wrap gap-x-1 gap-y-1`. Each segment is wrapped in `<span key={i}>` with the separator " · " (space + dot + space) inside. The result is `[segment1][4px gap][· segment2][4px gap]…` — the surrounding spaces in the literal separator combined with the flex gap produce visible inconsistency on the wrap-line boundary. Subtle but worth fixing.

**Fix:** Drop the `gap-x-1` on the parent (the literal separator spaces are enough), or drop the literal separator's surrounding spaces and rely on gap.

### IN-03: `submitOrder` helper name in confirm integration test shadows the imported service name from deliver integration test

**File:** `apps/api/test/orders.confirm.integration.test.ts:91`

**Issue:** The helper `async function submitOrder(nurseCookie, orderId, cumId)` is named identically to the service export. The confirm test file does NOT import the service `submitOrder`, so no actual shadowing occurs. The deliver test file imports `deliverOrder` but not `submitOrder`. The risk is low but the naming invites future bugs if someone adds `import { submitOrder } from '../src/services/order.service.js'` to the confirm test file expecting to call the service.

**Fix:** Rename the helper to `submitOrderViaApi` or `submitFromDraft` to disambiguate.

### IN-04: `useOrdersByStatusQuery` cache key uses comma-joined string for arrays — but no caller passes an array

**File:** `apps/web/src/features/orders/useOrderQueries.ts:54-62`

**Issue:** The hook signature accepts `OrderStatus | OrderStatus[] | 'alla'` but the only caller (`BestallningarPage.tsx:66`) passes either a single status or the literal `'alla'` — the array branch is dead code in the FE. The implementation is correct (joining `['skickad','bekraftad']` to `'skickad,bekraftad'` for the URL), but the dead array branch adds complexity. Either remove it or document that Phase 7+ uses the array form.

**Fix:** Either drop the array branch from the signature, or add a doc-comment explaining the future use case.

### IN-05: ORDER_STATUS_LABELS lookup falls through to `undefined` if `details.from` is malformed — no `code === 'order_transition_invalid'` schema validation

**File:** `apps/web/src/features/orders/useOrderMutations.ts:302, 361`

**Issue:** `const details = err.envelope.error.details as { from: OrderStatus };` is an unchecked cast. If the BE ever ships a malformed details payload (e.g., `from: 'unknown'`), `ORDER_STATUS_LABELS['unknown']` returns `undefined` and the toast renders "Beställningen har redan undefined." This is defensive paranoia — the BE schema is tight — but matches the same pattern the deliver `medication_removed` block guards against with `if (details.reason === 'medication_removed' && details.medicationName)`.

**Fix:** Optional. Add a safety fallback: `const label = ORDER_STATUS_LABELS[details.from] ?? 'ändrats'; …`

### IN-06: `DeliverConfirmDialog` `className="disabled:opacity-50 disabled:cursor-not-allowed"` is dead — disabled styling is already handled by the AlertDialogAction component

**File:** `apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx:81`

**Issue:** Tailwind's `disabled:` variants on the Action button are likely already provided by the `buttonVariants` cva config in the shadcn AlertDialogAction. Adding them inline duplicates the rule. Not a bug, just noise.

**Fix:** Remove the redundant `className` prop or move to the cva theme.

### IN-07: `prisma` and `prisma.order.create({ data })` in `seedOrderInStatus` use loose `Parameters<…>[0]['data']` type — TS infers an over-wide shape

**File:** `apps/api/prisma/seed.ts:514`

**Issue:** `const data: Parameters<typeof prisma.order.create>[0]['data'] = { … }` types `data` as the entire input shape, including optional nested relation creates. The narrower `Prisma.OrderCreateInput` would catch a future regression where someone adds a misnamed field (e.g., `confirmedByUserId` → `confirmedByUser`). Minor type-safety nit.

**Fix:** Use `import type { Prisma } from '@prisma/client'` and type as `Prisma.OrderCreateInput`.

---

_Reviewed: 2026-05-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
