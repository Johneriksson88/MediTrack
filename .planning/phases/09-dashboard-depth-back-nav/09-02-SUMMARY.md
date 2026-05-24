---
phase: 09-dashboard-depth-back-nav
plan: 02
subsystem: api
tags: [fastify, zod, prisma, postgres, discriminated-union, dashboard, orders, rbac]

# Dependency graph
requires:
  - phase: 06-ai-categorization-low-stock-notifications
    provides: "dedicated dashboard endpoint pattern (D-120) + own cache key + Phase 6 dashboard.service.ts host file for the new sibling function; routes/dashboard barrel; integration-test helpers (buildTestApp, loginAs, ensureAllRolesSeeded, resetSessions)"
  - phase: 04-confirm-deliver-stock
    provides: "Order status machine + actor trios (submittedBy/confirmedBy/deliveredBy) so the dashboard rows surface 'who created it' for every status"
  - phase: 03-draft-orders
    provides: "Order/OrderLine schema with createdByUserId, careUnitId scoping (D-16), soft-delete (deletedAt)"
  - phase: 01-foundation-auth
    provides: "requireSession decorating req.user.{id, role, careUnitId}; three-role enum (apotekare/sjukskoterska/admin); Role type"
provides:
  - "GET /api/dashboard/orders endpoint returning a role-discriminated payload (nurse vs apotekare/admin) over the published Zod discriminated union"
  - "dashboard.service.ts:listDashboardOrdersForUser(careUnitId, userId, role) — careUnitId-first per D-16"
  - "packages/shared dashboardOrderRow + dashboardOrdersResponse contracts (re-exported from @meditrack/shared)"
  - "5-scenario integration test surface for the new endpoint (subview shape × 2, cross-vårdenhet isolation, top-5 cap, DESC by createdAt)"
affects: [09-03-dashboard-orders-fe, 10-order-numbers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod discriminated union over `role` for role-aware API payloads (FE narrows on `data.role`; Fastify validates response shape at serialize time)"
    - "Two-query-pair-per-section pattern (findMany top-N + count total) so each dashboard section returns both preview rows AND an actionable total"

key-files:
  created:
    - "apps/api/src/routes/dashboard/orders.ts"
    - "apps/api/test/dashboard.orders.integration.test.ts"
    - ".planning/phases/09-dashboard-depth-back-nav/09-02-SUMMARY.md"
  modified:
    - "packages/shared/src/contracts/dashboard.ts"
    - "packages/shared/src/index.ts"
    - "apps/api/src/services/dashboard.service.ts"
    - "apps/api/src/routes/dashboard/index.ts"

key-decisions:
  - "D-141 reified: dedicated endpoint + own cache key — payload returns only what the dashboard card renders (top-5 + count per section)"
  - "D-142 reified: discriminated union on `role` — Fastify serialization fails fast if the service returns a subview that does not match the literal role field"
  - "D-143 reified: nurse recentHistory is vårdenhet-wide (any author) and excludes utkast; drafts have their own egnaUtkast section"
  - "D-144 reified: top-5 DESC by createdAt; count carries the total (may exceed 5)"
  - "D-16 reified: careUnitId is the FIRST argument on listDashboardOrdersForUser; every findMany + count includes `where: { careUnitId, ... }`"
  - "Added `deletedAt: null` filter on every order query (Rule 2 — missing critical) so discarded drafts never surface on the dashboard, matching the listOrdersForUnit convention (D-62/D-33)"
  - "Used Promise.all to parallelise the 3 nurse queries and 4 pharmacist queries — single round-trip latency wins matter on a card that polls every 30s (D-148 forward-compat)"

patterns-established:
  - "Section-with-preview pattern: each dashboard section is `{ count: total, rows: top-5 }` so the FE can render a meaningful subtitle (`totalt 12`) AND show row context without a second roundtrip"
  - "Role-discriminator on the wire: server reads `req.user!.role` (never client input — T-09-06 mitigation) and branches the payload; the FE imports the union type and narrows via the literal discriminator"

requirements-completed: [ORD-09]

# Metrics
duration: ~5m
completed: 2026-05-25
---

# Phase 9 Plan 02: Dashboard "Beställningar" Backend Summary

**Dedicated `GET /api/dashboard/orders` endpoint with a Zod discriminated-union payload — nurses see own utkast + vårdenhet-wide non-utkast history; apotekare/admin see skickad + bekraftad waiting-on-me sections.**

## Performance

- **Duration:** ~5 min (code-time across the 3 task commits)
- **Started:** 2026-05-25T00:18:00Z (worktree spawn)
- **First commit:** 2026-05-24T22:21:54Z (Task 1)
- **Last commit:** 2026-05-24T22:26:46Z (Task 3)
- **Tasks:** 3
- **Files modified:** 4 (2 shared, 2 api)
- **Files created:** 2 (routes/dashboard/orders.ts, test/dashboard.orders.integration.test.ts)

## Accomplishments

- Shared `dashboardOrdersResponse` Zod discriminated union (on `role`) published from `@meditrack/shared`, with `dashboardOrderRow` as the per-row sub-schema — FE and BE share the exact same wire shape from one source of truth.
- New service function `listDashboardOrdersForUser(careUnitId, userId, role)` branches role-aware: nurses get their own utkast + vårdenhet-wide non-utkast history (D-143); apotekare/admin get skickad + bekraftad sections. Both branches use `Promise.all` over the 3–4 underlying Prisma queries so a single round-trip latency wins on the 30s-poll cache (D-148 forward-compat).
- New route `GET /api/dashboard/orders` registered next to `lowStockRoute`. Gated by `requireSession` only (no `requirePermission` — all three roles see the dashboard per D-15/D-120/D-141). Response schema is the discriminated union, so Fastify validates the subview at serialize time (T-09-05 mitigation).
- Five-scenario integration test surface (`apps/api/test/dashboard.orders.integration.test.ts`) covering nurse subview shape, apotekare subview shape, cross-vårdenhet isolation (T-09-04 — disjoint id sets), top-5 cap, and DESC-by-createdAt ordering. All five pass against a live `docker compose` Postgres stack.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared dashboard contract + barrel** — `e917a8b` (feat)
2. **Task 2: Service function + route + barrel registration** — `9956110` (feat)
3. **Task 3: 5-scenario integration test** — `1f9194c` (test)

_(SUMMARY commit pending — emitted by the worktree closeout step in `execute-plan.md`.)_

## Files Created/Modified

- `packages/shared/src/contracts/dashboard.ts` — extended with `dashboardOrderRow` schema + type, module-private `nurseSubview` / `pharmacistSubview` building blocks, exported `dashboardOrdersResponse` discriminated union + `DashboardOrdersResponse` type. Preserves Phase 6 low-stock exports verbatim.
- `packages/shared/src/index.ts` — widened the dashboard re-export block with the 4 new symbols (`dashboardOrderRow`, `DashboardOrderRow`, `dashboardOrdersResponse`, `DashboardOrdersResponse`); updated the section comment to cite D-141/D-142 alongside the existing D-08/D-120/NTF-01.
- `apps/api/src/services/dashboard.service.ts` — appended `listDashboardOrdersForUser(careUnitId, userId, role)` with role branching, `toDashboardOrderRow` mapper, `dashboardOrderInclude` constant, and `DASHBOARD_ROW_LIMIT = 5`. Every Prisma query includes `where: { careUnitId, ..., deletedAt: null }` for cross-tenant and soft-delete safety.
- `apps/api/src/routes/dashboard/orders.ts` — new Fastify route mirroring `lowStock.ts` verbatim; only difference is the contract import, service call, and the `req.user!.id` + `req.user!.role` arguments passed alongside `req.user!.careUnitId`.
- `apps/api/src/routes/dashboard/index.ts` — registers `ordersRoute` after `lowStockRoute`. Order mirrors the dashboard layout (D-146: low-stock left/top, orders right/bottom).
- `apps/api/test/dashboard.orders.integration.test.ts` — new test file. 5 scenarios; idempotent setup + finally-block teardown for Test 3's second-vårdenhet ceremony; far-future `createdAt` strategy in Test 5 to keep DESC ordering deterministic regardless of other rows in the DB.

## Decisions Made

- **Promise.all over the per-section queries.** Each branch runs its 3 (nurse) or 4 (pharmacist) Prisma calls in parallel. The dashboard polls every 30s per D-148; even small serial latencies stack up over the day across all logged-in users.
- **`deletedAt: null` filter on every query.** Not strictly in the plan's `<action>` block, but consistent with `listOrdersForUnit` (D-62/D-33). A nurse who discards an utkast must not see it on the dashboard the next moment — applied as Rule 2 (missing critical correctness).
- **Far-future `createdAt` in Test 5.** The test seeds rows with `createdAt = now + 1 year` and 1-hour staggers. Cleaner than `Date.now() - 100` / `- 200` because it sidesteps any race with other rows in the test DB (which might also have very-recent `createdAt`s) — the seeded trio is guaranteed to occupy the top of the egnaUtkast slice.
- **Module-private subview schemas.** `nurseSubview` and `pharmacistSubview` are NOT exported; only `dashboardOrderRow` and `dashboardOrdersResponse` cross the barrel. FE narrows via the discriminator literal, not by importing the inner subview directly.
- **Resolved nurse `userId` via `prisma.user.findUniqueOrThrow({ where: { email } })`** in Tests 1, 4, and 5 rather than threading a `userId` field through `TEST_SJUKSKOTERSKA`. Matches the existing pattern (`orders.deliver.integration.test.ts` does the same).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Added `deletedAt: null` filter to every Prisma query in the new service function.**

- **Found during:** Task 2 (implementation of `listDashboardOrdersForUser`).
- **Issue:** The plan's `<action>` block specified `where: { careUnitId, status: 'utkast', createdByUserId: userId }` etc., but did not include `deletedAt: null`. Order has a soft-delete column (Phase 3 D-62/D-33) and `listOrdersForUnit` filters discarded drafts. Without the filter, a nurse who discards an utkast would still see it on the dashboard until refresh, and the apotekare's `skickad.count` would over-report if a Discard-after-Submit ever lands.
- **Fix:** Added `deletedAt: null` to all 6 `where:` clauses (3 findMany + 3 count for the two branches combined — actually 7: 3 nurse queries + 4 pharmacist queries, all gain the filter).
- **Files modified:** `apps/api/src/services/dashboard.service.ts`.
- **Verification:** Service typechecks against the existing Order Prisma type that includes `deletedAt`; integration tests pass.
- **Committed in:** `9956110` (Task 2 commit).

**2. [Rule 3 — Blocking] Generated Prisma client + reinstalled `node_modules` in the fresh worktree.**

- **Found during:** Task 2 verification (`pnpm --filter @meditrack/api typecheck`).
- **Issue:** The worktree was spawned without `node_modules` (`pnpm install` had not been run) and without a generated Prisma client (`apps/api/node_modules/.prisma/client` was absent). Typecheck failed with ~30 pre-existing errors (e.g., `Module '"@prisma/client"' has no exported member 'Order'`). These were not introduced by Phase 9 — they were universal blockers.
- **Fix:** Ran `pnpm install --frozen-lockfile` at the repo root, then `pnpm --filter @meditrack/api prisma:generate`. After both, all typecheck errors resolved and the API typechecks + builds cleanly.
- **Files modified:** Generated artifacts only (`node_modules/`); no source changes.
- **Verification:** `pnpm --filter @meditrack/api typecheck` exits 0; `pnpm --filter @meditrack/api build` exits 0; the 5 integration tests pass.
- **Committed in:** Not committed (generated artifacts are gitignored). Recorded as a deviation for the next worktree spawn — `pnpm install` + `pnpm prisma:generate` should run as part of worktree setup.

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking).
**Impact on plan:** Both auto-fixes were necessary for correctness/buildability. No scope creep — both align with established conventions in the repo (soft-delete convention from Phase 3, Prisma client generation from every prior phase's setup).

## Issues Encountered

- None during planned work — Tasks 1, 2, and 3 each landed on the first try (no debug loops). The two deviations above were the only mid-task interventions.

## Stub / Threat Surface Scan

- **Stubs:** None. Every new code path is wired end-to-end; the dashboard rows render real data and the integration test asserts the wire shape via `dashboardOrdersResponse.parse(res.json())`.
- **Threat surface:** No new surface beyond what the plan's `<threat_model>` enumerated (T-09-04 .. T-09-08). T-09-04 is mechanically asserted by Test 3; T-09-05 is structurally enforced by the Fastify response schema; T-09-06 is structurally enforced by reading `req.user!.role` (server-decorated, never client input); T-09-07 inherits the existing `requireSession` 401 + `@fastify/rate-limit`; T-09-08 inherits Prisma's typed query builder (no `$queryRaw` in this new code).

## Self-Check

See `## Self-Check: PASSED` block below — created files exist, commits resolve, build + tests green.

## Next Phase Readiness

- ORD-09 backend is complete and demoable via `curl -b 'meditrack.sid=<cookie>' http://localhost:3000/api/dashboard/orders`.
- Slice C (Plan 09-03, FE dashboard card) can consume this endpoint via the new `useDashboardOrdersQuery` hook and discriminate on `data.role` to render the matching subview without further BE changes.
- The 5 mutation hook invalidations Plan 09-03 will add (`['dashboard', 'orders']` cache key) are pure FE additions; this plan ships nothing on that surface.
- No blockers for parallel Slice A (Plan 09-01, ORD-10 back-nav fix) — this slice is purely BE and the back-nav slice is purely FE on URL-state.

---

## Self-Check: PASSED

**Created files exist:**
- FOUND: `apps/api/src/routes/dashboard/orders.ts`
- FOUND: `apps/api/test/dashboard.orders.integration.test.ts`
- FOUND: `.planning/phases/09-dashboard-depth-back-nav/09-02-SUMMARY.md`

**Commits resolve:**
- FOUND: `e917a8b` (Task 1 — shared contract + barrel)
- FOUND: `9956110` (Task 2 — service + route + barrel registration)
- FOUND: `1f9194c` (Task 3 — 5-scenario integration test)

**Verification re-run (final gate):**
- `pnpm --filter @meditrack/shared build` → exit 0
- `pnpm --filter @meditrack/shared typecheck` → exit 0
- `pnpm --filter @meditrack/api typecheck` → exit 0
- `pnpm --filter @meditrack/api build` → exit 0
- `pnpm --filter @meditrack/api test -- dashboard.orders.integration` → 5/5 passed

---
*Phase: 09-dashboard-depth-back-nav*
*Completed: 2026-05-25*
