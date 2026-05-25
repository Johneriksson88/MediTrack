---
id: order-detail-bekrafta-hidden-767
type: bug
severity: high
surface: web
discovered: 2026-05-25
discovered_during: Phase 9 HUMAN-UAT (back-nav demo)
source_phase: "04"
resolves_phase: null
status: pending
---

# Order detail "Bekräfta" button clipped at 767px breakpoint

## Symptom

Viewing a Skickad (submitted) order on `/bestallningar/:id` at viewport width 767px (the md-breakpoint boundary), the apotekare "Bekräfta" action button is hidden near the bottom of the viewport — only a thin sliver of the button's top edge is visible and barely clickable.

## Affected surface

- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — Mode C (Skickad) action row, OR
- Whatever sticky/fixed footer wrapper renders the action button on the detail page.

## Likely cause

Either a sticky bottom bar is hidden beneath a viewport-height container, OR the action row sits below a min-height parent that pushes it off-screen at exactly the md transition point. The "barely-visible top edge" pattern strongly suggests a `bottom-0` element layered behind another `bottom-0` element (e.g., mobile bottom-nav overlapping detail-footer).

## Acceptance

At viewport widths 320px / 411px / 767px / 768px / 1024px, the "Bekräfta" button is fully visible and clickable without scrolling beyond the order content.

## Notes

Pre-existing — not introduced by Phase 9. Severity is `high` because the button is functionally unusable at the exact breakpoint where mobile-Pad sizes commonly land. Related: same clipping pattern reproduces with "Markera som levererad" on Bekräftad orders — see `order-detail-leverera-hidden-767.md`.
