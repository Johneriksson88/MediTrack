---
status: partial
phase: 02-medication-catalog
source: [02-VERIFICATION.md]
started: 2026-05-21T13:00:00Z
updated: 2026-05-21T13:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Seed-driven low-stock badge + banner render on /lakemedel
expected: Table rows with `currentStock < lowStockThreshold` show red AlertTriangle + 'Lågt lager' pill on the Lager cell; banner above the filter row reads '{N} läkemedel under tröskel' with N ≈ 3 483 (~8% of 43 538) after seeding.
result: [pending]

### 2. belowThreshold chip behavior with shared / deep-link URLs
expected: Clicking 'Visa endast under tröskel' sets `?belowThreshold=true`; list narrows to below-threshold rows; URL survives reload; pasting the URL in a new tab restores the filtered view. Separately, `curl GET /api/medications?belowThreshold=false` should expose CR-01 (BE coerces "false" → true) — decide whether to fix before interview.
result: [pending]

### 3. Sheet mobile bottom-sheet layout on 360 px viewport
expected: Sheet slides up from bottom (not right); Spara/Avbryt footer is above the 56 px bottom tab bar; `env(safe-area-inset-bottom)` clearance applies; no content obscured.
result: [pending]

### 4. InlineEditThreshold stopPropagation isolation in the table
expected: Clicking the threshold number enters inline edit mode; the Sheet does NOT open; pressing Enter saves with optimistic flip; tabbing away or Escape cancels and restores the original value.
result: [pending]

### 5. Transparent restore on re-add after soft-delete
expected: Soft-delete a medication via the Sheet; open Add Sheet; search and re-add the same drug; `psql` query confirms the SAME `careUnitMedication.id` was reused with `deletedAt = NULL` and new stock/threshold values applied.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
