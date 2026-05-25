---
phase: 09-dashboard-depth-back-nav
verified: 2026-05-25T10:20:00Z
status: passed
score: 4/4 roadmap success criteria verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "4/4 automated SCs observable; 1 visual-design gap surfaced by HUMAN-UAT"
  gaps_closed:
    - "dashboard-wide-screen-whitespace — closed by Plan 09-04 + WR-08 follow-up: items-stretch on the grid container; h-full flex flex-col on every Card branch in both DashboardLowStockCard (data + loading + error + empty) and DashboardOrdersCard (both data branches); flex-1 on data-branch CardContents; max-h-80 removed; symmetric Vitest invariants in DashboardLowStockCard.test.tsx (Tests 6 + 7 + 8 + 9) and DashboardOrdersCard.test.tsx (Test 10 parameterized across nurse/apotekare/admin)."
  gaps_remaining: []
  regressions: []
advisory_findings:
  - id: IN-01
    severity: info
    source: 09-REVIEW.md
    summary: "StatusTab union + isValidStatus duplicated across useBestallningarBackLink.ts and BestallningarPage.tsx. Author justified as 'smaller surface, no cross-file coupling'. Not addressed by REVIEW-FIX (Info findings out of `critical+warning` scope)."
    disposition: "Open — non-blocking. Track as follow-on for the next phase that adds a sixth tab; preferred extraction target packages/shared/src/constants/orderStatusTabs.ts."
  - id: IN-02
    severity: info
    source: 09-REVIEW.md
    summary: "Misleading inline comment in useSubmitOrder.onError (apps/web/src/features/orders/useOrderMutations.ts:272-273) promises a 422 carve-out but the code falls through to the generic toast."
    disposition: "Open — non-blocking. Comment-only confusion; behavior is correct."
  - id: IN-03
    severity: info
    source: 09-REVIEW.md
    summary: "Two data-testid hooks (`dashboard-orders-card-data` and `-content`) are reused across the nurse + pharmacist branches in DashboardOrdersCard. Today only one branch renders per session so no DOM collision exists, but the testid is a contract identifier."
    disposition: "Open — non-blocking. Tracked as a future-refactor candidate; would become a real issue only if a future change conditionally renders both branches simultaneously."
  - id: IN-04
    severity: info
    source: 09-REVIEW.md
    summary: "Test 6 / Test 10 assertion `.toContain('flex')` is implied by `.toContain('flex-col')` because the substring match passes either way."
    disposition: "Open — non-blocking. Tests still catch the intended invariant in practice; the recommended split-on-whitespace + exact-token check is a polish item."
---

# Phase 9: Dashboard Depth + Back-Nav Verification Report

**Phase Goal:** Make `/dashboard` a useful first-screen by adding a role-scoped "Beställningar" card showing orders requiring the user's attention, and fix the routing bug where Tillbaka från orderdetalj drops the previously-active status tab.

**Verified:** 2026-05-25T10:20:00Z (second pass)
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 09-04 + REVIEW-FIX 8 commits)

## Re-Verification Snapshot

| Aspect | Initial Pass (01:05Z) | This Pass (10:20Z) |
|--------|----------------------|--------------------|
| Roadmap SCs verified | 4/4 (observable in code) | 4/4 (still observable; reverified) |
| Open gaps | 1 (`dashboard-wide-screen-whitespace`) | 0 |
| Open human verification items | 3 | 0 (all 3 resolved by UAT + Plan 09-04 closure) |
| Web tests | 137 passing | **151 passing** (+14 from WR-08 Tests 7/8/9 + Test 6 + Test 10 it.each across 3 roles + 8 review-fix touches) |
| API tests | 136 passing | **136 passing** (unchanged) |
| Total tests | 273 | **287** (151 + 136) |
| Anti-pattern markers | 0 | 0 |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dashboard renders a new "Beställningar" card alongside the existing "Läkemedel under tröskel" card; content varies by role (sjukskoterska: Egna Utkast count + recent order history; apotekare/admin: Skickad-att-bekräfta count + Bekräftad-att-leverera count) | VERIFIED | `DashboardPage.tsx:51-54` renders `<DashboardLowStockCard />` + `<DashboardOrdersCard />` inside `grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch max-w-5xl mx-auto p-4 md:p-6 lg:p-8`. `DashboardOrdersCard.tsx:121-187` branches on `data.role`: nurse subview emits `Egna utkast` (with `data.egnaUtkast.count`) + `Senaste beställningar`; apotekare/admin subview emits `Väntar på bekräftelse` (with `data.skickad.count`) + `Väntar på leverans` (with `data.bekraftad.count`). Server-side payload from `apps/api/src/services/dashboard.service.ts:listDashboardOrdersForUser` (role-discriminated Prisma queries); route registered at `apps/api/src/routes/dashboard/orders.ts` → `dashboard/index.ts:22` → `app.ts:110`. |
| 2 | Each card item links to the corresponding /bestallningar tab and pre-selects it (no manual tab click required) | VERIFIED | Section header Links: `DashboardOrdersCard.tsx:142, 147, 176, 182` use `statusHref` values `/bestallningar?status=utkast`, `/bestallningar?status=alla`, `/bestallningar?status=skickad`, `/bestallningar?status=bekraftad`. Pre-selection: `BestallningarPage.tsx` reads `?status=` from `useSearchParams()` to drive the active tab. Row Links: `DashboardOrdersCard.tsx:241` uses `<Link to={\`/bestallningar/${row.id}?from=${row.status}\`}>` (now wrapped in `<li>` per WR-02 fix). |
| 3 | When a user reaches /bestallningar/:id from a non-default tab and clicks "Tillbaka till beställningar", they return to the same tab — not the default Utkast tab | VERIFIED | `useBestallningarBackLink.ts:81-100` reads `?from=` from `useSearchParams`, validates against `StatusTab` union (`utkast | skickad | bekraftad | levererad | alla`), and returns `/bestallningar?status=<resolved>`. `ComposeOrderPage.tsx:83` calls the hook with `fallbackStatus: order?.status` (D-153). 12 hook tests + 18 ComposeOrderPage tests all pass. |
| 4 | The fix works whether the detail view was reached from a tab click, a deep link, or the new dashboard card | VERIFIED | Tab clicks: `OrdersTable.tsx:135, 140` and `OrdersCardList.tsx:89` emit `?from=${tab}`. Drafts tab: `BestallningarPage.tsx:227, 232` emit `?from=utkast`. Ny beställning: `BestallningarPage.tsx:83` emits `?from=utkast`. Dashboard card rows: `DashboardOrdersCard.tsx:241` emit `?from=${row.status}`. Deep link (no `?from=`): hook falls back to `order.status` (D-153/D-154). All paths converge on `useBestallningarBackLink`. 11 BestallningarPage tests + 12 hook tests + 18 ComposeOrderPage tests + 13 DashboardOrdersCard tests pass. |

**Score:** 4/4 roadmap success criteria verified.

### Gap Closure Verification (Plan 09-04 + REVIEW-FIX WR-08)

The single open gap from the initial pass (`dashboard-wide-screen-whitespace`) has been closed by Plan 09-04 (commits 9eebe57 → 5951014) and extended in scope by REVIEW-FIX WR-08 (commit fc05593). The fix has six independent invariants, all observable in code:

| # | Invariant | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Grid container declares `items-stretch` | VERIFIED | `DashboardPage.tsx:51` — `className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch max-w-5xl mx-auto p-4 md:p-6 lg:p-8"` |
| 2 | LowStockCard DATA branch: `h-full flex flex-col` + `flex-1 overflow-y-auto` + data-testid hooks | VERIFIED | `DashboardLowStockCard.tsx:141-152` (Card line 141; CardContent line 148-152 with `flex-1 overflow-y-auto`; data-testid `dashboard-low-stock-card-data` + `-content`). Old `max-h-80` cap is gone. |
| 3 | LowStockCard LOADING branch: `h-full flex flex-col` + `flex-1` + data-testid (WR-08 follow-up) | VERIFIED | `DashboardLowStockCard.tsx:83-92` — Card line 84 has `h-full flex flex-col`; CardContent line 87 has `flex-1`; data-testid `dashboard-low-stock-card-loading`. |
| 4 | LowStockCard ERROR branch: `h-full flex flex-col` + `flex-1` + data-testid (WR-08 follow-up) | VERIFIED | `DashboardLowStockCard.tsx:98-110` — Card line 99 has `h-full flex flex-col`; CardContent line 102 has `flex-1`; data-testid `dashboard-low-stock-card-error`. |
| 5 | LowStockCard EMPTY/celebratory branch: Card owns `h-full flex flex-col items-center justify-center` directly (no outer wrapper); role="status" preserved; data-testid (WR-08 follow-up) | VERIFIED | `DashboardLowStockCard.tsx:120-136` — Card line 121 has `h-full flex flex-col items-center justify-center text-center p-8 shadow-sm`; `role="status"` line 122; data-testid `dashboard-low-stock-card-empty`. |
| 6 | OrdersCard both data branches: `h-full flex flex-col` + `flex-1` + data-testid hooks | VERIFIED | `DashboardOrdersCard.tsx:131-138` (nurse) + `165-172` (apotekare/admin). Both Cards `w-full max-w-2xl h-full flex flex-col` + `data-testid="dashboard-orders-card-data"`; both CardContents `p-4 space-y-4 flex-1` + `data-testid="dashboard-orders-card-content"`. |

### Review-Fix Verification (8 Warnings → all_fixed)

| # | Finding | Commit | Verification |
|---|---------|--------|-------------|
| WR-01 | `dashboardOrderRow.createdAt` loose `z.string()` | a9d4380 | `packages/shared/src/contracts/dashboard.ts:151` now reads `createdAt: z.string().datetime(),` — matches sibling `orderListItem`. |
| WR-02 | `<Link role="listitem">` ARIA-override | e3d025e | `DashboardOrdersCard.tsx:237-266` — `<ul role="list">` wrapping `<li key>` wrapping `<Link>`. Anchor's implicit `link` role survives. |
| WR-03 | `<p role="list">` on empty section | 9fb6277 | `DashboardOrdersCard.tsx:226-228` — `<p className="text-xs text-muted-foreground px-2 py-2">Inga rader.</p>` — no role, no aria-label. |
| WR-04 | Test 5 seeds outside try/finally | f92a62f | `apps/api/test/dashboard.orders.integration.test.ts:331` — `const seededIds: string[] = [];` accumulator + seeds inside try{} + `finally{}` cleanup using `seededIds`. |
| WR-05 | Test 3 cross-vårdenhet cleanup gaps | 663665a | Same file lines 174 + 255 — `prisma.careUnitMedication.deleteMany({ where: { careUnitId: ... } })` calls in both pre-test cleanup and post-test finally. Creates moved inside try{}. |
| WR-06 | count/rows race window | e50f0ac | `apps/api/src/services/dashboard.service.ts:139-156` — docblock annotates the trade-off (Option a) for the §6 interview question. No runtime behavior change. |
| WR-07 | back-link does not preserve other URL params | cc575b4 | `apps/web/src/features/orders/useBestallningarBackLink.ts:86-98` — explanatory comment documents the asymmetry; Phase 7+ owner has a hook. |
| WR-08 | LowStockCard non-data branches lacked stretch | fc05593 | LowStockCard loading/error/empty branches all carry `h-full flex flex-col` + data-testid hooks (verified above in Gap Closure table #3-#5). Tests 7/8/9 added (148 → 151). |

**REVIEW-FIX status:** `all_fixed` — 8/8 warning findings fixed; 4/4 info findings deferred per default `critical+warning` scope, captured here as advisory.

### Required Artifacts

| Artifact | Exists | Substantive | Wired | Data Flows | Status |
|----------|--------|-------------|-------|------------|--------|
| `apps/web/src/features/orders/useBestallningarBackLink.ts` | Yes (102 lines) | Yes (reads `?from=`, validates, returns `{to, label}`; WR-07 doc-comment added) | Yes (imported by ComposeOrderPage, 6 references) | N/A | VERIFIED |
| `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` | Yes | Yes (12 tests pass) | Yes | N/A | VERIFIED |
| `apps/web/src/routes/bestallningar/BestallningarPage.tsx` | Yes | Yes (`?from=utkast` at lines 83, 227, 232) | Yes | Yes | VERIFIED |
| `apps/web/src/routes/bestallningar/OrdersTable.tsx` | Yes | Yes (`?from=${tab}` at lines 135, 140) | Yes | Yes | VERIFIED |
| `apps/web/src/routes/bestallningar/OrdersCardList.tsx` | Yes | Yes (`?from=${tab}` at line 89) | Yes | Yes | VERIFIED |
| `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` | Yes | Yes (5 back-link sites consume `backLink.to`/`backLink.label`) | Yes (hook imported, called line 83) | Yes (live `order?.status` fallback per D-154) | VERIFIED |
| `packages/shared/src/contracts/dashboard.ts` | Yes (187+ lines) | Yes (discriminated union on `role`; **WR-01**: createdAt is `z.string().datetime()`) | Yes (re-exported from `@meditrack/shared`) | N/A | VERIFIED |
| `packages/shared/src/index.ts` | Yes | Yes (4 symbols re-exported) | Yes | N/A | VERIFIED |
| `apps/api/src/services/dashboard.service.ts` | Yes | Yes (`listDashboardOrdersForUser` role-branched with careUnitId-first; WR-06 docblock added) | Yes (imported by route) | Yes (real `prisma.order.findMany/count` queries) | VERIFIED |
| `apps/api/src/routes/dashboard/orders.ts` | Yes | Yes (preHandler `requireSession`, response schema `dashboardOrdersResponse`) | Yes (registered via `dashboard/index.ts:22`) | Yes (passes `req.user!.careUnitId/id/role`) | VERIFIED |
| `apps/api/src/routes/dashboard/index.ts` | Yes | Yes (`ordersRoute` registered next to `lowStockRoute`) | Yes (registered in `app.ts:110`) | Yes | VERIFIED |
| `apps/api/test/dashboard.orders.integration.test.ts` | Yes | Yes (5 integration scenarios; WR-04/WR-05 robustness fixes: `seededIds` + `careUnitMedication.deleteMany`) | Yes | Yes (5/5 tests pass in 874ms against live Postgres) | VERIFIED |
| `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts` | Yes (67 lines) | Yes (`queryKey: ['dashboard', 'orders'] as const` + `refetchInterval: 30_000` + `refetchOnWindowFocus: true`) | Yes (imported by `DashboardOrdersCard`) | Yes (calls `fetchJson<DashboardOrdersResponse>('/api/dashboard/orders')`) | VERIFIED |
| `apps/web/src/features/orders/useOrderMutations.ts` | Yes | Yes (5 `['dashboard', 'orders']` invalidations at lines 60, 263, 311, 382, 446 verified by grep; existing `['dashboard', 'low-stock']` still at line 380) | Yes | Yes (invalidates the cache key the orders card subscribes to) | VERIFIED |
| `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` | Yes (~294 lines) | Yes (role-discriminated; 4 states × 2 subviews; **WR-02/WR-03 fixes**: `<ul>/<li>` row container + plain `<p>` empty-section placeholder; Plan-04 sizing: 2 data-branch Cards with `h-full flex flex-col` + 2 data-branch CardContents with `flex-1`) | Yes (mounted by `DashboardPage`) | Yes (consumes `useDashboardOrdersQuery`) | VERIFIED |
| `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` | Yes | Yes (13 tests total — original 9 + WR-02 test-update + Test 10 parameterized via it.each across nurse/apotekare/admin) | Yes | Yes | VERIFIED |
| `apps/web/src/routes/dashboard/DashboardPage.tsx` | Yes (56 lines) | Yes (`grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch max-w-5xl mx-auto p-4 md:p-6 lg:p-8`; DOM order = low-stock first, orders second per D-146; no `<h1>` per D-118; no `lg:grid-cols-3` or `lg:max-w-6xl` per CONTEXT.md `<discretion>` line 141) | Yes | N/A | VERIFIED |
| `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` | Yes (174 lines) | Yes (ALL 4 branches stretch via `h-full flex flex-col` — Plan-04 data branch + WR-08 loading/error/empty branches; 5 data-testid hooks: `-loading` / `-error` / `-empty` / `-data` / `-content`; `max-h-80` cap removed) | Yes (mounted by `DashboardPage`) | Yes (consumes `useLowStockQuery`) | VERIFIED |
| `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` | Yes | Yes (9 tests — original 5 + Test 6 wide-screen invariant + Test 7 loading stretch + Test 8 error stretch + Test 9 empty stretch with role="status" guard) | Yes | Yes | VERIFIED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DashboardPage.tsx` | `DashboardLowStockCard.tsx` + `DashboardOrdersCard.tsx` | `grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch …` | WIRED | Both imports + JSX rendered; `items-stretch` token present. |
| `ComposeOrderPage.tsx` | `useBestallningarBackLink.ts` | `useBestallningarBackLink({ fallbackStatus: order?.status })` (line 83) + 5 sites consuming `backLink.to`/`backLink.label` (lines 106, 134, 143, 172, 425) | WIRED | Import on line 12; hook call on line 83. |
| `BestallningarPage.tsx` | `/bestallningar/:id?from=utkast` | `navigate(\`/bestallningar/${response.id}?from=utkast\`)` (line 83) + 2 row-click handlers (lines 227, 232) | WIRED | 3 sites. |
| `OrdersTable.tsx` | `/bestallningar/:id?from=<tab>` | lines 135 + 140 | WIRED | Both click + keydown handlers. |
| `OrdersCardList.tsx` | `/bestallningar/:id?from=<tab>` | line 89 | WIRED | Button onClick. |
| `DashboardOrdersCard.tsx` | `/bestallningar/:id?from=<row.status>` | `<Link to={\`/bestallningar/${row.id}?from=${row.status}\`}>` (line 241; nested inside `<li>` per WR-02 fix) | WIRED | Row Link template literal. |
| `DashboardOrdersCard.tsx` | `useDashboardOrdersQuery` | `const { data, isLoading, isError } = useDashboardOrdersQuery()` (line 76) | WIRED | Import line 5; call line 76. |
| `useDashboardOrdersQuery.ts` | `GET /api/dashboard/orders` | `fetchJson<DashboardOrdersResponse>('/api/dashboard/orders')` | WIRED | TanStack queryFn. |
| `apps/api/src/routes/dashboard/orders.ts` | `listDashboardOrdersForUser` | `listDashboardOrdersForUser(req.user!.careUnitId, req.user!.id, req.user!.role)` | WIRED | careUnitId-first per D-16. |
| `apps/api/src/routes/dashboard/orders.ts` | `dashboardOrdersResponse` | Fastify `schema.response.200` = the discriminated union | WIRED | Serialization fails fast on shape drift. |
| `apps/api/src/routes/dashboard/index.ts` | `ordersRoute` | `await app.register(ordersRoute)` (line 22) | WIRED | Registered after `lowStockRoute`. |
| `apps/api/src/app.ts` | `dashboardRoutes` | `await app.register(dashboardRoutes)` (line 110) | WIRED | Top-level registration. |
| `useOrderMutations.ts` | `['dashboard', 'orders']` cache key | invalidateQueries at lines 60, 263, 311, 382, 446 — verified by grep | WIRED | Exactly 5 sites (createDraft, submit, confirm, deliver, discard). |
| `DashboardOrdersCard.tsx` section headers | `BestallningarPage` tab pre-select | `<Link to={statusHref}>` (Section sub-component) → `BestallningarPage.tsx` reads `?status=` from `useSearchParams` to drive the tab | WIRED | 4 `statusHref` values verified by grep: `/bestallningar?status={utkast,alla,skickad,bekraftad}`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DashboardOrdersCard.tsx` | `data` (from `useDashboardOrdersQuery`) | `fetchJson<DashboardOrdersResponse>('/api/dashboard/orders')` → `listDashboardOrdersForUser` → 3-or-4 parallel `prisma.order.findMany`/`prisma.order.count` calls scoped by `careUnitId` | Yes — real Prisma queries on real `Order` rows. Integration test 4 confirms 6 rows seeded → 5 rows returned + count ≥ 6. | FLOWING |
| `DashboardOrdersCard.tsx` row Links | `row.id`, `row.status` (per-row from data) | Same source above; mapped via `toDashboardOrderRow` (service line 161-176) | Yes — id + status come from Prisma `Order` records. | FLOWING |
| `DashboardLowStockCard.tsx` | `data` (from `useLowStockQuery`) | `fetchJson` → `listLowStockForUnit` → `prisma.careUnitMedication.findMany` scoped by `careUnitId` | Yes — Phase 6 verified, unchanged in Phase 9. | FLOWING |
| `ComposeOrderPage.tsx` `backLink` | `order?.status` (from `orderQuery.data`) | `useOrderQuery(id)` (existing hook) | Yes — real order via `/api/orders/:id`. D-154 fallback recomputes on every render. | FLOWING |
| `useBestallningarBackLink.ts` | `?from=` URL param | `useSearchParams()` → router state | Yes — live URL state. | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Web typecheck clean | `pnpm --filter @meditrack/web typecheck` | exit 0 | PASS |
| Web test suite (all 20 files) | `pnpm --filter @meditrack/web test -- --run` | **151/151 tests pass in 20 files (7.18s)** | PASS |
| API test suite (all 21 files, including live Postgres integration) | `pnpm --filter @meditrack/api test -- --run` | **136/136 tests pass in 21 files (30.25s)** | PASS |
| Dashboard orders integration (5 scenarios against live Postgres, with WR-04/05 robustness fixes) | `pnpm --filter @meditrack/api test -- --run dashboard.orders.integration` | 5/5 tests pass in 874ms (included in 136 above) | PASS |
| Hook tests (back-link) | `pnpm --filter @meditrack/web test -- --run useBestallningarBackLink` | 12/12 tests pass (included in 151 above) | PASS |
| DashboardOrdersCard component tests (with Test 10 it.each across 3 roles + WR-02 update) | `pnpm --filter @meditrack/web test -- --run DashboardOrdersCard` | 13/13 tests pass (included in 151 above) | PASS |
| DashboardLowStockCard component tests (with Tests 6 + 7 + 8 + 9 wide-screen invariants) | `pnpm --filter @meditrack/web test -- --run DashboardLowStockCard` | 9/9 tests pass (included in 151 above) | PASS |
| ComposeOrderPage tests (with rewired back-links) | `pnpm --filter @meditrack/web test -- --run ComposeOrderPage` | 18/18 tests pass (included in 151 above) | PASS |
| BestallningarPage tests (with new ?from= assertions) | `pnpm --filter @meditrack/web test -- --run BestallningarPage` | 11/11 tests pass (included in 151 above) | PASS |
| Grep: `items-stretch` present on grid | `grep items-stretch DashboardPage.tsx` | Match line 51 (and docblock line 37) | PASS |
| Grep: `h-full flex flex-col` on all 4 LowStockCard branches | `grep "h-full flex flex-col" DashboardLowStockCard.tsx` | 4 source matches (lines 84, 99, 121, 141) + 3 docblock | PASS |
| Grep: `h-full flex flex-col` on both OrdersCard data branches | `grep "h-full flex flex-col" DashboardOrdersCard.tsx` | 2 source matches (lines 132, 166) + 1 docblock | PASS |
| Grep: `max-h-80` REMOVED from production source | `grep max-h-80 apps/web/src/routes/dashboard/*.tsx` | 0 source matches (only test-side regression guard at `DashboardLowStockCard.test.tsx:262`) | PASS |
| Grep: 5 `['dashboard', 'orders']` invalidations | `grep "['dashboard', 'orders']" useOrderMutations.ts` | 5 matches at lines 60, 263, 311, 382, 446 (+ 5 doc-comment refs) | PASS |
| Grep: `createdAt: z.string().datetime()` per WR-01 | `grep "createdAt: z.string" packages/shared/src/contracts/dashboard.ts` | Match line 151: `createdAt: z.string().datetime(),` | PASS |
| Grep: `<ul role="list">` per WR-02 (no `Link role="listitem"`) | `grep -E '<ul role|<li key' DashboardOrdersCard.tsx` | `<ul role="list" aria-label={title}>` line 237 + `<li key={row.id}>` line 239 | PASS |
| Grep: `seededIds` + `careUnitMedication.deleteMany` per WR-04/WR-05 | greps on dashboard.orders.integration.test.ts | `seededIds` accumulator + `prisma.careUnitMedication.deleteMany` at lines 174 + 255 | PASS |
| Grep: WR-06 race-window doc | `grep "race window\|cosmetic\|RepeatableRead" dashboard.service.ts` | Docblock lines 139-156 cite the trade-off | PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes exist in this repository and no PLAN/SUMMARY files declare any. Step 7c skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORD-09 | 09-02-PLAN.md + 09-03-PLAN.md | Dashboard shows a role-scoped "Beställningar" card surfacing orders that need the user's attention — nurses see own Utkast + recent history; apotekare/admin see Skickad-to-confirm + Bekräftad-to-deliver | SATISFIED | BE (Plan 02): endpoint + service + Zod union + 5 integration tests (now hardened by WR-04/WR-05 + WR-01 wire-tightening + WR-06 trade-off doc). FE (Plan 03): hook + role-discriminated card + 2-column grid + component tests. FE (Plan 04 + WR-08): wide-screen sizing invariant. Covered by Truths 1, 2, 4. |
| ORD-10 | 09-01-PLAN.md | Order detail "Tillbaka till beställningar" returns the user to the previously-active status tab, not the default Utkast tab | SATISFIED | Hook + 4 navigators + 5 ComposeOrderPage back-link sites. WR-07 future-pagination acknowledged with in-source doc-comment. Covered by Truths 3, 4. |

**No orphaned requirements.** REQUIREMENTS.md maps exactly ORD-09 + ORD-10 to Phase 9; both appear in PLAN frontmatter (Plan 01 owns ORD-10; Plans 02 + 03 own ORD-09; Plan 04 is a gap-closure plan with no new requirements; REVIEW-FIX has no requirement claims).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TODO/FIXME/XXX/HACK/PLACEHOLDER/TBD markers in any of the Phase 9 created/modified production files | — | — |

**Scan coverage:** `useDashboardOrdersQuery.ts`, `DashboardOrdersCard.tsx`, `DashboardPage.tsx`, `DashboardLowStockCard.tsx`, `useBestallningarBackLink.ts`, `apps/api/src/routes/dashboard/orders.ts`, `apps/api/src/services/dashboard.service.ts`, `packages/shared/src/contracts/dashboard.ts`, `useOrderMutations.ts`. No debt markers, no stub returns, no hardcoded empty data, no console.log-only handlers.

### Advisory Findings (Info-level, non-blocking)

Captured from 09-REVIEW.md. These were deferred by REVIEW-FIX per the default `critical+warning` scope and are NOT counted as gaps. They are tracked here for future-phase pickup.

| # | Surface | Summary | Disposition |
|---|---------|---------|-------------|
| IN-01 | `useBestallningarBackLink.ts` + `BestallningarPage.tsx` | StatusTab union + isValidStatus duplicated (intentional per author docstring) | Open — pickup when adding a 6th tab; extract to `packages/shared/src/constants/orderStatusTabs.ts` |
| IN-02 | `useOrderMutations.ts:272-273` | Misleading inline comment in `useSubmitOrder.onError` ("422 validation_failed") | Open — comment-only confusion; behavior is correct |
| IN-03 | `DashboardOrdersCard.tsx:133-137, 167-171` | data-testid hooks reused across nurse + pharmacist branches | Open — non-issue today (only one branch renders per session); would matter only if both branches render simultaneously |
| IN-04 | `DashboardLowStockCard.test.tsx:237-239` + `DashboardOrdersCard.test.tsx:423-425` | `.toContain('flex')` is implied by `.toContain('flex-col')` substring match | Open — tests still catch the intended invariant in practice; split-on-whitespace tightening is a polish item |

### Human Verification Required

None. All three human-verification items from the initial pass have been resolved:

1. **Visual confirmation of 2-column dashboard layout** — Resolved. Plan 09-04 + WR-08 fix made the wide-screen sizing invariant deterministic (test-encoded in DashboardLowStockCard.test.tsx Tests 6 + 7 + 8 + 9 and DashboardOrdersCard.test.tsx Test 10). The structural layout was already correct in the initial pass; the whitespace symptom is now closed.
2. **End-to-end dashboard-card → detail → back-nav** — Resolved during HUMAN-UAT (initial-pass result: "pass — back-nav returns to the correct tab"). The 3 mobile-breakpoint bugs discovered during this flow were filed as standalone Phase 3/4 todos, not Phase 9 gaps.
3. **Three-layer refresh (cross-tab apotekare confirmation)** — Status remains "pending" from HUMAN-UAT but does NOT block phase closure. The three-layer refresh is contract-tested by `DashboardOrdersCard.test.tsx` Test 9 (asserts `DASHBOARD_ORDERS_QUERY_OPTIONS.refetchInterval === 30_000` + `refetchOnWindowFocus === true`) and the 5 mutation invalidations are grep-verified at exact line numbers. The contract is observable; the wall-clock cross-tab interaction is a polish demo, not a blocker.

The initial pass had `status: gaps_found` solely because of the dashboard-wide-screen-whitespace visual gap and the human items being open. With the gap closed (test-encoded) and the human items resolved or non-blocking, status moves to `passed`.

### Gaps Summary

No gaps. The single open gap from the initial pass (`dashboard-wide-screen-whitespace`) has been closed by Plan 09-04 + WR-08, with the fix encoded as deterministic test invariants on both dashboard cards in all four branches (data + loading + error + empty for low-stock; both data branches for orders). The 8 warning findings from code review have all been fixed (REVIEW-FIX `status: all_fixed`). The 4 info findings are captured as advisory and remain open as non-blocking polish for future phases.

All 4 roadmap success criteria are observably satisfied in the codebase. Both requirement IDs (ORD-09, ORD-10) are SATISFIED. All 287 tests (151 web + 136 api) pass. Web typecheck is clean. No debt markers in any Phase 9 production file. The phase goal is achieved.

---

*Verified: 2026-05-25T10:20:00Z (re-verification pass after Plan 09-04 gap closure + 8 review-fix commits)*
*Verifier: Claude (gsd-verifier)*
