# Phase 1: Foundation & Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 1-Foundation & Auth
**Areas discussed:** Session strategy, Monorepo layout, App shell & nav, RBAC enforcement

---

## Session Strategy

### Q1: How should sessions work?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side session | Random opaque session ID in httpOnly+Secure+SameSite=Lax cookie; sessions table in Postgres keyed by id with user_id, care_unit_id, expires_at. Logout = DELETE row. Trivial revocation, no JWT secret to rotate. | ✓ |
| Stateless JWT in cookie | Signed JWT in httpOnly cookie. No sessions table; logout = clear cookie. Revocation hard; needs refresh-token story for AUTH-02. | |
| Library-managed (Lucia/Auth.js/Iron-session) | Adopt a session lib. Saves boilerplate; harder to motivate in README. | |

**User's choice:** Server-side session
**Notes:** Picked for clean §6 scaling answer (no sticky routing needed) and easy revocation. Sets up D-01..D-03 in CONTEXT.md.

### Q2: Session cookie scoping — same-origin via vite proxy vs split-origin CORS?

| Option | Description | Selected |
|--------|-------------|----------|
| Same-origin via vite proxy | Dev: vite proxies /api/* to fastify. Prod: api serves built SPA or compose-level proxy. SameSite=Lax cookie just works. | ✓ |
| Split-origin with CORS + credentials | web on :5173, api on :3000, CORS allowlist + credentials:true. Realistic but adds preflight / cookie debugging surface. | |

**User's choice:** Same-origin via vite proxy
**Notes:** Avoids CORS class of bugs during the live interview demo. Locked as D-02.

### Q3: Session lifetime and refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Sliding 7-day expiry | Each authenticated request bumps expires_at by 7 days (cap at 30). User stays logged in as long as they use the app. | ✓ |
| Fixed 24-hour expiry | Login = 24h session, then forced re-login. Bad demo UX if hit live. | |
| Long-lived, no refresh (30 days fixed) | expires_at = now + 30d at login. Simplest; loses the thoughtful sliding-window touch. | |

**User's choice:** Sliding 7-day expiry
**Notes:** Implemented as a single UPDATE in the auth preHandler. Locked as D-03.

### Q4: Failed-login message detail

| Option | Description | Selected |
|--------|-------------|----------|
| Generic "Fel e-post eller lösenord" | Same message for unknown email and wrong password. No user enumeration. | ✓ |
| Differentiated messages | "Ingen användare med den e-posten" vs "Fel lösenord". Lets attackers enumerate emails. | |
| Generic + rate limit per IP/email | Generic message AND a basic rate limiter. Stronger story; ~half a day to ship; deferred to Phase 7 README. | |

**User's choice:** Generic "Fel e-post eller lösenord"
**Notes:** Rate limiting moved to deferred ideas. Locked as D-04.

---

## Monorepo Layout

### Q1: Workspace tool

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm workspaces | apps/web + apps/api + packages/shared. Fast, strict about phantom deps, standard TS monorepo choice. | ✓ |
| npm workspaces | Same layout, npm. Slower, less strict hoisting. Boring/safe. | |
| Flat dirs: web/ + api/ | Two separate package.json roots, no workspace linking. Loses shared DTOs across the stack. | |

**User's choice:** pnpm workspaces
**Notes:** Enables the same-language-stack win (shared types end-to-end). Locked as D-06.

### Q2: Where Prisma lives

| Option | Description | Selected |
|--------|-------------|----------|
| apps/api/prisma + client local to api | Schema and migrations with the service that uses them. apps/web never touches Prisma. | ✓ |
| packages/db (shared package) | Schema + migrations + generated client in a shared package. Couples FE to a DB client; overengineered for one API. | |

**User's choice:** apps/api/prisma + client local to api
**Notes:** Clean boundary, no risk of bundling Node deps into the FE. Locked as D-07.

### Q3: What lives in packages/shared

| Option | Description | Selected |
|--------|-------------|----------|
| Zod schemas + inferred types | API request/response shapes as Zod schemas; BE validates, FE uses for forms + z.infer for types. One source of truth, runtime + compile-time safety. | ✓ |
| TypeScript types only | Plain TS interfaces. No runtime validation; BE needs separate validators. Loses half the value. | |
| Generated from OpenAPI | Define routes via OpenAPI, generate FE client. Toolchain cost real for one week; no runtime BE validation for free. | |

**User's choice:** Zod schemas + inferred types
**Notes:** Locked as D-08. Strong §6 "API design" answer.

### Q4: Build orchestration

| Option | Description | Selected |
|--------|-------------|----------|
| Just pnpm scripts | pnpm -r run build / dev / test. Zero extra config; fits 3 packages. | ✓ |
| Turborepo | turbo.json with task pipeline + caching. Pays off at 20+ packages, not 3. | |

**User's choice:** Just pnpm scripts
**Notes:** Locked as D-09. Turborepo moved to deferred ideas.

---

## App Shell & Nav

### Q1: Mobile-first nav pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom tab bar (mobile) → sidebar (desktop) | <768px: fixed bottom tab bar (thumb reach, native-feel). ≥768px: persistent left sidebar collapsing to icons at md, expanding at lg+. | ✓ |
| Hamburger drawer at all breakpoints | Sheet/drawer triggered by top-left menu icon, identical across breakpoints. Hides primary nav on desktop; fails UX-01 spirit. | |
| Top nav that wraps to drawer below 768 | Horizontal top nav on tablet+, hamburger drawer on mobile. Weaker thumb-reach story on phone. | |

**User's choice:** Bottom tab bar (mobile) → sidebar (desktop)
**Notes:** Strongest UX-01 story; shadcn has the primitives. Locked as D-10.

### Q2: Primary destinations in the shell

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard / Läkemedel / Beställningar / Konto | Four tabs covering the demo loop. Konto holds logout + role/vårdenhet display. Admin entry appears conditionally for admin. | ✓ |
| Dashboard / Läkemedel / Beställningar (3 tabs, logout in header) | Three tabs, logout button + user pill in top app bar. Less consistent across breakpoints. | |
| Single navigation entry; routes drive sub-nav | One tab per top-level area. Pushes the nav decision down the road. | |

**User's choice:** Dashboard / Läkemedel / Beställningar / Konto
**Notes:** Locked as D-11. Admin (Audit) tab appears conditionally from Phase 5.

### Q3: Routing library

| Option | Description | Selected |
|--------|-------------|----------|
| React Router v7 (data mode) | Boring, well-known. Pairs cleanly with TanStack Query. | ✓ |
| TanStack Router | Type-safe routes, file-based, deep TanStack Query integration. Less common pick; reviewer time-cost. | |

**User's choice:** React Router v7 (data mode)
**Notes:** Locked as D-12. Loaders not load-bearing — TanStack Query handles fetching.

### Q4: Auth UI presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Centered login card; auth state via TanStack Query 'me' | /login route renders without shell. Authed routes wrapped by <AuthGate> using useQuery(['me']) → redirect to /login on 401. | ✓ |
| Login inside the shell as a modal/sheet | Always render the shell; gate routes behind a login modal. Confusing layout state. | |

**User's choice:** Centered login card; auth state via TanStack Query 'me'
**Notes:** Locked as D-13.

---

## RBAC Enforcement

### Q1: Backend RBAC pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Centralized permission map + Fastify preHandler factory | permissions.ts maps action keys → allowed roles. Route registration calls preHandler: requirePermission('order:confirm'). One source of truth. | ✓ |
| Per-route inline role check | Each handler starts with if (!['apotekare','admin'].includes(req.user.role)) return 403. Role rules scatter; no central audit. | |
| Decorator / Zod-extended schema with x-roles | Roles in route schema; plugin reads x-roles. Elegant but bespoke DSL. | |

**User's choice:** Centralized permission map + Fastify preHandler factory
**Notes:** Locked as D-15. Strong §6 "retrofit auth" answer: add a role = edit one file.

### Q2: Tenant scoping

| Option | Description | Selected |
|--------|-------------|----------|
| Service layer pulls care_unit_id from session | Auth hook attaches req.user = { id, role, careUnitId }. Every service takes careUnitId, every Prisma where includes it. | ✓ |
| Postgres Row-Level Security (RLS) | Strongest guarantee; bad query can't leak. Awkward with Prisma; needs per-request SET. Expensive for one week. | |
| Prisma middleware that injects careUnitId | Global middleware auto-injects { careUnitId } on every where. Magic; hard to debug; risky. | |

**User's choice:** Service layer pulls care_unit_id from session
**Notes:** Locked as D-16. RLS deferred — the §6 "make it airtight at 50 units" follow-up answer.

### Q3: Frontend role gating

| Option | Description | Selected |
|--------|-------------|----------|
| useAuth() hook + <Can action="..."/> component | useAuth() returns { user, can(action) }. <Can action='order:confirm'> wraps role-gated UI. FE and BE check the same permission key. | ✓ |
| Inline role checks | {user.role === 'apotekare' && <Button .../>} sprinkled around. Role rules drift between BE and FE. | |
| Route-level guards only | <ProtectedRoute roles={['admin']}/> at route boundaries; no in-page gating. Doesn't cover the common case. | |

**User's choice:** useAuth() hook + <Can action="..."/> component
**Notes:** Locked as D-17. Shared action-key union from packages/shared.

### Q4: Phase 1 stub endpoint shape

| Option | Description | Selected |
|--------|-------------|----------|
| Full /me with embedded permissions array | GET /me returns { id, email, name, role, careUnit, permissions: [...] }. Single source of truth for useAuth(). | ✓ |
| Separate /me and /me/permissions | Two endpoints. Slightly purer REST; two queries for one render. | |

**User's choice:** Full /me with embedded permissions array
**Notes:** Locked as D-18. Roadmap-named "/me/permissions" is the tweak — documented so planner doesn't undo it. Phase 1 also exposes an `admin:ping` stub to prove 401/403/200 paths end-to-end.

---

## Claude's Discretion

- Exact cookie name, session ID byte length, argon2 parameters (recommend OWASP 2025 defaults).
- File layout inside apps/api/src and apps/web/src.
- Whether the Konto tab is a separate route or a sheet/popover off the user pill.
- Logging stack for Phase 1 (recommend pino; level by env).
- Linting / formatting (ESLint flat config + Prettier vs Biome).
- Whether to add `/healthz` in Phase 1 (recommended — eases the docker-compose health check in Phase 7).

## Deferred Ideas

- Rate limiting on /auth/login → Phase 7 README "with more time".
- Postgres Row-Level Security (RLS) for tenant isolation → §6 follow-up answer / future hardening.
- OpenAPI / generated client → Phase 7 README "with more time".
- Turborepo task caching → revisit if repo grows to 6+ packages.
- Per-user password changes / admin provisioning UI → v2 (AUTH-08, AUTH-09).
- Multi-vårdenhet switcher in UI → v2 (MULTI-01).
- CI pipeline on day 1 → soft-deferred to Phase 7; could land earlier if time permits.
