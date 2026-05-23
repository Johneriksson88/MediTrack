---
phase: 5
slug: audit-log
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-23
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Source: 11 PLAN `<threat_model>` blocks (Plans 01–11) consolidated by `/gsd:secure-phase`.
> Mode: all open threats accepted-as-documented at user request (no auditor verification spawn).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| HTTP request → Fastify pipeline | ALS plugin runs on `onRequest` before any route handler — `requestId` always populated; `actorALS.run` per-request frame prevents keep-alive leakage. | Request body, session cookie, requestId |
| HTTP request → audit routes | Admin-only via `requirePermission('audit:read')`; preHandler order `[requireSession, requirePermission(...)]`. | Query params, cursor |
| HTTP request → POST /api/auth/login | Rate-limit-bucketed by (email, IP) and by IP; failing attempts write audit rows; 429 attempts do not. | Email, password attempt |
| HTTP request → DELETE /api/auth/session | Session cookie crosses here; route resolves actor via findSessionById BEFORE destroySession to preserve audit attribution. | Session cookie, userId |
| Service layer → Prisma extension `$transaction` | activeTxStackALS frame snapshots per call; per-model handlers route through the correct tx client. Audit INSERT runs inside the wrapping mutation's tx (D-91). | Mutation payload, actorId |
| service code → Prisma model methods | `createMany` bypasses audit interception per D-93; ESLint enforces `seed.ts` as sole consumer. `$queryRaw`/`$executeRaw` bypass entirely (T-05-01 accepted); CI grep + allowlist enforce. | Domain entity rows |
| service code → prisma.auditEvent.create (auth.login_failed) | Call uses OUTER prisma singleton; commits independently of any surrounding `$transaction`. | Failed-login attempt metadata |
| Prisma client → Postgres | `meditrack_app` runtime role REVOKEd UPDATE/DELETE/TRUNCATE on `audit_events` (migration 0010). Owner role `meditrack` bypasses GRANT but hits BEFORE-trigger (migration 0008). | All persisted writes |
| any code path → audit_events INSERT | BEFORE INSERT trigger (migration 0011) rejects empty/NULL `entityId` with SQLSTATE 23514. | Audit row |
| Cursor parameter → SQL | Base64-encoded JSON; decoded via Zod; used as Prisma `where` clause values (parameterized, not string-interpolated). Invalid cursor → 400 `invalid_cursor` envelope. | Pagination state |
| Application memory ↔ AsyncLocalStorage | actorALS store carries `actorUserId` from validated session cookie via `requireSession` — never from request body. | actorUserId, requestId, activeTx |
| Permalink URL → clipboard | `navigator.clipboard.writeText`; URL composed from values that passed server-side Zod response schema; no `before`/`after` payload in URL. | Filter params only |
| docker-compose env → Postgres role table | `POSTGRES_USER`/`POSTGRES_PASSWORD` create owner role; migration 0010 creates `meditrack_app` with non-production hardcoded password. | DB role credentials (demo-scope only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Tampering | `$queryRaw` / `$executeRaw` bypass | accept | `$extends` does not intercept raw queries. README documents gap; v2 CI grep banning `$executeRaw` outside allowlist (D-93). No write-bearing raw query exists today. | closed |
| T-05-02 | Tampering | audit_events UPDATE/DELETE from app code | mitigate | (1) ESLint `no-restricted-syntax` banning `prisma.auditEvent.update*/delete*/upsert`; (2) Postgres REVOKE migration; (3) Plan 03 integration test asserts both layers. | closed |
| T-05-03 | Information Disclosure | Sensitive data leak via before/after JSON or entityId column (passwordHash, raw session token) | mitigate | `AUDIT_ALLOWLIST` excludes `User.passwordHash` and `Session.id`; `resolveEntityId(model, row)` records `userId` for Session writes (never raw signed session token). Tests #5 + #7 assert. | closed |
| T-05-04 (P01) | Information Disclosure | Cross-tenant audit data exposure via `/api/audit/events` | mitigate | `requirePermission('audit:read')` restricted to `['admin']`; sjuksköterska/apotekare receive 403. Admin is intentionally cross-tenant per D-16 exception. | closed |
| T-05-04 (P04) | Repudiation | `auditExtension.ts` audit-row INSERT path orphan-on-rollback | mitigate | Route audit INSERT through `Prisma.getExtensionContext(this)`; row commits/rolls back with wrapping mutation. Regression test asserts. | closed |
| T-05-05 | Denial of Service | Audit log row volume explosion | accept | Only mutations audited (D-93). Cursor pagination on list endpoint (D-105). Admin-only access narrows abuse vector. Retention "keep forever for v1" (D-101); v2 cold-storage in README. | closed |
| T-05-06 | Spoofing | Replay/forgery of audit rows (claim a different actor) | mitigate | `actorUserId` sourced from `als.getStore()`, populated by `requireSession` from validated session cookie. Body-supplied actor impossible by construction. | closed |
| T-05-07 | Tampering / consistency | Orphan audit rows when wrapping mutation rolls back | mitigate | Prisma extension's interception runs inside same `$transaction` (D-91). Rollback path tested in canonical E2E. | closed |
| T-05-08 | Injection | Cursor parameter SQL injection | mitigate | Cursor decoded to `{createdAt, id}` and used as Prisma `where` values (parameterized). Invalid format → `ValidationFailedError` → 400. | closed |
| T-05-09 | Information Disclosure | Sensitive data in permalink URL | accept | URL contains `actor`, `action`, `requestId` only — none secret. No `before`/`after` payload. | closed |
| T-05-10 | Denial of Service | Filter-source endpoint hammering by admin | accept | 60s server-side memo + 60s TanStack `staleTime`. Max ~1 DB-hit per minute per app instance. | closed |
| T-05-11 | Spoofing | Permalink URL forgery to point at a different event | accept | Permalink is a filtered list URL, not direct event-id URL. No privileged "view this specific event" affordance to forge. | closed |
| T-05-12 | Information Disclosure | Test failures leaking row contents in CI logs | accept | Tests assert on filtered properties; full row may appear in failed-test diff. CI logs are private. | closed |
| T-05-13 (P03) | Tampering | Test bypasses REVOKE via privileged DB role | accept | Tests run as same Postgres role as application. Test #3 confirms REVOKE active. No test-only escape hatch. | closed |
| T-05-13 (P04) | Tampering | audit_events orphan rows from pre-fix runs | mitigate | Migration 0009 one-shot purge inside tx-scoped trigger-disable window. Append-only contract holds post-migration. | closed |
| T-05-14 (P03) | Repudiation | README claims that don't match the code | mitigate | README cites specific test names; reviewer can run `pnpm test` and verify. References D-numbers in CONTEXT.md. | closed |
| T-05-14 (P04) | Tampering | Append-only contract during migration 0009 | accept | Single migration tx; trigger-disable window not externally observable. Inline `DO $$ pg_trigger NOT tgenabled = 'D' RAISE EXCEPTION $$` gate fails the migration if trigger not re-enabled. | closed |
| T-05-15 | Information Disclosure | README drift between prose claim and code behavior | mitigate | Task 4 brings README §"How the audit hook works" back in line with HEAD. README accuracy graded ★★★. | closed |
| T-05-16 | Information Disclosure | `audit.service.ts:decodeCursor` cursor-error envelope | mitigate | Swap `'invalid_quantity'` → `'invalid_cursor'`. CR-02 regression test. | closed |
| T-05-17 | Repudiation | `DELETE /api/auth/session` logout audit row | mitigate | Resolve `session.userId` via `findSessionById` BEFORE `destroySession`; `setActor()` so ALS carries actor at audit-write time. CR-04 regression test. | closed |
| T-05-18 | Information Disclosure | Unknown-email failed-login row's (entityType, entityId) | mitigate | `entityType: 'auth_attempt'`, `entityId: attempted email`. Removes false-positive forensics for brute-force investigation. WR-07 regression test. | closed |
| T-05-19 | Tampering | shared `AUDIT_ENTITY_TYPES` const-list extension | accept | Strictly additive change to open-shape const-list per docstring. TS exhaustiveness forces paired label addition; no DB migration. | closed |
| T-05-23 | Tampering | `activeTx` scope under nested or parallel `$transaction` | mitigate | `withActiveTx(tx, fn)` uses `activeTxStackALS.run([...prev, tx], fn)`. Nested → N-deep stack; parallel → independent frames. Test 12 + Test 13 assert. | closed |
| T-05-24 | Repudiation | `actorALS` frame leakage across keep-alive requests | mitigate | `onRequest` hook converted to `actorALS.run(scope, () => done())` (Fastify 3-arg). Frame bound by `.run` callback lifetime; stdlib guarantees per-request independence. Test 14 cross-request smoke. | closed |
| T-05-25 | Repudiation | Shared-store design re-introducing fragility class in v2 | mitigate-structurally | Per-concern ALS refactor structurally eliminates shared-mutable-slot pattern. README §"Lessons learned" documents the pattern. | closed |
| T-05-26 | Tampering | Regression test pass-by-luck under parallel execution | mitigate | Test 13 inserts `await new Promise(r => setImmediate(r))` between callback start and mutation — deterministic event-loop interleaving. | closed |
| T-05-27 | Tampering | Regression test silent-skip if seed regresses below ≥2 CUMs | mitigate | Test 13 uses `expect(cums.length).toBeGreaterThanOrEqual(2)` — fails loudly on seed regression. | closed |
| T-05-28 | Tampering | App code attempting `prisma.auditEvent.update/delete/truncate` reaches Postgres | mitigate | Runtime role `meditrack_app` REVOKEd UPDATE/DELETE/TRUNCATE (migration 0010). Query rejected with SQLSTATE 42501 before BEFORE-trigger fires. Test 4 asserts. | closed |
| T-05-29 | Tampering | Admin/migration/seed code path attempting same against AuditEvent | mitigate | Owner role `meditrack` bypasses GRANT/REVOKE but hits BEFORE-trigger from migration 0008 (Layer 2a). Trigger raises 42501. | closed |
| T-05-30 | Repudiation | "REVOKE worked at migration time but not at runtime" brittleness | mitigate-structurally | REVOKE bound to named role, not `CURRENT_USER`. Future deployments with different role must consciously regrant or fail. Documented in README §Database roles. | closed |
| T-05-31 | Information Disclosure | Hardcoded role passwords in `docker-compose.yml` | accept | Passwords explicitly non-production. README documents env_file / secret manager substitution. Out of scope for one-week interview demo. | closed |
| T-05-32 | Tampering | Future contributor adds `prisma.<model>.createMany([...])` in service, bypassing audit | mitigate | ESLint bans `*.createMany` outside `seed.ts`. PR-time lint error directs to two correct paths (decompose or intercept). | closed |
| T-05-33 | Tampering | Future contributor adds `prisma.$executeRaw\`UPDATE ...\`` in service, bypassing audit | mitigate | Test 15 CI grep: production-code `$executeRaw*` matches must be in hardcoded allowlist. Off-allowlist match fails the test. | closed |
| T-05-34 | Data Integrity | Empty-string `entityId` audit row from forgotten WR-07-style code path | mitigate | Migration 0011 BEFORE INSERT trigger rejects empty/NULL `entityId` with SQLSTATE 23514. Application-code WR-07 fix is primary; trigger is backstop. | closed |
| T-05-35 | Denial of Service | Unbounded `audit.login_failed` row growth from brute-force | mitigate | `@fastify/rate-limit`: per-(email, IP) 10/min + per-IP 30/min. 429 returns without writing audit rows. Tests A/B/C in `auth.ratelimit.test.ts`. | closed |
| T-05-36 | Repudiation | Future refactor wraps `verifyCredentials` in tx, silently breaking `auth.login_failed` commit-outside-tx invariant | mitigate | Inline INVARIANT comments at both `auth.service.ts` write sites + Test 17 codifying the invariant. | closed |
| T-05-37 | Information Disclosure | Rate-limit error message leaks rate-limit window | accept | `Försök igen om <N> sekunder` is intentional UX guidance; matches OWASP/ASVS rate-limit response guidance. Actor can re-iterate after window regardless. | closed |
| T-05-38 | Repudiation | Reviewer-discovered concern silently dropped | mitigate | Every Tier C finding has a documented home: 05-CONTEXT.md `<deferred>` (planning artifact) AND README §"What I'd do with more time" (submission artifact). | closed |
| T-05-SC | Tampering / supply chain | New package installs across Phase 5 | mitigate | Plan 03: `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react-hooks` — all [LEGITIMATE] (official maintainers). Plan 09: `@fastify/rate-limit` — [LEGITIMATE] (official Fastify org, MIT, 50k+/wk). Plans 01/02/04/05/06/07/08/10/11: no packages installed. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party) · mitigate-structurally (architectural pattern eliminates class)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-01 | `$queryRaw`/`$executeRaw` bypass audit interception. No write-bearing raw query exists today; README discloses the gap; v2 will add CI grep allowlist. | John Eriksson (user) | 2026-05-23 |
| AR-05-02 | T-05-05 | Audit log retention is "keep forever for v1" (D-101). No row-volume cap in DB; cold-storage tier deferred to v2 README note. Admin-only access bounds the abuse surface. | John Eriksson (user) | 2026-05-23 |
| AR-05-03 | T-05-09 | Permalink URL contains `actor`, `action`, `requestId` only — none individually sensitive; no `before`/`after` payload. | John Eriksson (user) | 2026-05-23 |
| AR-05-04 | T-05-10 | Filter-source endpoint protected by 60s server memo + 60s FE `staleTime`. Worst-case abuse ≈1 DB-hit/min/instance. Admin credential required. | John Eriksson (user) | 2026-05-23 |
| AR-05-05 | T-05-11 | Permalink is a filtered list URL; no privileged "view this specific event" affordance exists to forge. | John Eriksson (user) | 2026-05-23 |
| AR-05-06 | T-05-12 | Test failure diffs may include full row content; CI logs are private. Not a meaningful disclosure vector for a one-week demo. | John Eriksson (user) | 2026-05-23 |
| AR-05-07 | T-05-13 (P03) | Tests run as same Postgres role as application; no test-only escape hatch. Privilege model is the real one. | John Eriksson (user) | 2026-05-23 |
| AR-05-08 | T-05-14 (P04) | Migration 0009 disables `AuditEvent_no_delete` inside a single tx; trigger-disable window not externally observable. Inline trigger-state gate aborts migration on regression. | John Eriksson (user) | 2026-05-23 |
| AR-05-09 | T-05-19 | Adding `'auth_attempt'` to `AUDIT_ENTITY_TYPES` is strictly additive per the constant's own docstring. TS exhaustiveness check on `AUDIT_ENTITY_TYPE_LABELS` forces paired label addition. | John Eriksson (user) | 2026-05-23 |
| AR-05-10 | T-05-31 | `docker-compose.yml` hardcoded role passwords (`meditrack` / `meditrack_app_dev`) are explicitly non-production. README documents env_file / secret manager substitution. | John Eriksson (user) | 2026-05-23 |
| AR-05-11 | T-05-37 | Rate-limit message reveals window (`Försök igen om <N> sekunder`). Intentional UX guidance; aligns with OWASP/ASVS rate-limit response guidance; window is recoverable by observation regardless. | John Eriksson (user) | 2026-05-23 |
| AR-05-12 | (all mitigate threats) | At `/gsd:secure-phase` runtime, user chose "Accept all open — document only" rather than spawning gsd-security-auditor. Mitigations are claimed by plan-time threat models and Plan 03/04/05/06/07/08/09's own regression tests; runtime verification deferred. Re-run `/gsd:secure-phase 5` with "Verify all open threats" to lift this acceptance. | John Eriksson (user) | 2026-05-23 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-23 | 39 | 39 | 0 | Claude (orchestrator) — user-directed acceptance, no auditor spawn |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer / mitigate-structurally)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-23 (user-directed acceptance; re-audit with auditor spawn to upgrade evidence basis)
