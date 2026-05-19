# Walking Skeleton — MediTrack

**Phase:** 1 (Foundation & Auth)
**Generated:** 2026-05-20

## Capability Proven End-to-End

A seeded `admin` user can submit credentials at `/login`, the API hashes-and-verifies against Postgres, persists a `Session` row, returns an `httpOnly` cookie, and the browser fetches `GET /api/me` with that cookie and renders the user's name + care unit on a `Dashboard` page — all running under one `docker compose up`.

This single login → session-write → /me-read → render loop touches every architectural surface (DB write, DB read, API auth chain, cookie boundary, FE router gate, TanStack Query cache, Docker orchestration) so subsequent phases can assume the skeleton works and add slices without renegotiating these decisions.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | Vite + React + TypeScript, React Router v7 (data mode, no loaders), TanStack Query | D-12; Vite gives the fastest dev loop; TanStack Query is the source of truth for `useAuth` (D-17); React Router owns URL only — clean split (Shared #8). |
| Styling | Tailwind CSS + shadcn/ui (`new-york` preset, `slate` baseColor, CSS variables) | UI-SPEC §Design System; shadcn unblocks defensible UX in interview budget; CSS variables let later phases theme without refactor. |
| Backend framework | Node.js 20 + Fastify (TypeScript, ESM) | PROJECT.md locked; Fastify preHandler pattern is the cleanest expression of D-15 (auth + RBAC chain). |
| Validation / contracts | Zod schemas in `packages/shared` shared across FE+BE | D-08; one source of truth, runtime + compile-time safety via `z.infer<>`. Fastify validates inputs via `fastify-type-provider-zod`; React forms via `@hookform/resolvers/zod`. |
| ORM / database | Prisma 5 + PostgreSQL 16 | D-07; Prisma local to `apps/api`, never imported from web. Postgres' row-level locking gives the §6 concurrency answer that lands in Phase 4. |
| Auth model | Server-side opaque session ID (≥256 bits, base64url) in `httpOnly` + `SameSite=Lax` cookie; argon2id for password hashing; sliding 7d expiry capped at 30d | D-01, D-03, D-04, D-05; no JWT secret rotation; trivial revocation via `DELETE FROM sessions`; clean §6 scaling answer (DB-backed sessions need no sticky routing). |
| Permission model | `ActionKey` literal union in `@meditrack/shared` + `PERMISSIONS: Record<ActionKey, Role[]>` map in `apps/api/src/auth/permissions.ts` + `requirePermission(action)` Fastify preHandler factory | D-15, D-17, D-18; FE `<Can>` shares the same `ActionKey` type, eliminating drift between client gating and server enforcement (Shared #4). |
| Tenant scoping | Service-layer `careUnitId` injection — every service function takes `careUnitId` as first arg; route handlers never call Prisma directly | D-16, Shared #2; gives a real answer to the §6 "50 vårdenheter" question (service-layer today, RLS tomorrow). |
| Error envelope | `{ error: { code: string, message: string, details?: unknown } }` — `code` is stable English, `message` is Swedish user copy | D-19, Shared #1; locked Phase 1 because every later phase emits errors. |
| Monorepo / build | pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`) — `pnpm-workspace.yaml`, single lockfile, plain `pnpm -r` scripts | D-06, D-09; no Turborepo at 3 packages. |
| Local run | `docker compose up` — services `postgres`, `api`, `web`; api runs `prisma migrate deploy && prisma db seed && node dist/server.js`; healthcheck on `/healthz` | PROJECT.md "golden command"; Phase 1 success #4; Vite dev proxies `/api/*` → api service in compose (D-02) so the cookie is same-origin without CORS. |
| i18n / copy | Hardcoded Swedish UI strings, English code identifiers; `<html lang="sv">` | Shared #5, UI-SPEC §Copy; brief vocabulary verbatim. |
| Testing | Vitest (Node env for API, `app.inject()` against a separate test DB; jsdom for web) | PROJECT.md locked; Pattern O; satisfies §3.1 "minst en enhets-/integrationstest". |

## Stack Touched in Phase 1

- [x] **Project scaffold** — pnpm workspace; `apps/web` (Vite/React/Tailwind/shadcn), `apps/api` (Fastify/Prisma), `packages/shared` (Zod). Strict TS, ESM, Node 20.
- [x] **Routing** — `/login` (public, no shell) + `/dashboard` (under `<AuthGate>`); plus full responsive shell with four nav destinations (`/dashboard`, `/lakemedel`, `/bestallningar`, `/konto`) and an admin-only `/admin/audit` stub.
- [x] **Database (real read AND real write)** — `User`, `CareUnit`, `Session` tables. Login = `SELECT user, INSERT session`. `GET /me` = `SELECT session JOIN user`. Migration committed; seed inserts 3 users + 1 vårdenhet.
- [x] **UI (real interactive element wired to the API)** — Login form (`react-hook-form` + `zodResolver(loginRequest)`) POSTs to `/api/auth/login`, cookie set, redirect to `/dashboard`, TanStack Query `useQuery(['me'])` populates the user pill. Logout button on Konto + popover hits `DELETE /api/auth/session` and clears the cache.
- [x] **Deployment (local full-stack run)** — `docker compose up` brings up postgres + api + web with seed data; api healthcheck passes; web container serves the SPA; integration smoke test (login + `/me` round-trip via Fastify `app.inject()`) passes in `apps/api/test/`.

## Out of Scope (Deferred to Later Slices)

These are intentionally excluded from Phase 1 to keep the skeleton minimal. Any later contributor tempted to re-add them in Phase 1 should re-read this list and the cited rationale.

- **Rate limiting on `/auth/login`** — Phase 7 README "with more time" note. Argon2id + generic error message (D-04) is the Phase 1 mitigation for brute force.
- **Postgres Row-Level Security (RLS)** — service-layer scoping (D-16) is the Phase 1 floor; RLS is the §6 follow-up answer when asked.
- **OpenAPI / generated client** — Zod-as-contract (D-08) gives runtime validation + inferred types; OpenAPI is a Phase 7 README note.
- **Password change / admin user-provisioning UI** — v2 requirements AUTH-08, AUTH-09; not in v1 roadmap.
- **Multi-vårdenhet switcher** — out of scope per PROJECT.md; v2 requirement MULTI-01.
- **Turborepo task caching** — 3 packages doesn't justify it; revisit at 6+.
- **CSRF token** — same-origin via Vite proxy + `SameSite=Lax` (D-02) suffices in dev; Phase 7 README documents the cross-origin follow-up.
- **WebSocket / push notifications** — TanStack Query invalidation is enough; out of scope per PROJECT.md.
- **Toasts / success notifications** — Phase 1 uses navigation as the success signal (UI-SPEC §Login, §10 401 Redirect). Toasts may be added in Phase 6 if needed for low-stock banner.
- **Medication / order / audit / AI surfaces** — Phases 2–6 add these on top of the skeleton without altering its decisions.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2** — Authorized user can find, create, edit, delete medications for their `vårdenhet`; low-stock indicator (`CAT-01..07`, `STK-03..04`). Builds on: service-layer + `<Can>` + Zod contracts + RBAC map (extend `PERMISSIONS` with `medication:*`).
- **Phase 3** — Nurse composes, edits, submits a multi-line order; `Utkast → Skickad` transition (`ORD-01..03`). Adds `medication` reads, `order` + `order_line` writes; status-machine enforced server-side; reuses the same error envelope and tenant scoping.
- **Phase 4** — Pharmacist confirms + delivers; stock increments atomically under `SELECT … FOR UPDATE`; concurrency test (`ORD-04..07`, `STK-01..02`, `OPS-03`). Lands the brief's §6 concurrency answer; full integration test of `create → submit → confirm → deliver`.
- **Phase 5** — Append-only `audit_events` table + admin browse view (`AUD-01..03`). Adds the BE middleware that wraps every mutation; admin-only audit page wired into the Phase 1 shell.
- **Phase 6** — LLM auto-categorization of medications + dashboard low-stock banner (`AI-01..03`, `NTF-01..02`). Differentiators on top of the working core; LLM call isolated behind one service interface.
- **Phase 7** — Submission polish: docker-compose with full seeds, README with stack rationale + §6 answers, clean git history, breakpoint pass across every screen (`OPS-01..02`, `OPS-04`). No new product surface.

---

*Walking Skeleton recorded: 2026-05-20*
*Sources: 01-CONTEXT.md (D-01..D-19), 01-PATTERNS.md (Patterns A–P), 01-UI-SPEC.md (Dimensions 1–6), PROJECT.md, ROADMAP.md, REQUIREMENTS.md*
