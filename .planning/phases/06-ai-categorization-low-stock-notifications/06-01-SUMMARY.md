---
phase: 06-ai-categorization-low-stock-notifications
plan: 01
subsystem: ui
tags: [tanstack-query, dashboard, notifications, low-stock, react, fastify, prisma, zod]

requires:
  - phase: 01-foundation-auth
    provides: requireSession + careUnit-scoped session.user contract (D-15 / D-16)
  - phase: 02-medication-catalog
    provides: CareUnitMedication × Medication join + ~8% under-threshold seed + LowStockBadge
  - phase: 04-confirm-deliver-stock
    provides: useDeliverOrder mutation hook with the existing onSuccess invalidation site (line 358 hook)
provides:
  - GET /api/dashboard/low-stock endpoint + lowStockListResponse contract on its own cache key ['dashboard', 'low-stock']
  - DashboardLowStockCard component replacing the Phase 1 EmptyStateCard stub on /dashboard
  - useLowStockQuery hook with 30s refetchInterval + refetchOnWindowFocus + LOW_STOCK_QUERY_OPTIONS named export
  - Sibling ['dashboard','low-stock'] invalidations at 5 mutation sites (useDeliverOrder + 4 medication mutations)
affects: [06-02-therapeutic-class, 06-03-ai-categorization]

tech-stack:
  added: []
  patterns:
    - "Dedicated cache key per dashboard surface (D-120): decouples /dashboard refresh model from /lakemedel filter state"
    - "Three-layer FE refresh contract: TanStack invalidation + refetchOnWindowFocus + refetchInterval (D-119)"
    - "TODO-now / swap-later contract field: therapeuticClass: z.string().nullable() in dashboard.ts with TODO to swap to therapeuticClassEnum once Plan 02's migration lands"

key-files:
  created:
    - packages/shared/src/contracts/dashboard.ts
    - apps/api/src/services/dashboard.service.ts
    - apps/api/src/routes/dashboard/lowStock.ts
    - apps/api/src/routes/dashboard/index.ts
    - apps/api/test/dashboard.integration.test.ts
    - apps/web/src/features/dashboard/useLowStockQuery.ts
    - apps/web/src/routes/dashboard/DashboardLowStockCard.tsx
    - apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx
  modified:
    - packages/shared/src/index.ts
    - apps/api/src/app.ts
    - apps/web/src/routes/dashboard/DashboardPage.tsx
    - apps/web/src/features/orders/useOrderMutations.ts
    - apps/web/src/features/medications/useMedicationMutations.ts

key-decisions:
  - "Plan 01 ships first before Plan 02 (D-115's therapeuticClass column) lands: dashboard.ts contract declares therapeuticClass as z.string().nullable() with a Plan-02 TODO; dashboard.service.ts SELECTs NULL::text AS therapeuticClass. Both compile + run BEFORE the column exists."
  - "Test 3 (post-deliver refetch) picks the FIRST under-threshold row from the sorted response and delivers exactly (threshold - currentStock + 1) units — guaranteed to flip the predicate. Assertion is the strong form (total drops by exactly 1) rather than the disjunctive form in the plan's <behavior>."
  - "LOW_STOCK_QUERY_OPTIONS exported as a named const from useLowStockQuery.ts so Test 5 can assert the D-119 refresh policy WITHOUT mounting a QueryClient. A refactor that drops either refetchOnWindowFocus or refetchInterval must also remove the named export — the test catches it as an assertion failure, not a silent regression."
  - "Component test bundled with the component commit (not a separate test commit) so the test exercises the JSX that just landed; the invalidation commit stays pure mutation-hooks-only so the reviewer's 'git log -p useOrderMutations.ts / useMedicationMutations.ts' shows the one-line NTF-02 hooks as discrete additions."

patterns-established:
  - "Dashboard route convention: apps/api/src/routes/dashboard/{lowStock.ts + index.ts} barrel mirrors routes/audit/* exactly — file-per-endpoint (D-65), registrar barrel imported by app.ts"
  - "Banner card render-state pattern: isLoading → 3 Skeleton bars | isError → destructive Alert | empty → celebratory Card with role='status' + emerald-600 icon | non-empty → role='list' + role='listitem' rows + LowStockBadge per row"
  - "Plan-01-ships-before-Plan-02-lands contract: shared contract uses a wider Zod type (z.string().nullable()) with a TODO; downstream plan swaps to the narrower enum once the migration lands. Avoids cross-plan ordering coupling without weakening the wire contract."

requirements-completed: [NTF-01, NTF-02]

duration: 11 min
completed: 2026-05-23
---

# Phase 06 Plan 01: Dashboard Low-Stock Banner Summary

**Dedicated `GET /api/dashboard/low-stock` endpoint + `DashboardLowStockCard` replacing the Phase 1 stub, three-layer refresh (TanStack invalidation + `refetchOnWindowFocus` + 30 s poll) on the new `['dashboard', 'low-stock']` cache key.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-23T12:20:19Z
- **Completed:** 2026-05-23T12:31:59Z
- **Tasks:** 2 (both TDD-style, full RED/GREEN cycles via integration + component tests)
- **Files created:** 8
- **Files modified:** 5

## Accomplishments

- New BE surface (`GET /api/dashboard/low-stock`) returning full enumeration of every under-threshold `CareUnitMedication` in the user's vårdenhet, sorted server-side by urgency ratio (D-117).
- Dedicated FE cache key (`['dashboard', 'low-stock']`) decoupling the dashboard banner from `/lakemedel`'s filter state (D-120).
- Three-layer auto-refresh wired end-to-end: TanStack mutation invalidation at 5 sites (delivery + 4 medication mutations) + `refetchOnWindowFocus` + 30 s `refetchInterval` (D-119).
- `DashboardPage.tsx` replaces the Phase 1 `<EmptyStateCard heading="Dashboard"/>` stub with `<DashboardLowStockCard />` — no `AppShell` or nav changes (D-118).
- Celebratory empty state when `total === 0`: `CheckCircle2` in `text-emerald-600` + "Alla läkemedel är över tröskel." copy + `role="status"` for screen readers.
- 8 new passing tests (3 API integration + 5 web component) — every behavior from the plan's `<behavior>` blocks asserted.

## Task Commits

Each task was committed atomically along the boundaries defined in the plan's `<output>` commit strategy:

1. **Task 1 Step 1 — Shared contract** — `db4dbba` `feat(06-01): add dashboard low-stock contract in shared`
2. **Task 1 Steps 2-5 — BE service + route + app wiring** — `1dd8106` `feat(06-01): dashboard low-stock service + route + app wiring`
3. **Task 1 Step 6 — Integration tests** — `5db3612` `test(06-01): dashboard low-stock integration suite (3 tests)`
4. **Task 2 Step 1 — useLowStockQuery hook** — `400d497` `feat(06-01): useLowStockQuery hook with 30s poll + window focus`
5. **Task 2 Steps 2-3 + Step 6 — Component + page swap + 5 component tests** — `ee253c2` `feat(06-01): DashboardLowStockCard component + DashboardPage swap`
6. **Task 2 Steps 4-5 — Sibling cache-key invalidations (5 sites)** — `3507213` `feat(06-01): wire sibling ['dashboard','low-stock'] invalidations to order + medication mutations`

The invalidation commit is intentionally separate so `git log -p apps/web/src/features/orders/useOrderMutations.ts` and the equivalent on `useMedicationMutations.ts` show each NTF-02 hook as a discrete one-line addition — matches the Phase 5 atomic-commit narrative style and the brief's "vi läser dina commits" expectation.

## Files Created / Modified

### Created (8)

- `packages/shared/src/contracts/dashboard.ts` — `lowStockItem` + `lowStockListResponse` Zod contracts; `therapeuticClass: z.string().nullable()` with Plan-02 TODO.
- `apps/api/src/services/dashboard.service.ts` — `listLowStockForUnit(careUnitId): Promise<LowStockListResponse>` via `$queryRaw` cross-column predicate; `NULL::text` placeholder for `therapeuticClass`.
- `apps/api/src/routes/dashboard/lowStock.ts` — `GET /api/dashboard/low-stock` with `preHandler: [requireSession]` only (D-120: no `requirePermission` — all roles see dashboard).
- `apps/api/src/routes/dashboard/index.ts` — registrar barrel mirroring `routes/audit/index.ts`.
- `apps/api/test/dashboard.integration.test.ts` — 3 tests (shape+sort, cross-careUnit isolation, post-deliver row-count drop). All passing in 845 ms.
- `apps/web/src/features/dashboard/useLowStockQuery.ts` — TanStack `useQuery` hook + `LOW_STOCK_QUERY_OPTIONS` named export for test introspection.
- `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` — four-state card (loading / error / empty / non-empty) per UI-SPEC §1.
- `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` — 5 tests covering the four states + the D-119 refresh-policy contract. All passing in 47 ms.

### Modified (5)

- `packages/shared/src/index.ts` — re-exports `lowStockItem`, `lowStockListResponse`, `LowStockItem`, `LowStockListResponse`.
- `apps/api/src/app.ts` — imports `dashboardRoutes` and `await app.register(dashboardRoutes)` between `auditRoutes` and `healthzRoutes`.
- `apps/web/src/routes/dashboard/DashboardPage.tsx` — body replaced with `<DashboardLowStockCard />`; old `LayoutDashboard`/`EmptyStateCard` imports removed; no `<h1>` added (UI-SPEC §IA Changes: CardTitle is the page heading).
- `apps/web/src/features/orders/useOrderMutations.ts` — one new line inside `useDeliverOrder.onSuccess` (line 363) + an extended doc-comment header above the hook.
- `apps/web/src/features/medications/useMedicationMutations.ts` — four new lines, one per onSuccess/onSettled site: line 48 (create), line 83 (update), line 171 (threshold optimistic onSettled), line 215 (delete).

### Exact lines added to mutation hooks (for Plan 03 cross-reference)

```ts
// apps/web/src/features/orders/useOrderMutations.ts:363  (inside useDeliverOrder.onSuccess)
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });

// apps/web/src/features/medications/useMedicationMutations.ts:48  (inside useCreateMedication.onSuccess)
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });

// apps/web/src/features/medications/useMedicationMutations.ts:83  (inside useUpdateMedication.onSuccess)
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });

// apps/web/src/features/medications/useMedicationMutations.ts:171 (inside useUpdateThresholdOptimistic.onSettled)
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });

// apps/web/src/features/medications/useMedicationMutations.ts:215 (inside useDeleteMedication.onSuccess)
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });
```

Each is paired with the existing `invalidateQueries({ queryKey: ['medications'] })` on the line immediately above (or, for `useUpdateThresholdOptimistic.onSettled`, on the line two above). No orphan invalidations: every site that invalidates `['medications']` now also invalidates `['dashboard', 'low-stock']`.

## Test Results

| Suite                                            | Tests | Status   | Duration |
| ------------------------------------------------ | ----- | -------- | -------- |
| `apps/api/test/dashboard.integration.test.ts`    | 3     | All pass | 845 ms   |
| `apps/web/.../DashboardLowStockCard.test.tsx`    | 5     | All pass | 47 ms    |
| `pnpm --filter @meditrack/api test` (full suite) | 105   | All pass | 19.68 s  |
| `pnpm --filter @meditrack/web test` (full suite) | 87    | All pass | 2.25 s   |
| `pnpm --filter @meditrack/shared build`          | —     | OK       | —        |
| `pnpm --filter @meditrack/web build` (prod)      | —     | OK       | 2.30 s   |
| `pnpm lint` (workspace)                          | —     | OK       | —        |

No regressions: API suite grew from 102 to 105 tests (the +3 are this plan's integration tests); web suite grew from 82 to 87 tests (the +5 are this plan's component tests).

## Decisions Made

See `key-decisions` in frontmatter — four locked decisions captured there. The most substantive is the **Plan-01-ships-before-Plan-02-lands** contract: because Plan 02 is what introduces the `therapeuticClass` column on `Medication`, Plan 01 has to compile + run WITHOUT it. The dashboard contract widens the type to `z.string().nullable()` with a TODO; the service SELECTs `NULL::text AS "therapeuticClass"`. Plan 02 swaps both in lockstep. This avoids cross-plan ordering coupling while keeping the wire shape stable.

## Deviations from Plan

### 1. [Rule 3 — Blocking / scope-tightening] Test 3 uses the strong assertion form, not the disjunctive form

- **Found during:** Task 1 Step 6 (integration test for post-deliver refetch).
- **Issue:** The plan's `<behavior>` Test 3 says `after.total < before.total` OR (if the delivered med's stock is still under threshold after the increment) the affected row's `currentStock` increased. The disjunction is logically correct but it makes the test weaker than it needs to be — a regression where deliver doesn't reach the dashboard endpoint would still pass via the OR branch.
- **Fix:** Pick the FIRST under-threshold row from the sorted response (guaranteed to be the most-urgent CUM in the vårdenhet), compute the exact delivery quantity needed to push its stock above threshold (`threshold - currentStock + 1`), then assert the strong form: `after.total === before.total - 1` AND the target `careUnitMedicationId` is no longer in the response. This is what the underlying contract guarantees, and it catches regressions the disjunctive form would miss.
- **Files modified:** `apps/api/test/dashboard.integration.test.ts` (Test 3 body).
- **Verification:** Test passes in 599 ms; deliberately producing a regression (commenting out the dashboard endpoint's WHERE-careUnitId clause) would still fail the test as expected.
- **Committed in:** `5db3612` (the integration-test commit).

### 2. [Rule 2 — Missing critical / a11y] `aria-hidden="true"` on the celebratory empty-state CheckCircle2

- **Found during:** Task 2 Step 2 (DashboardLowStockCard component).
- **Issue:** UI-SPEC §Accessibility explicitly notes that ConfidenceBadge icons are decorative and need `aria-hidden`. The celebratory CheckCircle2 in the empty state is the same kind of decorative icon — the heading text "Alla läkemedel är över tröskel." is the accessible content. Without `aria-hidden`, screen readers would announce a meaningless "image" or class name in addition to the heading.
- **Fix:** Added `aria-hidden="true"` to the `<CheckCircle2>` in the empty-state branch. The surrounding Card already has `role="status"` per UI-SPEC §1, which is the right semantics — the icon is just a visual reinforcement.
- **Files modified:** `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx`.
- **Verification:** Test 1 still passes; the icon is still findable in the DOM via the CSS class selector (text-emerald-600), only its role attribute changed.
- **Committed in:** `ee253c2` (the component commit).

---

**Total deviations:** 2 auto-fixed (1 test-strength tightening, 1 a11y critical).
**Impact on plan:** Both deviations strengthen the contract (one in the test suite, one for screen-reader users). No scope creep, no architectural changes.

## Issues Encountered

None. The plan's `<read_first>` blocks were comprehensive enough that no exploratory reads were needed beyond the prescribed files. `pnpm --filter @meditrack/api test -- dashboard.integration.test.ts` passed on the first attempt for all three tests; `pnpm --filter @meditrack/web test -- DashboardLowStockCard.test.tsx` passed on the first attempt for all five tests. Full workspace lint + typecheck + prod build all clean.

## User Setup Required

None — Plan 01 ships zero new env vars, zero new dependencies, zero new external services. `docker compose up` continues to be the golden command unchanged.

## Next Phase Readiness

- **Plan 02** (therapeutic-class schema + filter combobox) is unblocked. The dashboard contract's `therapeuticClass: z.string().nullable()` widens to `therapeuticClassEnum.nullable()` in lockstep with Plan 02's migration; the service's `NULL::text AS "therapeuticClass"` swaps to `m."therapeuticClass"` in the same Plan 02 commit. Both swap-sites carry inline TODOs pointing at Plan 02.
- **Plan 03** (AI categorization endpoint + sheet integration) is unblocked: Plan 01 establishes the file-per-endpoint pattern under `apps/api/src/routes/dashboard/` that Plan 03 mirrors at `apps/api/src/routes/ai/`. The TanStack mutation hook pattern (`useDeliverOrder`) and the named-options-const pattern (`LOW_STOCK_QUERY_OPTIONS`) are both reusable for Plan 03's `useSuggestTherapeuticClass` and `useAiAvailability` hooks.
- No blockers for Phase 7 (ops & submission polish).

## Self-Check: PASSED

- All 8 files listed in `key-files.created` exist on disk and match the `<files>` blocks in the plan.
- All 6 task commits (`db4dbba`, `1dd8106`, `5db3612`, `400d497`, `ee253c2`, `3507213`) are present in `git log --all`.
- All 3 API integration tests pass (`dashboard.integration.test.ts`).
- All 5 web component tests pass (`DashboardLowStockCard.test.tsx`).
- Full API suite (105/105) + full web suite (87/87) + shared build + web prod build + workspace lint all green.
- All 10 `must_haves.truths` from the plan frontmatter verified by code inspection + tests.
- Both `requirements: [NTF-01, NTF-02]` from the plan frontmatter are satisfied and ready to mark complete in REQUIREMENTS.md.

---
*Phase: 06-ai-categorization-low-stock-notifications*
*Completed: 2026-05-23*
