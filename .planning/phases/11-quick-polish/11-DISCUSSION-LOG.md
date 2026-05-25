# Phase 11: Quick Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 11-quick-polish
**Requirements in scope:** UX-02 (Logga ut in global top nav at every breakpoint), UX-03 (Konto-page guidance copy swap)
**Areas discussed:** Per-breakpoint placement of Logga ut, Fate of UserPillPopover, Konto-page Logga ut button, UX-03 copy literalness

---

## Area Selection

| Area | Selected |
|------|----------|
| A — Per-breakpoint placement of Logga ut | ✓ |
| B — Fate of UserPillPopover | ✓ |
| C — Konto-page Logga ut button (keep/remove) | ✓ |
| D — UX-03 copy literalness | ✓ |
| (E — Plan slicing — Claude's discretion) | — single slice; both UX-02 + UX-03 are FE-only, separate atomic commits inside one PLAN.md |

**User's choice:** All four gray areas selected. Plan slicing (E) rolled to Claude's discretion — phase is small enough that a single PLAN.md with two atomic commits fits the GSD pattern; no Wave 2 needed.

---

## Area A — Per-breakpoint placement of Logga ut

| Option | Description | Selected |
|--------|-------------|----------|
| A.1 Icon + responsive label (recommended) | One button, `<LogOut/>` icon + `<span className="hidden md:inline">Logga ut</span>`. Single component, destructive `text-[#DC2626]`. | |
| A.2 Icon-only at all breakpoints | Compact, consistent visual weight; sacrifices desktop discoverability the existing popover surfaced verbatim. | |
| A.3 Label-only at all breakpoints | Maximum discoverability; competes with logo for mobile TopBar real estate. | |
| **A.4 Separate mobile & desktop components** | Density-tuned per breakpoint; two distinct components rendered conditionally inside TopBar. | ✓ |

**User's choice:** A.4 Separate mobile & desktop components.
**Notes:** **D-170** captures the choice. User explicitly chose the per-breakpoint divergence over the single-component recommendation — opts to let mobile and desktop logout affordances be tuned independently (different visual treatments, sizes, possibly icon-vs-label split decoupled from a single responsive class). The two components share `useLogout()` and the destructive color token but diverge in markup. CSS-only breakpoint detection (no JS — per AppShell Pattern N).

**Sub-decisions deferred to plan-time (Claude's discretion, will be captured in CONTEXT.md):**
- Naming convention (e.g. `TopBarLogoutButton` mobile + `TopBarLogoutButton` desktop — final names land in PLAN).
- Visual treatment for each (icon vs icon+label, exact tap-target sizing, focus ring colors) — defaults to reusing existing TopBar patterns (`text-[#DC2626]`, `focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2`).
- Mobile-component touch target ≥44 px per UX-01 accessibility floor.
- aria-label on icon-only variants explicitly reads "Logga ut".

---

## Area B — Fate of UserPillPopover

| Option | Description | Selected |
|--------|-------------|----------|
| **B.1 Static identity display (recommended)** | Strip the `<Popover>` wrapper from UserPillPopover, keep `name · RoleBadge · careUnit.name` as a non-interactive read. Desktop logout button renders next to it. | ✓ |
| B.2 Remove pill entirely | Desktop TopBar right shows only the logout button; identity info lives on Konto. | |
| B.3 Pill becomes link to /konto | Click pill = navigate to Konto. Introduces a new affordance the req didn't ask for. | |
| B.4 Pill stays as Popover, content TBD | Keeps Popover dependency for an empty surface today; speculative scope. | |

**User's choice:** B.1 Static identity display (recommended).
**Notes:** **D-171** captures the choice. Pill loses its only popover content (the Logga ut button — now in TopBar per D-170), so the `<Popover>` / `<PopoverTrigger>` / `<PopoverContent>` wrapper is removed and the inner content becomes a `<div>` (or `<span>`) showing `name · RoleBadge · careUnit.name` only. No click behavior on the pill itself.

**Sub-decisions deferred to plan-time (Claude's discretion):**
- Whether to rename `UserPillPopover.tsx` → `UserPill.tsx` to reflect the loss of popover semantics (recommended yes — name no longer matches contract).
- Whether `@/components/ui/popover` import remains anywhere in the codebase after this change (audit at plan-time; if zero usages, leave the Radix dep in place but flag in deferred-items for v2 cleanup).

---

## Area C — Konto-page Logga ut button

| Option | Description | Selected |
|--------|-------------|----------|
| C.1 Remove (recommended) | Single source of truth: TopBar. Drop the destructive Konto-page button. | |
| **C.2 Keep as-is** | Two redundant entry points on mobile. More tests, more code, friendlier muscle memory. | ✓ |
| C.3 Keep but demote visually | Variant change destructive → ghost/link. Compromise — still two surfaces, softer. | |

**User's choice:** C.2 Keep as-is.
**Notes:** **D-172** captures the choice. User opts for redundancy on mobile — Konto-page Logga ut button (currently full-width destructive variant via `<Button variant="destructive" />`) stays untouched. Rationale: mobile users habituated to Konto-as-logout-tab; removing it would surprise existing muscle memory more than helping single-source-of-truth purity. The req says "not gated *behind* a navigation to Konto" — having an *additional* entry point at Konto doesn't violate that, since TopBar now satisfies the "at every breakpoint" reachability clause.

**Sub-decisions deferred to plan-time (Claude's discretion):**
- Konto-page button stays as `variant="destructive"`, full-width, no visual changes.
- Existing KontoPage test that asserts the Logga ut button stays as-is (no test churn).

---

## Area D — UX-03 copy literalness

| Option | Description | Selected |
|--------|-------------|----------|
| **D.1 Ship verbatim (recommended)** | Direct string swap on `KontoPage.tsx:115`. Honors roadmap SC#2's "**reads exactly**" clause. | ✓ |
| D.2 Contextualize for current surface | Replace with copy that fits the current diagnostic Admin-ping affordance (e.g. "Denna funktion kräver administratörsbehörighet."). Breaks "exactly". | |
| D.3 Verbatim + CONTEXT.md mismatch note | Same string ships; CONTEXT.md flags the copy-vs-surface mismatch for v2 reconciliation. | |

**User's choice:** D.1 Ship verbatim (recommended).
**Notes:** **D-173** captures the choice. String literal `"Denna åtgärd kräver adminrättigheter."` on `KontoPage.tsx:115` swaps verbatim to `"Ändringar kan endast göras av administratör."`. The req-author specified "exactly" in roadmap SC#2 — discussion confirms we honor it without editorialization. The mild copy/surface mismatch (the current Konto affordance is the diagnostic Admin-ping button, not a "change") is accepted as forward-looking: any future admin-only change-affordance on Konto will fit the new copy naturally.

**Sub-decision (Claude's discretion):**
- Trailing period preserved per the roadmap quote — the canonical string is `"Ändringar kan endast göras av administratör."` (with `.`).

---

## Claude's Discretion

Areas where the user accepted Claude's recommendation or deferred to plan-time:

- **Plan slicing** — single PLAN.md, two atomic commits (UX-02 vertical, then UX-03 string swap). Phase too small for a Wave 2 split.
- **Icon choice** — lucide-react `<LogOut/>` for both mobile and desktop variants (consistent visual cue across breakpoints despite separate components per D-170).
- **Destructive color** — `text-[#DC2626]` reused verbatim from the existing UserPillPopover Logga ut button. Single design token across surfaces.
- **Focus-visible ring** — `focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2` per existing TopBar pattern.
- **Mobile tap target** — ≥44 px per UX-01 accessibility floor (Phase 1 contract).
- **aria-label** — icon-only variants render `aria-label="Logga ut"`; icon+label variants get the label inline (no aria-label needed).
- **Popover dependency** — `@/components/ui/popover` left in repo even if unused after D-171; flagged in deferred-items.md if usage count drops to zero.
- **UserPillPopover rename** — recommended `UserPillPopover.tsx` → `UserPill.tsx` (name should match contract once Popover wrapper is stripped per D-171).
- **Konto-page button** — no visual or behavioral change (D-172).
- **Trailing period in UX-03 copy** — preserved per the canonical quote (D-173).
- **Test surfaces** — TopBar tests gain mobile-variant + desktop-variant assertions; KontoPage test gains copy-text assertion; existing UserPillPopover test rewritten to assert static-display semantics (no popover-open behavior).
- **AppShell unchanged** — placement is internal to TopBar; AppShell layout (header / sidebar / main / bottom tab) untouched.
- **BottomTabBar unchanged** — logout does NOT land in BottomTabBar (which is reserved for primary destinations per UI-SPEC §Information Architecture).

---

## Deferred Ideas

Captured during discussion (to be codified in CONTEXT.md `<deferred>`); do NOT act on in Phase 11:

- **Removing the Konto-page Logga ut button** — deferred per D-172; revisit if post-submission UAT shows users confused by the redundancy.
- **Copy/surface reconciliation for UX-03** — if future admin-only change-affordances land on Konto, the verbatim copy will fit. If they don't, revisit phrasing in v2.
- **UserPillPopover → UserPill rename** — proposed in Claude's discretion; if planner decides the rename is bigger than the slice budget, defer to a follow-up quick-task.
- **`@/components/ui/popover` removal** — if `git grep` post-Phase-11 shows zero remaining usages, the Radix popover dep + the shadcn wrapper component can be removed in a v2 cleanup.
- **A consolidated "User menu" pattern** (Konto link + Logga ut + future profile actions) — explicitly out of scope; req asked for Logga ut visibility, not a menu redesign.
- **Mobile TopBar identity affordance** — D-171 keeps identity info desktop-only (pill visible md+); mobile users still rely on Konto tab for "who am I logged in as." Not flagged as a gap because mobile users implicitly know after login.
- **Konto-page Logga ut variant demotion** (C.3 path) — deferred; if UAT shows the redundant destructive button competes too hard with TopBar for attention, demote then.

---

## Sequencing Notes

- Phase 11 is the final phase before submission gate. Roadmap §Cuttability lists Phase 11 as the last to cut: "two trivial frontend changes — ship even if everything else slips."
- No backend changes. No migration. No schema. No audit-allowlist updates (no entity mutations introduced).
- Both UX-02 and UX-03 are pure FE diffs against already-deployed components.
- Existing Playwright sc04 mobile-screenshot harness should be re-run post-Phase-11 to capture the new TopBar mobile state at 360 px (per Phase 7 §sc04 pattern).

---

## Next Step

Run `/gsd:plan-phase 11` to draft `11-01-PLAN.md` (and any CONTEXT.md skeleton) from these decisions. Discussion gate satisfied.
