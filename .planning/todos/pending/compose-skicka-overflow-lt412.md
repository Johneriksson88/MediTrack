---
id: compose-skicka-overflow-lt412
type: bug
severity: minor
surface: web
discovered: 2026-05-25
discovered_during: Phase 9 HUMAN-UAT (back-nav demo)
source_phase: "03"
resolves_phase: null
status: pending
---

# ComposeOrderPage "Skicka beställning" overflows under 412px

## Symptom

On `/bestallningar/:id` for an Utkast (draft) order, viewed at viewport widths below 412px (smaller than the iPhone-14-style 390px reference), the primary "Skicka beställning" button visually overflows its container.

## Affected surface

- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — Mode A (Utkast / draft) action row.

## Likely cause

The action row probably uses fixed-width buttons or a flex layout that doesn't wrap under a certain content width. Inspect the action-row container's flex/grid setup and add a wrap or shrink fallback for <412px.

## Acceptance

At 360px and 411px viewport widths, the "Skicka beställning" button (and any siblings — Spara, Kasta utkast) stay inside the card boundary with no horizontal overflow.

## Notes

Pre-existing — not introduced by Phase 9. Phase 9 only rewired the back-link in this file; the action row was untouched.
