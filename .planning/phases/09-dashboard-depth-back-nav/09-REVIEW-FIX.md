---
phase: 09-dashboard-depth-back-nav
fixed_at: 2026-05-25T10:00:00Z
review_path: .planning/phases/09-dashboard-depth-back-nav/09-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-05-25T10:00:00Z
**Source review:** `.planning/phases/09-dashboard-depth-back-nav/09-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (Warning-severity WR-01..WR-08; Info findings IN-01..IN-04 deferred per default `critical+warning` scope)
- Fixed: 8
- Skipped: 0
- Status: all_fixed
- Test delta: 148 → 151 (+3 from WR-08 Tests 7/8/9 in DashboardLowStockCard)

## Fixed Issues

### WR-01: dashboardOrderRow.createdAt loose z.string()

**Files modified:** `packages/shared/src/contracts/dashboard.ts`
**Commit:** `a9d4380`
**Applied fix:** Tightened `createdAt` from `z.string()` to `z.string().datetime()` to match the sibling `orderListItem.createdAt`. Inline comment explains the wire enforcement and points at the symmetric contract. Existing fixtures (full ISO-8601 with `Z` suffix) parse cleanly; DashboardOrdersCard tests still pass.

### WR-08: LowStockCard loading/error/empty branches lacked wide-screen stretch

**Files modified:** `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx`, `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx`
**Commit:** `fc05593`
**Applied fix:**
- Loading branch: Card now declares `h-full flex flex-col`, CardContent declares `flex-1`. New `data-testid="dashboard-low-stock-card-loading"`.
- Error branch: same stretch + `flex-1` on the destructive-Alert CardContent. New `data-testid="dashboard-low-stock-card-error"`.
- Empty/celebratory branch: dropped the outer `flex items-center justify-center flex-1 p-8` wrapper (whose `flex-1` was a no-op under the grid parent). The celebratory Card now owns `h-full flex flex-col items-center justify-center` directly, growing to fill the grid cell. `role="status"` preserved verbatim. New `data-testid="dashboard-low-stock-card-empty"`. Card cap widened from `max-w-md` to `max-w-2xl` for symmetry with the data-branch.
- Test 7 (loading stretch), Test 8 (error stretch), Test 9 (empty stretch + role="status" guard) added; full suite goes from 6 → 9 LowStockCard tests, all green.

### WR-02: `<Link role="listitem">` ARIA-overrode anchor's link role

**Files modified:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx`, `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx`
**Commit:** `e3d025e`
**Applied fix:** Switched row container from `<div role="list">` to `<ul role="list" className="list-none p-0 m-0">` and wrapped each row's `<Link>` in a `<li>`. Both list semantics and link semantics now survive (li contributes `listitem` role, the nested `<a>` keeps implicit `link` role). Tailwind list-reset utilities preserve the visual layout. Test 5 (row href contract) updated to query the link via `within(li).getByRole('link')` instead of casting the listitem to `HTMLAnchorElement`. Tests 1, 2, 6 unchanged — they work with either container element since `<li>` retains the implicit `listitem` role.

### WR-03: empty-section `<p role="list">` violated ARIA 1.2

**Files modified:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx`
**Commit:** `9fb6277`
**Applied fix:** Dropped `role="list"` and `aria-label={title}` from the empty-state `<p>Inga rader.</p>` placeholder. A `<p>` is phrasing content and cannot legally host a `list` role with zero `listitem` children. The non-empty branch (which has real list semantics from WR-02) is untouched. No test changes needed — no existing test exercised the empty-section branch.

### WR-04: Test 5 seeds outside try-block leaked orphan orders on partial failure

**Files modified:** `apps/api/test/dashboard.orders.integration.test.ts`
**Commit:** `f92a62f`
**Applied fix:** Moved all three `prisma.order.create` calls inside the `try{}` block. IDs accumulate in a `seededIds: string[]` array as each create returns; the `finally{}` block always deletes whatever was successfully seeded. No happy-path behavior change; only failure-mode robustness.

### WR-05: Test 3 cross-vårdenhet cleanup gaps

**Files modified:** `apps/api/test/dashboard.orders.integration.test.ts`
**Commit:** `663665a`
**Applied fix:**
- Pre-test cleanup: added `prisma.careUnitMedication.deleteMany({ where: { careUnitId: staleCu.id } })` before `careUnit.delete()`. No-op today; defensive against future Phase 8/10 seed paths that may add per-care-unit medications and trip the FK constraint.
- Seed creates (`otherCareUnit`, `otherUser`, `otherOrder`) moved inside `try{}`. Each create's return is captured in a nullable holder; `finally{}` null-guards each cleanup step so a mid-creation throw cleans only what was made.
- Mirrored `careUnitMedication.deleteMany` on the finally side too.

### WR-06: count/rows race window (transient cosmetic drift)

**Files modified:** `apps/api/src/services/dashboard.service.ts`
**Commit:** `e50f0ac`
**Applied fix:** Per the reviewer's recommendation (Fix option (a)): annotated the trade-off in the `listDashboardOrdersForUser` docblock so the §6 "two nurses ordering simultaneously" interview question has a documented answer. The lightweight-bias choice — wrapping each (`findMany`, `count`) pair in `prisma.$transaction([...], { isolationLevel: 'RepeatableRead' })` would close the window at the cost of one transaction per dashboard load; for a one-week interview with 30s background-refetch healing the inconsistency, the cosmetic-only impact does not justify the connection-pool pressure. No production-behavior change.

### WR-07: useBestallningarBackLink does not preserve other URL params

**Files modified:** `apps/web/src/features/orders/useBestallningarBackLink.ts`
**Commit:** `cc575b4`
**Applied fix:** Per the reviewer's recommendation (no code change in Phase 9 scope): added an explanatory comment above the `to = ...` line documenting that only `status=` is preserved on the destination URL. Notes that BestallningarPage's tab-change handler does preserve other params (asymmetric), and that Phase 7's planned pagination will tickle this. Future fix requires the row-click navigation to stash the full incoming search string (e.g., `?from=skickad&return=<urlencoded>`) — out of scope here. The comment gives Phase 7+ owner a clear hook. No production-behavior change.

## Skipped Issues

None — all 8 Warning-severity findings were fixed.

## Verification Summary

- **Web typecheck (`pnpm --filter @meditrack/web typecheck`):** exit 0 after every commit.
- **API typecheck:** pre-existing errors in `apps/api/src/services/order.service.ts` and `apps/api/src/auth/*` exist on the master baseline (unrelated to Phase 9 review fixes); the modified files (`dashboard.service.ts`, `dashboard.orders.integration.test.ts`) introduce zero new errors — verified via `npx tsc --noEmit -p .` + `grep dashboard.orders|dashboard\.service`.
- **Web test suite (`pnpm --filter @meditrack/web test -- --run`):** 151/151 passing across 20 files. Baseline was 148; +3 matches the WR-08 Tests 7/8/9 additions.
- **Targeted test verifications applied per FE-affecting commit:**
  - WR-01 → `DashboardOrdersCard` 13/13 green.
  - WR-08 → `DashboardLowStockCard` 9/9 green.
  - WR-02 → `DashboardOrdersCard` 13/13 green.
  - WR-03 → `DashboardOrdersCard` 13/13 green.
  - WR-07 → `useBestallningarBackLink` 12/12 green.

## Commits

| # | Finding | Commit | Files |
|---|---------|--------|-------|
| 1 | WR-01 | `a9d4380` | `packages/shared/src/contracts/dashboard.ts` |
| 2 | WR-08 | `fc05593` | `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx`, `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` |
| 3 | WR-02 | `e3d025e` | `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx`, `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` |
| 4 | WR-03 | `9fb6277` | `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` |
| 5 | WR-04 | `f92a62f` | `apps/api/test/dashboard.orders.integration.test.ts` |
| 6 | WR-05 | `663665a` | `apps/api/test/dashboard.orders.integration.test.ts` |
| 7 | WR-06 | `e50f0ac` | `apps/api/src/services/dashboard.service.ts` |
| 8 | WR-07 | `cc575b4` | `apps/web/src/features/orders/useBestallningarBackLink.ts` |

## Decisions / Constraint Adherence

- **D-118 (no page-level heading):** unchanged.
- **D-145 (responsive 2-col grid at md+):** unchanged. `DashboardPage.tsx` not touched.
- **D-146 (low-stock first, orders second):** unchanged.
- **CONTEXT.md `<discretion>` line 141 (no `lg:`-tier amendments above md on the grid container):** unchanged. No `lg:grid-cols-3` or `lg:max-w-6xl` added.
- **Swedish UI strings:** preserved verbatim everywhere. `Läkemedel under tröskel`, `Alla läkemedel är över tröskel.`, `Inga rader.`, `Tillbaka till beställningar`, `Kunde inte hämta lagernivåer — försök igen om en stund.`, etc. all unchanged.
- **Per-finding atomic commits:** 8 commits, one per warning, all following `fix(09): <id> <description>` pattern.

---

_Fixed: 2026-05-25T10:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
