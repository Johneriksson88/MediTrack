---
phase: "08"
plan: "03"
subsystem: orders
tags: [picker-suggestions, pre-search-ux, low-stock, most-ordered, deduplication, cross-tenant-isolation]
dependency_graph:
  requires:
    - "08-01"  # MedicationPickerSheet scaffolded
    - "06-01"  # listLowStockForUnit (D-138 anti-duplication)
  provides:
    - "GET /api/orders/picker-suggestions"
    - "PickerSuggestionsBlock component"
    - "usePickerSuggestionsQuery hook"
  affects:
    - "packages/shared/src/contracts/order.ts"
    - "packages/shared/src/contracts/dashboard.ts"
    - "apps/api/src/services/order.service.ts"
    - "apps/api/src/services/dashboard.service.ts"
    - "apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx"
tech_stack:
  added: []
  patterns:
    - "D-138 service reuse (listLowStockForUnit provides lowStock half without second $queryRaw)"
    - "D-135 set-based deduplication with LIMIT 6 fallthrough for most-ordered"
    - "D-137 hide-on-keystroke gate via debouncedQ === '' conditional render"
    - "T-08-02 cross-tenant scope assertion (NotFoundError not 403 — disclosure-safe)"
    - "D-65 route registration order (pickerSuggestionsRoute before getOrderRoute)"
key_files:
  created:
    - "packages/shared/src/contracts/order.ts (pickerSuggestion + pickerSuggestionsResponse schemas)"
    - "apps/api/src/routes/orders/pickerSuggestions.ts"
    - "apps/api/test/orders.pickerSuggestions.integration.test.ts (7 tests)"
    - "apps/web/src/features/orders/usePickerSuggestionsQuery.ts"
    - "apps/web/src/routes/bestallningar/PickerSuggestionsBlock.tsx"
    - "apps/web/src/routes/bestallningar/__tests__/PickerSuggestionsBlock.test.tsx (7 tests)"
  modified:
    - "packages/shared/src/contracts/dashboard.ts (widened lowStockItem with atcCode/form/strength)"
    - "packages/shared/src/index.ts (re-exports for new schemas)"
    - "apps/api/src/services/dashboard.service.ts (widened SELECT + inline type)"
    - "apps/api/src/services/order.service.ts (listPickerSuggestions function added)"
    - "apps/api/src/routes/orders/index.ts (pickerSuggestionsRoute registration)"
    - "apps/api/test/dashboard.integration.test.ts (3 assertions for new fields)"
    - "apps/web/src/features/orders/useOrderMutations.ts (invalidation on addLine success)"
    - "apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx (PickerSuggestionsBlock wired)"
    - "apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx (mock fixtures updated)"
decisions:
  - "D-138 compliance: listLowStockForUnit reused for lowStock half — no second $queryRaw for low-stock data in order.service.ts"
  - "D-135 deduplication: set-based filter on careUnitMedicationId; Lågt lager wins; most-ordered queries LIMIT 6 to allow 6th-ranked fallthrough"
  - "PICKER_SUGGESTIONS_QUERY_OPTIONS is a factory function (takes orderId argument) not a static const — orderId drives both queryKey and enabled flag"
  - "Tests E and F use isolated care units (fresh prisma.careUnit.create) to avoid seeded data interference in dedupe invariant tests"
metrics:
  duration: "~35 minutes (cross-context continuation)"
  completed: "2026-05-24T19:46:23Z"
  tasks_completed: 3
  files_created: 6
  files_modified: 10
---

# Phase 8 Plan 03: ORD-08 Pre-Search Picker Suggestions Summary

**One-liner:** Full-stack ORD-08 implementation — GET /api/orders/picker-suggestions with service-layer deduplication (D-135), shared low-stock service reuse (D-138), PickerSuggestionsBlock component with hide-on-keystroke gate (D-137), and 14 tests (7 BE integration + 7 FE component).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | BE contracts + service + route + integration tests | `0ca3aa9` | 8 files |
| 2 | TanStack hook + PickerSuggestionsBlock component + mutation invalidation | `73054c4` | 5 files |
| 3 | Wire block into MedicationPickerSheet + 7 component tests | `acfaac0` | 2 files |

## What Was Built

### Shared Contracts (packages/shared)

`pickerSuggestion` extends `pickerOption` with `medicationId`. `pickerSuggestionsResponse` wraps `{ mostOrdered, lowStock }` arrays of `PickerSuggestion`.

`lowStockItem` widened with `atcCode: z.string()`, `form: z.string()`, `strength: z.string().nullable()` (D-138 — enables listLowStockForUnit to feed the lowStock half of picker suggestions without a second raw query).

### Backend

**`listPickerSuggestions(careUnitId, orderId)`** in `order.service.ts`:
- T-08-02 scope assertion: loads order, checks `row.careUnitId !== careUnitId` → `NotFoundError` (disclosure-safe 404)
- D-136 most-ordered query: `COUNT(ol.id)` over all OrderLines, LIMIT 6 (extra slot for D-135 fallthrough)
- D-138 low-stock half: calls `listLowStockForUnit(careUnitId)`, slices top 5, maps to `PickerSuggestion` (drops `therapeuticClass`)
- D-135 deduplication: Set of lowStock careUnitMedicationIds; filters most-ordered; slices to 5

**Route `GET /api/orders/picker-suggestions`** with `requireSession` + `requirePermission('order:create')`, Zod querystring validation `{ orderId: string.min(1) }`, `pickerSuggestionsResponse` response schema.

**Route registration** (D-65): `pickerSuggestionsRoute` registered after `pickerOptionsRoute` and before `getOrderRoute` (which captures `:id`) to prevent param collision.

### Frontend

**`usePickerSuggestionsQuery`**: `PICKER_SUGGESTIONS_QUERY_OPTIONS(orderId)` factory returns `{ queryKey: ['order-picker-suggestions', orderId], staleTime: 30_000, refetchOnWindowFocus: false, enabled: orderId.length > 0 }`. Hook wraps `useQuery` with `fetchJson('/api/orders/picker-suggestions?orderId=...')`.

**`useAddOrderLine` mutation invalidation**: `void queryClient.invalidateQueries({ queryKey: ['order-picker-suggestions', vars.orderId] })` added to `onSuccess` — ensures most-ordered ranking refreshes after a line is added.

**`PickerSuggestionsBlock`**: loading skeletons → error Alert → loaded state. Empty surface (`mostOrdered.length === 0 && lowStock.length === 0`) renders "Sök på namn för att lägga till ett läkemedel." fallback. When sections have rows, sticky-header divs (token-class colors only, no hex literals per UI-SPEC) + `SuggestionRow` buttons with `LowStockBadge` when `currentStock < lowStockThreshold`.

**`MedicationPickerSheet`** hide-on-keystroke gate (D-137): `{debouncedQ === '' && <PickerSuggestionsBlock orderId={orderId} onRowClick={handleRowClick} />}` inserted before loading/empty/results branches. Uses existing `useDebounce(q, 150)` — no new debounce hook needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DashboardLowStockCard test mock objects missing new required fields**
- **Found during:** Task 1 (widening `lowStockItem` schema)
- **Issue:** `packages/shared/src/contracts/dashboard.ts` widened `lowStockItem` with `atcCode`, `form`, `strength` as required fields. Three mock row objects in `DashboardLowStockCard.test.tsx` (Test 2) were missing these fields, causing TS2739 compile errors.
- **Fix:** Added `atcCode`, `form`, `strength` to each of the three mock rows.
- **Files modified:** `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx`
- **Commit:** `0ca3aa9`

**2. [Rule 1 - Bug] PickerSuggestionsBlock Test 1 failing with multiple-element match**
- **Found during:** Task 3 (writing component tests)
- **Issue:** `screen.getByText('Lågt lager')` found multiple elements — both the section header `<div>` and the `<LowStockBadge>` span render the string "Lågt lager". Testing Library throws when `getByText` matches multiple elements.
- **Fix:** Changed to `screen.getAllByText('Lågt lager')`, asserted `length >= 2`, then located the badge by `tagName === 'span'` to verify LowStockBadge rendered.
- **Files modified:** `apps/web/src/routes/bestallningar/__tests__/PickerSuggestionsBlock.test.tsx`
- **Commit:** `acfaac0`

**3. [Rule 1 - Bug] Integration Tests E and F depended on seeded data ordering**
- **Found during:** Task 1 (running BE integration tests)
- **Issue:** Tests E and F (dedupe invariant and dedupe fallthrough) initially modified seeded CUM stock values to trigger low-stock status, then expected the target CUM in the top-5 of lowStock. But seeded data had many CUMs at ratio 0.0, and the urgency-ratio sort with name-based tiebreak meant the target CUM was not guaranteed to appear in the first 5 rows.
- **Fix:** Rewrote Tests E and F to create fully isolated care units (`prisma.careUnit.create`) with controlled medications and no seeded interference. Cleanup runs in `afterEach`.
- **Files modified:** `apps/api/test/orders.pickerSuggestions.integration.test.ts`
- **Commit:** `0ca3aa9`

### D-138 $queryRaw Count Note

The plan's done-criteria states `wc -l` of `$queryRaw` should return 1. The `order.service.ts` file already contained 4 `$queryRaw` calls from prior phases (`submitOrder`, `confirmOrder`, `deliverOrder` lock patterns). `listPickerSuggestions` adds one more (the most-ordered query). The D-138 intent is satisfied — only **one** `$queryRaw` fetches picker suggestion data, and the low-stock half reuses `listLowStockForUnit`. The raw count (now 8 occurrences) reflects prior-phase work, not a violation.

## Known Stubs

None — all data paths are wired end-to-end. `PickerSuggestionsBlock` fetches from the real API hook (`usePickerSuggestionsQuery`) which hits the authenticated `/api/orders/picker-suggestions` endpoint.

## Threat Flags

No new trust-boundary surfaces beyond what the plan modeled. `GET /api/orders/picker-suggestions` is gated by `requireSession` + `requirePermission('order:create')` and the T-08-02 cross-tenant scope assertion. All three roles (sjukskoterska, apotekare, admin) are granted `order:create`, matching the existing picker options route RBAC.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `apps/api/src/routes/orders/pickerSuggestions.ts` | FOUND |
| `apps/web/src/features/orders/usePickerSuggestionsQuery.ts` | FOUND |
| `apps/web/src/routes/bestallningar/PickerSuggestionsBlock.tsx` | FOUND |
| `apps/api/test/orders.pickerSuggestions.integration.test.ts` | FOUND |
| `apps/web/src/routes/bestallningar/__tests__/PickerSuggestionsBlock.test.tsx` | FOUND |
| Commit `0ca3aa9` (Task 1) | FOUND |
| Commit `73054c4` (Task 2) | FOUND |
| Commit `acfaac0` (Task 3) | FOUND |
| `pnpm verify` (131 API + 114 web tests, lint, typecheck, build) | PASSED |
