---
phase: 09-dashboard-depth-back-nav
plan: 03
subsystem: ui
tags: [react, tanstack-query, vitest, dashboard, discriminated-union, role-aware, three-layer-refresh]

# Dependency graph
requires:
  - phase: 09-dashboard-depth-back-nav
    plan: 01
    provides: "useBestallningarBackLink hook + ?from= URL-state convention — Slice C row links pass ?from=<row.status> at construction so the helper resolves correctly on back-nav from /bestallningar/:id"
  - phase: 09-dashboard-depth-back-nav
    plan: 02
    provides: "GET /api/dashboard/orders endpoint + listDashboardOrdersForUser service + dashboardOrdersResponse Zod discriminated union — Slice C consumes the contract verbatim via @meditrack/shared"
  - phase: 06-ai-categorization-low-stock-notifications
    provides: "DashboardLowStockCard celebratory empty-state pattern (role=status + emerald CheckCircle2), useLowStockQuery LOW_STOCK_QUERY_OPTIONS named-export pattern, three-layer refresh model (D-119), and the existing ['dashboard', 'low-stock'] invalidation in useDeliverOrder"
  - phase: 04-confirm-deliver-stock
    provides: "BestallningarPage ?status=<tab> URL contract that the section-header links target"
provides:
  - "useDashboardOrdersQuery hook + DASHBOARD_ORDERS_QUERY_OPTIONS named export (queryKey + refetchOnWindowFocus + refetchInterval — testable without mount)"
  - "DashboardOrdersCard role-discriminated component covering 4 render states × 2 role subviews"
  - "DashboardPage 2-column responsive grid mounting both DashboardLowStockCard + DashboardOrdersCard"
  - "5 mutation invalidations against ['dashboard', 'orders'] in useOrderMutations.ts (createDraft, submit, confirm, deliver, discard)"
  - "Verified pattern: row Link with ?from=<row.status> feeding Slice A's useBestallningarBackLink helper"
affects:
  - "Phase 10 (ORD-11 — order numbers): row content can adopt the new ORD-… string when the contract bumps; row layout already accommodates a third text line."
  - "SC#4 sc04 screenshot harness: docs/screenshots/sc04-360-dashboard.png must be re-captured to reflect the new 2-column grid. CONTEXT.md <specifics> line 351-353 captures this as a post-phase chore, NOT a Phase 9 commit."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-discriminated UI on a Zod-union server payload: FE narrows via `if (data.role === 'sjukskoterska')` so the TS compiler enforces subview-shape matching across both branches."
    - "Section-with-preview FE primitive: a Section sub-component takes { title, count?, statusHref, rows } and renders CardHeader (section link) + count CardDescription + role='list' container of row Links — reusable for any future role-scoped dashboard section."
    - "Named-const query options export (`DASHBOARD_ORDERS_QUERY_OPTIONS`) so component tests assert the refresh-policy contract without mounting a QueryClient — same pattern Phase 6 established with LOW_STOCK_QUERY_OPTIONS."

key-files:
  created:
    - "apps/web/src/features/dashboard/useDashboardOrdersQuery.ts — useDashboardOrdersQuery hook + DASHBOARD_ORDERS_QUERY_OPTIONS named const (D-141, D-142, D-148)"
    - "apps/web/src/routes/dashboard/DashboardOrdersCard.tsx — role-discriminated card with Section + EmptyState sub-components (D-141, D-142, D-145, D-146, D-147, D-148)"
    - "apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx — 9 it/it.each blocks (10 scenarios when apotekare+admin in it.each are counted separately); covers nurse + pharmacist subviews × 4 render states + ?from= row link + section-header URL map + DASHBOARD_ORDERS_QUERY_OPTIONS contract"
  modified:
    - "apps/web/src/features/orders/useOrderMutations.ts — 5 onSuccess callbacks each gain one-line invalidateQueries({ queryKey: ['dashboard', 'orders'] }) + matching one-line comment + docblock update citing D-148 (useCreateDraftOrder, useSubmitOrder, useConfirmOrder, useDeliverOrder, useDiscardOrder)"
    - "apps/web/src/routes/dashboard/DashboardPage.tsx — replaced single-card body with the locked 2-column grid (grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto p-4 md:p-6 lg:p-8); docblock widened to cite D-145 and D-146"

key-decisions:
  - "Honored D-141 verbatim: dedicated cache key ['dashboard', 'orders'], decoupled from ['orders', filters]"
  - "Honored D-142 verbatim: FE narrows on data.role; nurse and pharmacist/admin subviews emit distinct JSX trees"
  - "Honored D-145 verbatim: grid grid-cols-1 md:grid-cols-2 — single column mobile, two columns at md+"
  - "Honored D-146 verbatim: DashboardLowStockCard first (left/top), DashboardOrdersCard second (right/bottom)"
  - "Honored D-147 verbatim: celebratory empty state per role with text-emerald-600 CheckCircle2 + role='status' Card (NOT the shared empty-state primitive — its icon defaults to slate-400)"
  - "Honored D-148 verbatim: three-layer refresh (refetchOnWindowFocus + refetchInterval 30s + 5 sibling invalidations); useDeliverOrder retains BOTH ['dashboard', 'low-stock'] and ['dashboard', 'orders'] invalidations (additive, not replacement)"
  - "Honored D-144 row content lock: top line is formatRelative(createdAt), middle is 'Skapad av {name}', bottom is '{N} rad{er} · totalt {Q}' with singular/plural Swedish"
  - "Section render-empty-with-placeholder rule: when a section's overall data is non-empty but its rows array is empty (e.g., nurse has 2 utkast and 0 history), the section keeps its header + 'Inga rader.' placeholder rather than collapsing — symmetry across the two sections matters more than minimum chrome"
  - "Test 6 fix: used cleanup() + fresh renderWithProviders() to switch between subviews mid-test; rerender() after unmount fails with 'Cannot update an unmounted root'"
  - "Rephrased two docblock comments (the EmptyStateCard-don't-use note and the no-h1 note) to drop literal token references — the AC greps treat those literals strictly so the design rationale was kept but rephrased"

patterns-established:
  - "Two-section role-discriminated dashboard card: shared shell, role-specific section pair. Future role-scoped dashboard surfaces can mirror this 'card-with-Section[]' structure."
  - "Per-row Link with role='listitem' inside a div with role='list' + aria-label=<section title>: gives screen-reader semantics without nesting interactive elements inside a list element (anchor element IS the list item)."

requirements-completed: [ORD-09]

# Metrics
duration: ~8m
completed: 2026-05-25
---

# Phase 9 Plan 03: Dashboard "Beställningar" Card (Slice C) Summary

**`useDashboardOrdersQuery` hook + role-discriminated `DashboardOrdersCard` + 5 mutation invalidations + 2-column DashboardPage grid — `/dashboard` now surfaces the role-scoped Beställningar card alongside the Phase 6 low-stock card with three-layer refresh (focus + 30s poll + 5 sibling invalidations).**

## Performance

- **Duration:** ~8 min (first task commit 2026-05-25T00:39:11+02:00, final task commit 2026-05-25T00:44:38+02:00 approx)
- **Started:** 2026-05-24T22:36:26Z
- **Completed:** 2026-05-24T22:44:49Z
- **Tasks:** 3 (Task 1 single GREEN, Task 2 RED→GREEN TDD pair, Task 3 single GREEN)
- **Files created:** 2 (`useDashboardOrdersQuery.ts`, `DashboardOrdersCard.tsx`)
- **Test files created:** 1 (`DashboardOrdersCard.test.tsx` — 9 `it`/`it.each` blocks)
- **Files modified:** 3 (`useOrderMutations.ts`, `DashboardPage.tsx`, plus the test file got a Rule-1 fix in the GREEN commit)
- **Final test count:** 144/144 passing across 20 files; typecheck clean; build clean.

## Accomplishments

- **ORD-09 SC#1 satisfied** — `/dashboard` renders the role-scoped Beställningar card alongside the existing low-stock card; verified by the 9-test DashboardOrdersCard suite (nurse + apotekare + admin subviews + 4 render states).
- **ORD-09 SC#2 satisfied** — each section header is a `<Link>` to `/bestallningar?status=<tab>` with the role-specific tab mapping (nurse: utkast/alla; apotekare-admin: skickad/bekraftad). Verified by Test 6.
- **ORD-09 SC#4 satisfied** — each row `<Link>` carries `?from=<row.status>`, so the Slice A `useBestallningarBackLink` helper resolves back to the matching tab when the user returns from the detail view. Verified by Test 5.
- **D-148 three-layer refresh wired end-to-end** — TanStack Query handles focus + 30s poll; 5 mutation hooks (`useCreateDraftOrder`, `useSubmitOrder`, `useConfirmOrder`, `useDeliverOrder`, `useDiscardOrder`) now invalidate `['dashboard', 'orders']` alongside their existing invalidations. `useDeliverOrder` ends up invalidating BOTH dashboard keys (low-stock from Phase 6 NTF-02 + orders from Phase 9 D-148).
- **Testable-without-mount contract** — `DASHBOARD_ORDERS_QUERY_OPTIONS` named export lets Test 9 assert the literal `true` / `30_000` / `['dashboard', 'orders']` without a QueryClient. A future refactor that drops a flag breaks the test.

## Task Commits

1. **Task 1: hook + 5 mutation invalidations** — `acfbf2d` (feat). Single commit; the contract this task ships is asserted by Task 2's component test (Test 9), so no separate failing-test gate.
2. **Task 2 (RED): failing tests for DashboardOrdersCard** — `254cd8b` (test). Confirmed RED: `vite:import-analysis` failed because `../DashboardOrdersCard` did not exist; 0 of 10 tests collected.
3. **Task 2 (GREEN): implement DashboardOrdersCard** — `fa8d147` (feat). 10/10 tests pass. Includes a Rule-1 test-file fix (Test 6 needed `cleanup()` + fresh `renderWithProviders()` instead of `unmount()` + `rerender()`).
4. **Task 3: widen DashboardPage to 2-column grid** — `ef49841` (feat). Typecheck + full 144-test sweep green.

## Files Created/Modified

### Created (3)

- `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts` — `useDashboardOrdersQuery()` returns `useQuery<DashboardOrdersResponse, ApiError>` against `GET /api/dashboard/orders`. Named const `DASHBOARD_ORDERS_QUERY_OPTIONS` with `queryKey: ['dashboard', 'orders'] as const`, `refetchOnWindowFocus: true as const`, `refetchInterval: 30_000 as const`. Doc-block cites D-141 / D-142 / D-148 and names the 5 mutation sites Phase 9 wires.
- `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` — main component + two private sub-components (`Section` and `EmptyState`). Four render branches (loading → 2-section skeleton; error → destructive Alert; empty → role-specific celebratory Card; data → two stacked Sections). Discriminates on `data.role` with TS narrowing.
- `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` — 9 `it`/`it.each` blocks. Mock pattern preserves the real `DASHBOARD_ORDERS_QUERY_OPTIONS` via `vi.importActual` spread so Test 9 asserts against the actual named const, not the mock. Test fixtures are statically typed as `DashboardOrdersResponse` so a contract drift in Slice B fails the test compile-time, not just runtime.

### Modified (2)

- `apps/web/src/features/orders/useOrderMutations.ts` — five `onSuccess` callbacks each gain ONE line (`void queryClient.invalidateQueries({ queryKey: ['dashboard', 'orders'] });`) and ONE one-line comment (`// Phase 9 D-148: dashboard orders card uses its own dedicated cache key (D-141).`) immediately adjacent to the existing `['orders', ...]` invalidations. Each affected mutation's doc-block adds one line citing D-148. **No existing invalidation removed.** Verified: 5 invalidation sites for the orders key, 1 invalidation site for the low-stock key (Phase 6 NTF-02 preserved).
- `apps/web/src/routes/dashboard/DashboardPage.tsx` — body becomes `<div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto p-4 md:p-6 lg:p-8">` containing `<DashboardLowStockCard />` then `<DashboardOrdersCard />` (DOM order = visual order at every breakpoint; at <md they stack vertically with low-stock first, at md+ they sit side-by-side with low-stock left). Doc-block widened to cite D-145 / D-146 alongside the existing D-118 statement.

## Section header URL map (verified by Test 6)

| Role | Section 1 header (link) | Section 2 header (link) |
|------|-------------------------|-------------------------|
| sjukskoterska | "Egna utkast" → `/bestallningar?status=utkast` | "Senaste beställningar" → `/bestallningar?status=alla` |
| apotekare / admin | "Väntar på bekräftelse" → `/bestallningar?status=skickad` | "Väntar på leverans" → `/bestallningar?status=bekraftad` |

## Row Link contract (verified by Test 5)

Every row in every section emits a `<Link>` whose `href` matches `^/bestallningar/[^?]+\?from=<row.status>$`. The status comes from the row's own `status` field (NOT a section-level constant), so a `skickad` row in the apotekare's `skickad.rows` array correctly carries `?from=skickad`; if the row data ever drifts (e.g., a `bekraftad` row mistakenly shows up in the `skickad` section), the back-link resolves to wherever the row actually lives, which is the right behavior per D-156 (silent fallthrough on invalid `?from=`).

## 5 mutation invalidation sites (verified by grep)

| # | Hook | Existing invalidation(s) | Phase 9 addition |
|---|------|---------------------------|------------------|
| 1 | `useCreateDraftOrder` | `['orders', { status: 'utkast' }]` | `['dashboard', 'orders']` |
| 2 | `useSubmitOrder` | `['orders', { status: 'utkast' }]` | `['dashboard', 'orders']` |
| 3 | `useConfirmOrder` | `['orders', { status: 'skickad' }]` + `['orders', { status: 'bekraftad' }]` | `['dashboard', 'orders']` |
| 4 | `useDeliverOrder` | `['orders', { status: 'bekraftad' }]` + `['orders', { status: 'levererad' }]` + `['medications']` + `['dashboard', 'low-stock']` | `['dashboard', 'orders']` |
| 5 | `useDiscardOrder` | `['orders', { status: 'utkast' }]` | `['dashboard', 'orders']` |

`useDeliverOrder` final shape: BOTH `['dashboard', 'low-stock']` (Phase 6 NTF-02) AND `['dashboard', 'orders']` (Phase 9 D-148) fire — both are present in the final code, neither replaces the other. Confirmed by acceptance-criteria grep (5 hits for the orders key, 1 hit for the low-stock key).

## Decisions Made

All decisions locked in 09-CONTEXT.md `<decisions>` block (D-141..D-148); Slice C honored them verbatim:

- **D-141** — Dedicated `GET /api/dashboard/orders` endpoint with its own cache key `['dashboard', 'orders']`. (Slice B shipped the endpoint; Slice C wires the FE cache key.)
- **D-142** — Role-aware payload as a Zod discriminated union on `role`. FE narrows via `if (data.role === 'sjukskoterska') { ... } else { ... }` in `DashboardOrdersCard`. TypeScript enforces shape matching across branches.
- **D-143** — Nurse `recentHistory` is vårdenhet-wide (any author) and excludes utkast. (Slice B's service ships this; Slice C's `Senaste beställningar` section just renders `data.recentHistory` verbatim.)
- **D-144** — Top-5 rows per section, sorted DESC by createdAt; counts may exceed 5. Section component renders `CardDescription = "totalt {count}"` when `count` is provided (it is for egnaUtkast / skickad / bekraftad; it is NOT for nurse's `recentHistory` — that section is the row list itself).
- **D-145** — Grid `grid-cols-1 md:grid-cols-2`. Verified in `DashboardPage.tsx`.
- **D-146** — Low-stock card first in DOM order (left/top), orders second (right/bottom). Verified in `DashboardPage.tsx` and in the test file's parameterization order.
- **D-147** — Celebratory empty state per role. `Inga aktiva beställningar.` for nurses, `Inga beställningar väntar på åtgärd.` for apotekare/admin. Card uses `role="status"` + `CheckCircle2` in `text-emerald-600`.
- **D-148** — Three-layer refresh: `refetchOnWindowFocus: true`, `refetchInterval: 30_000`, plus the 5 sibling invalidations from `useOrderMutations.ts`.

Honored `<discretion>` recommendations:
- **Section header copy** = `Egna utkast` / `Senaste beställningar` (nurse), `Väntar på bekräftelse` / `Väntar på leverans` (apotekare/admin).
- **Count formatting** = `totalt {count}` as CardDescription beneath the header.
- **Row CTA** = a clickable Link spanning the whole row + `ChevronRight` on the right; NO separate "Visa alla" CTA (the section header IS the link to the full tab).
- **Loading skeleton** = two stacked sections × (header skeleton + 3 row skeletons).
- **NO `lg:grid-cols-3`** (no third dashboard card today).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Test 6 used `unmount()` + `rerender()` which throws "Cannot update an unmounted root"**

- **Found during:** Task 2 GREEN, first test run (9 of 10 pass; Test 6 fails on `rerender()` after `unmount()`).
- **Issue:** `react-testing-library`'s `rerender` requires the same root to still be mounted; calling `unmount()` then `rerender()` throws because the React root has been unmounted. I had structured Test 6 as one `renderWithProviders` call (for nurse data), then `unmount()`, then `rerender()` (for pharmacist data).
- **Fix:** Replaced the `unmount() + rerender()` pattern with `cleanup() + renderWithProviders()` for the second sub-case. `cleanup()` (from `@testing-library/react`) tears down the previous DOM and lets a brand-new `renderWithProviders` call build a fresh root.
- **Files modified:** `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx`.
- **Verification:** 10/10 tests pass after the fix.
- **Committed in:** `fa8d147` (Task 2 GREEN commit — the GREEN diff includes both the source file and the test-file fix).

**2. [Rule 3 — Blocking] Worktree spawned without `node_modules`; baseline typecheck/test/build all failed until `pnpm install --frozen-lockfile` ran**

- **Found during:** Initial environment setup before Task 1.
- **Issue:** Same blocker the 09-02 plan documented — fresh worktree has neither `node_modules` nor a generated Prisma client. Test/build/typecheck commands all fail with module-resolution errors until install runs.
- **Fix:** Ran `pnpm install --frozen-lockfile` at the repo root (5.9s — lockfile up to date), then `pnpm --filter @meditrack/shared build` to produce the shared package's `dist/` for downstream consumers. After both, every verification command (typecheck/test/build) ran clean.
- **Files modified:** Generated artifacts only (`node_modules/`, `packages/shared/dist/`); no source changes.
- **Verification:** Web `typecheck`/`test`/`build` all exit 0; 144/144 tests pass.
- **Committed in:** Not committed (generated artifacts are gitignored).

**3. [Cosmetic — AC literal-grep compliance] Two docblock rephrases**

- **Found during:** Acceptance-criteria grep sweep at the end of Task 2 + Task 3.
- **Issue:** Two AC greps treat literal substrings strictly:
  - `grep -c "LowStockBadge\|EmptyStateCard"` on `DashboardOrdersCard.tsx` (must equal 0). My initial docblock said "do NOT use `EmptyStateCard`; its icon defaults to slate-400".
  - `grep -c "<h1"` on `DashboardPage.tsx` (must equal 0). My initial docblock said "no `<h1>` and no AppShell chrome change" (twice).
- **Fix:** Rephrased both docblock passages to drop the literal tokens while preserving the design rationale: "the shared empty-state primitive defaults to slate-400 on the icon" and "no page-level heading is added here" / "no page-level heading element". Behavior unchanged; AC greps now read 0.
- **Files modified:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` (between RED-fix and GREEN commit), `apps/web/src/routes/dashboard/DashboardPage.tsx` (in the Task 3 commit).
- **Verification:** Greps return 0; tests still pass.
- **Committed in:** `fa8d147` (Task 2 GREEN) and `ef49841` (Task 3).

---

**Total deviations:** 3 auto-fixed (1 Rule-1 test bug, 1 Rule-3 environment blocker, 1 cosmetic AC literal-grep alignment).
**Impact on plan:** All three fixes were direct consequences of the plan's changes (Rule 1 and 3) or AC strictness (Cosmetic 3). No architectural decisions changed; no plan rewrites needed.

## Issues Encountered

- None beyond the three deviations above. Tasks 1, 2 GREEN, and 3 each landed on first try after the cosmetic fixes. Task 2 RED took one iteration to confirm the failure mode (vite import-analysis error vs runtime "not found" — confirmed the import failure means the test runner never even gets to render the component, which is the expected RED for a not-yet-existing import).

## Known Stubs

None. Every rendered branch is wired end-to-end:
- Loading branch renders Skeleton bars (real component, not a placeholder).
- Error branch renders the real Alert primitive with the locked Swedish copy.
- Empty branch renders the real CheckCircle2 + Card with the locked Swedish copy.
- Data branch renders the real Section sub-component with real `data.<section>.rows` from the live `useDashboardOrdersQuery` hook (which consumes Slice B's real endpoint).
- Row Links carry real `row.id` + `row.status` from the server payload.
- Mutation invalidations target the real `['dashboard', 'orders']` queryKey that the hook subscribes to.

## Threat Flags

None new. Slice C is pure FE composition over Slice B's session-gated endpoint:
- **T-09-09** (Information Disclosure, stale counts): mitigated by D-148 three-layer refresh — verified by greps (`refetchOnWindowFocus: true`, `refetchInterval: 30_000`, 5 sibling invalidations).
- **T-09-10** (Tampering, bogus `?from=` from server): accepted; Slice A's helper validates against the StatusTab union (D-156).
- **T-09-11** (DoS, 30s polling): accepted; TanStack pauses interval polling on hidden tabs.
- **T-09-12** (Spoofing, mocked role leaks across roles): mitigated by `data.role` discrimination (server-side computed) + statically-typed `DashboardOrdersResponse` test fixtures.

No new trust boundaries beyond what Slice A and Slice B already cover.

## User Setup Required

None — no new env vars, no migrations, no external services. The `/dashboard` route renders the new card the moment a logged-in user lands on it.

## Next Phase Readiness

- **Phase 9 complete** (ORD-09 + ORD-10 both shipped). The orchestrator can close out Phase 9 once all three SUMMARYs (09-01, 09-02, 09-03) are merged from their respective worktrees.
- **SC#4 sc04 harness re-capture** is a follow-on chore per CONTEXT.md `<specifics>` lines 351-353 — `apps/web/scripts/captureSc04Screenshots.ts` will need to run after Phase 9 lands on `master` to refresh `docs/screenshots/sc04-360-dashboard.png` with the new 2-column grid. Not a Phase 9 commit per the plan's `<output>` block.
- **Phase 10 (ORD-11 order numbers)** can adopt the new row-content slot for the `ORD-…` string without a contract bump — the row's bottom line currently shows `{N} rad{er} · totalt {Q}`; the order number can prepend or replace once it lives on `dashboardOrderRow`.

## Self-Check

See `## Self-Check: PASSED` block below — files exist, commits resolve, verification green.

---

## Self-Check: PASSED

**Created files exist:**
- FOUND: `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts`
- FOUND: `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx`
- FOUND: `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx`

**Commits resolve:**
- FOUND: `acfbf2d` (Task 1 — hook + 5 mutation invalidations)
- FOUND: `254cd8b` (Task 2 RED — failing tests for DashboardOrdersCard)
- FOUND: `fa8d147` (Task 2 GREEN — implement DashboardOrdersCard)
- FOUND: `ef49841` (Task 3 — DashboardPage 2-column grid)

**Verification re-run (final gate):**
- `pnpm --filter @meditrack/web typecheck` → exit 0
- `pnpm --filter @meditrack/web test -- --run` → 144/144 passed across 20 files
- `pnpm --filter @meditrack/web build` → exit 0

---
*Phase: 09-dashboard-depth-back-nav*
*Completed: 2026-05-25*
