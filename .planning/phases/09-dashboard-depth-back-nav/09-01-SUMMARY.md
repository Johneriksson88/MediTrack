---
phase: 09-dashboard-depth-back-nav
plan: 01
subsystem: ui
tags: [react, react-router-dom, vitest, useSearchParams, url-as-state, tdd]

# Dependency graph
requires:
  - phase: 04-confirm-deliver-stock
    provides: "BestallningarPage StatusTab union + ?status= URL-as-state (D-82) — Phase 9 mirrors the contract for ?from= on /bestallningar/:id"
  - phase: 03-draft-orders
    provides: "ComposeOrderPage Mode A/B/C/D/E shells + the 5 back-link sites (3 inline Link, 1 Button-wrapping Link, 1 navigate-after-discard) Phase 9 rewires"
  - phase: 04-confirm-deliver-stock
    provides: "OrdersTable / OrdersCardList tab prop (NonUtkastTab) — Phase 9 reuses it as the source of the ?from= value"
provides:
  - "useBestallningarBackLink hook — single source of truth for ?from= → /bestallningar?status= URL resolution"
  - "?from=<status> propagation at all 4 navigators (Ny beställning + DraftsTable/DraftsCardList row clicks + OrdersTable/OrdersCardList row clicks)"
  - "ComposeOrderPage back-link rewire across all 5 sites (loading + 404 inline + 404 Button + header + post-discard)"
  - "BackLink contract { to: string; label: string } reusable by Slice C DashboardOrdersCard row links"
affects:
  - "Phase 9 Slice C — DashboardOrdersCard row links will pass ?from=<row.status> to honor the same back-nav surface"
  - "Phase 10 — order numbers (ORD-11) feed the same back-link helper unchanged"

# Tech tracking
tech-stack:
  added: []  # No new deps — react-router-dom useSearchParams + vitest renderHook already in tree.
  patterns:
    - "URL-as-state via ?from= query param — extends Phase 2 D-44 (filter chips) and Phase 4 D-82 (status tabs)"
    - "Inline-duplicated StatusTab union / isValidStatus predicate to keep cross-file coupling minimal (per 09-CONTEXT.md <code_context> line 213)"
    - "Read-only useSearchParams() hook pattern — never call setSearchParams from a helper hook"
    - "renderHook + MemoryRouter wrapper (no QueryClient) for hook tests that only depend on the router"

key-files:
  created:
    - "apps/web/src/features/orders/useBestallningarBackLink.ts — D-149..D-156 helper hook (84 LOC including docblock)"
    - "apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx — 6 scenarios × 12 sub-tests"
  modified:
    - "apps/web/src/routes/bestallningar/BestallningarPage.tsx — handleNyBestallning + 2 DraftsTable/DraftsCardList row-click callbacks now emit ?from=utkast (D-150 #1, #3)"
    - "apps/web/src/routes/bestallningar/OrdersTable.tsx — onClick + onKeyDown row navigators emit ?from=${tab} (D-150 #2)"
    - "apps/web/src/routes/bestallningar/OrdersCardList.tsx — button onClick emits ?from=${tab} (D-150 #2)"
    - "apps/web/src/routes/bestallningar/ComposeOrderPage.tsx — 5 back-link sites rewired to backLink.to / backLink.label (D-151/D-152/D-153/D-155)"
    - "apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx — existing assertion updated + 3 new tests (Utkast / Skickade / Alla row clicks)"
    - "apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx — existing assertion updated + 5 new tests (loading / 404 / fallback / override / post-discard)"

key-decisions:
  - "Honored D-149..D-156 verbatim — URL search param, all 4 navigators, helper hook location, persist-through-state-changes, order.status fallback, recompute every render, loading/404 no-fallback, invalid silently dropped"
  - "Honored <discretion> bullet — always ?from=utkast for Ny beställning regardless of source tab"
  - "Honored <discretion> bullet — Alla tab clicks emit ?from=alla (not row.status); tab value flows through verbatim"
  - "StatusTab union + isValidStatus predicate duplicated inline in the hook rather than imported from BestallningarPage.tsx, per 09-CONTEXT.md <code_context> line 213 'smaller surface, no cross-file coupling'"
  - "Did NOT change the verbatim 'Tillbaka till beställningar' Swedish copy — backLink.label hard-codes that string so existing ComposeOrderPage assertion at line 236 stays green without test churn"

patterns-established:
  - "Helper hook for URL-as-state writes — first dedicated URL helper hook under apps/web/src/features/orders/; future ?from=-aware surfaces (Slice C dashboard card) consume the same hook unchanged"
  - "renderHook + MemoryRouter wrapper (no QueryClient) — appropriate for hooks whose only dependency is the router; future router-only hooks should mirror this shape"

requirements-completed: [ORD-10]

# Metrics
duration: 12min
completed: 2026-05-25
---

# Phase 9 Plan 01: Back-Nav Fix (Slice A) Summary

**useBestallningarBackLink hook + ?from=<status> propagation at 4 navigators + 5 ComposeOrderPage back-link sites — back-nav now lands on the originating status tab (Skickade/Bekräftade/Levererade/Alla/Utkast) instead of the default Utkast.**

## Performance

- **Duration:** ~12 min (first task commit 2026-05-25T00:03:30+02:00, final task commit 2026-05-25T00:14:57+02:00)
- **Started:** 2026-05-25T00:03:30+02:00
- **Completed:** 2026-05-25T00:14:57+02:00
- **Tasks:** 3 (each test→implement TDD pair)
- **Files modified:** 7 (1 new hook, 1 new test file, 5 edits)
- **Tests added/updated:** 12 new (hook) + 4 in BestallningarPage (1 updated + 3 new) + 6 in ComposeOrderPage (1 updated + 5 new)
- **Final test count:** 134/134 passing across 19 files; typecheck clean

## Accomplishments

- **ORD-10 SC#3 satisfied** for tab-click and deep-link sources — back-nav returns to the same tab. Verified by 18 ComposeOrderPage tests + 11 BestallningarPage tests + 12 hook tests.
- **ORD-10 SC#4 partially satisfied** — works for tab clicks AND deep links (the dashboard-card source is Slice C's responsibility, but Slice C will consume the same hook unchanged).
- **Single source of truth** — all back-link construction lives in one 84-line file with its own test surface (`apps/web/src/features/orders/useBestallningarBackLink.ts`).
- **Existing UI copy preserved verbatim** — `backLink.label` returns `'Tillbaka till beställningar'` exactly, so the existing `ComposeOrderPage.test.tsx` line 236 assertion stays green without test churn.

## Task Commits

Each task followed a RED → GREEN TDD cycle (no REFACTOR commits needed — implementations were minimal):

1. **Task 1 (RED): failing tests for useBestallningarBackLink** — `72964df` (test)
2. **Task 1 (GREEN): implement hook** — `1aa9be3` (feat) — includes inline Rule-1 fix in test file: lifted `initialProps` `as const` literal-narrowing so rerender({fallbackStatus: 'bekraftad'}) is type-correct
3. **Task 2 (RED): extend BestallningarPage tests for ?from= propagation** — `7f35a3d` (test)
4. **Task 2 (GREEN): propagate ?from= at the 4 navigators** — `45a6d6e` (feat) — includes inline Rule-1 fix in test (d): aria-label regex updated from `/öppna beställning/i` (used by OrdersTable/OrdersCardList) to `/öppna utkast/i` (used by DraftsTable/DraftCard)
5. **Task 3 (RED): extend ComposeOrderPage tests for back-link rewire** — `79312a2` (test)
6. **Task 3 (GREEN): rewire 5 ComposeOrderPage sites + update existing (11) assertion** — `f587a3d` (feat) — includes Rule-1 fix to existing test (11) assertion to reflect the new D-152/D-153 contract (post-discard navigates to `/bestallningar?status=utkast` via backLink.to, no longer bare `/bestallningar`)

_Plan metadata commit (this SUMMARY) follows separately._

## Files Created/Modified

### Created (2)

- `apps/web/src/features/orders/useBestallningarBackLink.ts` — D-149..D-156 helper hook. `useBestallningarBackLink(opts?: { fallbackStatus?: StatusTab }): BackLink`. Read-only — uses `useSearchParams()[0]` only.
- `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` — 6 scenarios fanning into 12 sub-tests covering valid ?from=, invalid ?from= (silent drop + fallback fall-through), fallback alone, neither, rerender (D-154), and parameterized acceptance of all 5 StatusTab members.

### Modified (5)

- `apps/web/src/routes/bestallningar/BestallningarPage.tsx` — `handleNyBestallning` + DraftsTable.onRowClick + DraftsCardList.onCardClick now append `?from=utkast`. No structural change.
- `apps/web/src/routes/bestallningar/OrdersTable.tsx` — `TableRow` `onClick` + `onKeyDown` now append `?from=${tab}`. `tab` prop already in scope since Phase 4.
- `apps/web/src/routes/bestallningar/OrdersCardList.tsx` — `button` `onClick` now appends `?from=${tab}`. `tab` prop already in scope since Phase 4.
- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — added `useBestallningarBackLink` import + `const backLink = useBestallningarBackLink({ fallbackStatus: order?.status })` call (after `const order = orderQuery.data;`). All 5 back-link sites consume `backLink.to` and `backLink.label`. ChevronLeft icon + classNames + surrounding `<div>`s preserved verbatim. Docblock for Discard flow updated to mention `backLink.to` and Phase 9 D-152.
- `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` — existing (c) "Ny beställning" assertion updated to expect `?from=utkast`; added (d) Utkast row click, (e) Skickade row click, (f) Alla row click (asserts tab value, not row status, flows into `?from=`). New helper `mockOrdersByStatusQuery`.
- `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` — `renderComposeOrderPage` now accepts an `initialPath` parameter (default `/order-1` preserves the existing 12 tests). New helpers `setupOrderQueryLoading` + fixture `MOCK_ORDER_BEKRAFTAD`. Existing (11) discard assertion updated to reflect new D-152/D-153 contract. Added (13) loading ?from=, (14) 404 ?from= on BOTH back-links, (15) order.status fallback, (16) ?from= wins over fallback, (17) post-discard preserves ?from=.

## Back-link contract (Slice C consumer)

The hook returns:

```ts
interface BackLink {
  to: string;        // '/bestallningar?status=<resolved>' OR bare '/bestallningar' when nothing is known
  label: string;     // always 'Tillbaka till beställningar' (verbatim Swedish)
}
```

Slice C's `DashboardOrdersCard` row links pass `?from=<row.status>` at construction; no hook call needed on the dashboard side (those are plain `<Link to={…}>` not `<Link to={backLink.to}>`).

## 4 navigators that now emit `?from=<status>`

| # | Site | Value | Decision |
|---|------|-------|----------|
| 1 | `BestallningarPage.handleNyBestallning` (line ~81) | `?from=utkast` (always) | D-150 #3 + `<discretion>` — new draft always lives in Utkast |
| 2 | `BestallningarPage` DraftsTable `onRowClick` (line ~225) | `?from=utkast` | D-150 #1 — drafts only render on the Utkast tab |
| 2 | `BestallningarPage` DraftsCardList `onCardClick` (line ~230) | `?from=utkast` | D-150 #1 |
| 3 | `OrdersTable.tsx` `TableRow` `onClick` + `onKeyDown` (lines ~135, ~140) | `?from=${tab}` | D-150 #2 — tab value flows verbatim |
| 4 | `OrdersCardList.tsx` `button` `onClick` (line ~89) | `?from=${tab}` | D-150 #2 |

## 5 ComposeOrderPage sites that now consume `useBestallningarBackLink`

| # | Site | Lines | Replacement |
|---|------|-------|-------------|
| 1 | Loading-state inline back link | ~95–101 | `to={backLink.to}` + `{backLink.label}` |
| 2 | 404-state inline back link | ~123–129 | `to={backLink.to}` + `{backLink.label}` |
| 3 | 404-state Button-wrapped Link | ~133–135 | `to={backLink.to}` + Button text `{backLink.label}` |
| 4 | Header back link | ~161–167 | `to={backLink.to}` + `{backLink.label}` |
| 5 | Post-discard `navigate(…)` | ~413 | `navigate(backLink.to)` |

## Decisions Made

All decisions were locked in 09-CONTEXT.md `<decisions>` block (D-149..D-156); Slice A honored them verbatim:

- **D-149 — URL search param `?from=<status>`.** Survives refresh, deep-linkable, shareable. Same convention as Phase 4 D-82.
- **D-150 — All 4 navigators construct `?from=<status>`.** Uniform mechanism; no caller is "special".
- **D-151 — Helper hook lives at `apps/web/src/features/orders/useBestallningarBackLink.ts`.** Reused by all 5 ComposeOrderPage back-link sites; validation + URL-building in exactly one file.
- **D-152 — `?from=` persists across in-page state changes (submit/confirm/deliver/discard).** Nothing strips the param. Verified by ComposeOrderPage test (17).
- **D-153 — Fallback to `order.status` when `?from=` is absent.** Resolution priority: valid `?from=` → `opts.fallbackStatus` → `null` (bare `/bestallningar`). Verified by ComposeOrderPage tests (15) and (16).
- **D-154 — Fallback recomputes on every render.** When `?from=` is absent and `order.status` changes mid-session, the back-link follows the live status. Verified by hook test (5).
- **D-155 — Loading + 404 states get the no-fallback path.** `order` is undefined → hook receives `fallbackStatus: undefined`. Verified by ComposeOrderPage tests (13) and (14).
- **D-156 — Invalid `?from=` values silently treated as missing.** No console.warn, no toast. Verified by hook test (2).

Honored `<discretion>` bullets:
- **Ny beställning always emits `?from=utkast` regardless of source tab.**
- **"Alla" tab clicks emit `?from=alla`** (not the row's own status).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `initialProps: { fallbackStatus: 'skickad' as const }` over-narrowed the rerender prop type**
- **Found during:** Task 1 GREEN, via typecheck
- **Issue:** `as const` made `initialProps` literally `{ fallbackStatus: 'skickad' }`, so subsequent `rerender({ fallbackStatus: 'bekraftad' })` calls failed TS2322: `Type '"bekraftad"' is not assignable to type '"skickad"'`.
- **Fix:** Extracted an explicit `type Props = { fallbackStatus?: StatusTab }` alias and passed `initialProps: Props`, allowing all 5 StatusTab members through `rerender`.
- **Files modified:** `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx`
- **Verification:** `pnpm --filter @meditrack/web typecheck` exits 0; 12/12 tests pass.
- **Committed in:** `1aa9be3` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Test (d) Utkast row used wrong aria-label regex**
- **Found during:** Task 2 GREEN, first test run
- **Issue:** Test (d) used `getAllByLabelText(/öppna beställning/i)`, which matches OrdersTable/OrdersCardList rows but NOT DraftsTable/DraftCard rows — those carry `aria-label='Öppna utkast skapat …'` (per `DraftsTable.tsx` line 67). Test failed with "Unable to find a label with the text of: /öppna beställning/i".
- **Fix:** Updated the regex in test (d) to `/öppna utkast/i`. Tests (e) and (f) already used the right regex for their tabs.
- **Files modified:** `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx`
- **Verification:** 11/11 BestallningarPage tests pass.
- **Committed in:** `45a6d6e` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] Existing ComposeOrderPage test (11) discard assertion stale after rewire**
- **Found during:** Task 3 GREEN, first test run
- **Issue:** Test (11) asserted `expect(navigateFn).toHaveBeenCalledWith('/bestallningar')`. With the Phase 9 rewire, the discard flow now calls `navigate(backLink.to)` — and with MOCK_ORDER_UTKAST (status: 'utkast') + no `?from=`, the hook resolves to `/bestallningar?status=utkast` via D-153 fallback. The pre-Phase-9 assertion was therefore stale and falsely failing on the new (correct) behavior.
- **Fix:** Updated the assertion to `'/bestallningar?status=utkast'` and added a comment citing D-152/D-153.
- **Files modified:** `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx`
- **Verification:** 18/18 ComposeOrderPage tests pass; the new (17) post-discard test also passes the corresponding `?from=skickad` scenario.
- **Committed in:** `f587a3d` (Task 3 GREEN commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs surfaced during implementation/verification)
**Impact on plan:** All three fixes were direct consequences of the plan's changes, not scope creep. The over-narrowed test type (#1) is a TS subtlety not visible from PLAN.md alone; the wrong aria-label regex (#2) was a oversight on my part during test authoring (the plan correctly says to use `mockDraftsQuery` for the Utkast tab — I just picked the wrong label substring); the stale discard assertion (#3) was a planned consequence of D-152 that the existing test happened to predate. No architectural decisions changed; no plan rewrites needed.

## Issues Encountered

- **Initial Write tool path issue:** First attempt wrote the test file to the main repo path (`C:/Projekt/MediTrack/apps/web/...`) instead of the worktree path (`C:/Projekt/MediTrack/.claude/worktrees/agent-a77eb9e390afea223/apps/web/...`). Caught immediately when running tests via `cd worktree && pnpm test` showed the file missing. Deleted the misplaced file, re-Wrote to the correct worktree-relative absolute path. This is exactly the worktree absolute-path-safety scenario in `references/worktree-path-safety.md`.
- **Worktree `node_modules` not pre-installed:** First `pnpm test` invocation in the worktree failed with `'vitest' is not recognized`. Ran `pnpm install` (5.8s — lockfile up to date, only deduplicated install) to materialize `node_modules`. Subsequent test runs all worked.

## Threat Flags

None — Slice A is pure URL-state plumbing. No new endpoints, no new RBAC surface, no new mutations, no new audited actions. The threat model in PLAN.md `<threat_model>` lists three threats all dispositioned `accept` with severity `low`/`trivial` (decorative `?from=` param; tab-name disclosure already present via `?status=`; spoofed deep-links already gated by `requireSession` + careUnit scope).

## User Setup Required

None — no external service configuration, no new env vars, no migrations.

## Next Phase Readiness

- **Slice B (ORD-09 BE)** ready to start — independent of Slice A; consumes nothing from this slice.
- **Slice C (ORD-09 FE)** ready once Slice B lands — will consume `useBestallningarBackLink` indirectly (`DashboardOrdersCard` row links pass `?from=<row.status>` at construction; ComposeOrderPage's hook reads it). No additional Slice A work required.
- **No blockers; no concerns.**

## Self-Check: PASSED

- `apps/web/src/features/orders/useBestallningarBackLink.ts` exists.
- `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` exists.
- All commits exist:
  - `72964df` — `test(09-01): add failing tests for useBestallningarBackLink (RED)`
  - `1aa9be3` — `feat(09-01): implement useBestallningarBackLink hook (GREEN)`
  - `7f35a3d` — `test(09-01): extend BestallningarPage tests for ?from= propagation (RED)`
  - `45a6d6e` — `feat(09-01): propagate ?from=<status> at all 4 navigators (GREEN)`
  - `79312a2` — `test(09-01): extend ComposeOrderPage tests for back-link rewire (RED)`
  - `f587a3d` — `feat(09-01): rewire all 5 ComposeOrderPage back-nav sites to useBestallningarBackLink (GREEN)`
- `pnpm --filter @meditrack/web test` — 134/134 passing across 19 files.
- `pnpm --filter @meditrack/web typecheck` — exits 0.

---
*Phase: 09-dashboard-depth-back-nav*
*Completed: 2026-05-25*
