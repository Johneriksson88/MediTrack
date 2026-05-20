---
phase: 01
slug: foundation-auth
status: approved
nyquist_compliant: true
wave_0_complete: n/a-retroactive
created: 2026-05-20
---

# Phase 01 — Validation Strategy

> Retroactive Nyquist audit of foundation-auth (Plans 02–05). All 8 phase requirements (AUTH-01..07, UX-01) have automated coverage except UX-01, which is intentionally manual-only (4-breakpoint visual scroll inspection requires a real browser; Phase 7 may revisit).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend framework** | Vitest 2.0.5 + Fastify `app.inject` + Prisma (real Postgres test schema) |
| **Backend config** | `apps/api/vitest.config.ts` (Pattern O — `pool: 'forks'`, `singleFork: true` so DB-touching files run serially) |
| **Backend harness** | `apps/api/test/helpers/buildTestApp.ts` (exports `buildTestApp`, `resetSessions`, `ensureAllRolesSeeded`, `TEST_ADMIN`, `TEST_APOTEKARE`, `TEST_SJUKSKOTERSKA`, `prisma`) |
| **Frontend framework** | Vitest 2.0.5 + jsdom 24 + React Testing Library 16.x + jest-dom matchers |
| **Frontend config** | `apps/web/vitest.config.ts` (jsdom env, globals, `@`/`@meditrack/shared` aliases via `path.resolve`) |
| **Frontend setup** | `apps/web/vitest.setup.ts` (imports `@testing-library/jest-dom`) |
| **Frontend harness** | `apps/web/test/helpers/renderWithProviders.tsx` (QueryClient + MemoryRouter wrapper with pre-seed support) |
| **Quick run (BE)** | `pnpm --filter @meditrack/api exec vitest run --reporter=basic` |
| **Quick run (FE)** | `pnpm --filter @meditrack/web exec vitest run --reporter=basic` |
| **Full suite** | `pnpm -r exec vitest run --reporter=basic` (BE + FE together) |
| **Estimated runtime** | BE ~4s · FE ~2s · combined ~6s |

---

## Sampling Rate

- **After every task commit:** Run the relevant package suite (BE or FE).
- **After every plan wave:** Run both suites.
- **Before `/gsd:verify-work` / phase close:** Both suites green.
- **Max feedback latency:** ~6s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-02-01 | 02 | 1 | AUTH-04, AUTH-07 | T-01-01..06 | Prisma schema declares `Role` enum + `Session.careUnitId` snapshot; argon2id primitives + opaque 256-bit session IDs | structural | `pnpm --filter @meditrack/api build` (Prisma typegen + tsc enforces) | ✅ | ✅ green |
| 01-02-02 | 02 | 1 | AUTH-01, AUTH-02, AUTH-07 | T-01-01, T-01-02, T-01-06 | Login round-trips signed cookie, /me returns careUnit-scoped payload, tampered cookies rejected | integration | `pnpm --filter @meditrack/api exec vitest run apps/api/test/auth.login.test.ts apps/api/test/auth.me.test.ts` | ✅ | ✅ green (7/7) |
| 01-02-03 | 02 | 1 | AUTH-01, AUTH-02 | T-01-07 | Initial migration applied; schema-push guards against typegen/DB drift | integration | `pnpm --filter @meditrack/api exec vitest run` (smoke + login + me round-trip against migrated DB) | ✅ | ✅ green |
| 01-02-04 | 02 | 1 | UX-01, AUTH-01 | T-01-08 | Vite + Tailwind + shadcn loads `/login` with verbatim Swedish copy | structural | `pnpm --filter @meditrack/web build` (typecheck + bundle); UX-01 visual verified manually | ✅ | ✅ green |
| 01-02-05 | 02 | 1 | — | T-01-07 | `docker compose up --build` brings postgres + api + web healthy | integration | `docker compose ps` (manual checkpoint) + smoke test against live container | ✅ | ✅ green (Plan 05 Task 4 user-approved) |
| 01-03-01 | 03 | 2 | AUTH-05 | T-03-01, T-03-05, T-03-06 | BE rejects unauthorized with 401/403 + canonical envelope; `requireSession` precedes `requirePermission` | integration | `pnpm --filter @meditrack/api exec vitest run apps/api/test/admin.ping.test.ts` | ✅ | ✅ green (7/7 — 401/403/200 matrix + /me regression across 3 roles) |
| 01-03-02 | 03 | 2 | AUTH-06 | T-03-02, T-03-03 | FE `<Can>` / `useCan` / `useAuth` hide actions when role lacks ActionKey | unit | `pnpm --filter @meditrack/web exec vitest run apps/web/test/Can.test.tsx apps/web/test/useAuth.test.tsx` | ✅ | ✅ green (10/10) |
| 01-04-01 | 04 | 2 | AUTH-03, UX-01 | T-04-04 | RoleBadge / EmptyStateCard / useLogout / RoleRoute primitives ready; logout idempotent DELETE | integration | `pnpm --filter @meditrack/api exec vitest run apps/api/test/auth.flow.smoke.test.ts` (BE logout cycle) | ✅ | ✅ green |
| 01-04-02 | 04 | 2 | UX-01 | T-04-03 | TopBar + Sidebar + BottomTabBar + UserPillPopover render with verbatim Swedish copy + correct breakpoint classes | structural + visual | `pnpm --filter @meditrack/web build` (typecheck); UX-01 4-breakpoint visual = manual-only | ✅ | ✅ green |
| 01-04-03 | 04 | 2 | UX-01, AUTH-06 | T-04-02, T-04-03 | Router maps all Phase 1 routes; `/admin/audit` gated by `RoleRoute(['admin'])`; admin nav filtered for non-admin in Sidebar + BottomTabBar | unit | `pnpm --filter @meditrack/web exec vitest run apps/web/test/RoleRoute.test.tsx apps/web/test/Sidebar.test.tsx apps/web/test/BottomTabBar.test.tsx` | ✅ | ✅ green (21/21) |
| 01-04-04 | 04 | 2 | UX-01 | — | 4-breakpoint zero-horizontal-scroll across `/dashboard`, `/lakemedel`, `/bestallningar`, `/konto` | manual | (see Manual-Only Verifications) | n/a | ✅ user-approved 2026-05-20 |
| 01-05-01 | 05 | 3 | AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07 | T-05-02 | Idempotent 3-role seed + end-to-end smoke per role: login → /me → admin:ping → logout → /me 401 | integration | `pnpm --filter @meditrack/api exec vitest run apps/api/test/auth.flow.smoke.test.ts` | ✅ | ✅ green (4/4 — 3 role iterations + session-count invariant) |
| 01-05-02 | 05 | 3 | AUTH-06 | T-04-02, T-04-03 | KontoPage uses `<Can action="admin:ping">` for the admin button; non-admin sees verbatim `Denna åtgärd kräver adminrättigheter.`; no `TODO` markers in `RoleRoute.tsx` / `KontoPage.tsx` | unit | `pnpm --filter @meditrack/web exec vitest run apps/web/test/KontoPage.test.tsx` | ✅ | ✅ green (9/9 — admin / sjukskoterska / apotekare matrices + logout button always visible) |
| 01-05-03 | 05 | 3 | — | T-05-01 | README documents quickstart + demo credentials | structural | `grep -F 'apotekare@example.test' README.md && grep -F 'demo1234' README.md && grep -F 'Avdelning 4, Karolinska' README.md` | ✅ | ✅ green |
| 01-05-04 | 05 | 3 | All Phase 1 | All Phase 1 | Cold-clone `docker compose down -v && docker compose up --build` brings stack healthy; smoke test green; all 5 ROADMAP success criteria observably true | manual | (see Manual-Only Verifications) | n/a | ✅ user-approved 2026-05-20 ("Phase 1 approved") |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Coverage:** 14/14 tasks have automated verification or recorded human-checkpoint approval. No 3-consecutive-task gap without automated feedback.

---

## Wave 0 Requirements

N/A — retroactive validation. Phase 1 executed without a Wave 0 stub. The audit added the missing FE test infrastructure (Vitest config + RTL harness + 6 test files, 40 tests) to close AUTH-06's coverage gap. No backend test infra changes needed — Pattern O harness from Plan 02 covered all BE requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zero horizontal scroll on `/dashboard`, `/lakemedel`, `/bestallningar`, `/konto` at 360 / 768 / 1024 / 1440 px | UX-01 | jsdom does not implement responsive CSS layout faithfully; only a real browser engine can validate `document.documentElement.scrollWidth ≤ clientWidth` across viewports. Playwright would close this — deferred (out of Phase 1 scope per ROADMAP; Phase 7 polish candidate). | Run `pnpm dev` (or `docker compose up`), open Chrome DevTools → Responsive mode, visit each of the 4 routes at each of the 4 widths, confirm `document.documentElement.scrollWidth - document.documentElement.clientWidth ≤ 0` in the console. User-approved 2026-05-20 at Plan 04 Task 4 ("Approved — all points pass") and again at Plan 05 Task 4 ("Phase 1 approved"). |
| Logout button click → redirect to `/login` (UI gesture, not BE call) | AUTH-03 (UI half) | `useLogout` hook is exercised by KontoPage / UserPillPopover tests at render level; the actual click → mutation → `removeQueries(['me'])` → `navigate('/login')` chain integrates TanStack Query with React Router and is more cheaply validated end-to-end in a browser than worth wiring up in jsdom. BE DELETE /api/auth/session is fully tested by `auth.flow.smoke.test.ts`. | Log in as any role → click `Logga ut` (mobile: Konto page; desktop: user-pill popover) → confirm redirect to `/login` and `/api/me` returns 401 on next request. User-approved 2026-05-20 at Plan 05 Task 4. |
| `docker compose up --build` from cold clone | Phase 1 success #4 | Container orchestration + healthchecks + first-run migrate-then-seed is environment-level behavior. Smoke test runs **against** a live api but doesn't spin compose itself. | `docker compose down -v && docker compose up --build` → `docker compose ps` shows postgres (healthy), api (healthy), web (running). User-approved 2026-05-20 at Plan 05 Task 4. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or recorded human-checkpoint approval
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (audit added FE Vitest infra + 6 test files / 40 tests; UX-01 documented as manual-only with justification)
- [x] No watch-mode flags in any command (all commands use `vitest run`, not `vitest`)
- [x] Feedback latency < 10s (BE ~4s, FE ~2s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-20

---

## Validation Audit 2026-05-20

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 1 (AUTH-06 — 40 FE tests across 6 files) |
| Escalated to manual-only | 1 (UX-01 — Playwright deferred per scope; human approvals on file) |
| New test files | 6 (apps/web/test/Can.test.tsx, useAuth.test.tsx, KontoPage.test.tsx, Sidebar.test.tsx, BottomTabBar.test.tsx, RoleRoute.test.tsx) |
| New infrastructure | 3 (apps/web/vitest.config.ts, vitest.setup.ts, test/helpers/renderWithProviders.tsx) |
| New devDeps | 3 (@testing-library/react, @testing-library/jest-dom, @testing-library/user-event) |
| Tests added | 40 (3 + 7 + 9 + 9 + 8 + 4) — all green |
| Implementation files modified | 0 (auditor constraint respected) |
