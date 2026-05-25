# Phase 11: Quick Polish - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Two pure-FE corrections that didn't fit the spine: surface "Logga ut" in the global TopBar at every breakpoint (today's only entry points are the desktop UserPillPopover at md+ and the Konto-page destructive button on mobile), and swap the Konto-page admin-gate guidance copy from `"Denna åtgärd kräver adminrättigheter."` to `"Ändringar kan endast göras av administratör."`. No backend, no schema, no migration, no audit allowlist change, no new endpoint. The phase is intentionally tiny — Roadmap §Cuttability puts Phase 11 as the last phase to drop ("ship even if everything else slips").

**In scope (Phase 11 only — REQ-IDs UX-02, UX-03):**

- **Mobile-side TopBar logout (UX-02 mobile half).** A new TopBar-right component visible at `<md` widths. Icon-button (lucide-react `<LogOut/>`), 44×44 px tap target (UI-SPEC §3), `text-[#DC2626]` (UI-SPEC §Colors §1.97 destructive), `aria-label="Logga ut"`. Wires to the existing `useLogout()` mutation (`apps/web/src/features/auth/useLogout.ts` — no behavioral change to the logout flow itself; DELETE /api/auth/session + cache eviction + `navigate('/login', {replace: true})`). Per D-170, this is a distinct component from the desktop variant — not a single responsive button.
- **Desktop-side TopBar logout (UX-02 desktop/tablet half).** A new TopBar-right component visible at `≥md` widths, rendered next to the static User Pill (per D-171, the popover wrapper goes away — see below). Whether this variant is icon-only, icon+label, or text-only is a plan-time decision under Claude's discretion within these constraints: ≥44 px tap target, `text-[#DC2626]`, focus ring `[#2563EB]` (UI-SPEC §149), shares the same `useLogout()` hook and behavioral contract as the mobile variant.
- **UserPillPopover → UserPill (D-171).** Strip the `<Popover>`/`<PopoverTrigger>`/`<PopoverContent>` wrapper from `apps/web/src/routes/shell/UserPillPopover.tsx`. The button-as-popover-trigger becomes a non-interactive `<div>` (or `<span>`) showing `{user.name} · <RoleBadge/> · {user.careUnit.name}`. Recommended rename to `UserPill.tsx` (file rename + import update at `TopBar.tsx:5`) to reflect the loss of popover semantics — plan may keep the filename to minimize churn if the rename diff is judged too noisy.
- **Konto-page guidance copy swap (UX-03).** Verbatim string replacement at `apps/web/src/routes/konto/KontoPage.tsx:115`: `"Denna åtgärd kräver adminrättigheter."` → `"Ändringar kan endast göras av administratör."`. Trailing period preserved (per the canonical quote in ROADMAP §"Phase 11" SC#2). Per D-173, no editorialization to better-fit the current Admin-ping affordance — the req-author's "**reads exactly**" clause wins.
- **Test surface updates.**
  - `apps/web/test/KontoPage.test.tsx:17` — the existing test header doc-comment plus the `it()` assertion that checks the gate note must swap to the new copy. Two role branches (sjukskoterska, apotekare) — both assert the new string.
  - **New** `apps/web/test/TopBar.test.tsx` — first test for this component. Assert: (a) mobile-only variant present at default render (no `md:` class active in test env), (b) desktop-only variant present, (c) clicking either invokes `useLogout()`, (d) the User Pill renders as a non-interactive node (no role="button"), (e) `aria-label="Logga ut"` on icon-only variant(s).
  - The existing `apps/web/test/BottomTabBar.test.tsx` and `apps/web/test/Sidebar.test.tsx` are untouched — Phase 11 does not alter primary-nav surfaces.
- **sc04 mobile-screenshot re-capture.** Re-run `apps/web/scripts/captureSc04Screenshots.ts` after Phase 11 lands; refresh `docs/screenshots/sc04-360-*.png` for any route where the TopBar visibly changes (login is shell-less and unaffected; the other 5 captures show the new mobile logout icon). Commit the regenerated PNGs as part of the slice closeout, same as Phase 10 D-141 / Phase 9 sc04 re-capture pattern. Verify `scrollWidth <= innerWidth` invariant holds at 360 px (Phase 7 SC#4 contract — `[data-test="primary-nav"]` selector must remain on `BottomTabBar.tsx:27`, untouched by Phase 11).

**Out of scope (other phases / v2 / explicitly rejected this phase):**

- **Removing the Konto-page destructive `Logga ut` button** — per D-172, the mobile redundancy stays. Single source of truth was offered (C.1) and explicitly rejected by the user; preserving Konto-page muscle memory beats code-duplication tax.
- **Logout confirmation dialog** — UI-SPEC §386 says "No confirmation dialog for logout in Phase 1 (logout is low-stakes; destructive color is the signal)." Phase 11 inherits this — the new TopBar buttons fire `useLogout()` on a single click, same as today's popover and today's Konto button.
- **Adding logout to BottomTabBar** — BottomTabBar is reserved for primary destinations (Dashboard / Lakemedel / Bestallningar / Konto per `apps/web/src/routes/shell/nav.ts`). Adding a fifth tab would dilute the IA contract. Phase 11 routes logout through TopBar instead.
- **User-menu / profile-menu pattern** (Konto link + Logga ut + future profile actions) — explicitly out of scope. Req asked for Logga ut visibility, not a menu redesign. If Konto gains future admin-only change-affordances, revisit then.
- **AppShell layout changes** — header height (h-14), sidebar width (w-16/w-60), bottom-tab height (h-14 + safe-area-inset), main padding — all untouched. Phase 11 mutates only `TopBar.tsx`, `UserPillPopover.tsx` (rename + simplify), `KontoPage.tsx` (one string), and `KontoPage.test.tsx` (one assertion). Plus new `TopBar.test.tsx`.
- **Removing the `@/components/ui/popover` shadcn primitive** — per Claude's discretion (Deferred): if `git grep` after Phase 11 shows zero remaining usages, the Radix popover dep + the shadcn wrapper can be removed in a v2 cleanup, but the cleanup itself is not Phase 11's job.
- **Mobile TopBar identity affordance** — D-171 keeps `name · RoleBadge · careUnit.name` desktop-only (today's `<div className="hidden md:block">` wrapper around the pill stays). Mobile users implicitly know who they're logged in as after login; surfacing it on every page is a UX choice for v2 (and might want a dedicated mobile user-menu pattern, also v2).
- **Demoting the Konto-page destructive button** (C.3 path — variant change destructive → ghost/link) — offered as a compromise, rejected in favor of full retention. If UAT shows the redundancy competes too hard with the new TopBar control, revisit then.
- **Auth retrofitting work** (forgot-password, multi-device, session timeout, etc.) — these were already deferred in Phase 1 D-21 and remain out of every subsequent phase. Phase 11 does not touch them.

</domain>

<decisions>
## Implementation Decisions

### TopBar logout placement

- **D-170:** **Separate mobile and desktop logout components inside TopBar.** Mobile-only variant rendered at `<md` widths; desktop-only variant rendered at `≥md` widths next to the static User Pill (per D-171). They share `useLogout()` and the destructive color token (`text-[#DC2626]`, UI-SPEC §Colors §1.97), but the markup, sizing, and label-vs-icon decision is per-component. CSS-only breakpoint detection via Tailwind responsive classes (`hidden md:block` / `md:hidden`) — never JS, per AppShell Pattern N. Rejected:
  - **Single component with responsive label** (A.1 recommended) — would be cleanest (one focus surface, one test), but user explicitly chose per-breakpoint divergence for density tuning. Honored.
  - **Icon-only at all breakpoints** (A.2) — consistent visual weight but sacrifices desktop discoverability the existing popover surfaces verbatim ("Logga ut" as text).
  - **Label-only at all breakpoints** (A.3) — maximum discoverability; would compete with the logo for mobile TopBar real estate on 360 px (mobile TopBar is `px-4` not `px-6` per `TopBar.tsx:23`, leaving ~320 px of content width — a text "Logga ut" + 14 px logo + spacing fits but feels cramped).
- **D-174 (Claude's discretion, lock at plan time):** **Mobile variant** = icon-only `<LogOut/>` (lucide-react), 44×44 px tap target (`h-11 w-11 flex items-center justify-center`), `aria-label="Logga ut"`, `text-[#DC2626]`, focus ring per UI-SPEC §149. **Desktop variant** = icon + label (`<LogOut className="h-4 w-4" /> Logga ut`), `text-sm font-semibold text-[#DC2626]`, `px-3 py-2 min-h-[44px]` (tap target preserved even on desktop per UX-01 floor), no `aria-label` needed because the label is inline. Both variants render as `<button type="button">` not `<a>` — logout is an action, not navigation. Both reuse the existing focus ring pattern (`focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2`).

### User Pill simplification

- **D-171:** **`UserPillPopover` collapses to a static `UserPill` identity display.** Strip `<Popover>`, `<PopoverTrigger>`, `<PopoverContent>`. The wrapping element becomes a non-interactive `<div>` (or `<span>`) showing `{user.name} · <RoleBadge/> · {user.careUnit.name}`. No click behavior, no popover-trigger button semantics. The desktop logout component (per D-170) sits to its right inside `TopBar.tsx`. Rejected:
  - **Remove pill entirely** (B.2) — cleanest visually but desktop loses the at-a-glance "who am I logged in as" cue (today's UI-SPEC §170 lists Konto as "User pill + logout" — the pill IS the identity affordance on desktop).
  - **Pill becomes a link to /konto** (B.3) — introduces a new navigation affordance the req didn't ask for; adds keyboard-focusable surface that competes with the new logout button.
  - **Pill stays as popover with empty content** (B.4) — keeps a dependency for a surface that does nothing; speculative scope.
- **D-175 (Claude's discretion, plan-time decision):** **Rename `UserPillPopover.tsx` → `UserPill.tsx`** (file rename + single import update at `TopBar.tsx:5`). Name should match contract once Popover wrapper is stripped. If planner judges the rename diff too noisy for the slice budget, the filename can stay (filename mismatch with content is acceptable tech debt for a 2-line feature phase) — flag in deferred-items.md if so.

### Konto-page redundancy

- **D-172:** **Konto-page `Logga ut` button retained verbatim.** No visual or behavioral change. Today's full-width destructive `<Button variant="destructive">` at `KontoPage.tsx:79-87` stays as-is — same wiring to `useLogout()`, same copy "Logga ut" / "Loggar ut…", same styling. Mobile users habituated to Konto-as-logout-tab keep that path; the new TopBar logout satisfies the "at every breakpoint" reachability clause without removing the older entry point. The req text "not gated *behind* a navigation to Konto" is satisfied by adding the TopBar control — having an *additional* path at Konto doesn't violate it (a control is "gated behind" navigation only when it's the *sole* way to reach it). Rejected:
  - **Remove** (C.1 recommended) — single source of truth, aligns with req spirit, fewer tests, less code. User explicitly chose retention.
  - **Demote visually** (C.3) — variant change destructive → ghost/link. Two surfaces still, just softer. User opted for full retention.

### UX-03 copy literalness

- **D-173:** **Verbatim swap on `KontoPage.tsx:115`** — `"Denna åtgärd kräver adminrättigheter."` → `"Ändringar kan endast göras av administratör."`. Trailing period preserved per the canonical quote in ROADMAP §"Phase 11" SC#2 ("**reads exactly** 'Ändringar kan endast göras av administratör.'"). No editorialization to fit the current Admin-ping affordance (which is a diagnostic, not a "change"). The mild copy/surface mismatch is accepted as forward-looking — any future admin-only change-affordance on Konto will fit the new copy naturally. Rejected:
  - **Contextualize for current surface** (D.2) — e.g., `"Denna funktion kräver administratörsbehörighet."` or revert. Would break the req's "exactly" clause; reviewer reading the brief sees a mismatch.
  - **Verbatim + CONTEXT mismatch note** (D.3) — same string ships; adds a paper trail. Accepted partially — the note is captured here in `<deferred>` rather than as a separate alternative, so D.1 covers it implicitly.
- **Test consequence:** `apps/web/test/KontoPage.test.tsx:17` doc comment + the role-branch assertions that check the gate note text must update in lockstep with the source string change. The existing test names two branches (sjukskoterska, apotekare); both assert the new copy.

### Claude's Discretion

- **Plan slicing — single PLAN.md (`11-01-PLAN.md`), two atomic commits.** Phase too small for a Wave 2 split. Commit 1: UX-02 vertical (TopBar split into mobile+desktop logout components + UserPill simplification + new TopBar.test.tsx + sc04 re-capture). Commit 2: UX-03 string swap + KontoPage.test.tsx assertion update. Each is independently revertable. Final closeout: `docs(phase-11): complete phase execution` mirroring Phase 8/9/10 pattern.
- **Icon choice — lucide-react `<LogOut/>`** for both mobile and desktop variants. Consistent visual cue across breakpoints despite separate components per D-170. lucide-react is already in the dependency tree (used by `BottomTabBar.tsx`, `TopBar.tsx` `<Stethoscope/>`, etc.).
- **Destructive color — `text-[#DC2626]`** reused verbatim from the existing `UserPillPopover.tsx:60` Logga ut button. Single design token across surfaces — `UI-SPEC` §Colors §1.97 ("Destructive #DC2626 — Logout confirmation, delete actions only").
- **Focus-visible ring — `focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2`** per UI-SPEC §149 and the existing TopBar pattern (Logo focus-visible style at `TopBar.tsx:26`, popover-trigger style at `UserPillPopover.tsx:37`).
- **Mobile tap target — ≥44 px** per UX-01 accessibility floor (Phase 1 contract enforced in BottomTabBar `min-h-[44px]`, in QuantityStepper, in Sidebar). The icon-only mobile logout uses `h-11 w-11` (= 44 px) explicit.
- **aria-label** — icon-only variants render `aria-label="Logga ut"`; icon+label variants get the label inline (no aria-label needed — would create a redundant accessible name).
- **`@/components/ui/popover` dependency** — left in repo even if D-171 drops its only usage. Audit at plan-time with `git grep "from '@/components/ui/popover'"` — if zero results, flag the shadcn wrapper component + Radix dep for a v2 cleanup quick-task. Don't remove in Phase 11 (out of scope; one-line `Untouched if zero usages` note in `deferred-items.md`).
- **AppShell unchanged** — no edits to `apps/web/src/routes/shell/AppShell.tsx`. Sidebar / BottomTabBar / main padding all untouched. The `[data-test="primary-nav"]` attribute (Phase 7 D-128) lives on `BottomTabBar.tsx:27` and `Sidebar.tsx` — Phase 11 does not touch either, so the sc04 harness's primary-nav assertion is unaffected by construction.
- **Logout flow contract** — `useLogout()` behavior unchanged (no behavioral diff to `apps/web/src/features/auth/useLogout.ts`). DELETE /api/auth/session is idempotent; cache eviction of `['me']`; `navigate('/login', {replace: true})`. Three new caller sites (mobile TopBar variant, desktop TopBar variant, retained Konto button) all share the same hook — single source of truth for the logout side-effect.
- **No new permissions, no new endpoints, no new BE routes** — pure FE diff.
- **No new dev-deps, no new env vars, no Docker Compose changes.**
- **Trailing period in UX-03 copy** preserved per the canonical quote — the string is `"Ändringar kan endast göras av administratör."` (with `.`).
- **`react-router-dom` not needed** for the new logout components — they render `<button>` not `<Link>`. The current TopBar imports `Link` for the logo only; new buttons sit alongside without changing that import.

### Folded Todos

*(None — `cross_reference_todos` step surfaced 3 pending todos, all scored 0.6, none in Phase 11 scope. See `<deferred>` "Reviewed Todos (not folded)" subsection.)*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 11 framing & scope

- `.planning/ROADMAP.md` §"Phase 11: Quick Polish" — Goal + 2 Success Criteria + Requirements (UX-02, UX-03). SC#1 dictates global TopBar reachability "at every breakpoint, not gated behind the desktop UserPillPopover or a navigation to Konto"; SC#2 dictates verbatim copy "Ändringar kan endast göras av administratör." (with trailing period).
- `.planning/REQUIREMENTS.md` lines 73-74 — single source of truth for UX-02 and UX-03 requirement text.
- `.planning/PROJECT.md` — Core Value loop, lightweight bias (no new infra for two FE tweaks), Swedish UI labels verbatim convention, mobile-first.
- `.planning/STATE.md` — current phase progress (Phase 10 complete, ready_to_discuss Phase 11 — this CONTEXT.md closes the discuss gate).

### Phase 1 foundations (UI-SPEC + auth shell — Phase 11 lives entirely inside this skeleton)

- `.planning/phases/01-foundation-auth/01-UI-SPEC.md` — **the canonical reference for every Phase 11 visual decision.** Specifically:
  - §3 Spacing & Touch Targets: 44×44 px minimum (`min-h-[44px] min-w-[44px]` or equivalent). Phase 11 mobile logout uses `h-11 w-11`.
  - §Colors line 97: `#DC2626` is the destructive token; "Logout confirmation, delete actions only" — Phase 11's three logout sites all use it.
  - §Focus rings line 149: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2` — Phase 11 reuses verbatim.
  - §Top Bar §257-265: h-14, logo left, User Pill right (md+) as popover trigger. Phase 11 D-171 dismantles the popover-trigger semantics; the h-14 + logo-left structure stays.
  - §Routes table line 170: `/konto` = "User pill + logout". Phase 11 keeps this — Konto remains a valid logout entry point per D-172.
  - §4 Mobile Layout line 377: "Top bar (mobile): Logo only (icon + 'MediTrack' text). No user pill." Phase 11 modifies this — mobile TopBar now also has the logout icon-button (the only TopBar-right element on mobile).
  - §User Pill §388-403: the popover spec Phase 11 D-171 removes. Lines 401-402 describe the destructive-text-button-inside-popover pattern; that's gone after D-171.
  - §Konto §385-386: "Logga ut" button shadcn `Button variant=destructive`, full-width, no confirmation dialog. Phase 11 D-172 retains verbatim.
  - §Logout flow §403: `DELETE /api/auth/session` + clear TanStack Query cache + `navigate('/login')`. Phase 11 wires three new caller sites to the same `useLogout()` hook; flow unchanged.
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` — D-21 (auth retrofitting deferred to v2; Phase 11 does not surface this); shell + auth scaffolding decisions (`useAuth()` hook + `AuthGate` route guard); RoleBadge component reuse (the UserPill identity row still renders `<RoleBadge role={user.role} />`).
- `.planning/phases/01-foundation-auth/01-DISCUSSION-LOG.md` — historical context for why the popover-as-logout-trigger pattern was chosen in Phase 1 (now reversed in Phase 11). Read for context only — Phase 11's D-171 changes the pattern.

### Phase 7 mobile-first verification harness (Phase 11 must not regress)

- `.planning/phases/07-ops-submission-polish/07-CONTEXT.md` — **D-128 specifically.** SC#4 mobile-first verification harness targets `[data-test="primary-nav"]` on the AppShell nav element. This attribute is on `BottomTabBar.tsx:27` (`<nav aria-label="Primary" data-test="primary-nav" ...>`) and on `Sidebar.tsx` (verify path). Phase 11 does NOT touch either component — the attribute remains intact by construction. Plan must explicitly verify this with a grep at the end of the slice ("no edits to `apps/web/src/routes/shell/BottomTabBar.tsx` or `apps/web/src/routes/shell/Sidebar.tsx`").
- `.planning/phases/07-ops-submission-polish/07-CONTEXT.md` lines 34-49 — six 360-px screenshot captures + the `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` command. Phase 11 re-runs this after the slice lands; refreshed PNGs commit with the closeout.
- `apps/web/scripts/captureSc04Screenshots.ts` — the Playwright harness. Phase 11 plan should note that the captured states will visibly change for the 5 authenticated routes (login is shell-less, unchanged).

### Recent prior phases (carry forward, do NOT re-decide)

- `.planning/phases/09-dashboard-depth-back-nav/09-CONTEXT.md` lines 30, 222 — `min-h-[44px]` / `role="list"`/`listitem` semantics on dashboard cards; Phase 11 inherits the 44-px floor for the new TopBar buttons.
- `.planning/phases/10-order-numbers/10-CONTEXT.md` lines 118, 139 — sc04 re-capture pattern (commit regenerated PNGs as part of slice closeout, not a separate phase task). Phase 11 follows the same pattern.
- `.planning/phases/03-draft-orders/03-CONTEXT.md` D-67 — destructive button + AlertDialog pattern ("Kasta utkast"). Phase 11 explicitly REJECTS adding a confirmation dialog for logout (UI-SPEC §386 inheritance — logout is low-stakes; destructive color is the only signal). Cited as a precedent for the rejection, not the choice.

### Existing code referenced by Phase 11 deliverables (read carefully — these files will be edited)

- `apps/web/src/routes/shell/TopBar.tsx` — current 38-line file. Phase 11 widens the right-side `<div className="hidden md:block"><UserPillPopover/></div>` into a two-element layout: (a) static UserPill (D-171), (b) desktop logout button (D-170 desktop variant); plus a new mobile-only logout button outside the `hidden md:block` (visible at `<md`).
- `apps/web/src/routes/shell/UserPillPopover.tsx` — current 68-line file. Phase 11 strips lines 32-66 (the `<Popover>...</Popover>` JSX), retains the user-info `<button>` content but as a non-interactive `<div>`. Imports `useLogout`, `Popover/PopoverContent/PopoverTrigger` removed. File rename recommended (D-175). Behavioral test surface zero (no existing test) — new component test in `apps/web/test/TopBar.test.tsx` covers the static-display assertion.
- `apps/web/src/routes/konto/KontoPage.tsx` — current 122-line file. Phase 11 edits exactly two locations: line 115 (the gate-note copy string per D-173), and verifies line 79-87 (the destructive button) is unchanged (D-172). The admin-ping affordance and the 403 alert are untouched.
- `apps/web/src/features/auth/useLogout.ts` — read for understanding only; no edits. Confirms the idempotent DELETE + cache eviction + redirect contract that all three logout sites share.
- `apps/web/test/KontoPage.test.tsx` — current 80+ line file. Phase 11 updates: line 17 doc comment (gate-note quote), the assertion in the sjukskoterska branch, the assertion in the apotekare branch. Three string updates total; no structural changes to the test.
- `apps/web/test/BottomTabBar.test.tsx` — read for understanding only; no edits. Confirms the `[data-test="primary-nav"]` selector contract.
- `apps/web/test/Sidebar.test.tsx` — read for understanding only; no edits. Same.
- `apps/web/test/helpers/renderWithProviders.tsx` (assumed path — verify) — the existing test harness new `TopBar.test.tsx` reuses.
- `apps/web/src/components/RoleBadge.tsx` (assumed path — verify) — referenced by the static UserPill; no changes needed, just kept in the render output.
- `apps/web/src/auth/useAuth.ts` (assumed path — verify) — read by `UserPillPopover.tsx` for `user.name` / `user.role` / `user.careUnit.name`. No changes; just keep the read pattern in the simplified UserPill.

### Brief & tooling

- `local/intervju-testcase-1-1-.pdf` (Swedish brief — local only) §3.1, §4 mobile-first requirements. Phase 11 lives entirely inside the mobile-first envelope already established in Phase 1.
- `CLAUDE.md` — Swedish UI labels + English code identifiers; mobile-first constraint; lightweight bias (no new infrastructure for two FE tweaks).
- `.planning/config.json` — Workflow toggles unchanged; no Phase 11 changes to config.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`useLogout()` hook** (`apps/web/src/features/auth/useLogout.ts`) — TanStack Query mutation, idempotent DELETE /api/auth/session, cache eviction of `['me']`, `navigate('/login', {replace: true})`. Three Phase-11 callers (mobile TopBar logout, desktop TopBar logout, retained Konto button) all hit this — single source of truth for the logout side-effect. No widening, no behavioral diff.
- **`useAuth()` hook** (path: `@/auth/useAuth`) — supplies `{user: {name, role, careUnit: {name}}}` to the simplified UserPill. Same read pattern as today's `UserPillPopover.tsx:25`.
- **`RoleBadge` component** (path: `@/components/RoleBadge`) — renders the role pill ("Apotekare", "Sjuksköterska", "Admin"). Phase 11's static UserPill renders it identically to today.
- **lucide-react icon set** — `<LogOut/>` icon already implicitly available (the lib is used across `BottomTabBar.tsx`, `TopBar.tsx`, etc.). One-line import addition in the two new logout components.
- **shadcn focus-visible-ring pattern** — `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2`. Phase 11 reuses verbatim.
- **Destructive color token `text-[#DC2626]`** — already in use at `UserPillPopover.tsx:60`. Phase 11 reuses verbatim.
- **`hidden md:block` / `md:hidden` responsive convention** — already in use at `TopBar.tsx:32` and `BottomTabBar.tsx:28`. Phase 11 uses both to render the per-breakpoint logout variants per D-170.
- **`renderWithProviders` test helper** (`apps/web/test/helpers/renderWithProviders.tsx`) — the existing test harness used by `KontoPage.test.tsx`, `BottomTabBar.test.tsx`, `Sidebar.test.tsx`. New `TopBar.test.tsx` reuses it.

### Established Patterns

- **CSS-only breakpoint detection** (UI-SPEC §App Shell, Pattern N) — `hidden md:block` / `md:hidden` classes, never JS. Phase 11 D-170 renders both per-breakpoint logout variants this way; each is in the DOM but only one is visible per viewport.
- **44 px tap target floor** (UI-SPEC §3 + UX-01) — enforced in `BottomTabBar.tsx:37` (`min-h-[44px]`), `Sidebar.tsx`, `QuantityStepper.tsx` (Phase 3 D-60). Phase 11's mobile logout uses `h-11 w-11` (exactly 44 px); desktop variant uses `min-h-[44px]` to preserve floor.
- **`<button type="button">` for actions, `<a>` / `<Link>` for navigation** (Phase 1 D-... — exact ID not surfaced, but consistent through the codebase). Phase 11 logout buttons are actions, so `<button type="button">`. The TopBar logo stays a `<Link>` per `TopBar.tsx:24`.
- **No confirmation dialog for logout** (UI-SPEC §386) — Phase 1 baseline. Phase 11 inherits — single-click logout.
- **Test-mock convention for `useLogout`** — `apps/web/test/KontoPage.test.tsx:29-34` shows the pattern: `vi.mock('@/features/auth/useLogout', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) }))`. New TopBar.test.tsx reuses this exact mock shape.
- **Verbatim Swedish UI string assertions in tests** — `KontoPage.test.tsx:17` shows the pattern (doc-comment + assertion both quote the Swedish string). Phase 11 D-173 updates both in lockstep.
- **Single-slice phase pattern** (Phase 7 Plan 09, Phase 9 Slice A, etc.) — small phases land as a single PLAN.md with multiple atomic commits inside. Phase 11 follows: one `11-01-PLAN.md`, two commits (`feat(11-01): ...UX-02...` + `feat(11-01): ...UX-03...`).

### Integration Points

- **One existing file edited heavily** — `apps/web/src/routes/shell/TopBar.tsx` widens to render two logout variants + static UserPill.
- **One existing file simplified + renamed** — `apps/web/src/routes/shell/UserPillPopover.tsx` → `UserPill.tsx` (D-175); strips popover wrapper, becomes a static identity display.
- **One existing file string-edited** — `apps/web/src/routes/konto/KontoPage.tsx` (one line: 115).
- **One existing test file updated** — `apps/web/test/KontoPage.test.tsx` (gate-note string in three places: doc comment + two role-branch assertions).
- **One new test file** — `apps/web/test/TopBar.test.tsx` (first test for this component; asserts both logout variants + static UserPill behavior).
- **Optional shadcn cleanup deferred** — `@/components/ui/popover` may have zero remaining usages post-Phase-11; v2 cleanup quick-task, not Phase 11's job.
- **5 sc04 screenshot regenerations** — `docs/screenshots/sc04-360-{katalog,bestallningsskapande,bestallningshistorik,audit,dashboard}.png` (login is shell-less and unchanged). Re-run the existing Playwright harness; commit refreshed PNGs as part of the slice closeout.
- **No new permissions, no new endpoints, no new BE routes, no schema, no migration, no audit-allowlist change, no env vars, no dev-deps, no Docker Compose changes.**

</code_context>

<specifics>
## Specific Ideas

### TopBar after Phase 11 (locked layout intent — plan-time refinements OK)

```tsx
// apps/web/src/routes/shell/TopBar.tsx (post-Phase-11 shape)

import { LogOut, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLogout } from '@/features/auth/useLogout';
import { UserPill } from './UserPill'; // renamed from UserPillPopover per D-175

export function TopBar() {
  const logout = useLogout();
  return (
    <header className="h-14 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between px-4 md:px-6">
      <Link to="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2">
        <Stethoscope className="h-5 w-5 text-[#2563EB]" aria-hidden="true" />
        <span>MediTrack</span>
      </Link>

      {/* Desktop right cluster: identity + logout */}
      <div className="hidden md:flex md:items-center md:gap-3">
        <UserPill />
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#DC2626] px-3 py-2 min-h-[44px] rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
        </button>
      </div>

      {/* Mobile right cluster: icon-only logout */}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        aria-label="Logga ut"
        className="md:hidden inline-flex items-center justify-center h-11 w-11 text-[#DC2626] rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
      </button>
    </header>
  );
}
```

### UserPill (post-D-171 — renamed from UserPillPopover)

```tsx
// apps/web/src/routes/shell/UserPill.tsx (post-Phase-11; was UserPillPopover.tsx)

import { useAuth } from '@/auth/useAuth';
import { RoleBadge } from '@/components/RoleBadge';

export function UserPill() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center">
      <span className="text-sm font-semibold text-[#0F172A]">{user.name}</span>
      <span className="text-[#64748B] mx-2" aria-hidden="true">·</span>
      <RoleBadge role={user.role} />
      <span className="text-[#64748B] mx-2" aria-hidden="true">·</span>
      <span className="text-sm text-[#64748B]">{user.careUnit.name}</span>
    </div>
  );
}
```

### KontoPage.tsx:115 swap (D-173)

```diff
- <p className="text-xs text-[#64748B]">
-   Denna åtgärd kräver adminrättigheter.
- </p>
+ <p className="text-xs text-[#64748B]">
+   Ändringar kan endast göras av administratör.
+ </p>
```

### KontoPage.test.tsx updates (D-173 lockstep)

```diff
- *   - Gate note: "Denna åtgärd kräver adminrättigheter."
+ *   - Gate note: "Ändringar kan endast göras av administratör."
```

```diff
- expect(screen.getByText('Denna åtgärd kräver adminrättigheter.')).toBeInTheDocument();
+ expect(screen.getByText('Ändringar kan endast göras av administratör.')).toBeInTheDocument();
```

(Two assertion sites — one per non-admin role branch.)

### TopBar.test.tsx (new file — test surface scaffold)

```tsx
// apps/web/test/TopBar.test.tsx (new)
// Asserts:
//  1. Mobile-only icon-button renders (md:hidden present in className).
//  2. Desktop-only logout button renders (hidden md: present).
//  3. Static UserPill renders inside the desktop cluster (no role="button" on the pill).
//  4. Clicking either logout button invokes useLogout().mutate().
//  5. aria-label="Logga ut" on the icon-only mobile variant.
//  6. Existing logo Link to /dashboard stays unchanged.
```

### Plan-slice ordering (recommended)

1. **Slice 1 — Phase 11 in a single PLAN.md (`11-01-PLAN.md`).**
   - Commit 1 `feat(11-01): split TopBar logout into per-breakpoint variants` — TopBar.tsx widened, UserPillPopover.tsx simplified + renamed to UserPill.tsx (per D-175), new TopBar.test.tsx, no Konto changes.
   - Commit 2 `feat(11-01): update Konto gate-note copy (UX-03)` — KontoPage.tsx:115 string swap, KontoPage.test.tsx assertion updates.
   - Commit 3 `chore(11-01): regenerate sc04 mobile screenshots` — 5 refreshed PNGs.
   - Phase closeout `docs(phase-11): complete phase execution` mirroring Phase 8/9/10.

### Commit message conventions (Phase 11)

- All commits use `feat(11-01):` / `test(11-01):` / `chore(11-01):` / `docs(phase-11):` scopes per the existing project convention.

</specifics>

<deferred>
## Deferred Ideas

(Captured during Phase 11 discussion; do NOT lose; do NOT act on in Phase 11.)

- **Removing the Konto-page Logga ut button** — D-172 retains it for mobile muscle-memory. Revisit if post-submission UAT shows users confused by the redundancy.
- **Demoting the Konto-page button to ghost/link variant** (C.3 path) — offered as a compromise, declined in favor of full retention. Revisit if the destructive button competes too hard with TopBar for attention.
- **Copy/surface reconciliation for UX-03** — D-173 ships the verbatim "Ändringar kan endast göras av administratör." string while the only current Konto affordance is the diagnostic Admin-ping button. If future admin-only change-affordances land on Konto, the copy fits naturally. If they don't, revisit phrasing in v2.
- **UserPillPopover → UserPill rename** (D-175 recommendation) — if planner judges the file rename diff too noisy for the slice budget, the filename can stay (mismatch with content is acceptable tech debt for a 2-line feature phase). Flag in `.planning/phases/11-quick-polish/deferred-items.md` if so.
- **`@/components/ui/popover` shadcn component + Radix dep removal** — if `git grep "from '@/components/ui/popover'"` post-Phase-11 shows zero remaining usages, the dep + the shadcn wrapper can be removed in a v2 cleanup quick-task. Not Phase 11's job.
- **Consolidated "User menu" pattern** (Konto link + Logga ut + future profile actions inside a unified dropdown) — explicitly out of scope. Req asked for Logga ut visibility, not a menu redesign.
- **Mobile TopBar identity affordance** — D-171 keeps `name · RoleBadge · careUnit.name` desktop-only. Mobile users still rely on the Konto tab for "who am I logged in as." Not flagged as a gap because mobile users implicitly know after login. If post-submission feedback says otherwise, design a dedicated mobile user-menu in v2.
- **Logout confirmation dialog** — UI-SPEC §386 baseline ("No confirmation dialog for logout — destructive color is the signal"). Phase 11 inherits. If user-testing surfaces accidental-logout incidents, revisit with a Phase 3 D-67 style `<AlertDialog>` pattern in v2.

### Reviewed Todos (not folded)

`cross_reference_todos` surfaced 3 pending todos in `.planning/todos/pending/` matching Phase 11 by generic keyword score (0.6 each). All three are out of Phase 11 scope — they're ComposeOrderPage / order-detail viewport bugs on the order surface, not logout/Konto-copy. Documented here so future phases know they were considered:

- **`compose-skicka-overflow-lt412.md`** (severity: minor, surface: ComposeOrderPage Mode A) — "Skicka beställning" overflows under 412 px viewport. Not folded because the surface is ComposeOrderPage action row, not the AppShell/Konto target of Phase 11. Candidate for a future "Phase 12 Compose UX polish" or its own quick task.
- **`order-detail-bekrafta-hidden-767.md`** (severity: high, surface: ComposeOrderPage Mode C) — "Bekräfta" button clipped at 767 px (md-breakpoint boundary). Same surface as the above; same out-of-scope reasoning. High severity suggests prioritizing as a near-term quick task even though it's not Phase 11.
- **`order-detail-leverera-hidden-767.md`** (severity: high, surface: ComposeOrderPage Mode D) — "Markera som levererad" button clipped at 767 px. Mirror of the bekrafta bug; likely shares root cause; fixing one likely fixes the other.

Recommendation: surface the two `_767` todos to the user post-Phase-11 as candidates for a single quick task (`260525-XYZ-fix-order-detail-action-clipping-at-767px`) since they probably share a single layout bug — a sticky/fixed footer collision at the md transition.

</deferred>

---

*Phase: 11-Quick Polish*
*Context gathered: 2026-05-25*
*Discussion log: 11-DISCUSSION-LOG.md*
