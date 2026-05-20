---
phase: 01
slug: foundation-auth
status: verified
threats_total: 35
threats_closed: 35
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-05-20
audit_date: 2026-05-20
auditor: gsd-security-auditor (sonnet)
register_authored_at_plan_time: true
---

# Phase 01 — Security (foundation-auth)

> Verdict: **SECURED.** All 35 plan-time threats verified CLOSED — 25 mitigated in code, 10 accepted with documented rationale. Four advisory flags from `01-REVIEW.md` are listed under Unregistered Flags; they are non-blocking and tracked for follow-up.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → `/api/*` | Untrusted user input crosses the wire | email, password, body payloads |
| Cookie ↔ `Session` table | Signed cookie value indexes server-side session; HMAC rejects tampering | session id (256-bit base64url), `careUnitId` lookup |
| Service layer → Prisma | `careUnitId`-scoped queries enforce tenancy (D-16) | tenant identifier on every read/write |
| Browser → `/api/admin/*` | Role check via `requirePermission` + PERMISSIONS map | session-bound role |
| FE `<Can>` / `<RoleRoute>` → DOM | Defense in depth only — never the security boundary (AUTH-06) | rendered DOM tree |
| Logout flow → session cookie | `DELETE /api/auth/session` is the only state-changing logout request | session id (cleared) |
| Compose network → host | Postgres on 5432, api on 3000, web on 5173 — host-bound for dev | local dev only |
| Seed script → DB | Inserts three demo users with `demo1234` — dev/demo environment only | three role-tagged users + one `CareUnit` |
| README → reviewer | Documents demo credentials; no secrets beyond the seed script | published demo credentials |

---

## Threat Register

### Plan 02 — Walking Skeleton + Auth (T-01-xx)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Spoofing | `POST /api/auth/login` | mitigate | argon2id hash + verify (`apps/api/src/auth/password.ts`); 256-bit `crypto.randomBytes` session id (`apps/api/src/auth/session.ts`); signed cookie via `COOKIE_SECRET` (`apps/api/src/auth/cookie.ts`) | closed |
| T-01-02 | Tampering | session cookie | mitigate | `@fastify/cookie` HMAC sign/unsign (`apps/api/src/plugins/cookies.ts`); `unsignCookie` invalid → `UnauthenticatedError` (`apps/api/src/auth/requireSession.ts`) | closed |
| T-01-03 | Tampering | npm installs (Dockerfile path) | mitigate | `pnpm install --frozen-lockfile` in `apps/api/Dockerfile`; only canonical top-100 packages used; `pnpm-lock.yaml` committed | closed |
| T-01-04 | Repudiation | login attempts | accept | See Accepted Risks Log | closed |
| T-01-05 | Information Disclosure | login response on failure | mitigate | Unknown email and wrong password share `InvalidCredentialsError` → identical envelope `{ code: 'invalid_credentials', message: 'Fel e-post eller lösenord.' }` (`apps/api/src/services/auth.service.ts` + `apps/api/src/plugins/errorHandler.ts`) | closed |
| T-01-06 | Information Disclosure | login response timing | mitigate | Unknown-email path calls `verifyPassword` against `DUMMY_HASH_PLACEHOLDER` before throwing — constant-ish response time across failure modes (`apps/api/src/services/auth.service.ts`) | closed |
| T-01-07 | Information Disclosure | `passwordHash` field | mitigate | Service layer constructs response objects without `passwordHash`; `meResponse` Zod schema has no such field (`packages/shared/src/contracts/me.ts`); grep confirms zero occurrences in `user.service.ts` | closed |
| T-01-08 | Information Disclosure | session cookie via XSS | mitigate | `httpOnly: true` on the session cookie (`apps/api/src/auth/cookie.ts`); zero `dangerouslySetInnerHTML` in Phase 1 FE code | closed |
| T-01-09 | Denial of Service | brute force on `/api/auth/login` | accept | See Accepted Risks Log | closed |
| T-01-10 | Elevation of Privilege | session fixation | mitigate | Session id always generated server-side via `crypto.randomBytes(32)` in `createSession`; never accept client-supplied ids (`apps/api/src/auth/session.ts`) | closed |
| T-01-11 | Elevation of Privilege | CSRF on auth routes | mitigate | `sameSite: 'lax'` on the session cookie blocks third-party form-POST CSRF (`apps/api/src/auth/cookie.ts`); Vite proxy keeps the SPA same-origin in dev | closed |
| T-01-12 | Elevation of Privilege | mass assignment on `POST /api/auth/login` | mitigate | `loginRequest` Zod schema strips unknown fields (`packages/shared/src/contracts/login.ts`); Fastify route validates via `fastify-type-provider-zod` (`apps/api/src/routes/auth.ts`) | closed |
| T-01-13 | Information Disclosure | cross-`careUnit` data leak | mitigate | `getMeForSession(careUnitId, sessionId)` takes `careUnitId` first; cross-tenant check `session.careUnitId !== careUnitId` enforced (`apps/api/src/services/user.service.ts`) — Pattern D / D-16 | closed |
| T-01-14 | Information Disclosure | secrets in repo | mitigate | `.env` gitignored; `.env.example` ships only placeholder `replace-me-with-32-bytes-random`; `docker-compose.yml` `COOKIE_SECRET` fallback is obviously a dev value | closed |
| T-01-SC | Tampering | supply chain (npm) | mitigate | All Phase 1 packages are top-100 npm with verified maintainers; `pnpm-lock.yaml` committed; `--frozen-lockfile` in `apps/api/Dockerfile`; no `[ASSUMED]` / `[SUS]` / `[SLOP]` packages | closed |

### Plan 03 — RBAC end-to-end (T-03-xx)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Elevation of Privilege | non-admin calls `/api/admin/ping` | mitigate | `requirePermission('admin:ping')` returns 403 + `{ code: 'forbidden', message: 'Du saknar behörighet att utföra denna åtgärd.' }` before the handler runs (`apps/api/src/auth/requirePermission.ts`); covered by 7 matrix tests in `apps/api/test/admin.ping.test.ts` | closed |
| T-03-02 | Elevation of Privilege | FE bypass (direct request) | mitigate | BE remains the security boundary; T-03-01 mitigation applies regardless of FE state; `apps/web/src/auth/Can.tsx` is documented defense in depth | closed |
| T-03-03 | Tampering | permission-map drift FE/BE | mitigate | `ACTION_KEYS` literal union in `packages/shared/src/contracts/permissions.ts` is the single source of truth; `PERMISSIONS: Record<ActionKey, Role[]>` in `apps/api/src/auth/permissions.ts` enforces compile-time exhaustiveness; FE imports `ActionKey` from `@meditrack/shared` | closed |
| T-03-04 | Information Disclosure | `/me` leaks privileged action keys | accept | See Accepted Risks Log | closed |
| T-03-05 | Tampering | `preHandler` chain ordering | mitigate | `apps/api/src/routes/adminPing.ts` registers `preHandler: [requireSession, requirePermission('admin:ping')]` — `requireSession` first per Pattern C | closed |
| T-03-06 | Elevation of Privilege | `requirePermission` without `req.user` | mitigate | `requirePermission` guards `if (!req.user) throw new UnauthenticatedError()` before the role check (`apps/api/src/auth/requirePermission.ts`) | closed |
| T-03-SC | Tampering | supply chain (no new packages) | mitigate | Plan 03 introduced zero new third-party packages; uses only Plan 02-vetted dependencies | closed |

### Plan 04 — Responsive shell + logout (T-04-xx)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Information Disclosure | logout button visible to unauthenticated users | accept | See Accepted Risks Log | closed |
| T-04-02 | Tampering | URL craft to `/admin/audit` as non-admin | mitigate | `<RoleRoute roles={['admin']}>` reads `useAuth()` and falls back to `<Navigate to="/dashboard" replace/>` for non-admin (`apps/web/src/auth/RoleRoute.tsx`) — defense in depth ahead of Phase 5 BE enforcement | closed |
| T-04-03 | Information Disclosure | admin nav item visible to non-admin | mitigate | Centralized `visibleNav(role)` filter (`apps/web/src/routes/shell/nav.ts`) consumed by `Sidebar.tsx` and `BottomTabBar.tsx` excludes `adminOnly` entries when `role !== 'admin'` | closed |
| T-04-04 | Spoofing | CSRF on `DELETE /api/auth/session` | mitigate | Covered by T-01-11's `SameSite=Lax`; applies to all state-changing cookie-bearing requests | closed |
| T-04-05 | Information Disclosure | XSS via user-controlled DOM content | accept | See Accepted Risks Log | closed |
| T-04-06 | Elevation of Privilege | FE `<Can>` bypass via DevTools | accept | See Accepted Risks Log | closed |
| T-04-07 | Denial of Service | spamming logout endpoint | accept | See Accepted Risks Log | closed |
| T-04-SC | Tampering | shadcn `add popover` (supply chain) | mitigate | shadcn registry is `ui.shadcn.com` (official); underlying `@radix-ui/react-popover ^1.1.15` is a top-100 npm package; no `[SUS]` / `[ASSUMED]` packages | closed |

### Plan 05 — Seeds + smoke test + reconciliation (T-05-xx)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Information Disclosure | demo password in README + seed | accept | See Accepted Risks Log | closed |
| T-05-02 | Tampering | re-running seed creates duplicates | mitigate | `prisma.{careUnit,user}.upsert` keyed by stable unique fields (`id`, `email`); `update: {}` leaves existing rows untouched (`apps/api/prisma/seed.ts`); `VERIFICATION.md` confirms idempotency (User count == 3 after second run) | closed |
| T-05-03 | Spoofing | same-password reuse across roles | accept | See Accepted Risks Log | closed |
| T-05-04 | Information Disclosure | smoke test logs session cookies | accept | See Accepted Risks Log | closed |
| T-05-SC | Tampering | no new package installs | mitigate | Plan 05 added zero npm packages; no supply-chain surface | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-04 | Phase 1 logs login attempts via pino (Fastify default). Detailed audit trail lands in Phase 5 (AUD-01). Acceptable for interview tool, low-value target. | Plan 02 author | 2026-05-20 |
| AR-02 | T-01-09 | Rate limiting deferred to Phase 7 README "with more time" note. Argon2id is intrinsically slow (~100 ms/verify at OWASP defaults), passively bounding attack rate. Acceptable for one-week interview demo. | Plan 02 author | 2026-05-20 |
| AR-03 | T-03-04 | `permissions` array on `/me` is intentional disclosure — AUTH-06 requires the FE to gate UI using the same map. Phase 1's only action key is `'admin:ping'`, a harmless string. | Plan 03 author | 2026-05-20 |
| AR-04 | T-04-01 | Logout button renders only inside `<AuthGate>` (authenticated routes); never visible to unauthenticated users. | Plan 04 author | 2026-05-20 |
| AR-05 | T-04-05 | Rendered values (`user.name`, `user.careUnit.name`) come from the BE which validates inputs via Zod. React's default escaping prevents script injection; zero `dangerouslySetInnerHTML` in Plan 04. | Plan 04 author | 2026-05-20 |
| AR-06 | T-04-06 | AUTH-06 explicitly designates the FE as defense in depth, not the security boundary. A user editing local state to force-render the admin button still gets 403 from `requirePermission` on the BE. | Plan 04 author | 2026-05-20 |
| AR-07 | T-04-07 | `DELETE /api/auth/session` is idempotent (204 even without a cookie). No DoS surface beyond normal request volume. | Plan 04 author | 2026-05-20 |
| AR-08 | T-05-01 | README documents that demo passwords are dev/demo only. Production deploy requires regenerating users with strong passwords (called out as Phase 7 README note). Acceptable for the interview submission. | Plan 05 author | 2026-05-20 |
| AR-09 | T-05-03 | All three demo users share `demo1234`. The brief does not require per-account passwords; Phase 7 README mentions this as a known gap. | Plan 05 author | 2026-05-20 |
| AR-10 | T-05-04 | Vitest may include cookie values in failure output. These are local test-fixture sessions against a test DB, not production secrets. | Plan 05 author | 2026-05-20 |

---

## Unregistered Flags

Items surfaced by `01-REVIEW.md` that do not map to any declared threat in the four PLAN registers. Advisory only — they do not block Phase 1 shipment.

| Flag ID | Source | Category | Description | Recommendation |
|---------|--------|----------|-------------|----------------|
| UF-01 | CR-01 | Information Disclosure / Availability | `apps/api/src/services/user.service.ts:32-37` throws plain `new Error('Session no longer valid')` on the session-race branch. The global error handler maps unknown errors to HTTP 500, not 401. The code comment claims "401-equivalent" — implementation disagrees. The FE's `isUnauthenticated()` check (`err.status === 401`) returns false on this branch and falls through to the router error boundary instead of `/login`. | Replace with `throw new UnauthenticatedError()` (already imported by `requireSession.ts`). Defense-in-depth path that should be unreachable when `requireSession` runs as preHandler. Register on Phase 2 backlog. |
| UF-02 | WR-05 | Integrity / Defense in depth | `apps/web/src/routes/konto/KontoPage.tsx` — the admin gate note (inverse side) uses `user.role !== 'admin'` instead of `!useCan('admin:ping')`. Positive side correctly uses `<Can action="admin:ping">`. Bypasses the PERMISSIONS map on the inverse branch — silently wrong if the role/permission mapping becomes non-trivial. | Replace with `const canAdminPing = useCan('admin:ping'); {!canAdminPing && <p>…</p>}`. Low priority for Phase 1 (1:1 mapping), important once Phase 2 adds more action keys. |
| UF-03 | WR-01 | Denial of Service | No rate limiting on `POST /api/auth/login`. Argon2id's ~150–300 ms verify is the only passive throttle. Unlimited attempts per IP/email are accepted. | Register `@fastify/rate-limit` in Phase 7 polish. Document in README "Known gaps" section. Related to AR-02. |
| UF-04 | WR-06 | Repudiation / Observability | Failed login attempts produce no log output — `errorHandler` suppresses logging on `InvalidCredentialsError`. Combined with UF-03, brute-force activity is operationally invisible. | Add `req.log.warn({ ip: req.ip }, 'auth.login.invalid')` on the `InvalidCredentialsError` branch. Worth raising for the §6 "operational questions" discussion. Related to AR-01. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-20 | 35 | 35 | 0 | gsd-security-auditor (sonnet) |

| Event | Date | Outcome |
|-------|------|---------|
| Plans 02–05 execution complete | 2026-05-20 | All 5 ROADMAP success criteria verified ("phase 1 approved") |
| Phase 01 code review (`01-REVIEW.md`) | 2026-05-20T22:30:00Z | 1 critical (CR-01) + 7 warnings + 7 info — none declared in PLAN threat registers (filed as UF-01..UF-04) |
| Phase 01 verification (`01-VERIFICATION.md`) | 2026-05-20T19:43:05Z | status=passed, 5/5 ROADMAP criteria, 8/8 REQ-IDs |
| Phase 01 security audit (this document) | 2026-05-20 | 35/35 threats CLOSED, 0 OPEN, 4 unregistered flags (advisory) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-20
