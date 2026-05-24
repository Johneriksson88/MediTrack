---
status: complete
phase: 08-compose-catalog-ux
source: [08-VERIFICATION.md]
started: 2026-05-24T20:30:00Z
updated: 2026-05-24T21:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. AtcCodeCombobox in LakemedelFilter — typeahead + free-text fallback
expected: Open /lakemedel, click the ATC-kod combobox. Dropdown renders with the global codes list; typing 'N02' narrows the list; typing 'XYZ' shows a `XYZ (fri sökning)` row.
result: pass

### 2. AtcCodeCombobox in MedicationSheet user-create form (Controller integration)
expected: /lakemedel → Lägg till läkemedel → user-create form → ATC-kod field renders the shared combobox (not a plain Input); picking a code writes it into the form field; placeholder reads `Välj ATC-kod`.
result: pass

### 3. CAT-10 Variant A empty state (no NPL match) — verbatim copy + Unicode guillemets
expected: /lakemedel → Lägg till läkemedel, search for `qqqzzzimpossible123`. Heading reads `Inget i NPL matchade »qqqzzzimpossible123«.` and sub-line reads `Kontrollera stavning eller skapa ett nytt läkemedel.` with `skapa ett nytt läkemedel` rendered as an inline link.
result: pass

### 4. CAT-10 Variant B empty state (all matches already stocked at vårdenhet)
expected: /lakemedel → Lägg till läkemedel, search for a medication name already stocked in the seeded vårdenhet. Heading reads `Alla träffar finns redan i din vårdenhet.` with sub-line `Justera sökningen eller skapa ett nytt läkemedel.` (lowercase inline link).
result: pass

### 5. PickerSuggestionsBlock — pre-search render, hide-on-keystroke, cache reuse
expected: Open a draft order at /bestallningar/:id → Lägg till läkemedel. Two sticky-header sections appear before any typing: `Mest beställda` and `Lågt lager` (LowStockBadge on below-threshold rows). On first keystroke the block disappears; clearing the input within 30s brings it back without a skeleton flash (cache hit).
result: issue
reported: "It works, but it just appeared to me we need to show Styrka of the item in the beställningar UI (all pages that show items) and the \"Lägg till läkemedel\" modal cards, where we show ATC-kod and Form"
severity: minor

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Picker suggestion rows and beställningar item displays show enough information to identify the right medication variant at a glance"
  status: failed
  reason: "User reported: It works, but it just appeared to me we need to show Styrka of the item in the beställningar UI (all pages that show items) and the \"Lägg till läkemedel\" modal cards, where we show ATC-kod and Form"
  severity: minor
  test: 5
  artifacts: []
  missing: []
