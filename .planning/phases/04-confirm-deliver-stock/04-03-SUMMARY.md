---
phase: "04"
plan: "03"
subsystem: "orders"
tags: ["order-lifecycle", "history", "tdd", "shadcn", "react-query", "seed"]
dependency_graph:
  requires: ["04-01", "04-02"]
  provides: ["order history with status tabs", "list API comma-list/alla filtering", "shadcn Tabs", "seedDemoOrders"]
  affects: ["order.service.ts (already widened)", "list.ts route", "BestallningarPage", "useOrderQueries", "seed.ts"]
tech_stack:
  added:
    - "@radix-ui/react-tabs ^1.1.13 (via pnpm dlx shadcn add tabs)"
  patterns:
    - "ORD-07: URL-backed status tab filter via useSearchParams — ?status=utkast (default) drives Tabs value"
    - "Phase 4 list pre-parser: preValidation hook intercepts ?status before Zod validates; alla → ORDER_STATUSES array, comma-list → split+trim array"
    - "D-85: seedDemoOrders fan-out — 4 per-status seeders, each idempotency-keyed on (careUnitId, createdByUserId, status); Levererad post-step CUM increment inside the idempotency guard"
    - "React Hook rules: both useDraftsQuery + useOrdersByStatusQuery called unconditionally; active status selects which result renders"
    - "pickLowStockCumsFor helper: same 3 CUMs across all 4 demo orders for predictable 30-second demo path"
key_files:
  created:
    - "apps/api/test/orders.list.integration.test.ts"
    - "apps/web/src/components/ui/tabs.tsx"
    - "apps/web/src/routes/bestallningar/OrdersTable.tsx"
    - "apps/web/src/routes/bestallningar/OrdersCardList.tsx"
  modified:
    - "apps/api/src/routes/orders/list.ts"
    - "apps/web/src/features/orders/useOrderQueries.ts"
    - "apps/web/src/routes/bestallningar/BestallningarPage.tsx"
    - "apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx"
    - "apps/api/prisma/seed.ts"
    - "apps/web/package.json"
    - "pnpm-lock.yaml"
decisions:
  - "preValidation Fastify hook chosen for status pre-parser (runs before Zod schema validation; intercepts raw req.query before the type-provider processes it)"
  - "Both useDraftsQuery and useOrdersByStatusQuery called unconditionally per React Hook rules; active status selects which result is displayed"
  - "Tabs component uses className overrides at usage site (underlined-tab aesthetic) not modifying the shadcn primitive — matches UI-SPEC §Components 1 pattern"
  - "seedDraftOrder kept in seed.ts but no longer called — replaced by seedDemoOrders orchestrator for the demo path"
  - "Levererad post-step stock increment uses quantity: 5 (predictable demo quantity) matching the line quantity seeded"
metrics:
  duration: "~45 minutes"
  completed_date: "2026-05-22"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 11
---

# Phase 04 Plan 03: Slice C — History Surface Summary

Delivered the complete order history surface end-to-end: widened the list API to accept comma-list and 'alla' status filtering, installed shadcn Tabs, wired a URL-backed 5-tab history view on `/bestallningar` with per-tab column sets and mobile card variants, and extended the seed to produce one demo order per status with idempotent Levererad stock post-step.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing list-API integration tests (7-scenario ORD-07 suite) | `f6dde9b` | orders.list.integration.test.ts |
| 1 (GREEN) | widen list API — 'alla' + comma-list pre-parser | `9afb96f` | list.ts |
| 2 | Install shadcn Tabs + useOrdersByStatusQuery + BestallningarPage tabbed history | `484f03e` | tabs.tsx, OrdersTable.tsx, OrdersCardList.tsx, useOrderQueries.ts, BestallningarPage.tsx, BestallningarPage.test.tsx, package.json, pnpm-lock.yaml |
| 3 | Seed extension — seedDemoOrders with all four statuses + Levererad post-step stock | `ef415c0` | seed.ts |

## What Was Built

**List API pre-parser (Task 1):** `preValidation` hook on GET /api/orders intercepts `req.query.status` before Zod validation. `'alla'` expands to `ORDER_STATUSES` array; comma-separated strings split and trimmed into an array; single values and absent params pass through unchanged. Zod's `z.union([orderStatusEnum, z.array(orderStatusEnum)])` then validates the result, rejecting invalid tokens with HTTP 400 (T-04-18). The `listOrdersForUnit` service was already widened in Slices A/B to accept `{ in: status[] }` — no service changes needed.

**Integration tests (Task 1):** 7 scenarios with direct Prisma fixtures for non-utkast statuses (avoids coupling to endpoint availability). Tests cover: back-compat default (no param → utkast), single status, comma-list (skickad,bekraftad,levererad), alla literal expanding to all four, cross-careUnit isolation (T-04-17), invalid token rejection (T-04-18), and actor field shape verification for a bekraftad order.

**shadcn Tabs (Task 2):** Installed via `pnpm dlx shadcn add tabs` — added `@radix-ui/react-tabs ^1.1.13` to `apps/web/package.json` and generated `apps/web/src/components/ui/tabs.tsx` exporting `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

**useOrdersByStatusQuery (Task 2):** Parallel to `useDraftsQuery`. Accepts `OrderStatus | OrderStatus[] | 'alla'`. Query key `['orders', { status: statusKey }]` where `statusKey` is the comma-joined string for arrays. Sends the status verbatim to the API (the BE pre-parser handles expansion). `keepPreviousData` for smooth tab transitions.

**OrdersTable (Task 2):** Desktop table (≥md) for non-Utkast tabs. Columns branch on `tab` prop per UI-SPEC §1 Column Spec: Skickad/Bekräftad/Levererad show their respective timestamp + actor; Alla shows createdAt + OrderStatusPill + createdBy. Full row clickable → `navigate('/bestallningar/:id')` with `aria-label="Öppna beställning från {formatRelative(relevantAt)}"`.

**OrdersCardList (Task 2):** Mobile card list (<md). Per-tab card anatomy per UI-SPEC §1 Mobile Card Variants. Alla tab adds `OrderStatusPill` on the top row and omits "totalt {sum}" from the bottom row per spec. Each card is a `<button type="button">` with keyboard accessibility.

**BestallningarPage tabbed history (Task 2):** URL-backed status tabs via `useSearchParams`. Default `'utkast'` when param absent (Phase 3 back-compat). `<Tabs value={status} onValueChange={(v) => setSearchParams({ status: v })}>` — underlined-tab aesthetic per UI-SPEC §1. Both hooks called unconditionally (React Hook rules). Utkast tab reuses Phase 3 `DraftsTable`/`DraftsCardList` unchanged. Per-tab empty states: Utkast keeps EmptyStateCard+CTA; non-Utkast tabs show inline `<p className="text-sm text-muted-foreground py-12 text-center">`.

**Seed extension (Task 3):** `pickLowStockCumsFor(prisma, careUnitId, n)` extracted helper returns the same 3 demo CUMs across all four orders. `seedOrderInStatus(status, sjukskoterska, apotekare, cumIds)` idempotency-keyed on `(careUnitId, createdByUserId, status, deletedAt: null)`. Actor stamps: utkast (none), skickad (+submittedAt/By), bekraftad (+confirmedAt/By), levererad (+deliveredAt/By). Levererad post-step: `careUnitMedication.update({ currentStock: { increment: 5 } })` per CUM, inside the idempotency guard so re-runs never double-increment (T-04-21). `seedDemoOrders` orchestrator replaces `seedDraftOrder` call in `main()`. Clean run: 4 "created" messages + stock increment. Re-run: 4 "skipping (idempotent)" messages.

## Verification

- API tests: 81/81 pass (7 new in `orders.list.integration.test.ts`)
- Web tests: 82/82 pass (BestallningarPage.test.tsx updated with `useOrdersByStatusQuery` mock)
- Web typecheck: `tsc --noEmit` exits 0
- Web build: `vite build` exits 0 (641kB bundle; chunk size warning is pre-existing)
- Seed run 1: 4 "created" messages + Levererad stock increment
- Seed run 2: 4 "skipping (idempotent)" messages, no stock changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BestallningarPage.test.tsx mock missing useOrdersByStatusQuery**
- **Found during:** Task 2 — web test run
- **Issue:** `vi.mock('@/features/orders/useOrderQueries')` factory only exported `useDraftsQuery`; calling `useOrdersByStatusQuery()` from `BestallningarPage` threw `[vitest] No "useOrdersByStatusQuery" export is defined on the mock`
- **Fix:** Added `useOrdersByStatusQuery: vi.fn()` to mock factory; added import, mocked constant, and stub return value in `mockDraftsQuery` helper
- **Files modified:** `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx`
- **Commit:** `484f03e`

**2. [Rule 3 - Blocking] node_modules not installed in worktree (same as Slice B)**
- **Found during:** Task 1 RED phase
- **Issue:** `vitest` not found in worktree node_modules
- **Fix:** Ran `pnpm install --frozen-lockfile` + `pnpm exec prisma generate` to install deps and regenerate Prisma client
- **Files modified:** None (dependency install only)
- **Commit:** N/A

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — `test(04-03)` commit | `f6dde9b` | PASSED |
| GREEN — `feat(04-03)` commit after RED | `9afb96f` | PASSED |
| REFACTOR | not needed | N/A |

## Known Stubs

None — all data flows are wired end-to-end. The history surface reads from real order data. The seed produces real demo orders. useOrdersByStatusQuery fetches real API data.

## Threat Flags

None beyond what is already declared in the plan's threat register:

| Threat | File | Status |
|--------|------|--------|
| T-04-17 (cross-careUnit isolation) | list.ts + order.service.ts | Mitigated — Test 5 in integration suite proves careUnit-B orders invisible to careUnit-A |
| T-04-18 (crafted ?status=foo) | list.ts preValidation | Mitigated — Zod rejects after pre-parser; Test 6 proves 400 for invalid tokens |
| T-04-21 (seed re-run stock double-increment) | seed.ts | Mitigated — findFirst guard covers both order create AND post-step increment |
| T-04-SC (@radix-ui/react-tabs via shadcn) | apps/web/package.json | Accepted — official shadcn registry; mirrors all prior shadcn installs in the project |

## Self-Check

| Check | Result |
|-------|--------|
| orders.list.integration.test.ts | FOUND |
| tabs.tsx | FOUND |
| OrdersTable.tsx | FOUND |
| OrdersCardList.tsx | FOUND |
| list.ts pre-parser | FOUND |
| useOrdersByStatusQuery in useOrderQueries.ts | FOUND |
| BestallningarPage useSearchParams + Tabs | FOUND |
| seedDemoOrders in seed.ts | FOUND |
| Commit f6dde9b (Task 1 RED) | FOUND |
| Commit 9afb96f (Task 1 GREEN) | FOUND |
| Commit 484f03e (Task 2 FE) | FOUND |
| Commit ef415c0 (Task 3 seed) | FOUND |

## Self-Check: PASSED
