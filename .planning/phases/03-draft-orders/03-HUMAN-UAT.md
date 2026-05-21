---
status: partial
phase: 03-draft-orders
source: [03-VERIFICATION.md]
started: 2026-05-22T09:00:00Z
updated: 2026-05-22T09:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Mobile compose view layout
expected: On a 360px viewport — line list renders as stacked cards (OrderLineCard), QuantityStepper buttons are visually 44x44px and tappable without zoom, ComposeStickyFooter shows totals (line count + total quantity) and the Submit button without needing to scroll
result: [pending]

### 2. MedicationPickerSheet orientation
expected: Sheet side prop switches between 'bottom' and 'right' based on viewport; bottom-sheet has rounded-t-2xl top corners and max-h-[90dvh]
result: [pending]

### 3. Submit flow Mode A → Mode B
expected: After clicking submit, the page visually flips to Mode B: blue 'Skickad' pill, 'Beställningen är skickad till apotekare.' banner, line items without trash or stepper buttons, no sticky footer at bottom
result: [pending]

### 4. Discard AlertDialog focus + navigation
expected: AlertDialog shows 'Kasta detta utkast?' and 'Utkastet tas bort permanent.', Cancel is default-focused, confirming Kasta soft-deletes the order and navigates back
result: [pending]

### 5. Synthetic 409 lock test
expected: Toast 'Beställningen kan inte ändras efter att den skickats.' appears and page switches to Mode B
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
