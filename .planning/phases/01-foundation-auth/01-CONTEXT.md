# Phase 1: Foundation & Auth - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the project skeleton so a seeded user can log in, see an app shell scoped to their `vårdenhet`, and have RBAC enforced end-to-end on a stub endpoint. Mobile-first layout system in place across 360 / 768 / 1024 / 1440.

**In scope (Phase 1 only — REQ-IDs AUTH-01..07, UX-01):**
- Login / logout / session persistence (email + password)
- 3-role enum (`apotekare`, `sjuksköterska`, `admin`); one role per user; one `vårdenhet` per user
- Backend role enforcement on a stub endpoint that returns 401 / 403 / 200 correctly
- Frontend role-aware action gating on the same stub
- Empty app shell with mobile-first nav, working at all four breakpoints
- 3 seed users (one per role) on a single seeded `vårdenhet`
- `docker compose up` brings up `postgres` + `api` + `web`; smoke test `login → /me round-trip` passes

**Out of scope (other phases):**
- Medication CRUD, search/filter, low-stock indicator → Phase 2
- Order composition / submission → Phase 3
- Order confirm/deliver, stock decrement, concurrency lock → Phase 4
- Audit log writes and admin browse → Phase 5
- AI categorization + dashboard low-stock banner → Phase 6
- Final README + seed data polish + git history cleanup → Phase 7

</domain>

<decisions>
## Implementation Decisions

### Session Strategy

- **D-01: Server-side sessions, not JWT.** Random opaque session ID (≥128 bits, base64url) in an `httpOnly` + `Secure` + `SameSite=Lax` cookie. A `sessions` table in Postgres keyed by `id` stores `user_id`, `care_unit_id`, `created_at`, `expires_at`, `last_seen_at`. Logout = `DELETE FROM sessions WHERE id = $1`. No JWT secret to rotate; trivial revocation; clean §6 scaling answer (DB-backed sessions need no sticky routing).
- **D-02: Same-origin in dev via Vite proxy.** Vite proxies `/api/*` → Fastify (e.g. `http://api:3000` in compose, `localhost:3000` outside compose). No CORS config required for the session cookie path. Same posture as prod (api serves built SPA, or compose-level proxy). Removes a class of preflight / `SameSite=None` bugs that would cost time live in the interview.
- **D-03: Sliding 7-day session expiry, 30-day cap.** On every authenticated request, the auth preHandler bumps `expires_at = now + 7d` (cap at `created_at + 30d`). User stays logged in through normal usage, gets a real idle expiry, no refresh-token machinery.
- **D-04: Generic failed-login message.** AUTH-01 returns `400` (or `401`) with `{ error: { code: 'invalid_credentials', message: 'Fel e-post eller lösenord.' } }` for both unknown email and wrong password — no user enumeration. Rate limiting deferred to Phase 7 "with more time" notes.
- **D-05: Password hashing = `argon2id` via `argon2` npm package.** Modern default, OWASP-recommended; bcrypt acceptable fallback if argon2 native build trips on Windows during local dev. Settle on argon2id in `apps/api`'s `auth/password.ts`.

### Monorepo Layout

- **D-06: pnpm workspaces.** Single `pnpm-workspace.yaml` at repo root. Packages: `apps/web` (Vite + React), `apps/api` (Fastify), `packages/shared` (Zod schemas + inferred DTO types). One lockfile (`pnpm-lock.yaml`), strict about phantom deps. README sells the choice in one line.
- **D-07: Prisma is local to `apps/api`.** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, generated client imported only from `apps/api/src/**`. `apps/web` never imports Prisma; types crossing the wire come from `packages/shared`.
- **D-08: `packages/shared` = Zod schemas + `z.infer<>` types.** Request/response shapes (login, /me, /me/permissions, error envelope) live as Zod schemas in `packages/shared/src/contracts/*.ts`. Fastify validates inputs with the schema; React forms (`react-hook-form` + `@hookform/resolvers/zod`) consume the same schema. One source of truth, runtime + compile-time safety.
- **D-09: Plain `pnpm` scripts, no Turborepo.** `pnpm -r run build / dev / test`. Docker Compose orchestrates services. If task caching ever matters, revisit — for 3 packages it doesn't.

### App Shell & Navigation

- **D-10: Mobile-first responsive nav.** Below `md` (<768px): fixed bottom tab bar (thumb-reach, 56–64px tall, safe-area inset on iOS). At `md`+ (≥768px): persistent left sidebar — icon-only at `md`, icon + label at `lg`+ (≥1024px). No layout shift between breakpoints (same router outlet, different chrome).
- **D-11: Four primary destinations from Phase 1.** Dashboard / Läkemedel / Beställningar / Konto. Phase 1 pages are stubs (empty states + breadcrumb-style headers) except for Konto (logout + user pill showing name, role, vårdenhet). Admin-only entry (Audit) appears conditionally for `admin` role — wired in shell from Phase 1, page lands in Phase 5.
- **D-12: React Router v7 (data mode).** `createBrowserRouter` with route objects; loaders optional and not load-bearing in Phase 1 (TanStack Query handles fetching). Route guards: `<AuthGate>` at the root authenticated route; `<RoleRoute roles={[...]}>` for admin-only routes (Audit, Phase 5).
- **D-13: Auth UI = standalone `/login` route + `<AuthGate>` for everything else.** `/login` renders without the shell (centered shadcn `Card`, email + password + submit, generic error inline). Authenticated routes render under `<AuthGate>` which calls `useQuery(['me'])`; on 401 it `<Navigate to="/login" state={{ from }} />`. Successful login redirects to `from` or `/`.
- **D-14: User pill in the shell.** Top app bar (desktop) / Konto tab landing (mobile) shows `{user.name} · {role-badge} · {careUnit.name}`. Logout button lives in the Konto tab content (mobile) and in a popover off the pill (desktop).

### RBAC Enforcement

- **D-15: BE — centralized permission map + Fastify `preHandler` factory.** `apps/api/src/auth/permissions.ts` exports `PERMISSIONS: Record<ActionKey, Role[]>` (action keys like `'medication:create'`, `'order:confirm'`, `'order:deliver'`, `'audit:read'`). Route registration: `app.post('/...', { preHandler: [requireSession, requirePermission('order:confirm')] }, ...)`. `requirePermission` returns 401 if no session, 403 if session role not in the permission list, both via the canonical error envelope (D-19).
- **D-16: BE — tenant scoping in the service layer.** Auth preHandler decorates `req.user = { id, role, careUnitId, name, email }`. **Every** service function takes `careUnitId` as the first arg and includes it in every Prisma `where`. Handlers do not call Prisma directly — they go through `apps/api/src/services/*`. Enforced by lint convention + code review (Phase 1 sets the precedent on `auth.service.ts`). RLS deferred — it's the §6 follow-up answer if asked.
- **D-17: FE — `useAuth()` hook + `<Can action="...">` component.** `useAuth()` returns `{ user, can(action), isLoading }` backed by `useQuery(['me'])`. `<Can action="order:confirm">{children}</Can>` renders children only when `can('order:confirm')`. `useCan(action)` for inline disables (`disabled={!useCan('...')}`). The action-key list mirrors the BE permission map; both consume the same `ActionKey` union from `packages/shared`.
- **D-18: Phase 1 stub endpoint = `GET /me` with embedded permissions array.** Single endpoint returns `{ id, email, name, role, careUnit: { id, name }, permissions: ActionKey[] }`. FE's `useQuery(['me'])` is the source of truth for `useAuth()`. Saves a round-trip vs separate `/me/permissions`. The roadmap names `/me/permissions` — this is the satisfying tweak; documented here so planner doesn't undo it. Unauthenticated: 401. Wrong-role stub for the demo: an `admin:ping` action that returns 403 for non-admin sessions, proving 401 / 403 / 200 paths all work end-to-end (Phase 1 success criterion #2).
- **D-19: Canonical error envelope.** All error responses from the API: HTTP status `{4xx,5xx}` + body `{ error: { code: string, message: string, details?: unknown } }`. `code` is a short stable string (`invalid_credentials`, `forbidden`, `unauthenticated`, `validation_failed`); `message` is Swedish, user-displayable. Schema lives in `packages/shared/src/contracts/error.ts`. Locked from Phase 1 because every later phase produces error responses.

### Claude's Discretion

- Exact cookie name (recommend `meditrack.sid`), session ID byte length (recommend 32 bytes / 256 bits, base64url-encoded), and argon2 parameters (recommend OWASP 2025 defaults).
- File layout inside `apps/api/src/` (e.g., `routes/`, `services/`, `auth/`, `db/`) and inside `apps/web/src/` (e.g., `routes/`, `components/`, `hooks/`, `lib/`).
- Whether the Konto tab is a separate route or a sheet/popover triggered from the user pill — decide during implementation based on what looks best with shadcn primitives.
- Logging stack for Phase 1: pino is the obvious Fastify default; level driven by env. No structured tracing required this phase.
- Linting / formatting tooling (ESLint flat config + Prettier vs Biome). Pick the one with the lowest friction; nothing depends on the choice.
- Whether to add a `/healthz` endpoint in Phase 1 (recommended — it makes the docker-compose health check easy in Phase 7).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing & scope
- `.planning/PROJECT.md` — Locked stack (TS+React+Vite+TanStack Query+Tailwind+shadcn, Node+TS+Fastify, Postgres+Prisma, Vitest, Docker Compose), Key Decisions table, out-of-scope reasoning. **The Key Decisions table is binding** — do not relitigate.
- `.planning/REQUIREMENTS.md` §"Authentication & Authorization" + §"User Experience" — REQ-IDs AUTH-01..07 and UX-01 with their full acceptance language. **The reviewable acceptance criteria for this phase.**
- `.planning/ROADMAP.md` §"Phase 1: Foundation & Auth" — Goal statement, the 5 success criteria, mode (mvp), and cuttability framing.

### Brief (the source of truth for the interview)
- `local/intervju-testcase-1-1-.pdf` §2.1, §3 (deliverables), §5 (evaluation weights), §6 (live interview questions: concurrency, 1→50 vårdenheter, auth retrofitting). **Local-only PDF, not committed; do not read in CI. Use PROJECT.md and REQUIREMENTS.md as the committed mirror.**

### Tooling / harness
- `CLAUDE.md` — Tooling rules, GSD workflow expectations, current stack constraints, directory conventions.
- `.planning/STATE.md` — Current phase progress and config.
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled).

No external ADRs or SPEC.md exist yet — implementation decisions captured above are the canonical record for Phase 1.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Greenfield repo. No application source code exists yet. Only existing trees are:
- `.claude/` — GSD tooling (hooks, agents, commands). **Do not modify** unless explicitly asked.
- `.planning/` — Planning artifacts (PROJECT, REQUIREMENTS, ROADMAP, STATE, config). **Read-only inputs for planner/researcher.**
- `local/` — Brief PDF; gitignored, not committed.
- `CLAUDE.md` — Project instructions.

### Established Patterns

None in code yet. Patterns established by **this CONTEXT.md** that every later phase inherits:
- Zod-schema-as-contract via `packages/shared` (D-08).
- Service-layer Prisma access with `careUnitId` injected from session (D-16).
- Fastify `preHandler` factory pattern for auth + RBAC (D-15).
- Centralized action-key permission map shared FE↔BE (D-15, D-17).
- Canonical error envelope (D-19).
- React Router v7 + TanStack Query split (router routes, queries data) (D-12).

### Integration Points

There is no system to integrate with yet. Phase 1 **creates** all of: the repo layout (D-06), the database schema scaffolding (users, sessions, care_units), the Fastify app skeleton with the auth preHandler chain, the Vite + Tailwind + shadcn skeleton, and the docker-compose file. Every later phase plugs into these surfaces — they must be solid before Phase 2 starts.

</code_context>

<specifics>
## Specific Ideas

- **Swedish UI vocabulary, English code identifiers.** Tab labels, error messages, role labels in the FE are Swedish (`Läkemedel`, `Beställningar`, `Konto`, `Apotekare`, `Sjuksköterska`, `Admin`, `Fel e-post eller lösenord.`). Variable names, table names, action keys stay English (`medications`, `orders`, `care_units`, `'order:confirm'`).
- **Status pill vocabulary (carried for future phases, locked now):** `Utkast` / `Skickad` / `Bekräftad` / `Levererad` — verbatim. Phase 1 doesn't render these yet but the strings live in shared constants from day 1.
- **Demo seeds:** three users `apotekare@example.test`, `sjukskoterska@example.test`, `admin@example.test` with a single shared trivial password (e.g., `demo1234`); documented in README seeds section in Phase 7. One vårdenhet: `"Avdelning 4, Karolinska"`.
- **`docker compose up` is the golden command** — every Phase 1 decision must keep that command end-to-end working (smoke test: login + `/me` round-trip).
- **§6 prep notes baked into Phase 1 architecture:** Server-side sessions (scale answer), service-layer `careUnitId` scoping (50-units answer), real RBAC enforced on every write from day 1 (retrofit-auth answer). The "what I'd do differently" answer becomes natural once Phases 2–7 ship.

</specifics>

<deferred>
## Deferred Ideas

- **Rate limiting on `/auth/login`** — recommended in Phase 7 "with more time" README notes.
- **Postgres Row-Level Security (RLS)** for tenant isolation — discussed as the stronger guarantee; deferred. The §6 "how would you make this airtight at 50 units" answer becomes "service-layer scoping today, RLS tomorrow."
- **OpenAPI / generated client** — discussed during shared-package question; rejected for now in favor of Zod-as-contract. Reasonable Phase 7 README note.
- **Turborepo task caching** — rejected at 3 packages; revisit if the repo grows to 6+.
- **Per-user password changes / admin user provisioning UI** — already in v2 requirements (AUTH-08, AUTH-09); not in v1 roadmap.
- **Multi-vårdenhet switcher in the UI** — out of scope per PROJECT.md; v2 requirement MULTI-01.
- **CI pipeline on day 1** — not asked about; deferrable to Phase 7. Could land earlier as a half-day investment if time permits.

</deferred>

---

*Phase: 1-Foundation & Auth*
*Context gathered: 2026-05-20*
