---
phase: 11-quick-polish
plan: 01
subsystem: ui
tags: [phase-11, frontend, react, typescript, logout, topbar, tailwind, playwright, vitest]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: useLogout hook, UserPillPopover component, AppShell shell with TopBar, KontoPage with admin gate, renderWithProviders test helper
  - phase: 07-ops-submission-polish
    provides: sc04 Playwright screenshot harness (captureSc04Screenshots.ts) and D-128 primary-nav contract
provides:
  - TopBar with per-breakpoint logout (mobile icon-only md:hidden + desktop icon+label hidden md:flex) wired to useLogout()
  - UserPill static identity display (renamed from UserPillPopover, non-interactive div, no popover)
  - KontoPage gate note reading exactly "Ändringar kan endast göras av administratör."
  - TopBar.test.tsx (6 tests) — first TopBar component test coverage
  - Regenerated sc04-360-*.png screenshots showing new mobile logout icon
affects: [any future shell-layout work, mobile UX changes, auth logout flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-breakpoint CSS-only divergence: md:hidden (mobile-only) / hidden md:flex (desktop-only) — AppShell Pattern N"
    - "Lift mockMutate to module scope in tests that need to assert mutate call count"
    - "git mv + content rewrite: git detects D+A not R when content similarity < 50%; acceptable for major rewrites"

key-files:
  created:
    - apps/web/src/routes/shell/UserPill.tsx
    - apps/web/test/TopBar.test.tsx
  modified:
    - apps/web/src/routes/shell/TopBar.tsx
    - apps/web/src/routes/konto/KontoPage.tsx
    - apps/web/test/KontoPage.test.tsx
    - docs/screenshots/sc04-360-dashboard.png
    - docs/screenshots/sc04-360-lakemedel.png
    - docs/screenshots/sc04-360-bestallningsskapande.png
    - docs/screenshots/sc04-360-bestallningshistorik.png
    - docs/screenshots/sc04-360-audit.png

key-decisions:
  - "D-170: Per-breakpoint divergence — mobile (md:hidden icon-only) + desktop (hidden md:flex icon+label) each fully in the DOM; CSS visibility toggles per viewport"
  - "D-171: UserPillPopover loses Popover wrapper entirely; becomes a static identity display <div> — UserPill.tsx"
  - "D-172: Konto-page destructive Logga ut button retained verbatim — mobile muscle-memory preserved"
  - "D-173: Verbatim string swap KontoPage.tsx:115 per ROADMAP Phase 11 SC#2 exact-quote clause"
  - "D-174: Mobile icon-only (h-11 w-11 = 44px, aria-label=Logga ut); desktop icon+label (min-h-[44px], inline text)"
  - "D-175: Rename UserPillPopover.tsx -> UserPill.tsx via git mv; content rewritten > 50% so git records D+A (acceptable)"

patterns-established:
  - "TopBar logout: two sibling button elements (md:hidden mobile, hidden md:flex desktop cluster) sharing one useLogout() call"
  - "Test mock lifting: lift mockMutate = vi.fn() to module scope when click-assertion tests need to verify call count"

requirements-completed: [UX-02, UX-03]

# Metrics
duration: 30min
completed: 2026-05-25
---

# Phase 11 Plan 01: Quick Polish Summary

**TopBar logout split into per-breakpoint variants (mobile 44px icon-only + desktop icon+label) plus KontoPage gate-note verbatim string swap — 164/164 tests green, sc04 SC#4 invariant holds across 24 cells**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-25T23:50:00Z
- **Completed:** 2026-05-25T23:58:00Z
- **Tasks:** 3
- **Files modified:** 9 (4 source, 1 test created, 1 test modified, 5 screenshots)

## Accomplishments

- UX-02 satisfied: Logga ut now reachable at every breakpoint — mobile icon-only `<LogOut/>` button (44×44 px, `md:hidden`, `aria-label="Logga ut"`, `text-[#DC2626]`) + desktop icon+label button (`hidden md:flex`, `min-h-[44px]`, same red color token). Both share `useLogout()` — single source of truth for DELETE /api/auth/session.
- UX-03 satisfied: KontoPage non-admin gate note reads exactly "Ändringar kan endast göras av administratör." (trailing period preserved per ROADMAP §Phase 11 SC#2). Old string fully purged from source and tests.
- D-171 satisfied: UserPillPopover.tsx simplified and renamed to UserPill.tsx — non-interactive `<div>` identity display, no popover wrapper, no click handler, no role="button".
- New `apps/web/test/TopBar.test.tsx` (6 tests) is the first component test for TopBar. All pass.
- sc04 Phase 7 SC#4 invariant preserved: 24 cells (4 viewports × 6 routes) all pass scrollWidth ≤ innerWidth + primary-nav assertions. 5 authenticated route screenshots refreshed showing new mobile logout icon.

## Task Commits

Each task was committed atomically:

1. **Task 1: TopBar split + UserPill simplification + TopBar.test.tsx** - `1871431` (feat)
2. **Task 2: KontoPage gate-note copy swap + test updates** - `ca7582b` (feat)
3. **Task 3: Regenerate sc04 mobile screenshots** - `7349f16` (chore)

## Files Created/Modified

- `apps/web/src/routes/shell/TopBar.tsx` — Widened to render mobile icon-only logout (`md:hidden h-11 w-11 aria-label="Logga ut"`) + desktop cluster (`hidden md:flex`) with static UserPill and icon+label logout; imports LogOut from lucide-react and useLogout; logo block unchanged
- `apps/web/src/routes/shell/UserPill.tsx` — NEW (renamed from UserPillPopover.tsx via git mv + rewrite); static identity display `<div className="flex items-center">` showing `{user.name} · <RoleBadge/> · {user.careUnit.name}`; no Popover, no logout wiring
- `apps/web/src/routes/konto/KontoPage.tsx` — Line 115: "Denna åtgärd kräver adminrättigheter." → "Ändringar kan endast göras av administratör."; lines 79-87 destructive logout button unchanged (D-172)
- `apps/web/test/TopBar.test.tsx` — NEW; 6 tests covering mobile button (md:hidden class present), desktop button (hidden md:flex parent), both buttons invoke mockMutate, UserPill is non-interactive, logo Link to /dashboard
- `apps/web/test/KontoPage.test.tsx` — 6 string sites updated: doc-comment + admin negative assertion (it-description + queryByText) + sjukskoterska assertion (it-description + getByText) + apotekare assertion (getByText)
- `docs/screenshots/sc04-360-{dashboard,lakemedel,bestallningsskapande,bestallningshistorik,audit}.png` — Regenerated at 360px showing new red LogOut icon in TopBar top-right

## Decisions Made

- D-174 (plan-time decision): Desktop logout uses icon+label ("Logga ut" inline text) rather than icon-only — preserves text discoverability on desktop. Mobile uses icon-only with `aria-label="Logga ut"` — preserves 44×44 tap target on constrained 360px viewport.
- D-175 executed: git mv was performed before content rewrite; git records D+A (not R) because content similarity < 50% after stripping Popover wrapper and renaming the export. This is acceptable — the rename intent is documented in the commit message and this SUMMARY.

## Deviations from Plan

None — plan executed exactly as written. All 6 acceptance criteria for Task 1 and all 5 for Task 2 verified. sc04 harness exited 0 for Task 3.

The only minor note: docker container name conflict between worktree and main repo's stopped containers (`meditrack-postgres`, `meditrack-api`, `meditrack-web` names). Resolved by removing the stopped main-repo containers and starting the worktree stack with the rebuilt images (which include the Phase 11 FE changes).

## Issues Encountered

- Docker container name conflict: worktree's `docker-compose.yml` uses hardcoded `container_name:` fields identical to the main repo stack's stopped containers. Resolved by removing the stopped containers (`docker rm meditrack-postgres meditrack-api meditrack-web`) then starting from the worktree — images rebuilt including Phase 11 code (confirmed by checking bundle for "Ändringar kan endast").

## User Setup Required

None — no external service configuration required. Stack left running per orchestrator instruction.

## Threat Surface Scan

No new threat surface. Pure FE diff per threat model T-11-01:
- No new endpoints, no new request handlers, no new data sinks
- Three new `useLogout()` caller sites (mobile TopBar, desktop TopBar, retained Konto button) — all invoke the existing CSRF-protected DELETE /api/auth/session. Idempotent; `disabled={logout.isPending}` prevents double-fire.

## Known Stubs

None — all wired. TopBar logout buttons invoke `useLogout()` (real hook). UserPill reads from `useAuth()` (real hook). KontoPage string is a verbatim literal. Screenshots are real Playwright captures from the live stack.

## Next Phase Readiness

Phase 11 is the final phase per ROADMAP §Cuttability. All v1 requirements satisfied:
- UX-02: TopBar logout at every breakpoint — complete
- UX-03: Konto gate note verbatim — complete
- All prior phase requirements (AUTH-01..07, CAT-01..10, ORD-01..11, STK-01..04, AUD-01..03, NTF-01..02, AI-01..03, UX-01) validated in prior phases

The `@/components/ui/popover` Radix dep + shadcn wrapper remain in the codebase (3 remaining importers: AtcCodeCombobox, TherapeuticClassCombobox, AuditFilterBar). Removal is a v2 cleanup quick-task, not Phase 11 scope.

---
*Phase: 11-quick-polish*
*Completed: 2026-05-25*
