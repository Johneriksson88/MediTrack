---
phase: 03-draft-orders
plan: "02"
subsystem: fullstack
tags: [fastify, prisma, tanstack-query, react, tdd, rbac, careunit-scoping, drafts-list]
dependency_graph:
  requires:
    - "03-01: Order+OrderLine schema, Zod contracts, OrderLockedError/ValidationFailedError, RBAC keys"
  provides:
    - "POST /api/orders — create empty Utkast Order (RBAC + Zod .strict() body)"
    - "GET /api/orders — list Orders by status for careUnit (sorted createdAt DESC)"
    - "GET /api/orders/:id — full Order with embedded lines (D-47)"
    - "POST/PATCH/DELETE /api/orders/:id/lines — line CRUD (D-54 atomic precondition)"
    - "POST /api/orders/:id/submit — Utkast→Skickad transition (D-56 validate, D-54 atomic)"
    - "DELETE /api/orders/:id — soft-delete draft (D-33/D-67)"
    - "GET /api/orders/picker-options — typeahead for MedicationPickerSheet (D-59)"
    - "order.service.ts with createDraftOrder / listOrdersForUnit / full service layer"
    - "useDraftsQuery + useOrderQuery + usePickerOptionsQuery hooks"
    - "useCreateDraftOrder mutation hook"
    - "/bestallningar drafts list page (replaces Phase 1 stub)"
    - "/bestallningar/:id route with ComposeOrderPage placeholder"
    - "DraftsTable (≥md) + DraftsCardList + DraftCard (<md)"
    - "Swedish formatRelative() helper (inline, no date-fns dependency)"
    - "8 BestallningarPage component tests"
    - "3 orders integration tests (POST create, GET list, unauthenticated 401)"
  affects:
    - apps/api/src/services/order.service.ts
    - apps/api/src/routes/orders/
    - apps/api/src/app.ts
    - apps/api/test/orders.integration.test.ts
    - apps/web/src/features/orders/useOrderQueries.ts
    - apps/web/src/features/orders/useOrderMutations.ts
    - apps/web/src/routes/bestallningar/BestallningarPage.tsx
    - apps/web/src/routes/bestallningar/DraftsTable.tsx
    - apps/web/src/routes/bestallningar/DraftsCardList.tsx
    - apps/web/src/routes/bestallningar/DraftCard.tsx
    - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
    - apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx
    - apps/web/src/router.tsx
tech_stack:
  added:
    - "Swedish formatRelative() helper — inline in DraftCard.tsx (no date-fns)"
  patterns:
    - "TDD RED/GREEN for integration tests (POST/GET /api/orders)"
    - "careUnitId-first service-layer contract (D-16) — all 8 service functions"
    - "Atomic UPDATE-with-precondition (D-54) — assertOrderEditable() shared guard"
    - "D-57 full-Order response on every line op — FE cache hydrates in one round-trip"
    - "Zod .strict() empty body (createOrderRequest) — T-03-02 mass-assignment guard"
    - "404-not-403 for cross-careUnit access (D-73/D-19)"
    - "Inline empty-state card mirroring LakemedelPage geometry (not EmptyStateCard)"
    - "hidden md:block / block md:hidden responsive split (D-72)"
    - "<Can action='order:create'> defense-in-depth gating (D-17)"
key_files:
  created:
    - path: apps/api/src/services/order.service.ts
      role: "Full order service layer — 8 exported functions + 3 mapper helpers"
    - path: apps/api/src/routes/orders/create.ts
      role: "POST /api/orders — createOrderRequest Zod .strict() body, requirePermission('order:create')"
    - path: apps/api/src/routes/orders/list.ts
      role: "GET /api/orders — orderListQuery querystring, careUnit scoped"
    - path: apps/api/src/routes/orders/get.ts
      role: "GET /api/orders/:id — full Order with denormalized lines (D-47)"
    - path: apps/api/src/routes/orders/lines.ts
      role: "POST/PATCH/DELETE /api/orders/:id/lines[/:lineId] — requirePermission('order:update')"
    - path: apps/api/src/routes/orders/submit.ts
      role: "POST /api/orders/:id/submit — validate + atomic Utkast→Skickad transition"
    - path: apps/api/src/routes/orders/delete.ts
      role: "DELETE /api/orders/:id — soft-delete, 409 if not utkast (D-67)"
    - path: apps/api/src/routes/orders/pickerOptions.ts
      role: "GET /api/orders/picker-options — CareUnitMedication typeahead, registered before :id"
    - path: apps/api/src/routes/orders/index.ts
      role: "orderRoutes barrel — all 7 sub-routes registered"
    - path: apps/api/test/orders.integration.test.ts
      role: "3 integration tests: POST create, GET list, unauthenticated 401 (Slice 4 extends)"
    - path: apps/web/src/features/orders/useOrderQueries.ts
      role: "useDraftsQuery / useOrderQuery / usePickerOptionsQuery (stub for Slice 3)"
    - path: apps/web/src/features/orders/useOrderMutations.ts
      role: "useCreateDraftOrder — POST empty draft, invalidates list on success"
    - path: apps/web/src/routes/bestallningar/DraftCard.tsx
      role: "Mobile card — 3-row layout, role=button, aria-label, formatRelative() helper"
    - path: apps/web/src/routes/bestallningar/DraftsCardList.tsx
      role: "Mobile card list barrel mirroring MedicationCardList.tsx"
    - path: apps/web/src/routes/bestallningar/DraftsTable.tsx
      role: "Desktop table — 5 columns, keyboard-accessible rows, ChevronRight icon"
    - path: apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
      role: "Placeholder stub — back link + 'Nytt utkast' heading (Slice 3 replaces body)"
    - path: apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx
      role: "8 component tests — empty state D-70 strings, filled state, Ny beställning navigation"
  modified:
    - path: apps/api/src/app.ts
      role: "Added orderRoutes registration after medicationRoutes"
    - path: apps/web/src/routes/bestallningar/BestallningarPage.tsx
      role: "Replaced Phase 1 <EmptyStateCard> stub with full drafts list page"
    - path: apps/web/src/router.tsx
      role: "Added '/bestallningar/:id' sibling route pointing to ComposeOrderPage"
decisions:
  - "usePickerOptionsQuery and useOrderQuery exported as stubs in Slice 2 — Slice 3 consumes them unchanged"
  - "formatRelative() helper inlined in DraftCard.tsx — no date-fns dep (T-03-SC constraint)"
  - "pickerOptionsRoute registered BEFORE getOrderRoute in barrel — prevents 'picker-options' from matching :id param"
  - "assertOrderEditable() shared guard implements D-54 atomic precondition for all line mutations"
  - "Full order service layer (lines, submit, delete, picker) implemented in Slice 2 — Slices 3-4 only add FE wiring"
metrics:
  duration: "~25m"
  completed_date: "2026-05-21"
  tasks_completed: 3
  files_changed: 17
---

# Phase 3 Plan 02: Drafts List Summary

POST /api/orders + GET /api/orders?status=utkast with careUnit scoping + RBAC + Zod-strict body; complete order service layer (all 8 functions); FE drafts list with mobile/desktop split + empty state + Ny beställning → POST → navigate flow; /bestallningar/:id route placeholder (ComposeOrderPage).

## Tasks Completed

| # | Task | Commit | Key Output |
|---|------|--------|------------|
| 1 (RED) | BE integration tests (TDD RED) | 19954b2 | orders.integration.test.ts — 3 failing tests |
| 1 (GREEN) | order.service.ts + routes + app.ts | 62d9458 | Full service layer + 7 order routes + app.ts registration |
| 2 | FE hooks + router | 2c93792 | useOrderQueries, useOrderMutations, ComposeOrderPage, router.tsx update |
| 3 | BestallningarPage + table/cards + tests | 6b907b3 | Drafts list page, DraftsTable, DraftsCardList, DraftCard, 8 component tests |

## What Was Built

### Task 1 — Backend Service + Routes + Integration Tests

`apps/api/src/services/order.service.ts` exports:
- `createDraftOrder(careUnitId, createdByUserId)` — POST-empty-on-compose-open (D-50)
- `listOrdersForUnit(careUnitId, filters)` — careUnit-scoped, sorted createdAt DESC, lineCount + totalQuantity computed (D-53, D-72)
- `getOrderForUnit(careUnitId, orderId)` — full Order with denormalized lines (D-47); 404 on cross-careUnit (D-73)
- `addLineToOrder` / `updateOrderLine` / `removeOrderLine` — all gate via `assertOrderEditable()` (D-54)
- `submitOrder(careUnitId, orderId, actorUserId)` — validates empty/bad-quantity (D-56), atomic UPDATE (D-54), stamps submittedAt/By (D-49), returns full Order (D-57)
- `softDeleteOrder(careUnitId, orderId)` — 404 if not found, 409 if not utkast (D-67)
- `searchPickerOptions(careUnitId, { q, limit })` — CareUnitMedication typeahead for MedicationPickerSheet (D-59)
- Mapper helpers `toOrderResponse`, `toOrderListItem`, `toOrderLineResponse` (exported)

7 Fastify routes registered in `orderRoutes` barrel. `pickerOptionsRoute` registered first to prevent `'picker-options'` matching the `:id` param. All routes follow requireSession + requirePermission preHandler chain (D-15). `app.ts` registers `orderRoutes` after `medicationRoutes`.

Integration tests: TDD RED committed, then GREEN. 3 tests covering POST create (Zod .strict() mass-assignment guard + careUnit scoping) + GET list (createdAt DESC sort + lineCount/totalQuantity/createdBy.name) + unauthenticated 401. Slice 4 extends this file with the full D-73 test matrix (409, 422, cross-careUnit, etc.) using the TODO comment for `ensureSecondCareUnitSeeded`.

### Task 2 — Frontend Hooks + Route Registration

`useOrderQueries.ts`: `useDraftsQuery` (queryKey `['orders', { status: 'utkast' }]`, keepPreviousData), `useOrderQuery` (retry:false, enabled:!!id), `usePickerOptionsQuery` (stub for Slice 3 — exported now so it compiles).

`useOrderMutations.ts`: `useCreateDraftOrder` (pessimistic POST, invalidates drafts list on success, toasts on error). TODO stubs for Slice 3/4 mutations at bottom of file.

`ComposeOrderPage.tsx`: Back link + 'Nytt utkast' heading + inline placeholder body with 'Slice 3 fyller i denna vy.'. `// TODO Slice 3` comment marks what to replace.

`router.tsx`: `'/bestallningar/:id'` added as sibling route immediately after `'/bestallningar'` (UI-SPEC §IA flat sibling structure, not nested).

### Task 3 — BestallningarPage Drafts List

`BestallningarPage.tsx` replaces the Phase 1 `<EmptyStateCard icon={ClipboardList} heading="Beställningar" />` stub with:
- Loading state: 5 skeleton rows (≥md) + 3 skeleton cards (<md)
- Empty state: inline card (not EmptyStateCard — that component lacks body/action props), matching LakemedelPage geometry. Heading: `Inga utkast ännu`, body: `Skapa en ny beställning för att komma igång.`, CTA: `Ny beställning` (all D-70 locked strings).
- Filled state: `<DraftsTable>` (hidden md:block) + `<DraftsCardList>` (block md:hidden)
- `<Can action="order:create">` wraps both "Ny beställning" buttons (D-17 defense-in-depth)
- `useCreateDraftOrder.mutateAsync()` → on success `navigate('/bestallningar/${response.id}')`
- Document title effect: `'Beställningar — MediTrack'` on mount, `'MediTrack'` on unmount

`DraftsTable.tsx`: 5 columns (Skapad / Rader / Total / Skapad av / Öppna), keyboard-accessible rows (tabIndex=0, onKeyDown Enter/Space), bg-muted/50 header, ChevronRight icon, cursor-pointer hover:bg-muted/50.

`DraftCard.tsx`: Three-row mobile card — relative time + ChevronRight / Skapad av name / lineCount rader · totalt totalQuantity. `role="button"`, `tabIndex={0}`, `aria-label="Öppna utkast skapat <relative>"` per UI-SPEC §A11y. Includes `formatRelative()` helper (inline, no date-fns — T-03-SC constraint satisfied).

`DraftsCardList.tsx`: Thin barrel mirroring MedicationCardList.tsx.

Component tests: 8 tests in `__tests__/BestallningarPage.test.tsx` — empty state D-70 strings (3 tests), filled state DraftsTable/DraftCard rendering (3 tests), Ny beställning click → mutateAsync → navigate (1 test). All pass.

## Deviations from Plan

None — plan executed exactly as written.

The full order service layer (lines, submit, delete, pickerOptions routes) was implemented in Task 1 even though Slices 3-4 own the FE wiring for those endpoints. This is consistent with the plan's `<files>` list which included all route files.

## Known Stubs

1. **ComposeOrderPage** (`apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`, entire body): Placeholder pending Slice 3. The plan explicitly specifies this stub; Slice 3 replaces the body with line list + sticky footer + picker overlay.

2. **useOrderQuery** (`apps/web/src/features/orders/useOrderQueries.ts`): Exported but not yet consumed by any page. Slice 3 wires it in ComposeOrderPage.

3. **usePickerOptionsQuery** (`apps/web/src/features/orders/useOrderQueries.ts`): Exported but not yet consumed. Slice 3 wires it in MedicationPickerSheet.

4. **orders.integration.test.ts** (3 of 5 D-73 scenarios): Full coverage (409, 422, cross-careUnit 404, draft list scoping) lands in Slice 4. The Slice 4 executor must add `ensureSecondCareUnitSeeded()` to `buildTestApp.ts` (TODO comment is in place).

None of these stubs block the plan's goal — ORD-01 (create a draft order) is demoable end-to-end: the seeded draft from Slice 1 is visible on `/bestallningar`, "Ny beställning" creates a new draft and navigates to the placeholder ComposeOrderPage.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`. All four mitigations verified:
- T-03-01: careUnitId in every Prisma where-clause; integration test verifies scoping
- T-03-02: createOrderRequest = z.object({}).strict() — Zod 400 on stray fields confirmed by test
- T-03-04: requirePermission('order:create') preHandler confirmed; unauthenticated 401 test passes
- T-03-AUTH: requireSession returns 401 — sanity inject test passes

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @meditrack/api exec tsc --noEmit` | 0 errors |
| `pnpm --filter @meditrack/api test` (8 files, 46 tests) | All pass |
| `pnpm --filter @meditrack/web exec tsc --noEmit` | 0 errors |
| `pnpm --filter @meditrack/web build` | Success (1740 modules) |
| `pnpm --filter @meditrack/web test` (7 files, 48 tests) | All pass |
| Grep `^export async function (createDraftOrder\|listOrdersForUnit)` in order.service.ts | 2 matches |
| Grep `requirePermission('order:create')` in routes/orders/create.ts | 1 match |
| Grep `requirePermission('order:read')` in routes/orders/list.ts | 1 match |
| Grep `await app.register(orderRoutes)` in app.ts | 1 match |
| Grep `useDraftsQuery\|useOrderQuery\|usePickerOptionsQuery` in useOrderQueries.ts | 3 matches |
| Grep `useCreateDraftOrder` in useOrderMutations.ts | 1 match |
| Grep `'/bestallningar/:id'` in router.tsx | 1 match |
| Grep `Slice 3 fyller i denna vy.` in ComposeOrderPage.tsx | 1 match |
| Grep `Inga utkast ännu` in BestallningarPage.tsx | 1 match |
| Grep `DraftsTable\|DraftsCardList` in BestallningarPage.tsx | 2 matches |

## Self-Check: PASSED
