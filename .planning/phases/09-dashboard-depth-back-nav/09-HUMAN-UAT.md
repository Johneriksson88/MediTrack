---
status: diagnosed
phase: 09-dashboard-depth-back-nav
source: [09-VERIFICATION.md]
started: 2026-05-25T01:05:00Z
updated: 2026-05-25T01:18:00Z
---

## Current Test

[complete]

## Tests

### 1. 2-column dashboard layout at md+, stacked at <md
expected: On a 1024px viewport, DashboardLowStockCard is left of DashboardOrdersCard; at 360px both cards stack vertically with low-stock on top; no horizontal overflow (scrollWidth <= innerWidth).
result: issue — structural layout is correct (2-col at md+, stacked on mobile, no overflow), but on wide screens both cards (especially "Läkemedel under tröskel") have excessive vertical whitespace; the cards feel undersized for the available canvas. Mobile rendering is fine.

### 2. Nurse row → detail → Tillbaka returns to matching tab
expected: Logged in as `sjukskoterska`, open /dashboard, click a row in the "Senaste beställningar" section of the orders card, land on /bestallningar/:id, click "Tillbaka till beställningar". Returns to /bestallningar?status=<row.status> (the tab matching the row's status, NOT the default Utkast).
result: pass — back-nav returns to the correct tab. (Three unrelated mobile-breakpoint bugs were observed on the detail page during this flow and are captured as standalone todos — see Gaps section.)

### 3. Apotekare three-layer refresh
expected: Open /dashboard in two browser tabs as `apotekare`. In Tab A confirm an order (Skickad → Bekräftad). In Tab B the "Skickad att bekräfta" count on the dashboard card drops within 30 seconds OR immediately when Tab B regains focus.
result: pending — not exercised in this session.

## Summary

total: 3
passed: 1
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

### Gap 1 — Dashboard cards under-fill wide-screen canvas (Phase 9)
status: failed
test: 1
observed: At ≥1024px, both DashboardLowStockCard and DashboardOrdersCard render with excessive vertical whitespace inside their card frames; "Läkemedel under tröskel" is the worst offender. Layout structure (2-col grid, stacked-mobile) is correct.
expected: Cards should make better use of the wider canvas — denser content, larger affordances, or a layout that doesn't leave the lower half of each card empty.
scope: Phase 9 — adjust DashboardPage grid sizing and/or per-card density at md+ breakpoints. Belongs in 9.1 gap-closure.
debug_session: none

### Out-of-scope findings (filed as separate todos — NOT Phase 9 gaps)

These are pre-existing mobile-breakpoint bugs in earlier phases that were surfaced during the Phase 9 back-nav demo. They do NOT block Phase 9 closure.

- **todo:** ComposeOrderPage "Skicka beställning" button overflows at viewport widths under 412px (Utkast page). Phase 3 surface. → `.planning/todos/pending/compose-skicka-overflow-lt412.md`
- **todo:** Order detail "Bekräfta" button on a Skickad order is hidden/barely clickable at the 767px breakpoint. Phase 4 surface. → `.planning/todos/pending/order-detail-bekrafta-hidden-767.md`
- **todo:** Order detail "Markera som levererad" button on a Bekräftad order has the same 767px clipping. Phase 4 surface. → `.planning/todos/pending/order-detail-leverera-hidden-767.md`
