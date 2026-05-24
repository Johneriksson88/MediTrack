---
status: partial
phase: 09-dashboard-depth-back-nav
source: [09-VERIFICATION.md]
started: 2026-05-25T01:05:00Z
updated: 2026-05-25T01:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. 2-column dashboard layout at md+, stacked at <md
expected: On a 1024px viewport, DashboardLowStockCard is left of DashboardOrdersCard; at 360px both cards stack vertically with low-stock on top; no horizontal overflow (scrollWidth <= innerWidth).
result: [pending]

### 2. Nurse row → detail → Tillbaka returns to matching tab
expected: Logged in as `sjukskoterska`, open /dashboard, click a row in the "Senaste beställningar" section of the orders card, land on /bestallningar/:id, click "Tillbaka till beställningar". Returns to /bestallningar?status=<row.status> (the tab matching the row's status, NOT the default Utkast).
result: [pending]

### 3. Apotekare three-layer refresh
expected: Open /dashboard in two browser tabs as `apotekare`. In Tab A confirm an order (Skickad → Bekräftad). In Tab B the "Skickad att bekräfta" count on the dashboard card drops within 30 seconds OR immediately when Tab B regains focus.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
