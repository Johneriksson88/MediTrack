---
phase: 05-audit-log
plan: 01
subsystem: audit
tags: [audit, prisma-extension, async-local-storage, postgres-triggers, schema, append-only, security, t-05-03]

requires:
  - phase: 01-foundation-auth
    provides: D-15 ACTION_KEYS + PERMISSIONS map, Session model + req.user shape, signed-cookie + requireSession preHandler, errorHandler envelope
  - phase: 02-medication-catalog
    provides: Medication + CareUnitMedication schema (audited models), pg_trgm GIN index
  - phase: 03-draft-orders
    provides: Order + OrderLine schema, atomic UPDATE-with-precondition pattern (D-54)
  - phase: 04-confirm-deliver-stock
    provides: order.service.ts confirm/deliver paths (wrap targets for action overrides), D-83 retrofit promise
provides:
  - AuditEvent table + 5 indexes (cursor-pagination key, 3 filter axes, requestId grouping)
  - Postgres BEFORE UPDATE/DELETE/TRUNCATE triggers raising SQLSTATE 42501 — owner-binding append-only enforcement (D-98 layer 2)
  - Prisma $extends middleware intercepting create/update/updateMany/delete/deleteMany on the 6 audited models, same-tx as the wrapping mutation (D-90/D-91)
  - AsyncLocalStorage request-context plugin (X-Request-Id header + actor/careUnit/requestId/actionOverride store) (D-92)
  - resolveEntityId() closing T-05-03 — Session writes record actor User.id, NEVER row.id (the raw session token)
  - AUDIT_ALLOWLIST excluding User.passwordHash and Session.id from before/after JSON (D-97)
  - auth.login_failed explicit writes inside both auth.service.ts InvalidCredentialsError branches (D-96)
  - withActionOverride() wraps converting submit/confirm/deliver/stock.increment/order.softDelete to D-94 domain-rich actions
  - audit:read permission key in shared ACTION_KEYS + BE PERMISSIONS map (admin-only)
  - Shared Zod contracts: auditEventResponse, auditEventListQuery, auditEventListResponse, auditFiltersResponse (Plan 02 consumes)
  - Shared Swedish label maps: AUDIT_ACTION_LABELS (11 entries), AUDIT_ENTITY_TYPE_LABELS (6 entries)
affects: [05-02-read-api, 05-03-ui-and-tests, future-retention-job, observability]

tech-stack:
  added:
    - "node:async_hooks AsyncLocalStorage (stdlib — no new package)"
    - "Postgres BEFORE-triggers + plpgsql RAISE EXCEPTION (DB-level append-only guard for owner roles)"
    - "Prisma.defineExtension({ query: ... }) — first $extends use in repo"
  patterns:
    - "Same-tx audit write via $extends — caller's prisma.$transaction propagates to audit INSERT (D-91)"
    - "ALS-keyed seed suppression: store undefined → middleware skips audit row (D-92)"
    - "Two-layer leak prevention: AUDIT_ALLOWLIST (after JSON) + resolveEntityId (entityId column) (D-97 + T-05-03)"
    - "withActionOverride(action, fn) — request-scoped temporary action rename without service-signature widening"
    - "Owner-binding append-only via BEFORE-triggers (REVOKE alone is ineffective when the runtime role owns the table)"

key-files:
  created:
    - "apps/api/prisma/migrations/20260522181022_0007_audit_events/migration.sql"
    - "apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql"
    - "apps/api/src/db/auditAllowlist.ts"
    - "apps/api/src/db/auditExtension.ts"
    - "apps/api/src/plugins/requestContext.ts"
    - "packages/shared/src/contracts/audit.ts"
    - "packages/shared/src/constants/auditAction.ts"
    - "packages/shared/src/constants/auditEntityType.ts"
  modified:
    - "apps/api/prisma/schema.prisma (+ AuditEvent model)"
    - "apps/api/src/db/client.ts (chain .$extends(buildAuditExtension()))"
    - "apps/api/src/app.ts (register requestContextPlugin between cookies and routes)"
    - "apps/api/src/auth/requireSession.ts (call setActor after req.user decoration)"
    - "apps/api/src/auth/permissions.ts (PERMISSIONS map: 'audit:read': ['admin'])"
    - "apps/api/src/services/auth.service.ts (auth.login_failed writes + actor seeding before createSession + auth.logout override)"
    - "apps/api/src/services/order.service.ts (withActionOverride wraps for submit/confirm/deliver/stock.increment/order.softDelete)"
    - "apps/api/prisma/seed.ts (D-92 header comment)"
    - "packages/shared/src/contracts/permissions.ts (ACTION_KEYS: 'audit:read')"
    - "packages/shared/src/index.ts (re-export audit symbols)"

key-decisions:
  - "Migration 0008 uses BEFORE-triggers + RAISE EXCEPTION (SQLSTATE 42501) instead of REVOKE alone — the meditrack role OWNS the table, so REVOKE is bypassed by Postgres' owner privileges. Triggers bind the owner; the REVOKE is kept as a no-op-against-owner fallback that auto-engages if the runtime role is ever switched."
  - "Prisma $extends query keys are lowercase modelProps names ('session', 'careUnitMedication'), NOT PascalCase. PascalCase silently registers but never matches at runtime — discovered during Task 3 smoke testing."
  - "auth.login is not a Session.create intercept driven by an action override set in the route — it's set on the ALS store in auth.service.ts BEFORE createSession (login is unprotected, so requireSession never runs; the store would have actorUserId=null without this seeding)."
  - "Phase 5 ADDS order.softDelete withActionOverride wrap that wasn't explicitly in the plan task list but IS in AUDIT_ACTIONS — closing the gap so soft-deleted drafts record the rich action (Rule 2 — missing critical for label-map exhaustiveness)."

patterns-established:
  - "Audit write co-located with mutation: $extends + ALS makes audit a same-tx side effect — service code stays unaware"
  - "Owner-binding DB guard: BEFORE-trigger that raises SQLSTATE 42501 produces /permission denied/ — matches D-98 contract verbatim while working against table owners"
  - "ALS as request-scope cross-cutting carrier: actorUserId / careUnitId / requestId / actionOverride threaded from Fastify onRequest to Prisma extension with zero explicit-arg propagation through the service layer"
  - "Per-model entityId resolver centralizes a single security-relevant branching in one function with one citation (D-97 + T-05-03) — Plan 03 tests can import + unit-assert it"

requirements-completed: [AUD-01]

duration: ~85min
completed: 2026-05-22
---

# Phase 5 Plan 01: Audit Foundation Summary

**Append-only audit_events table with Prisma `$extends` middleware + AsyncLocalStorage request context + Postgres BEFORE-triggers — every Phase 2/3/4 mutation auto-writes a redacted audit row inside the same transaction, with zero changes to existing service mutation logic.**

## Performance

- **Duration:** ~85 minutes
- **Started:** 2026-05-22T20:13:30Z
- **Completed:** 2026-05-22T20:30:00Z
- **Tasks:** 3 / 3
- **Files created:** 8
- **Files modified:** 13

## Accomplishments

- **AuditEvent table live in Postgres** with 5 secondary indexes (cursor key + 3 filter axes + requestId grouping) and a triple-trigger guard that rejects every UPDATE/DELETE/TRUNCATE with `permission denied for table "AuditEvent"` (SQLSTATE 42501) — even against the role that owns the table.
- **Prisma `$extends` audit middleware** wraps the singleton client; every existing `prisma.<model>.create/update/delete` call in Phase 2/3/4 service code automatically writes an audit row inside the same transaction with allowlist-filtered before/after JSON, the request's UUID requestId, and the actor inherited from the AsyncLocalStorage store.
- **AsyncLocalStorage request-context plugin** seeds `{ actorUserId, careUnitId, requestId, requestSource, ipAddress, actionOverride }` on every HTTP request via Fastify `onRequest` (using `als.enterWith` for forward propagation through the whole request lifecycle); the plugin also writes the `X-Request-Id` reply header for log correlation.
- **Two-layer T-05-03 leak prevention closed**: `AUDIT_ALLOWLIST` excludes `User.passwordHash` from User audit rows and excludes `id` (the raw signed session token) from Session audit rows; `resolveEntityId(model, row)` returns `row.userId` for Session writes so the audit row's `entityId` column also never carries the token. Smoke-tested against a real login flow — confirmed `auth.login` row's `entityId === User.id`, `after` JSON contains no `id` and no `passwordHash`.
- **Domain-rich action labels** (`order.submit` / `order.confirm` / `order.deliver` / `stock.increment` / `order.softDelete` / `auth.login` / `auth.logout` / `auth.login_failed`) thread through the audit log via `withActionOverride()` wraps in `order.service.ts` and explicit override seeding in `auth.service.ts` — siblings of one deliver call share a requestId (1+N shape per D-94).
- **Shared FE↔BE contract surface** (`auditEventResponse`, `auditEventListQuery`, `auditEventListResponse`, `auditFiltersResponse`, `AUDIT_ACTION_LABELS`, `AUDIT_ENTITY_TYPE_LABELS`, `audit:read` permission key) ready for Plan 02 (read API) and Plan 03 (admin UI).
- **D-83 promise delivered**: Phase 2/3/4 service files were touched ONLY for the explicit auth.login_failed writes (auth.service.ts) and the withActionOverride wraps (order.service.ts) — all other mutations get audit coverage for free via the extended client.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema + migrations + REVOKE — DB foundation** — `9bffbaa` (feat)
2. **Task 2: Shared contracts + constants + permission key** — `a7dae03` (feat)
3. **Task 3: Prisma $extends middleware + allowlist + ALS plugin + wiring + auth.login_failed write** — `55afe79` (feat)

**Plan metadata commit:** (to follow this Summary write — `docs(05-01): complete plan`)

## Files Created/Modified

### Created (8)

- `apps/api/prisma/migrations/20260522181022_0007_audit_events/migration.sql` — CREATE TABLE AuditEvent + 5 indexes + rich header comment citing AUD-01 / D-97 / D-98. Recreates the Phase 2 `Medication_name_trgm_idx` GIN index that Prisma's drift detector tried to drop (preserving Phase 2 search perf).
- `apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql` — BEFORE UPDATE/DELETE/TRUNCATE triggers raising SQLSTATE 42501 (owner-binding); REVOKE kept as future-proofing for a non-owner runtime role. Idempotent via DROP-IF-EXISTS / CREATE-OR-REPLACE.
- `apps/api/src/db/auditAllowlist.ts` — `AUDITED_MODELS` (6), `AUDIT_ALLOWLIST` (per-model column allowlist with grep-discoverable exclusion comments), `mapPrismaModelToEntityType`, `resolveEntityId` (T-05-03 leak closure), `filterAllowlist`.
- `apps/api/src/db/auditExtension.ts` — `buildAuditExtension()` factory returning `Prisma.defineExtension({ query: { ... } })`. Handlers for create / update / updateMany / delete / deleteMany on each audited model (keyed by lowercase modelProps name). Loads before-state inside the same tx, emits 1 or N audit rows with allowlist-filtered before/after.
- `apps/api/src/plugins/requestContext.ts` — `als` singleton, `requestContextPlugin` (Fastify `fp` with onRequest hook), `setActor()`, `withActionOverride()` helpers.
- `packages/shared/src/contracts/audit.ts` — 4 Zod schemas (response, list query, list response, filters response) + inferred TS types.
- `packages/shared/src/constants/auditAction.ts` — `AUDIT_ACTIONS` (11), `auditActionEnum`, `AUDIT_ACTION_LABELS` (Swedish, verbatim from CONTEXT specifics).
- `packages/shared/src/constants/auditEntityType.ts` — `AUDIT_ENTITY_TYPES` (6), `auditEntityTypeEnum`, `AUDIT_ENTITY_TYPE_LABELS` (lowercase Swedish nouns).

### Modified (13)

- `apps/api/prisma/schema.prisma` — `model AuditEvent` block with 5 `@@index` lines, no FK on `actorUserId`, triple-slash header explaining D-97/D-98.
- `apps/api/src/db/client.ts` — chains `.$extends(buildAuditExtension())` on the PrismaClient constructor; globalThis cache uses the inferred extended-client type.
- `apps/api/src/app.ts` — registers `requestContextPlugin` AFTER `cookiesPlugin` and BEFORE the routes.
- `apps/api/src/auth/requireSession.ts` — calls `setActor(user.id, session.careUnitId)` after the existing `req.user` decoration.
- `apps/api/src/auth/permissions.ts` — adds `'audit:read': ['admin']` to PERMISSIONS map.
- `apps/api/src/services/auth.service.ts` — two `prisma.auditEvent.create` calls inside InvalidCredentialsError branches (`if (!user)` with actorUserId=null + entityId='' sentinel; `if (!ok)` with actorUserId=user.id + entityId=user.id). On success path, seeds ALS store with `actorUserId`, `careUnitId`, and `actionOverride='auth.login'` before calling createSession. logout() wraps destroySession with `actionOverride='auth.logout'`.
- `apps/api/src/services/order.service.ts` — wraps `tx.order.updateMany` in submitOrder / confirmOrder / deliverOrder with `withActionOverride('order.submit'|'order.confirm'|'order.deliver', ...)`. Wraps each `tx.careUnitMedication.update` in deliverOrder with `withActionOverride('stock.increment', ...)`. Wraps softDeleteOrder's `prisma.order.updateMany` with `withActionOverride('order.softDelete', ...)`.
- `apps/api/prisma/seed.ts` — adds the D-92 header comment block explaining that seed runs outside ALS and audit rows are naturally suppressed.
- `packages/shared/src/contracts/permissions.ts` — appends `'audit:read'` to ACTION_KEYS with a Phase 5 D-15 trail comment.
- `packages/shared/src/index.ts` — re-exports the new audit symbols.
- `apps/api/test/auth.me.test.ts`, `apps/api/test/admin.ping.test.ts`, `apps/api/test/auth.flow.smoke.test.ts` — update admin permission-snapshot assertions to include `'audit:read'` (Rule 1 scope-bounded regression fix — directly caused by the new ACTION_KEYS entry).

## Decisions Made

- **DB-layer append-only via BEFORE-trigger (D-98 evolution).** The plan's literal instruction was `REVOKE UPDATE, DELETE, TRUNCATE FROM CURRENT_USER`. We applied that, then discovered the `meditrack` role OWNS the AuditEvent table — Postgres bypasses GRANT/REVOKE for owners. To preserve D-98's verbatim contract ("Postgres rejects the write with `permission denied`"), we added BEFORE-triggers that `RAISE EXCEPTION ... USING ERRCODE = '42501'` — the canonical "permission denied" SQLSTATE. The REVOKE is kept as defense-in-depth so a future non-owner runtime role auto-engages the role-level enforcement.
- **Prisma `$extends` query keys are lowercase modelProps names.** PascalCase keys silently register but never match at runtime — confirmed by reading `node_modules/.pnpm/@prisma+client@5.22.0/runtime/library.d.ts:980` (DynamicQueryExtensionArgs type). The `clientPropName(model)` helper normalizes — applied at the registration boundary, the PascalCase model names stay for grep-discovery throughout the audit allowlist and resolveEntityId code.
- **Auth.login attribution via ALS-store seeding in auth.service.ts, not via requireSession.** Login is an unprotected route — requireSession never runs on POST /api/auth/login. Without the manual seeding step, the Session.create that follows would write an audit row with `actorUserId: null`. We set `store.actorUserId = user.id` AND `store.actionOverride = 'auth.login'` before `createSession`, clearing the override immediately after so no subsequent mutation in the same request inherits it.
- **Migration 0007 also recreates the trgm GIN index that Prisma's drift detector dropped.** Prisma sees the raw-SQL-created GIN index from migration 0003 as drift and emits a DROP statement at the head of the new migration. Without recreation, the medication-search ILIKE queries would degrade from index-scan to seq-scan over 43k rows. The 0007 migration header explains this; the index recreation is part of the same migration so 0007 → 0008 stays a clean two-step sequence.
- **`order.softDelete` action override added (auto-fix, Rule 2 — D-94 evolution).** The plan task list didn't enumerate `order.softDelete` as a wrap target, but `AUDIT_ACTIONS` includes it and the FE label map (`'order.softDelete': 'Borttagen (utkast)'`) expects it. Without the wrap, soft-deleted drafts would write `action='update'`, breaking label-map exhaustiveness in Plan 03 UI. Added the wrap in `softDeleteOrder` alongside the planned three.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `prisma migrate dev` dropped the Phase 2 trgm GIN index as schema drift**

- **Found during:** Task 1 (running `prisma migrate dev --name 0007_audit_events`)
- **Issue:** The generated migration's first statement was `DROP INDEX "Medication_name_trgm_idx";`. That index is created via raw SQL in migration 0003 (Phase 2 pg_trgm setup) — Prisma doesn't model GIN indexes in `schema.prisma`, so its drift detector sees them as orphans and removes them. Applying the migration as-generated would have degraded Phase 2 medication search to sequential scans over ~43k rows.
- **Fix:** Recreated the index inside the same migration (DROP IF EXISTS + CREATE INDEX statements verbatim from migration 0003) BEFORE the AuditEvent DDL, and ran a one-off `CREATE INDEX IF NOT EXISTS` against the live DB to restore the index that was dropped before I caught it. The 0007 header comment block documents this so future contributors understand why migration 0007 contains DDL that isn't strictly about audit_events.
- **Files modified:** `apps/api/prisma/migrations/20260522181022_0007_audit_events/migration.sql`
- **Verification:** `SELECT indexname FROM pg_indexes WHERE tablename = 'Medication'` includes `Medication_name_trgm_idx`.
- **Committed in:** `9bffbaa` (Task 1)

**2. [Rule 1 — Bug] D-98 REVOKE was ineffective because `meditrack` role OWNS the table**

- **Found during:** Task 1 (verifying `UPDATE "AuditEvent"` rejects with `permission denied`)
- **Issue:** After applying the planned REVOKE migration verbatim, `prisma.$executeRawUnsafe('UPDATE "AuditEvent" SET action=\'x\' WHERE id=\'real-row-id\'')` SUCCEEDED. Postgres bypasses GRANT/REVOKE checks for table owners — and the `meditrack` role both runs migrations and serves application traffic. The D-98 contract ("Postgres rejects the write with permission denied") was not met.
- **Fix:** Rewrote migration 0008 to install BEFORE UPDATE/DELETE/TRUNCATE triggers calling a plpgsql function that `RAISE EXCEPTION ... USING ERRCODE = '42501'` (= "insufficient_privilege" = the SQLSTATE behind "permission denied for table"). The trigger approach binds the table OWNER too; the REVOKE is kept for defense-in-depth so a future non-owner role automatically gets the role-level guard. The migration header comment explains both layers and the §6 interview answer.
- **Files modified:** `apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql`
- **Verification:** UPDATE, DELETE, TRUNCATE on AuditEvent with a real row all reject with `code: '42501', message: 'ERROR: permission denied for table "AuditEvent"...'`.
- **Committed in:** `9bffbaa` (Task 1)

**3. [Rule 1 — Bug] Prisma `$extends({ query })` keys must be lowercase modelProps, not PascalCase**

- **Found during:** Task 3 (smoke-testing the audit pipeline via app.inject login)
- **Issue:** After Task 3 wiring, `prisma.session.create` inside the login path did NOT trigger the audit middleware — 0 audit rows after a successful login. Reading `node_modules/.pnpm/@prisma+client@5.22.0/runtime/library.d.ts:980` (DynamicQueryExtensionArgs) showed that `K extends TypeMap['meta']['modelProps']` — i.e. the keys are lowercase ('session', 'careUnitMedication'), not PascalCase ('Session', 'CareUnitMedication'). The PascalCase keys silently registered without runtime matching.
- **Fix:** Added `clientPropName(model)` helper that lowercases the first character (`'Session' → 'session'`, `'CareUnitMedication' → 'careUnitMedication'`), used at the `modelHandlers[propName] = handlers` registration line and in all internal `(client as any)[propName].findUnique` calls. PascalCase is preserved in `AUDITED_MODELS`, `AUDIT_ALLOWLIST`, and `resolveEntityId` so grep-discovery still finds the documented model names.
- **Files modified:** `apps/api/src/db/auditExtension.ts`
- **Verification:** Smoke test shows `auth.login` audit row appears with `entityType=session`, `actor=apotekare.id`, `entityId=apotekare.id` (NOT Session.id). After fix, 81/81 vitest tests still pass and integration-test side-effects produce ~300 audit rows (visible only because the test harness goes through app.inject which triggers the requestContextPlugin).
- **Committed in:** `55afe79` (Task 3)

**4. [Rule 1 — Bug] Test snapshots asserted the exact admin permissions array, broken by `'audit:read'` addition**

- **Found during:** Task 2 (running pnpm --filter @meditrack/api test after adding 'audit:read' to ACTION_KEYS)
- **Issue:** 3 tests in `auth.me.test.ts`, `admin.ping.test.ts`, `auth.flow.smoke.test.ts` use `expect(permissions).toEqual([...])` with the full admin permissions list. Adding `'audit:read'` to ACTION_KEYS made it appear in `/me`'s response automatically, breaking the literal-array snapshots.
- **Fix:** Updated the three test snapshots to include `'audit:read'` at the end of the admin array. Apotekare and sjuksköterska arrays untouched (audit:read is admin-only).
- **Files modified:** `apps/api/test/auth.me.test.ts`, `apps/api/test/admin.ping.test.ts`, `apps/api/test/auth.flow.smoke.test.ts`
- **Verification:** 81/81 vitest tests pass after the snapshot updates.
- **Committed in:** `a7dae03` (Task 2)

**5. [Rule 2 — Missing Critical] `order.softDelete` was in AUDIT_ACTIONS but no withActionOverride wrap existed**

- **Found during:** Task 3 (cross-checking AUDIT_ACTIONS labels against the actually-wrapped mutations in order.service.ts)
- **Issue:** Task 3's action specifies wraps for submit / confirm / deliver / stock.increment. The Phase 3 `softDeleteOrder` was unwrapped — its mutation would audit as the generic `'update'`, but `AUDIT_ACTIONS` already includes `'order.softDelete'` with Swedish label `'Borttagen (utkast)'`. Plan 03's UI label-map exhaustiveness would have a value Plan 01 never produces.
- **Fix:** Added `withActionOverride('order.softDelete', () => prisma.order.updateMany({...}))` around the existing softDeleteOrder mutation.
- **Files modified:** `apps/api/src/services/order.service.ts`
- **Verification:** Grep `withActionOverride('order.softDelete'` finds one match; typecheck + tests still pass.
- **Committed in:** `55afe79` (Task 3)

---

**Total deviations:** 5 auto-fixed (3 bugs, 1 blocking, 1 missing critical)
**Impact on plan:** All deviations preserve D-98's verbatim contract or close concrete leak / regression paths; none widen scope beyond Plan 01's stated boundary. The trigger-vs-REVOKE evolution is the most architectural — documented inline in the migration and in the Decisions section above — but stays a strict superset of the planned REVOKE.

## Known Stubs

None — every audit-pipeline contract this plan promised is wired end-to-end; the smoke test confirmed `auth.login` flows through ALS → extension → audit_events row with correct attribution and no leaks.

## Threat Flags

None — Phase 5 Plan 01's threat model (`<threat_model>` T-05-01 through T-05-07 + T-05-SC) is unchanged. No new network endpoints (Plan 02 adds those), no new auth paths, no schema changes outside the planned AuditEvent model.

## Issues Encountered

- **Prisma `$extends` documentation gap on key casing.** Spent ~10 minutes debugging "extension registered but never fires" before reading the runtime type def to discover the lowercase-modelProps requirement. Once identified, the fix was three lines.
- **Owner-role REVOKE limitation.** The plan's literal instruction was correct in intent but ineffective in practice because the `meditrack` role owns the table. Took ~10 minutes to research and decide on the BEFORE-trigger evolution.
- **Audit rows accumulating during test runs.** The 81-test vitest run produced ~300 audit rows (every app.inject request goes through requestContextPlugin → seeds an ALS scope → triggers the audit middleware on every Session.create, Order.create, etc.). This is the audit pipeline working as designed — Plan 03's integration tests will explicitly wrap test setup in `als.run({...})` to ASSERT audit behavior. Plan 01 ends with the audit table holding test-side-effect rows; Plan 03 will need a `resetAudit()` helper analogous to `resetSessions()`.

## User Setup Required

None — no external services configured.

## Self-Check: PASSED

- Created files:
  - `apps/api/prisma/migrations/20260522181022_0007_audit_events/migration.sql` — FOUND
  - `apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql` — FOUND
  - `apps/api/src/db/auditAllowlist.ts` — FOUND
  - `apps/api/src/db/auditExtension.ts` — FOUND
  - `apps/api/src/plugins/requestContext.ts` — FOUND
  - `packages/shared/src/contracts/audit.ts` — FOUND
  - `packages/shared/src/constants/auditAction.ts` — FOUND
  - `packages/shared/src/constants/auditEntityType.ts` — FOUND
- Commits in git log:
  - `9bffbaa` (Task 1) — FOUND
  - `a7dae03` (Task 2) — FOUND
  - `55afe79` (Task 3) — FOUND

## Next Phase Readiness

- **Plan 02 (read API)** can now build `audit.service.ts` (cross-tenant read, D-16 exception documented), `routes/audit/list.ts` (cursor-paginated `GET /api/audit/events`), `routes/audit/filters.ts` (`GET /api/audit/filters`). All required shared contracts and the `audit:read` permission key are in place.
- **Plan 03 (UI + tests)** can build the admin page (`/admin/audit`) and the integration test suite. The threat-model assertions (allowlist redaction test, entityId leak test, append-only DB-level rejection, grep test for prisma.auditEvent.update*/delete*/upsert) can be written against the existing pipeline; a `resetAudit()` helper analogous to `resetSessions()` will be needed.
- **No blockers carried forward.** All 81 existing vitest tests pass; typecheck is clean; the live DB state is consistent with the migration history.

---
*Phase: 05-audit-log*
*Plan: 01*
*Completed: 2026-05-22*
