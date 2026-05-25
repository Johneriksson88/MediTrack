---
phase: 09-dashboard-depth-back-nav
verified: 2026-05-25T01:05:00Z
updated: 2026-05-25T01:18:00Z
status: gaps_found
score: 4/4 success criteria observable in code; 1 visual-design gap surfaced by HUMAN-UAT
overrides_applied: 0
gaps:
  - id: dashboard-wide-screen-whitespace
    severity: minor
    surface: "apps/web/src/routes/dashboard/DashboardPage.tsx + DashboardLowStockCard.tsx + DashboardOrdersCard.tsx"
    observed: "At ≥1024px viewport, both dashboard cards (especially 'Läkemedel under tröskel') render with excessive vertical whitespace inside their card frames — the cards feel undersized for the available canvas. Structural layout (2-col at md+, stacked-mobile, no overflow) is correct."
    expected: "Cards should make better use of the wider canvas — denser content, larger affordances, or a layout that doesn't leave the lower half of each card empty."
    why_in_scope: "Phase 9 introduced the 2-column grid (DashboardPage) and the orders card; the wide-screen layout sizing is owned by this phase."
    source: 09-HUMAN-UAT.md (Test 1, Gap 1)
human_verification:
  - test: "Visual confirmation of the 2-column dashboard at md+ and stacked layout at <md"
    expected: "On a 1024px viewport, DashboardLowStockCard is left of DashboardOrdersCard; at 360px both cards stack vertically with low-stock on top; no horizontal overflow (scrollWidth <= innerWidth)."
    result: "issue — structural layout correct, but wide-screen whitespace excessive. Captured as gap above."
    why_human: "Visual layout + breakpoint behavior cannot be programmatically verified without running the browser harness."
  - test: "End-to-end demo: nurse session — click a row in the Senaste beställningar section of the dashboard card, land on order detail, click 'Tillbaka till beställningar'"
    expected: "Returns to /bestallningar?status=<row.status> (the tab matching the row's status, NOT the default Utkast)."
    result: "pass — back-nav returns to the correct tab. (Three unrelated mobile-breakpoint bugs were observed on the detail page during this flow; filed as standalone todos — see Out-of-Scope Findings.)"
    why_human: "The full SC#4 dashboard-card path requires a logged-in session against a seeded DB."
  - test: "End-to-end demo: apotekare session — confirm an order while another browser tab has /dashboard open; observe the Skickad count drop within 30s OR on window focus"
    expected: "Three-layer refresh (D-148) fires: focus-refetch + 30s interval + sibling invalidation from useConfirmOrder."
    result: "pending — not exercised in this session."
    why_human: "Real-time refresh behavior across browser tabs cannot be asserted in a unit test."
out_of_scope_findings:
  - todo: compose-skicka-overflow-lt412
    surface: "Phase 3 (ComposeOrderPage Mode A action row)"
    summary: "'Skicka beställning' button overflows under 412px viewport width on Utkast detail."
    file: ".planning/todos/pending/compose-skicka-overflow-lt412.md"
  - todo: order-detail-bekrafta-hidden-767
    surface: "Phase 4 (ComposeOrderPage Mode C action row)"
    summary: "'Bekräfta' button clipped at 767px breakpoint on Skickad detail."
    file: ".planning/todos/pending/order-detail-bekrafta-hidden-767.md"
  - todo: order-detail-leverera-hidden-767
    surface: "Phase 4 (ComposeOrderPage Mode D action row)"
    summary: "'Markera som levererad' button clipped at 767px breakpoint on Bekräftad detail. Likely same root cause as previous."
    file: ".planning/todos/pending/order-detail-leverera-hidden-767.md"
---

# Phase 9: Dashboard Depth + Back-Nav Verification Report

**Phase Goal:** Make `/dashboard` a useful first-screen by adding a role-scoped "Beställningar" card showing orders requiring the user's attention, and fix the routing bug where Tillbaka från orderdetalj drops the previously-active status tab.

**Verified:** 2026-05-25T01:05:00Z (initial) → re-evaluated 2026-05-25T01:18:00Z after HUMAN-UAT
**Status:** gaps_found — 4/4 automated success criteria observable in code, but HUMAN-UAT surfaced a wide-screen layout gap (dashboard cards under-fill canvas); routing to `/gsd:plan-phase 9 --gaps`. Three additional mobile-breakpoint bugs were discovered during the back-nav demo but belong to Phase 3/4 surfaces — filed as standalone todos, not Phase 9 gaps.
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + PLAN frontmatter)

| # | Truth (Roadmap SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | Dashboard renders a new "Beställningar" card alongside the existing "Läkemedel under tröskel" card; content varies by role (sjukskoterska: Egna Utkast count + recent order history; apotekare/admin: Skickad-att-bekräfta count + Bekräftad-att-leverera count) | VERIFIED | `apps/web/src/routes/dashboard/DashboardPage.tsx:38-41` renders both `<DashboardLowStockCard />` and `<DashboardOrdersCard />` inside `grid grid-cols-1 md:grid-cols-2`. `DashboardOrdersCard.tsx:109-163` branches on `data.role`: nurse subview renders `Egna utkast` + `Senaste beställningar` sections (with count via `data.egnaUtkast.count`); apotekare/admin subview renders `Väntar på bekräftelse` + `Väntar på leverans` sections with counts. Server-side payload comes from `apps/api/src/services/dashboard.service.ts:listDashboardOrdersForUser` which branches on `role` and returns the role-discriminated shape. Endpoint registered at `apps/api/src/routes/dashboard/orders.ts:38-50` and registered into the app via `apps/api/src/routes/dashboard/index.ts:22` → `apps/api/src/app.ts:110`. |
| 2 | Each card item links to the corresponding /bestallningar tab and pre-selects it (no manual tab click required) | VERIFIED | Section header links: `DashboardOrdersCard.tsx:124, 129, 152, 158` use `statusHref` values `/bestallningar?status=utkast`, `/bestallningar?status=alla`, `/bestallningar?status=skickad`, `/bestallningar?status=bekraftad`. Pre-selection is satisfied by `BestallningarPage.tsx:61-62` reading `?status=` from `useSearchParams()` to drive the active tab. Row links: `DashboardOrdersCard.tsx:209` uses `/bestallningar/${row.id}?from=${row.status}` so the back-nav (Truth 3) takes the user back to the matching tab. Verified by `DashboardOrdersCard.test.tsx` Tests 5 + 6 (10/10 pass). |
| 3 | When a user reaches /bestallningar/:id from a non-default tab (e.g. Bekräftade) and clicks "Tillbaka till beställningar", they return to the same tab — not the default Utkast tab | VERIFIED | `useBestallningarBackLink.ts:81-88` reads `?from=` from `useSearchParams`, validates against the `StatusTab` union, and returns `/bestallningar?status=<resolved>`. `ComposeOrderPage.tsx:83` calls the hook with `fallbackStatus: order?.status` (D-153); 5 back-link sites (lines 106, 134, 143, 172, 425) consume `backLink.to` and `backLink.label`. Verified by 18 ComposeOrderPage tests + 12 hook tests (all pass). |
| 4 | The fix works whether the detail view was reached from a tab click, a deep link, or the new dashboard card (Phase 9 #1) | VERIFIED | Tab clicks: `OrdersTable.tsx:135, 140` and `OrdersCardList.tsx:89` emit `?from=${tab}`. Drafts tab: `BestallningarPage.tsx:227, 232` emit `?from=utkast`. Ny beställning: `BestallningarPage.tsx:83` emits `?from=utkast`. Dashboard card rows: `DashboardOrdersCard.tsx:209` emit `?from=${row.status}`. Deep link (no `?from=` present): hook falls back to `order.status` (D-153). All paths converge on `useBestallningarBackLink`. Verified by 11 BestallningarPage tests + 12 hook tests + 18 ComposeOrderPage tests + 10 DashboardOrdersCard tests (51/51 pass). |

**Score:** 4/4 roadmap success criteria verified.

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Data Flows | Status |
|----------|----------|--------|-------------|-------|------------|--------|
| `apps/web/src/features/orders/useBestallningarBackLink.ts` | Back-link helper hook + `BackLink` type | Yes (88 lines) | Yes (reads `?from=`, validates, returns `{to, label}`) | Yes (imported by ComposeOrderPage; 6 references) | N/A (pure URL builder) | VERIFIED |
| `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` | 6 scenarios fanning into 12 sub-tests | Yes | Yes (12 tests pass) | Yes | N/A | VERIFIED |
| `apps/web/src/routes/bestallningar/BestallningarPage.tsx` | `?from=utkast` propagation at 3 sites | Yes | Yes (line 83 + 227 + 232) | Yes (active route) | Yes (calls hook indirectly via URL contract) | VERIFIED |
| `apps/web/src/routes/bestallningar/OrdersTable.tsx` | `?from=${tab}` at click + keydown | Yes (lines 135 + 140) | Yes | Yes | Yes | VERIFIED |
| `apps/web/src/routes/bestallningar/OrdersCardList.tsx` | `?from=${tab}` at button onClick | Yes (line 89) | Yes | Yes | Yes | VERIFIED |
| `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` | All 5 back-link sites consume `backLink.to`/`backLink.label` | Yes (lines 106, 134, 143, 172, 425) | Yes | Yes (hook imported line 12, called line 83) | Yes (live `order?.status` fallback) | VERIFIED |
| `packages/shared/src/contracts/dashboard.ts` | `dashboardOrderRow` + `dashboardOrdersResponse` Zod discriminated union | Yes (187 lines) | Yes (discriminated union on `role` with both subviews) | Yes (re-exported from `@meditrack/shared`) | N/A (schema only) | VERIFIED |
| `packages/shared/src/index.ts` | 4 new symbols re-exported | Yes (lines 98–101) | Yes | Yes | N/A | VERIFIED |
| `apps/api/src/services/dashboard.service.ts` | `listDashboardOrdersForUser(careUnitId, userId, role)` | Yes (lines 192–277) | Yes (role-branched Prisma queries with careUnitId-first + soft-delete filter) | Yes (imported by route) | Yes (real `prisma.order.findMany` queries) | VERIFIED |
| `apps/api/src/routes/dashboard/orders.ts` | `GET /api/dashboard/orders` Fastify route | Yes (52 lines) | Yes (preHandler `requireSession`, response schema `dashboardOrdersResponse`) | Yes (registered via `dashboard/index.ts:22`) | Yes (passes through `req.user!.careUnitId/id/role`) | VERIFIED |
| `apps/api/src/routes/dashboard/index.ts` | Registers `ordersRoute` next to `lowStockRoute` | Yes (line 22) | Yes | Yes (registered in `app.ts:110`) | Yes | VERIFIED |
| `apps/api/test/dashboard.orders.integration.test.ts` | 5 integration scenarios | Yes (348 lines, 5 `it()` blocks) | Yes (5 tests pass against live Postgres) | Yes | Yes (asserts cross-careUnit isolation + top-5 cap + DESC ordering with real prisma writes) | VERIFIED |
| `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts` | Hook + `DASHBOARD_ORDERS_QUERY_OPTIONS` named export | Yes (67 lines) | Yes (`queryKey: ['dashboard', 'orders'] as const` + 30s `refetchInterval` + `refetchOnWindowFocus: true`) | Yes (imported by `DashboardOrdersCard`) | Yes (calls `fetchJson<DashboardOrdersResponse>('/api/dashboard/orders')`) | VERIFIED |
| `apps/web/src/features/orders/useOrderMutations.ts` | 5 `['dashboard', 'orders']` invalidations added alongside existing ones | Yes (5 hits at lines 60, 263, 311, 382, 446); existing `['dashboard', 'low-stock']` still at line 380 | Yes | Yes (mutations live in routes) | Yes (invalidates the cache key the orders card subscribes to) | VERIFIED |
| `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` | Role-discriminated card | Yes (262 lines) | Yes (4 render states × 2 subviews; Section + EmptyState sub-components; `?from=${row.status}` on row Links) | Yes (mounted by `DashboardPage`) | Yes (consumes `useDashboardOrdersQuery` → real endpoint) | VERIFIED |
| `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` | 9 component tests (10 with apotekare/admin it.each split) | Yes (10 it/it.each blocks; 10 tests pass) | Yes (asserts both subviews + 4 states + row links + section URLs + query config) | Yes | Yes (mocks the hook with statically-typed `DashboardOrdersResponse` fixtures) | VERIFIED |
| `apps/web/src/routes/dashboard/DashboardPage.tsx` | 2-column responsive grid mounting both cards | Yes (44 lines) | Yes (exact `grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto p-4 md:p-6 lg:p-8` className; DOM order = low-stock first) | Yes (page is the `/dashboard` route component) | N/A (composition only) | VERIFIED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ComposeOrderPage.tsx` | `useBestallningarBackLink.ts` | `useBestallningarBackLink({ fallbackStatus: order?.status })` (line 83) + 5 sites consuming `backLink.to`/`backLink.label` (lines 106, 134, 143, 172, 425) | WIRED | Import on line 12; hook call on line 83; 6 usages of `backLink.*`. |
| `BestallningarPage.tsx` | `/bestallningar/:id?from=utkast` | `navigate(\`/bestallningar/${response.id}?from=utkast\`)` (line 83) + 2 row-click handlers (lines 227, 232) | WIRED | 3 hits for `?from=utkast`. |
| `OrdersTable.tsx` | `/bestallningar/:id?from=<tab>` | `navigate(\`/bestallningar/${row.id}?from=${tab}\`)` (lines 135 + 140) | WIRED | Both click + keydown handlers emit `?from=${tab}`. |
| `OrdersCardList.tsx` | `/bestallningar/:id?from=<tab>` | `navigate(\`/bestallningar/${row.id}?from=${tab}\`)` (line 89) | WIRED | Button onClick honors. |
| `DashboardOrdersCard.tsx` | `/bestallningar/:id?from=<row.status>` | `<Link to={\`/bestallningar/${row.id}?from=${row.status}\`}>` (line 209) | WIRED | Row Link template literal. |
| `DashboardOrdersCard.tsx` | `useDashboardOrdersQuery` | `const { data, isLoading, isError } = useDashboardOrdersQuery()` (line 64) | WIRED | Import line 5; call line 64. |
| `DashboardPage.tsx` | `DashboardOrdersCard.tsx` | `<DashboardOrdersCard />` inside `grid grid-cols-1 md:grid-cols-2` (line 40) | WIRED | Both imports + JSX rendered. |
| `useDashboardOrdersQuery.ts` | `GET /api/dashboard/orders` | `fetchJson<DashboardOrdersResponse>('/api/dashboard/orders')` (line 62) | WIRED | TanStack queryFn hits the dedicated endpoint. |
| `apps/api/src/routes/dashboard/orders.ts` | `listDashboardOrdersForUser` | `listDashboardOrdersForUser(req.user!.careUnitId, req.user!.id, req.user!.role)` (lines 45–49) | WIRED | careUnitId-first per D-16. |
| `apps/api/src/routes/dashboard/orders.ts` | `dashboardOrdersResponse` | `schema: { response: { 200: dashboardOrdersResponse } }` (line 42) | WIRED | Fastify response schema is the discriminated union; serialization fails fast on shape drift. |
| `apps/api/src/routes/dashboard/index.ts` | `ordersRoute` | `await app.register(ordersRoute)` (line 22) | WIRED | Registered after `lowStockRoute`. |
| `apps/api/src/app.ts` | `dashboardRoutes` | `await app.register(dashboardRoutes)` (line 110) | WIRED | Top-level registration. |
| `useOrderMutations.ts` | `['dashboard', 'orders']` cache key | `queryClient.invalidateQueries({ queryKey: ['dashboard', 'orders'] })` at lines 60, 263, 311, 382, 446 | WIRED | Exactly 5 sites (createDraft, submit, confirm, deliver, discard); existing `['dashboard', 'low-stock']` at line 380 retained. |
| `DashboardOrdersCard.tsx` section header Links | `BestallningarPage` tab pre-select | `to={statusHref}` where `statusHref ∈ /bestallningar?status={utkast,alla,skickad,bekraftad}` | WIRED | `BestallningarPage.tsx:61-62` reads `?status=` from `useSearchParams` to drive the tab. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DashboardOrdersCard.tsx` | `data` (from `useDashboardOrdersQuery`) | `fetchJson<DashboardOrdersResponse>('/api/dashboard/orders')` → `listDashboardOrdersForUser` → 3 or 4 parallel `prisma.order.findMany`/`prisma.order.count` calls with `where: { careUnitId, ... }` | Yes — real Prisma queries on real `Order` rows. Integration test 4 confirms 6 rows seeded → 5 rows returned + count >= 6. | FLOWING |
| `DashboardOrdersCard.tsx` row Links | `row.id`, `row.status` (per-row from data) | Same source above; mapped through `toDashboardOrderRow` (service line 161–176). | Yes — id and status come from Prisma `Order` records. | FLOWING |
| `ComposeOrderPage.tsx` `backLink` | `order?.status` (from `orderQuery.data`) | `useOrderQuery(id)` (existing hook, unchanged by Phase 9) | Yes — real order via `/api/orders/:id`. Fallback uses live order status that recomputes on every render (D-154). | FLOWING |
| `useBestallningarBackLink.ts` | `?from=` URL param (live `useSearchParams`) | `useSearchParams()` → router state (always live). | Yes — live URL state. Recomputes every render. | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Hook tests pass | `pnpm --filter @meditrack/web test -- --run useBestallningarBackLink` | 12/12 tests pass in 17ms | PASS |
| DashboardOrdersCard tests pass | `pnpm --filter @meditrack/web test -- --run DashboardOrdersCard` | 10/10 tests pass in 102ms | PASS |
| BestallningarPage tests pass (with new ?from= assertions) | `pnpm --filter @meditrack/web test -- --run BestallningarPage` | 11/11 tests pass in 275ms | PASS |
| ComposeOrderPage tests pass (with rewired back-links) | `pnpm --filter @meditrack/web test -- --run ComposeOrderPage` | 18/18 tests pass in 259ms | PASS |
| FE typecheck clean | `pnpm --filter @meditrack/web typecheck` | exit 0 | PASS |
| API typecheck clean | `pnpm --filter @meditrack/api typecheck` | exit 0 | PASS |
| API integration test (5 scenarios against live Postgres) | `pnpm --filter @meditrack/api test -- --run dashboard.orders.integration` | 5/5 tests pass in 879ms | PASS |
| `/healthz` reachable | `curl http://localhost:3000/healthz` | `{"status":"ok"}` | PASS |
| `GET /api/dashboard/orders` reachable on running docker | `curl http://localhost:3000/api/dashboard/orders` | 404 — but the running container was built 2026-05-24T20:47Z (pre-Phase-9 commit timeline). Source code, integration tests, and typecheck all confirm the endpoint is correctly registered (`apps/api/src/routes/dashboard/index.ts:22` + `apps/api/src/app.ts:110`). Container `/app/apps/api/dist/routes/dashboard/` contains only `index.js` + `lowStock.js`. **A `docker compose build api` rebuild would surface the new route.** This is environment staleness, not a Phase 9 code gap. | SKIP (environment limitation) |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes exist in this repository and the PLAN/SUMMARY files do not declare any. Step 7c skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORD-09 | 09-02-PLAN.md + 09-03-PLAN.md | Dashboard shows a role-scoped "Beställningar" card surfacing orders that need the user's attention — nurses see own Utkast + recent history; apotekare/admin see Skickad-to-confirm + Bekräftad-to-deliver | SATISFIED | BE (Plan 02): endpoint + service + Zod union + 5 integration tests; FE (Plan 03): hook + role-discriminated card + 2-column grid + 10 component tests. Covered by Truths 1, 2, 4. |
| ORD-10 | 09-01-PLAN.md | Order detail "Tillbaka till beställningar" returns the user to the previously-active status tab, not the default Utkast tab | SATISFIED | Hook + 4 navigators propagating `?from=` + 5 ComposeOrderPage back-link sites consuming `backLink.to`. Covered by Truths 3, 4. |

**No orphaned requirements.** REQUIREMENTS.md maps exactly ORD-09 + ORD-10 to Phase 9, and both appear in PLAN frontmatter (Plan 01 owns ORD-10; Plans 02 + 03 own ORD-09).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TODO/FIXME/XXX/HACK/PLACEHOLDER markers found in any of the 7 Phase 9 created/modified production files | — | — |

Anti-pattern scan ran on: `useDashboardOrdersQuery.ts`, `DashboardOrdersCard.tsx`, `DashboardPage.tsx`, `useBestallningarBackLink.ts`, `apps/api/src/routes/dashboard/orders.ts`, `apps/api/src/services/dashboard.service.ts`, `packages/shared/src/contracts/dashboard.ts`. No debt markers, no stub returns, no hardcoded empty data, no console.log-only handlers.

### Deferred / Non-Blocking Observations

| # | Observation | Status |
|---|-------------|--------|
| 1 | `docs/screenshots/sc04-360-dashboard.png` is the Phase 7 capture; the Phase 9 layout change makes a re-capture appropriate. `09-CONTEXT.md` `<specifics>` lines 351–353 and `09-03-SUMMARY.md` line 26 BOTH explicitly designate this as a post-phase chore, NOT a Phase 9 commit. The working tree shows the file as modified (uncommitted) — likely from a manual capture by the user, but not part of Phase 9 by design. | Deferred per plan; not a Phase 9 gap. |
| 2 | Running `meditrack-api` docker container is pre-Phase-9 (created 2026-05-24T20:47Z, Phase 9 commits dated 2026-05-25). The container's compiled `dist/routes/dashboard/` directory does not contain `orders.js`. The source code, typecheck, and integration tests against a freshly-built test app all confirm the route IS correctly registered. A `docker compose build api && docker compose up -d api` would resolve. | Environment staleness, not a Phase 9 code gap. |

### Human Verification Required

Three items need human testing — all verifiable only with a running browser + seeded session:

**1. Visual confirmation of 2-column dashboard at md+ and stacked layout at <md**
- **Test:** Open `/dashboard` at 1024px viewport, then resize to 360px.
- **Expected:** At 1024px: DashboardLowStockCard on the left, DashboardOrdersCard on the right. At 360px: both cards stack vertically with low-stock on top. No horizontal scroll at either breakpoint (scrollWidth <= innerWidth — same SC#4 invariant the Phase 7 sc04 harness enforces).
- **Why human:** Visual layout + breakpoint behavior cannot be verified programmatically without re-running the sc04 screenshot harness (`apps/web/scripts/captureSc04Screenshots.ts`). The harness re-capture is an explicit post-phase chore per CONTEXT.md.

**2. End-to-end dashboard-card path → detail → back-nav**
- **Test:** Log in as sjukskoterska. From `/dashboard`, click a row in the "Senaste beställningar" section. On the resulting order detail page, click "Tillbaka till beställningar".
- **Expected:** Land on `/bestallningar?status=<row.status>` (the tab matching the row's actual status — typically `skickad`, `bekraftad`, or `levererad` for non-utkast history). NOT the default Utkast tab.
- **Why human:** Each link is unit-tested individually but the full SC#4 dashboard-card → detail → back-nav round-trip requires a seeded DB + a real session. (Tab clicks and deep links are also covered by SC#4 — the BestallningarPage + ComposeOrderPage tests verify those paths in isolation.)

**3. Three-layer refresh — cross-session apotekare confirmation**
- **Test:** Open `/dashboard` as apotekare in two browser tabs (Tab A + Tab B). In Tab A, navigate to a Skickad order and click "Bekräfta". In Tab B (still on /dashboard), wait up to 30s OR click into the tab to trigger window focus.
- **Expected:** Tab B's "Väntar på bekräftelse" count drops by 1 within 30s (interval poll) or immediately (focus refetch / mutation invalidation if the same session). D-148 three-layer refresh.
- **Why human:** Cross-tab/cross-session refresh timing cannot be asserted in a unit test; the 30s interval polling and window-focus behavior require a real browser environment.

### Gaps Summary

No gaps blocking the phase goal. All 4 success criteria are observably satisfied in the codebase:

- **SC#1:** Dashboard renders both cards via `DashboardPage.tsx`; `DashboardOrdersCard` discriminates on `data.role` for the two subview shapes.
- **SC#2:** Section header `<Link>`s point at `/bestallningar?status=<tab>`; `BestallningarPage` reads `?status=` to pre-select.
- **SC#3:** `useBestallningarBackLink` reads `?from=`, validates against StatusTab union, returns `/bestallningar?status=<resolved>`; `ComposeOrderPage` consumes `backLink.to` at all 5 back-link sites.
- **SC#4:** All 4 navigation sources (tab click via OrdersTable/OrdersCardList, deep link via order.status fallback, Ny beställning, dashboard card row Links) propagate or fall back to a valid status. Hook + 4 navigators + 5 sites all wired and tested.

Both requirement IDs are SATISFIED. No anti-patterns. No debt markers. Three items flagged for human verification (visual layout + end-to-end demo + cross-session refresh) because automated tests cannot cover them — these are tracked under the `human_verification` frontmatter section.

Status is `human_needed` (not `passed`) per Step 9 decision-tree rule: even when all truths verify, the presence of any human-verification items means status MUST be `human_needed`.

---

*Verified: 2026-05-25T01:05:00Z*
*Verifier: Claude (gsd-verifier)*
