---
id: order-detail-leverera-hidden-767
type: bug
severity: high
surface: web
discovered: 2026-05-25
discovered_during: Phase 9 HUMAN-UAT (back-nav demo)
source_phase: "04"
resolves_phase: null
related: [order-detail-bekrafta-hidden-767]
status: pending
---

# Order detail "Markera som levererad" button clipped at 767px breakpoint

## Symptom

Viewing a Bekräftad (confirmed) order on `/bestallningar/:id` at viewport width 767px (the md-breakpoint boundary), the apotekare "Markera som levererad" action button is hidden near the bottom of the viewport — only a thin sliver of the button's top edge is visible and barely clickable.

## Affected surface

- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — Mode D (Bekräftad) action row.

## Likely cause

Almost certainly the same root cause as `order-detail-bekrafta-hidden-767.md` — both Skickad and Bekräftad modes share the same action-row wrapper / sticky-footer pattern in ComposeOrderPage. Fix the parent once, both should resolve together.

## Acceptance

At viewport widths 320px / 411px / 767px / 768px / 1024px, the "Markera som levererad" button is fully visible and clickable without scrolling beyond the order content.

## Notes

Pre-existing — not introduced by Phase 9. Tightly coupled to `order-detail-bekrafta-hidden-767`; likely the same fix resolves both. Group them in one debug session.
