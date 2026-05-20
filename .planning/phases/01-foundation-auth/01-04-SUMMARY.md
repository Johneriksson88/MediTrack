---
phase: 01-foundation-auth
plan: 04
subsystem: ui
tags: [shell, navigation, mobile-first, responsive, ux-01, breakpoints, react-router, tailwind, shadcn, swedish, accessibility]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: "Plan 02 walking skeleton (AuthGate, fetchJson, queryClient, shadcn primitives, /api/auth/* endpoints, login page)"
  - phase: 01-foundation-auth
    provides: "Plan 03 RBAC primitives (useAuth, useCan, <Can>, /api/admin/ping, PERMISSIONS map)"
provides:
  - "Responsive app shell (TopBar + Sidebar + BottomTabBar) sized to UX-01 4-breakpoint contract (360/768/1024/1440 px)"
  - "Reusable component primitives: RoleBadge, EmptyStateCard, shadcn Popover"
  - "AuthSkeleton — zero-layout-shift loading chrome that mirrors the real shell"
  - "useLogout hook (AUTH-03) — DELETE /api/auth/session + cache invalidation + redirect"
  - "RoleRoute wrapper — admin-only route gate (defense-in-depth, BE is real boundary)"
  - "Canonical NAV array at apps/web/src/routes/shell/nav.ts (single source for Sidebar + BottomTabBar)"
  - "Phase 1 router: /login + AuthGate(AppShell) + /dashboard /lakemedel /bestallningar /konto /admin/audit + catch-all"
  - "Verbatim Swedish copy contract enforced (Dashboard, Läkemedel, Beställningar, Konto, Admin, Logga ut, 'Den här vyn fylls i nästa fas.')"
affects: [phase-02-medication-registry, phase-03-orders, phase-04-stock-logic, phase-05-audit, phase-06-low-stock, phase-07-polish]

# Tech tracking
tech-stack:
  added:
    - "@radix-ui/react-popover (via shadcn add popover) — accessible Popover primitive for UserPillPopover"
  patterns:
    - "Pattern N (responsive shell, CSS-only breakpoint detection — Tailwind hidden md:flex / md:hidden, NEVER JS)"
    - "Shared #6 (focus-visible:ring-2 ring-[#2563EB] ring-offset-2 on every interactive element)"
    - "Shared #7 (min-h-[44px] touch targets on all nav items)"
    - "Shared #8 (TanStack Query owns data; React Router owns URL; never mix)"
    - "Single canonical NAV array consumed by both Sidebar and BottomTabBar (DRY nav surface)"
    - "AuthGate(AppShell) layout-route wrapper — skeleton renders shell chrome too (zero layout shift)"
    - "RoleRoute defense-in-depth pattern (FE redirects + BE is the real boundary)"

key-files:
  created:
    - "apps/web/src/components/ui/popover.tsx — shadcn Popover re-exports"
    - "apps/web/src/components/RoleBadge.tsx — role-color chip (Apotekare/Sjuksköterska/Admin)"
    - "apps/web/src/components/EmptyStateCard.tsx — canonical stub-page card"
    - "apps/web/src/features/auth/useLogout.ts — DELETE /api/auth/session mutation + redirect"
    - "apps/web/src/auth/RoleRoute.tsx — admin-route gate wrapper"
    - "apps/web/src/routes/shell/nav.ts — canonical NAV array (extend here in Phase 2+)"
    - "apps/web/src/routes/shell/AppShell.tsx — layout wrapper (TopBar + Sidebar/BottomTabBar + Outlet)"
    - "apps/web/src/routes/shell/TopBar.tsx — h-14 logo + (md+) UserPillPopover"
    - "apps/web/src/routes/shell/Sidebar.tsx — md:w-16 icon-only / lg:w-60 icon+label"
    - "apps/web/src/routes/shell/BottomTabBar.tsx — fixed bottom nav <md with safe-area-inset"
    - "apps/web/src/routes/shell/UserPillPopover.tsx — name · RoleBadge · careUnit + Logga ut"
    - "apps/web/src/routes/shell/AuthSkeleton.tsx — loading chrome matching shell dimensions"
    - "apps/web/src/routes/lakemedel/LakemedelPage.tsx — EmptyStateCard stub"
    - "apps/web/src/routes/bestallningar/BestallningarPage.tsx — EmptyStateCard stub"
    - "apps/web/src/routes/konto/KontoPage.tsx — user info + Logga ut + admin gate + admin:ping"
    - "apps/web/src/routes/admin/AuditPage.tsx — EmptyStateCard stub (RoleRoute-gated)"
  modified:
    - "apps/web/src/router.tsx — full Phase 1 route map (AuthGate > AppShell > children + admin RoleRoute branch + catch-all)"
    - "apps/web/src/routes/dashboard/DashboardPage.tsx — replaced Plan 02 placeholder with EmptyStateCard"
    - "apps/web/src/auth/AuthGate.tsx — swap raw Skeleton for <AuthSkeleton/>"
    - "apps/web/package.json + pnpm-lock.yaml — added @radix-ui/react-popover"

key-decisions:
  - "Centralized NAV array at routes/shell/nav.ts (not co-located with Sidebar). Both Sidebar and BottomTabBar import it. Phase 2+ extends this single file when adding nav destinations."
  - "AuthGate wraps AppShell (not the reverse). The skeleton loading state therefore renders the shell chrome too, eliminating layout shift when /me resolves."
  - "Used `<Can action=\"admin:ping\">` from Plan 03 directly on Konto page (Plan 03 was already merged when Plan 04 executed in Wave 2). No Wave-2 fallback shim needed."
  - "BottomTabBar filters the admin nav item by `user.role === 'admin'` — the Sidebar does the same. Both are defense-in-depth; the real gate is RoleRoute + BE permission checks (Plan 03)."
  - "CSS-only breakpoint detection (Tailwind responsive classes) — never JS window.matchMedia. Cleaner SSR-compatible, no hydration mismatch risk, no resize listeners."

patterns-established:
  - "Pattern N — responsive shell: CSS-only breakpoint detection (hidden md:flex / md:hidden), single NAV array shared by mobile + desktop, min-w-0 on every flex child to prevent overflow blowout."
  - "Stub page contract: every empty Phase 1 destination renders <EmptyStateCard icon={lucideIcon} heading=\"<Swedish label>\"/> with the verbatim body 'Den här vyn fylls i nästa fas.' hardcoded in the card."
  - "Loading skeleton contract: <AuthSkeleton/> renders the exact shell chrome dimensions so /me resolution causes zero layout shift."
  - "Logout flow: useLogout mutation does DELETE /api/auth/session → queryClient.removeQueries(['me']) → navigate('/login', {replace: true}). Idempotent on the BE (DELETE returns 204 even without a session)."

requirements-completed: [UX-01, AUTH-03]

# Metrics
duration: ~75min (3 task commits + 1 checkpoint UX-01 verification cycle)
completed: 2026-05-20
---

# Phase 01 Plan 04: App Shell + Stub Pages Summary

**Responsive app shell — TopBar + adaptive Sidebar/BottomTabBar + UserPillPopover + AuthSkeleton — with 4-breakpoint UX-01 contract met and AUTH-03 logout wired end-to-end across desktop + mobile entry points.**

## Performance

- **Duration:** ~75 min (across 3 task commits + Task 4 manual UX verification)
- **Completed:** 2026-05-20
- **Tasks:** 4 (3 implementation + 1 human-verify checkpoint)
- **Files modified:** 21 (16 created, 5 modified)
- **Lines added/removed:** +1287 / −68

## Accomplishments

- **UX-01 satisfied:** Zero horizontal scroll on every Phase 1 route at 360 / 768 / 1024 / 1440 px. Sidebar collapses to icon-only at md and expands to icon+label at lg; BottomTabBar takes over below md with safe-area-inset respected. User-approved at the Task 4 checkpoint.
- **AUTH-03 satisfied:** Logout works from both the desktop user-pill popover and the mobile Konto page button. Mutation invalidates the `['me']` query and redirects to `/login`.
- **Full Phase 1 route surface live:** `/login`, `/dashboard`, `/lakemedel`, `/bestallningar`, `/konto`, `/admin/audit`, and catch-all. Admin route is RoleRoute-gated (FE defense-in-depth; BE remains the real boundary).
- **Canonical primitives extracted** for downstream phases: `RoleBadge`, `EmptyStateCard`, `AuthSkeleton`, `RoleRoute`, `useLogout`, and the single `nav.ts` NAV array.
- **All Swedish copy verbatim per UI-SPEC:** `Dashboard`, `Läkemedel`, `Beställningar`, `Konto`, `Admin`, `Logga ut`, `Den här vyn fylls i nästa fas.`, `Denna åtgärd kräver adminrättigheter.`

## Task Commits

Each task was committed atomically on the main branch:

1. **Task 1: Reusable building blocks (Popover + RoleBadge + EmptyStateCard + useLogout + RoleRoute)** — `de9a4ad` (feat)
2. **Task 2: Responsive app shell (TopBar + Sidebar + BottomTabBar + UserPillPopover + AuthSkeleton)** — `8a97ef6` (feat)
3. **Task 3: Route pages + Phase 1 router wired through AppShell** — `f7974fa` (feat)
4. **Task 4: UX-01 four-breakpoint manual verification** — checkpoint only, no code commit (user-approved "Approved — all points pass")

**Plan metadata commit:** this SUMMARY.md (docs commit, follows immediately).

## Files Created/Modified

### Created (16)

- `apps/web/src/components/ui/popover.tsx` — shadcn Popover wrapper around `@radix-ui/react-popover`
- `apps/web/src/components/RoleBadge.tsx` — `bg-blue-100 / bg-teal-100 / bg-amber-100` chip with Swedish labels
- `apps/web/src/components/EmptyStateCard.tsx` — centering wrapper + shadcn Card with icon + heading + hardcoded body
- `apps/web/src/features/auth/useLogout.ts` — TanStack mutation: DELETE /api/auth/session → removeQueries + navigate('/login')
- `apps/web/src/auth/RoleRoute.tsx` — Outlet wrapper, redirects to /dashboard when user.role not in `roles`
- `apps/web/src/routes/shell/nav.ts` — canonical NAV array (5 items, admin gated by `adminOnly: true`)
- `apps/web/src/routes/shell/AppShell.tsx` — min-h-screen flex column: TopBar, flex row (Sidebar md+, main + BottomTabBar md-), Outlet
- `apps/web/src/routes/shell/TopBar.tsx` — h-14 bg-slate-100 with Stethoscope logo + (md+) UserPillPopover
- `apps/web/src/routes/shell/Sidebar.tsx` — hidden md:flex md:w-16 lg:w-60, NavLink list with active-state left border
- `apps/web/src/routes/shell/BottomTabBar.tsx` — md:hidden fixed bottom-0 with safe-area-inset-bottom + aria-label="Primary"
- `apps/web/src/routes/shell/UserPillPopover.tsx` — name · RoleBadge · careUnit pill + Popover with Logga ut
- `apps/web/src/routes/shell/AuthSkeleton.tsx` — Skeleton blocks matching shell layout (zero layout shift)
- `apps/web/src/routes/lakemedel/LakemedelPage.tsx` — EmptyStateCard stub
- `apps/web/src/routes/bestallningar/BestallningarPage.tsx` — EmptyStateCard stub
- `apps/web/src/routes/konto/KontoPage.tsx` — user info + RoleBadge + Logga ut + `<Can action="admin:ping">` admin gate
- `apps/web/src/routes/admin/AuditPage.tsx` — EmptyStateCard stub (RoleRoute-protected)

### Modified (5)

- `apps/web/src/router.tsx` — full Phase 1 route map (was Plan 02 walking-skeleton minimal map)
- `apps/web/src/routes/dashboard/DashboardPage.tsx` — replaced Plan 02 user-name placeholder with EmptyStateCard
- `apps/web/src/auth/AuthGate.tsx` — swap raw `<Skeleton/>` for `<AuthSkeleton/>` (chrome-matching loading state)
- `apps/web/package.json` — added `@radix-ui/react-popover`
- `pnpm-lock.yaml` — lockfile churn for the new dep

## Decisions Made

- **Centralized NAV at `apps/web/src/routes/shell/nav.ts`** rather than co-locating with `Sidebar.tsx`. Reason: Sidebar and BottomTabBar are sibling consumers; co-location creates a "who owns it" smell. Phase 2+ extends this single file when adding nav destinations.
- **AuthGate wraps AppShell, not the reverse.** The skeleton loading state renders the shell chrome too (same outer dimensions). When `useQuery(['me'])` resolves, content appears in place — no layout shift.
- **`<Can action="admin:ping">` used directly on the Konto page** without the Wave-2 fallback shim. Plan 03 had already merged when Plan 04 executed, so `useAuth`, `useCan`, and `<Can>` were all importable from `@/auth/*`. No TODO comments left behind.
- **CSS-only breakpoint detection (Tailwind responsive classes)** — never JS `window.matchMedia`. Cleaner SSR posture, no hydration mismatch risk, no resize listeners to clean up. Pattern N codified.
- **`min-w-0` on every flex child** that contains content in AppShell. This is the non-obvious one — without it, long content (long medication names in Phase 2) blows out the flex container width, breaking UX-01. Documented in the AppShell file header.

## Deviations from Plan

None — plan executed exactly as written.

The plan's Wave-2 fallback contingencies (inline `useQuery(['me'])` hook + TODO comments if Plan 03 hadn't merged) turned out unnecessary because Plan 03 had already shipped. No deviation rules triggered.

## Issues Encountered

### Docker compose `api` container failed at runtime — UX-01 verification fell back to native dev

- **What happened:** `docker compose up --build` (the README's golden command from Plan 02) crashed the `api` container at startup. Prisma 5's query engine on `node:20-alpine` could not load `libquery_engine-linux-musl-openssl-3.0.x.so.node` — the Alpine OpenSSL 3 binary in `node_modules/.prisma/client` is unreliable across Prisma 5 multi-stage Docker builds.
- **How resolved:** UX-01 verification was performed against native dev (`pnpm --filter @meditrack/api dev` + `pnpm --filter @meditrack/web dev` against a single Postgres container). All 6 routes returned HTTP 200; the user executed the 4-breakpoint protocol against `http://localhost:5173` and approved.
- **Deferred to Plan 05** — see `deferred-items.md` for the full repro + suggested fix (switch `apps/api/Dockerfile` from `node:20-alpine` to `node:20-bookworm-slim` so the Prisma binary target becomes the well-supported `debian-openssl-3.0.x`). The README golden command MUST work before Phase 1 ships; Plan 05 owns the fix.

### Non-admin role visibility verification (step 9) deferred — no non-admin seed users yet

- **What happened:** UX-01 step 9 (log in as `sjukskoterska@example.test`, confirm Admin nav hidden + Konto admin gate note renders) could not run — Plan 02's seed only creates `admin@example.test`.
- **How resolved:** The plan's checkpoint explicitly allows deferring step 9 if seeds aren't ready. Steps 1–8 and 10–11 passed; user approved.
- **Deferred to Plan 05** — extend `apps/api/prisma/seed.ts` to seed one `apotekare` and one `sjukskoterska` user against the existing care unit, then re-run step 9 as part of Plan 05's checkpoint. See `deferred-items.md`.

## Deferred Items

Both items above are tracked in `.planning/phases/01-foundation-auth/deferred-items.md`:

1. **Docker compose api container Prisma/Alpine/OpenSSL incompatibility** — Plan 05 must fix the api Dockerfile (likely `node:20-bookworm-slim`). README's `docker compose up` golden command is broken until this lands.
2. **Non-admin role UX-01 verification (step 9)** — Plan 05 must seed non-admin users + re-run the visibility check.

## User Setup Required

None — no external service configuration introduced in Plan 04. All deps installed via `pnpm install` are public npm registry packages (Radix UI + lucide-react via shadcn, already a Plan 02 dependency).

## Next Phase Readiness

**Ready for Plan 05 (Phase 1 wave 3 — final reconciliation + Docker fix):**

- All Phase 1 UI surface in place: shell + 4 stub destinations + admin gate + logout.
- Plan 05's known scope: (1) fix `docker compose up` (api Dockerfile Debian switch), (2) seed non-admin users, (3) re-run UX-01 step 9, (4) any final Wave-2 reconciliation (none currently needed — Plan 03 + 04 integrated cleanly).
- All Phase 2+ inherits: Pattern N (responsive shell), `EmptyStateCard` (every empty destination), `RoleBadge` (status chips by analogy), `RoleRoute` (admin gates), the canonical `nav.ts` NAV array.

**Blockers:** None for Phase 2 design work. The docker issue blocks the README golden-command claim but does not block code progress (native dev works end-to-end).

## Self-Check: PASSED

- All 3 task commits present in git log (`de9a4ad`, `8a97ef6`, `f7974fa`).
- All 16 created files present on disk under `apps/web/src/`.
- `pnpm --filter @meditrack/web build` clean (Task 1, 2, 3 verifies).
- 6 routes returned HTTP 200 against native dev (Task 4 preflight automation).
- User approved Task 4 UX-01 four-breakpoint protocol verbatim: "Approved — all points pass".

---
*Phase: 01-foundation-auth*
*Completed: 2026-05-20*
