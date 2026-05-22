---
phase: 03-draft-orders
fixed_at: 2026-05-22T11:00:00Z
review_path: .planning/phases/03-draft-orders/03-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-05-22T11:00:00Z
**Source review:** `.planning/phases/03-draft-orders/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning, fix_scope=critical_warning): 12
- Fixed: 12
- Skipped: 0
- Info findings (IN-01..IN-06): out of scope, untouched

**Verification:**
- `pnpm -F @meditrack/api test` — 60/60 passing (was 59/59 pre-fix; +1 cross-tenant CR-01 test)
- `pnpm -F @meditrack/web test` — 82/82 passing (was 79/79 pre-fix; +3 WR-02 / WR-08 tests)
- `pnpm -F @meditrack/{shared,api,web} exec tsc --noEmit` — all clean
- DB migration 0005 (WR-01) applied successfully against the Phase 3 schema

## Fixed Issues

### CR-01: addLineToOrder does not verify careUnitMedicationId belongs to the caller's careUnit

**Files modified:** `apps/api/src/services/order.service.ts`, `apps/api/test/orders.integration.test.ts`
**Commit:** 7b08d13
**Applied fix:** Service now does a careUnitId-scoped findUnique on CareUnitMedication before insert and throws NotFoundError (404, D-73) on cross-tenant / soft-deleted / missing rows. Added integration test (i) seeding a CareUnit B + CUM and asserting User A's add-line attempt returns 404 with no line inserted.

### CR-02: submitOrder transaction does not lock the row

**Files modified:** `apps/api/src/services/order.service.ts`
**Commit:** 4198577
**Applied fix:** Added `tx.$queryRaw\`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE\`` as step 0 of the submit transaction. Concurrent line-mutation or discard transactions now wait on this row lock until submit commits. Closes the read/write race between step 1 (read with lines) and step 5 (atomic UPDATE) in READ COMMITTED isolation. Status: **fixed: requires human verification** for concurrency semantics under load (the syntax check and unit tests cover correctness but not the race itself; Phase 4 STK-02 will exercise this directly with a true concurrency test).

### CR-03: softDeleteOrder is non-atomic — a Skickad order can be soft-deleted

**Files modified:** `apps/api/src/services/order.service.ts`
**Commit:** 14b94b0
**Applied fix:** Replaced findUnique + unconditional update with the atomic updateMany pattern that mirrors submitOrder step 5 (D-54). Single `UPDATE … WHERE id AND careUnitId AND status='utkast' AND deletedAt IS NULL`. On count===0 reloads to disambiguate not-found (NotFoundError → 404) from status-changed (OrderLockedError → 409). The existing integration test continues to pass (app.inject's sequential semantics removed the race in test); Phase 4 STK-02 will add a true concurrency test. Status: **fixed: requires human verification** for concurrency semantics under load.

### WR-01: orderResponse contract drift — quantity = 0 can be poisoned via direct DB writes

**Files modified:** `apps/api/prisma/migrations/20260522000000_0005_order_line_quantity_check/migration.sql` (new), `apps/api/prisma/schema.prisma`, `apps/api/test/orders.integration.test.ts`
**Commit:** 67fc24f
**Applied fix:** New migration 0005 adds `CHECK (quantity > 0)` constraint on OrderLine. Updated schema.prisma comment. The Zod contract stays positive() — DB and contract now agree. Integration test scenario 3 sub-test (b) rewritten: instead of relying on the poison path to test the submit endpoint's invalid_quantity branch (now defense-in-depth, no longer reachable through normal channels), the test asserts BOTH (i) the DB rejects the direct prisma.update with quantity=0 and (ii) the public PATCH route still 400s on quantity=0 via Zod.

### WR-02: MedicationPickerSheet closes the sheet before the mutation resolves

**Files modified:** `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx`, `apps/web/src/routes/bestallningar/__tests__/MedicationPickerSheet.test.tsx`
**Commit:** c69b2e6
**Applied fix:** `handleRowClick` switched from `mutation.mutate()` + immediate close to `await mutation.mutateAsync()` + close on success / stay open on error. The 409 order_locked path still closes the Sheet because the hook's invalidation re-renders ComposeOrderPage into Mode B (which unmounts the Sheet via conditional render). Test (c) updated to verify pessimistic ordering with mutateAsync; added an error-path test that asserts the Sheet does NOT close when mutateAsync rejects.

### WR-03: QuantityStepper.stopLongPress did not call flushCommit

**Files modified:** `apps/web/src/components/QuantityStepper.tsx`
**Commit:** 0f4a5ed
**Applied fix:** `stopLongPress` now calls `flushCommit(localValue)` after clearing the interval ref, mirroring the `handleInputBlur` pattern. The held value is committed synchronously on pointer-up so the trailing 250 ms debounce timer can't outlive the component on Mode B transitions / route navigations / line removals.

### WR-04: useDiscardOrder onSuccess + caller navigate() race

**Files modified:** `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`
**Commit:** ae197f3
**Applied fix:** Discard handler now calls `navigate('/bestallningar')` FIRST, then awaits `discardMutation.mutateAsync(...)`. Navigating synchronously unmounts ComposeOrderPage so the cache eviction in `useDiscardOrder.onSuccess` happens after this route is no longer mounted — eliminating the one-frame "Beställning hittades inte" flash. Existing test (11) still passes (it asserts both calls were made, order-agnostic).

### WR-05: ComposeOrderPage document.title cleanup leaked to "MediTrack"

**Files modified:** `apps/web/src/lib/useDocumentTitle.ts` (new), `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`
**Commit:** 408cce4
**Applied fix:** Extracted a tiny `useDocumentTitle(title)` hook that captures `document.title` on mount / title-change and restores the captured value on cleanup. ComposeOrderPage replaced its hand-rolled effect with the hook; derived `titleForOrder` branches on `order?.status` (utkast / skickad / loading default) so transitions chain correctly across SPA route changes (Läkemedel → Beställning · Skickad → Läkemedel restores correctly).

### WR-06: Two TooltipProviders mounted simultaneously

**Files modified:** `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`, `apps/web/src/routes/bestallningar/OrderLineTable.tsx`, `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx`
**Commit:** fca5978
**Applied fix:** Hoisted a single `<TooltipProvider>` to the ComposeOrderPage Mode A + Mode B return branches. OrderLineTable and ComposeStickyFooter swapped their wrapper for a fragment. Verified DraftsTable doesn't use Tooltip (it doesn't import TooltipProvider — only has a comment mentioning it). Phase 4 components mounted inside the compose route get the provider for free.

### WR-07: Picker query empty-string handling + caching

**Files modified:** `packages/shared/src/contracts/order.ts`, `apps/web/src/features/orders/useOrderQueries.ts`
**Commit:** 7920158
**Applied fix:** Server contract tightened to `z.string().trim().min(1)` so whitespace-only queries are rejected at the boundary. FE `usePickerOptionsQuery` now trims `q` before keying the cache, building the fetch URL, and checking the enabled gate; the two layers agree. Added `staleTime: 30_000` so revisits within 30 s reuse cached results — typeahead with repeated prefixes no longer re-hits Postgres on every Sheet reopen. Shared package rebuilt so the FE picks up the new schema.

### WR-08: SubmitConfirmationBanner role="status" silently dropped on deep-link

**Files modified:** `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx`, `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`, `apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx`, `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx`
**Commit:** 2442a0e
**Applied fix:** SubmitConfirmationBanner now takes `(status, justSubmitted)` props and returns null unless both `status === 'skickad'` AND `justSubmitted === true`. ComposeOrderPage threads `submitMutation.isSuccess` as `justSubmitted` so the banner only mounts on the in-session submit transition — when role="status" actually fires its SR announcement. Deep-link refreshes to a Skickad order now omit the banner entirely (no silent a11y failure). Phase 4 will widen the banner to handle bekraftad / levererad with their own copy. Tests updated: SubmitConfirmationBanner tests cover the 4 prop combinations; ComposeOrderPage tests 7/7b/8 split into "post-submit shows banner" (submitIsSuccess=true) and "deep-link does NOT show banner" (submitIsSuccess=false).

### WR-09: BestallningarPage document.title same hardcoded-cleanup pattern

**Files modified:** `apps/web/src/routes/bestallningar/BestallningarPage.tsx`
**Commit:** 0181040
**Applied fix:** Switched the inline `useEffect(() => { document.title = '...'; return () => { document.title = 'MediTrack'; }; }, [])` to `useDocumentTitle('Beställningar — MediTrack')` (the hook extracted in WR-05). Now restores the previous route's title on unmount instead of hard-coding the bare app name.

## Skipped Issues

None — all 12 in-scope findings were fixed in this iteration.

## Notes

- **Info findings (IN-01..IN-06)** are explicitly out of scope per the task brief (`fix_scope=critical_warning`) and the agent instructions. They remain in 03-REVIEW.md for a future iteration or a manual pass.
- **CR-02 and CR-03** correctness depends on Postgres row-locking semantics that the test suite cannot fully exercise in `app.inject`'s sequential single-process model. Both fixes implement the production-correct pattern (row lock for CR-02, atomic updateMany for CR-03) and are tagged "fixed: requires human verification" — Phase 4 STK-02 will add the true concurrency tests. Static checks (tsc) + behavior tests pass.
- **WR-01 (DB CHECK)** required updating an integration test that previously poisoned `quantity=0` via direct Prisma write. The constraint now blocks that write, so the test asserts the constraint AND the route-level Zod rejection — covering both defenses in depth.
- **WR-05 / WR-09** share a new `useDocumentTitle` hook in `apps/web/src/lib/`. The hook was created in the WR-05 commit; WR-09 just consumes it.

---

_Fixed: 2026-05-22T11:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
