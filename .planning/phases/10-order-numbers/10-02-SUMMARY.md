---
phase: 10-order-numbers
plan: 02
subsystem: web

tags: [react, identity, swedish-ui, mobile-first, playwright]

# Dependency graph
requires:
  - phase: 10-order-numbers
    provides: orderNumber + orderNumberCounter + orderNumberYear on every order envelope (Plan 10-01 BE end-to-end)
  - phase: 07-ops-submission-polish
    provides: sc04 mobile-first verification harness (apps/web/scripts/captureSc04Screenshots.ts)
  - phase: 09-dashboard-depth-back-nav
    provides: DashboardOrdersCard row layout + Section structure, sc04 mobile screenshot baselines
provides:
  - "OrdersTable: leftmost Best.nr column rendering order.orderNumber"
  - "DraftsTable: leftmost Best.nr column rendering order.orderNumber"
  - "OrdersCardList + DraftCard: orderNumber promoted to top-of-card heading slot (mobile)"
  - "ComposeOrderPage: H1 reads 'Beställning ORD-YYYY-####' (status pill carries status; H1 carries identity)"
  - "DashboardOrdersCard: per-row layout promotes orderNumber over createdBy.name as the row identity"
  - "SubmitConfirmationBanner: 'Beställning ORD-YYYY-#### är skickad.' copy embeds the number verbatim"
  - "aria-labels at every row site updated to reference orderNumber rather than formatRelative(timestamp)"
  - "Component test extensions assert new copy + DOM presence (BestallningarPage, ComposeOrderPage, SubmitConfirmationBanner, DashboardOrdersCard)"
  - "sc04 harness fix: /bestallningar/ny resolves to a real draft id (was a 404 placeholder)"
affects: [11-final-prep README screenshots, dashboard 'ovan vikningen' follow-up]

# Tech tracking
tech-stack:
  added: []  # Zero new runtime dependencies; pure UI shape + Swedish copy + test additions
  patterns:
    - "Identity-on-the-left, status-on-the-right (D-167): the H1 carries identity (orderNumber), the OrderStatusPill carries lifecycle state — no more duplicated status copy"
    - "font-mono on the orderNumber identity slot — code-style glyph rendering distinguishes ORD-YYYY-#### from prose"
    - "Harness route resolution: the screenshot harness fetches /api/orders?status=utkast and substitutes the first draft id into the /bestallningar/:id route, so the Compose screenshot reflects the real Compose page (not the 404 placeholder)"

key-files:
  created:
    - .planning/phases/10-order-numbers/10-02-SUMMARY.md
  modified:
    - apps/web/src/routes/bestallningar/OrdersTable.tsx
    - apps/web/src/routes/bestallningar/DraftsTable.tsx
    - apps/web/src/routes/bestallningar/OrdersCardList.tsx
    - apps/web/src/routes/bestallningar/DraftsCardList.tsx
    - apps/web/src/routes/bestallningar/DraftCard.tsx
    - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
    - apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx
    - apps/web/src/routes/dashboard/DashboardOrdersCard.tsx
    - apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx
    - apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx
    - apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx
    - apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx
    - apps/web/scripts/captureSc04Screenshots.ts
    - docs/screenshots/sc04-360-bestallningshistorik.png
    - docs/screenshots/sc04-360-bestallningsskapande.png
    - .planning/phases/10-order-numbers/deferred-items.md
---

# Plan 10-02 Summary — FE Order Numbers (ORD-11 Slice 2)

Light up Phase 10's ORD-11 in the FE: every order-rendering surface promotes
`orderNumber` to identity-level visual prominence. The H1 carries identity
(ORD-YYYY-####); the OrderStatusPill keeps carrying lifecycle state.

## What landed

| Surface | Change |
|---|---|
| `OrdersTable` | Leftmost `Best.nr` column, `font-mono`, `order.orderNumber` |
| `DraftsTable` | Leftmost `Best.nr` column, `font-mono`, `order.orderNumber` |
| `OrdersCardList` | Top-of-card heading is `ORD-YYYY-####` (was: relative timestamp) |
| `DraftCard` | Top-of-card heading is `ORD-YYYY-####` (was: status copy) |
| `ComposeOrderPage` | H1 reads `Beställning ORD-YYYY-####`; OrderStatusPill renders separately |
| `DashboardOrdersCard` | Row primary line is `orderNumber` (font-mono); actor + relative timestamp consolidate into the muted secondary line |
| `SubmitConfirmationBanner` | Copy reads `Beställning ORD-YYYY-#### är skickad.` verbatim |
| Component tests | Extended to assert new copy + DOM presence (BestallningarPage, ComposeOrderPage, SubmitConfirmationBanner, DashboardOrdersCard) |

## Visual verification

The plan asked for a re-run of the sc04 mobile-first screenshot harness with a
human-verify checkpoint. Two issues surfaced during checkpoint review:

1. **Harness bug:** the harness used `/bestallningar/ny` for the
   `bestallningsskapande` slug, but the real route is `/bestallningar/:id` —
   so `:id="ny"` rendered the 404 placeholder (`Beställning hittades inte. Den
   här vyn fylls i nästa fas.`) and the screenshot couldn't capture the new H1.
   **Fix:** the harness now hits `GET /api/orders?status=utkast` after login and
   substitutes the first draft's id into the route, so the Compose screenshot
   reflects the actual Compose page. Committed as a separate `fix(10-02)`.

2. **Stale docker image:** the docker `meditrack-web` container was built from
   `main` before Wave 2 was merged, so it served pre-Wave-2 bundle even though
   the worktree had the new code. Worked around by capturing screenshots
   against a Vite dev server started directly from the worktree. Surfaced as
   D-10-04 in `deferred-items.md` (README should call out
   `docker compose up --build`, not just `up`, after FE source changes).

## What's committed

- `sc04-360-bestallningshistorik.png` — leftmost identity is now `ORD-2026-####`
  on the Utkast tab (was: relative timestamp). Verifies DraftsCard layout shift.
- `sc04-360-bestallningsskapande.png` — H1 reads
  `Beställning ORD-2026-0001` with the `Utkast` status pill below (was:
  `Nytt utkast Utkast`). Verifies ComposeOrderPage identity promotion.

## What's NOT committed (and why)

- `sc04-360-dashboard.png`: the regenerated fullPage screenshot was
  **158,406 pixels tall / 9.4 MB** because `DashboardLowStockCard` renders all
  3433 seeded low-stock medications without virtualization. Wave 2 only
  modified `DashboardOrdersCard`, not the LowStockCard — the size blow-up is
  a pre-existing data-volume issue, not a Wave 2 regression. Committing a
  9.4 MB PNG would bloat the repo for zero diagnostic value (the rendered
  height makes the image unreadable). The DashboardOrdersCard change is
  verified via component tests + an element-scoped visual capture during the
  checkpoint. Surfaced as D-10-03 in `deferred-items.md` — recommended
  follow-up: cap LowStockCard at top-5 with "Visa fler" or virtualize.
- `sc04-360-audit.png` and `sc04-360-lakemedel.png`: out of plan scope (Wave 2
  didn't touch the audit or läkemedel surfaces). Their regenerated copies
  reflect unrelated pre-existing changes in those areas. Reverted to the
  HEAD-committed versions to keep the diff scoped to ORD-11 surfaces.

## Mechanical verification

- sc04 harness: **all 24 cells PASSED** (4 viewports × 6 routes — no
  horizontal overflow, primary nav reachable in every non-`/login` cell)
- Component tests pass (run during executor self-check)
- BE end-to-end tests (post-Wave 1 merge): 145/145 BE + 151/151 FE green;
  re-verified after Wave 1 merge with regenerated Prisma client

## Commits (this plan, on worktree branch)

1. `feat(10-02)`: leftmost Best.nr column on OrdersTable + DraftsTable
2. `feat(10-02)`: orderNumber as card heading on OrdersCardList + DraftCard
3. `feat(10-02)`: order-number H1 on ComposeOrderPage + SubmitConfirmationBanner
4. `feat(10-02)`: promote orderNumber on DashboardOrdersCard row layout
5. `test(10-02)`: extend FE component tests with orderNumber assertions
6. `fix(10-02)`: harness resolves /bestallningar/ny to a real draft id
7. `chore(10-02)`: regenerate sc04 screenshots showing ORD-#### promotion

## Deferred items (added during this plan)

- **D-10-03** DashboardLowStockCard renders all rows unbounded (pre-existing
  data-volume issue surfaced during this plan's screenshot re-run; out of
  scope; recommend top-N + "Visa fler" follow-up)
- **D-10-04** docker compose web image is stale-by-design (no source mount;
  `up --build` is required after FE changes; document in README)

## Self-Check: PASSED

- [x] All 7 plan tasks executed (5 implementation + 1 test extension + 1
      human-verify checkpoint cleared)
- [x] Each task committed atomically with conventional-commit subject
- [x] No modifications to STATE.md / ROADMAP.md (orchestrator owns these)
- [x] sc04 harness re-run produces PASSED verification across all 24 cells
- [x] Human-verify checkpoint resolved (visual confirmation of ORD-####
      promotion on bestallningshistorik + bestallningsskapande screenshots;
      DashboardOrdersCard verified via element-scoped capture)
- [x] SUMMARY.md created and committed before agent return
