---
phase: 05-audit-log
verified: 2026-05-22T19:23:50Z
status: gaps_found
score: 7/11 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The audit-row INSERT lands in the SAME transaction as the wrapping mutation (D-91). A rolled-back mutation leaves zero audit rows."
    status: failed
    reason: "Empirically falsified. The Prisma `$extends` middleware writes the audit row via the captured base `client` argument from `Prisma.defineExtension((client) => ...)`. Sibling calls on that captured client run against the root connection pool, NOT against the active transaction context. A diagnostic test that performs `tx.careUnitMedication.update(...)` followed by a forced throw inside `prisma.$transaction` confirmed: the stock change correctly rolled back, but the audit row persisted as an orphan in the audit_events table. The append-only DB triggers then make the orphan permanent — it cannot be cleaned up by application code."
    artifacts:
      - path: "apps/api/src/db/auditExtension.ts"
        issue: "Lines 90-256: `Prisma.defineExtension((client) => client.$extends({query: {...}}))` captures the root `client`. Inside the per-model handler, `query(args)` is correctly routed to the active tx, but the subsequent `findUnique` / `findMany` (lines 136, 164, 171, 200, 229) and the audit-row insert (`client.auditEvent.create({data})` at line 299) all execute on the captured root client, NOT on the tx. This means both `before` snapshots AND the audit INSERT itself happen outside any wrapping transaction."
      - path: "apps/api/test/audit.integration.test.ts:129-153"
        issue: "Test 2 (`rolled-back mutations leave zero audit rows (D-91)`) is vacuously passing. The empty-submit path throws ValidationFailedError at order.service.ts:441-446 BEFORE reaching the `withActionOverride('order.submit', () => tx.order.updateMany(...))` block. No audit-write is attempted regardless of whether the extension is transactional, so the test cannot falsify the bug. CR-01 was confirmed by an actual rollback test I ran in this verification (see report body)."
    missing:
      - "Refactor the audit extension so its findUnique/findMany pre-loads AND its auditEvent.create write execute against the same transactional context the wrapping mutation uses. Options: (a) switch to `client.$extends` with `$allOperations` middleware-style hook + `Prisma.getExtensionContext(this)` to discover the active tx; (b) refactor to a service-layer `withAudit(tx, ...)` wrapper called explicitly inside each `prisma.$transaction(async tx => ...)`; (c) accept the limitation and document it explicitly in README + remove the D-91 claim."
      - "Add a REAL D-91 regression test that performs a mutation that succeeds inside a tx, then forces a rollback, then asserts zero audit rows for that mutation. The current Test 2 does not exercise the rollback path."
      - "Clean up the orphan audit rows the bug has already produced during normal test runs (~300+ rows per `pnpm test` per Plan 01 SUMMARY) — but note the append-only triggers prevent application-level cleanup; a SECURITY DEFINER bypass or trigger-disable migration is required."
  - truth: "Cursor decode errors surface the correct reason code (not a copy-paste from order validation)."
    status: failed
    reason: "CR-02 confirmed by code inspection. `decodeCursor` throws `ValidationFailedError('Ogiltig cursor.', { reason: 'invalid_quantity' })`. `invalid_quantity` is the order-line validation reason code (used in `order.service.ts:452` and the contracts envelope tests in Phase 3-4). Any FE that switches on `details.reason` to localize the error toast will pick the wrong message for a cursor-decode failure. The bug also pollutes the documented `details.reason` taxonomy across subsystems."
    artifacts:
      - path: "apps/api/src/services/audit.service.ts:85-87"
        issue: "Uses `reason: 'invalid_quantity'` which belongs to order-line validation. Should be `reason: 'invalid_cursor'` (or a new audit-domain reason). The Plan 02 SUMMARY explicitly acknowledges this trade-off but it remains a real bug that breaks structured error taxonomy."
    missing:
      - "Change the reason code to `invalid_cursor`. Add the new reason to the documented error taxonomy (D-19 catalog reference). Add a regression test asserting the cursor-error response's `details.reason` is NOT `invalid_quantity`."
  - truth: "`auth.logout` audit row attributes the actor User.id correctly (D-92 ALS store carries actorUserId at logout time)."
    status: failed
    reason: "CR-04 confirmed. `DELETE /api/auth/session` (the logout route at `apps/api/src/routes/auth.ts:51-65`) is intentionally unprotected (idempotent logout per Phase 1 D-01) and has no `requireSession` preHandler. No `setActor(...)` call happens before `logout(unsigned.value)`. The ALS store's `actorUserId` is null at the moment `destroySession` runs, so every `auth.logout` audit row in production records `actorUserId: null`. The integration test (Test 7 line 274-277) explicitly acknowledges this: 'DELETE /api/auth/session has no requireSession preHandler ... So the ALS store's actorUserId may be null at the moment the Session is deleted'. This means the read endpoint will return `actor: null` for every logout event, and the admin's `?actor=X` filter will never find logout events for user X. 'Who logged this user out' is unanswerable — the entire point of an audit log."
    artifacts:
      - path: "apps/api/src/routes/auth.ts:51-65"
        issue: "Logout handler does not call setActor() before `await logout(unsigned.value)`. Should resolve the actor from the unsigned session id BEFORE destroying the session, then setActor(session.userId, session.careUnitId) so the audit row attributes correctly."
      - path: "apps/api/test/audit.integration.test.ts:281-294"
        issue: "Test 7 (logout entityId leak) does NOT assert on actorUserId — the comment at lines 274-277 admits the limitation. No production behavior asserts that logout audit rows carry the actor."
    missing:
      - "Modify the logout route handler to resolve session.userId BEFORE calling logout(), and call setActor(session.userId, session.careUnitId, req.ip) so the ALS store carries the actor at the moment destroySession runs."
      - "Add an integration test: `auth.logout audit row carries actorUserId of the session owner` (suggested test body in CR-04 of 05-REVIEW.md)."
  - truth: "Failed login attempts each write one auth.login_failed audit row with actorUserId set appropriately (null for unknown email, user.id for wrong password) and no password material in the after JSON (D-96)."
    status: partial
    reason: "The shape is correct (actorUserId null for unknown email, user.id for wrong password; after JSON contains only {email}). However, the `entityId: ''` sentinel for the unknown-email path is structurally problematic: the schema declares `entityId String NOT NULL`, so empty-string is valid but semantically wrong. An admin filter `?entityType=session&entityId=` would match all unknown-email failed-login rows AND any other row with missing entityId. This is WR-07 in the code review and is a real impedance with the read-API filter design — but is not a blocker because no test asserts on this filter today."
    artifacts:
      - path: "apps/api/src/services/auth.service.ts:64"
        issue: "`entityId: ''` (empty string sentinel) is a documented choice in Plan 01 task spec, but the schema admits empty strings as valid entityIds and the filter API does not currently exclude them. Either extend AUDIT_ENTITY_TYPES with an `'auth_attempt'` value and use the email as a structural entityId, or document the sentinel in auditAllowlist.ts header and add a Zod refinement on the contract."
    missing:
      - "Either (a) extend AUDIT_ENTITY_TYPES with `'auth_attempt'` and use the attempted email as entityId for unknown-email failed-login rows, OR (b) keep the sentinel but document it explicitly and add validation so the FE filter cannot accidentally match it."
deferred: []
---

# Phase 5: Audit Log Verification Report

**Phase Goal:** Every mutation in the system is recorded in an append-only `audit_events` table, and an admin can browse it. The audit table cannot be modified from any code path (architectural guarantee, not a runtime check).

**Verified:** 2026-05-22T19:23:50Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AuditEvent table exists in Postgres with 5 secondary indexes (cursor key + 3 filter axes + requestId grouping) and the actorUserId column has no FK relation. | ✓ VERIFIED | `apps/api/prisma/schema.prisma:300+` declares `model AuditEvent` with 5 `@@index` lines and `actorUserId String?` (no `@relation`). Migration `20260522181022_0007_audit_events/migration.sql` was applied. |
| 2 | The DB role rejects UPDATE/DELETE/TRUNCATE against AuditEvent with `permission denied for table "AuditEvent"` (D-98, two-layer enforcement). | ✓ VERIFIED | Migration `20260522181023_0008_audit_events_revoke_grants/migration.sql` installs BEFORE-triggers raising SQLSTATE 42501. Integration test #4 in `audit.integration.test.ts:182-209` asserts `prisma.$executeRawUnsafe('UPDATE "AuditEvent" ...')` rejects with `/permission denied/i`. I ran the test — it passes. |
| 3 | No code path in apps/api/src, apps/web/src, or packages/shared/src calls prisma.auditEvent.update*, delete*, upsert (D-99 ESLint rule + grep test). | ✓ VERIFIED | `.eslintrc.cjs` configures the `no-restricted-syntax` AST selector matching the banned patterns. `pnpm lint` returned exit code 0. Integration test #3 in `audit.integration.test.ts:157-180` runs `git grep -nE 'prisma\.auditEvent\.(update\|delete\|deleteMany\|updateMany\|upsert)\b'` and asserts exit code 1 (no matches). |
| 4 | The Prisma `$extends` middleware intercepts the operations `create`, `update`, `updateMany`, `delete`, `deleteMany` on the 6 audited models (Medication, CareUnitMedication, Order, OrderLine, User, Session); `upsert`, `createMany`, reads, and raw SQL are NOT intercepted (the unaudited raw-SQL surface is documented in README per D-93). | ✓ VERIFIED | `apps/api/src/db/auditExtension.ts:90-256` builds handlers for exactly the 5 operations across `AUDITED_MODELS`. The README §"Known gap" (line 243+) explicitly documents the `$queryRaw` / `$executeRaw` exclusion. |
| 5 | The `entityId` column for Session-typed audit rows (auth.login, auth.logout, auth.login_failed) carries the actor User.id — NEVER the raw Session.id; passwordHash never appears in after JSON (D-97 + T-05-03). | ✓ VERIFIED | `auditAllowlist.ts:163-182` (`resolveEntityId`) returns `row.userId` for Session, with a throw guarding against missing userId. `AUDIT_ALLOWLIST.User` does not include `passwordHash`; `AUDIT_ALLOWLIST.Session` does not include `id`. Integration tests #5 and #7 in `audit.integration.test.ts:212-304` assert both layers structurally and via JSON.stringify substring checks. I ran them — both pass. |
| 6 | DELIVER path produces one order.deliver audit row plus N stock.increment audit rows, all sharing a single requestId (D-94). | ✓ VERIFIED | `order.service.ts:724-731` wraps each CUM update in `withActionOverride('stock.increment', ...)`, and lines 738-747 wrap the Order updateMany in `withActionOverride('order.deliver', ...)`. Integration test #1 in `audit.integration.test.ts:73-127` asserts the 1+N shape with shared requestId. Test passes. |
| 7 | GET /api/audit/events returns 403 for sjuksköterska/apotekare, 200 for admin; response shape matches auditEventListResponse with cursor pagination (createdAt DESC, id DESC tiebreak). | ✓ VERIFIED | `routes/audit/list.ts:30` uses preHandler `[requireSession, requirePermission('audit:read')]`. `auth/permissions.ts` maps `'audit:read': ['admin']`. `audit.service.ts:101-189` implements cursor-paginated findMany with `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `take: limit + 1`. Integration test #6 in `audit.integration.test.ts:307-338` asserts 403/403/200 plus `{events, nextCursor}` shape. Test passes. |
| 8 | The audit-row INSERT lands in the SAME transaction as the wrapping mutation (D-91). A rolled-back mutation leaves zero audit rows. | ✗ FAILED | **CRITICAL — CR-01 EMPIRICALLY CONFIRMED.** See gap below. The audit-row write uses the captured base `client` from `Prisma.defineExtension((client) => ...)`, NOT the active tx context. A diagnostic test I wrote during verification produced an orphan audit row after a forced rollback — proof that D-91 is not actually upheld. |
| 9 | Cursor decode errors surface the correct reason code (not a copy-paste from order validation). | ✗ FAILED | **CR-02 CONFIRMED.** `audit.service.ts:85-87` uses `reason: 'invalid_quantity'` (the order-line validation reason). This leaks order-validation taxonomy into the audit subsystem. |
| 10 | `auth.logout` audit row attributes the actor User.id correctly (D-92 ALS store carries actorUserId at logout time). | ✗ FAILED | **CR-04 CONFIRMED.** Logout route at `routes/auth.ts:51-65` has no `setActor()` call before `logout(unsigned.value)`. ALS store's `actorUserId` is null at logout time; every production `auth.logout` audit row records `actorUserId: null`. The integration test acknowledges this gap in a comment. |
| 11 | Failed login attempts each write one auth.login_failed audit row with actorUserId set appropriately and no password material in the after JSON (D-96). | ⚠️ PARTIAL | Shape is correct (actorUserId null for unknown email, user.id for wrong password; after JSON contains only {email}). However, the `entityId: ''` sentinel for unknown-email failed-logins (auth.service.ts:64) is structurally problematic per WR-07. Treated as PARTIAL: blocker-shaped concerns ride the existing CR-04 fix path. |

**Score:** 7/11 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/prisma/schema.prisma` | AuditEvent model with 5 indexes, no FK on actorUserId | ✓ VERIFIED | Block at line 300+; 5 `@@index` declarations confirmed. |
| `apps/api/prisma/migrations/20260522181022_0007_audit_events/migration.sql` | audit_events CREATE TABLE + 5 indexes | ✓ VERIFIED | Folder + file present. |
| `apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql` | BEFORE-trigger + REVOKE (D-98) | ✓ VERIFIED | Folder + file present; trigger + REVOKE both implemented (REVOKE is a no-op because role owns the table — trigger is the binding layer). |
| `apps/api/src/db/auditExtension.ts` | Prisma $extends middleware + resolveEntityId call per write | ⚠️ ORPHANED (functionality) | File exists; `resolveEntityId(` is called per write. However, **the same-tx guarantee the file's header advertises (D-91) does not hold** — `client.auditEvent.create` runs against the captured root client, not the tx. The file's claim and behavior contradict. |
| `apps/api/src/db/auditAllowlist.ts` | Per-model column allowlist + resolveEntityId | ✓ VERIFIED | Exports AUDIT_ALLOWLIST, AUDITED_MODELS, resolveEntityId, filterAllowlist, mapPrismaModelToEntityType. User excludes passwordHash; Session excludes id. |
| `apps/api/src/plugins/requestContext.ts` | AsyncLocalStorage Fastify plugin (D-92) | ⚠️ WARNING (WR-01) | File exists, exports `als`, `requestContextPlugin`, `setActor`, `withActionOverride`. Uses `als.enterWith` instead of `als.run` — has documented leak-across-requests risk under keep-alive (WR-01). Acceptable for v1 but flagged. |
| `packages/shared/src/contracts/audit.ts` | 4 Zod schemas + types | ✓ VERIFIED | All four schemas (auditEventResponse, auditEventListResponse, auditEventListQuery, auditFiltersResponse) exported. |
| `packages/shared/src/constants/auditAction.ts` | AUDIT_ACTIONS (11) + AUDIT_ACTION_LABELS Swedish | ✓ VERIFIED | All 11 actions + Swedish labels present. |
| `packages/shared/src/constants/auditEntityType.ts` | AUDIT_ENTITY_TYPES (6) + AUDIT_ENTITY_TYPE_LABELS Swedish | ✓ VERIFIED | All 6 entity types + Swedish labels present. |
| `apps/api/src/services/audit.service.ts` | listAuditEvents (cross-tenant, D-16 EXCEPTION) + 60s memoized listAuditFilters | ✓ VERIFIED | D-16 EXCEPTION header present; no careUnitId arg; cursor pagination with deterministic tiebreak; module-scope 60s memo with `_resetAuditFiltersCache`. **BUG**: cursor decode error uses wrong reason code (CR-02). |
| `apps/api/src/routes/audit/list.ts` | GET /api/audit/events admin-only | ✓ VERIFIED | preHandler `[requireSession, requirePermission('audit:read')]`; uses auditEventListQuery + auditEventListResponse schemas. |
| `apps/api/src/routes/audit/filters.ts` | GET /api/audit/filters admin-only | ✓ VERIFIED | File present, admin-only. |
| `apps/web/src/routes/admin/AuditPage.tsx` | /admin/audit page replacing EmptyStateCard stub | ✓ VERIFIED | Real page with heading "Granskningslogg", filter bar, responsive table/card, two distinct empty states, pagination footer. |
| `apps/web/src/routes/admin/AuditDiffPanel.tsx` | Fält/Före/Efter diff table + requestId chip + permalink copy | ✓ VERIFIED | Renders Fält/Före/Efter triplet; copyPermalink with `navigator.clipboard.writeText` + sonner toast. WR-09 (unhandled promise) is a code-style concern, not a behavior gap. |
| `.eslintrc.cjs` | Root ESLint config with no-restricted-syntax rule | ✓ VERIFIED | Two AST selectors (direct member-access + destructured); message contains `append-only` and `D-98`. `pnpm lint` exits 0. |
| `apps/api/test/audit.integration.test.ts` | 7-test suite | ⚠️ WARNING | All 7 tests pass when run (`pnpm --filter @meditrack/api test -- audit.integration.test.ts` — 7 passed). BUT Test 2 (D-91 rollback) is vacuously true and does NOT exercise the actual rollback path. CR-01's bug is not detected by the existing suite. |
| `apps/api/test/helpers/buildTestApp.ts` | 5 promoted helpers + existing exports | ✓ VERIFIED | All 5 functions exported; six existing test files migrated. |
| `README.md` | Audit log section with two-layer enforcement + §6 phrasings | ⚠️ WARNING | Section exists with all required content. But the §"How the audit hook works" claim "If the mutation rolls back, the audit row rolls back with it" is **factually incorrect** per the CR-01 confirmation. README drift — needs correction. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/api/src/db/client.ts` | `apps/api/src/db/auditExtension.ts` | `.$extends(buildAuditExtension())` | ✓ WIRED | Line 23 of client.ts chains the extension on the constructor. |
| `apps/api/src/app.ts` | `apps/api/src/plugins/requestContext.ts` | `app.register(requestContextPlugin)` | ✓ WIRED | Plugin registered between cookies and routes per Plan 01 SUMMARY. |
| `apps/api/src/db/auditExtension.ts` | `apps/api/src/plugins/requestContext.ts` | `als.getStore()` | ✓ WIRED | Called in every handler (lines 106, 128, 158, 192, 223). |
| `apps/api/src/db/auditExtension.ts` | `apps/api/src/db/auditAllowlist.ts` | `resolveEntityId(model, row)` call | ✓ WIRED | Line 276 of auditExtension.ts: `const entityId = resolveEntityId(model, payload.row)`. |
| `apps/api/src/auth/permissions.ts` | `packages/shared/src/contracts/permissions.ts` | `'audit:read'` key entry | ✓ WIRED | ACTION_KEYS includes `'audit:read'`; PERMISSIONS maps `'audit:read': ['admin']`. |
| `apps/api/src/services/auth.service.ts` | audit_events (auth.login_failed write) | explicit prisma.auditEvent.create | ✓ WIRED | Two calls at lines 59-72 and 84-96. |
| `apps/api/src/app.ts` | `apps/api/src/routes/audit/index.ts` | `app.register(auditRoutes)` | ✓ WIRED | Per Plan 02 SUMMARY. |
| `apps/web/src/routes/admin/AuditPage.tsx` | `/api/audit/events` | useInfiniteQuery via useAuditEventsQuery | ✓ WIRED | Page imports `useAuditEventsQuery`; hook uses `useInfiniteQuery`. |
| `apps/web/src/routes/admin/AuditFilterBar.tsx` | URL search params | `setSearchParams` for actor/entity/action/requestId | ✓ WIRED | Per Plan 02 SUMMARY decision log. |
| `apps/api/src/db/auditExtension.ts → tx context` | The audit-row INSERT runs inside the caller's `$transaction` | (intended via Prisma extension semantics) | ✗ NOT WIRED | **CRITICAL.** The `client.auditEvent.create` call uses the captured root client, not the active tx. Empirically confirmed by diagnostic rollback test. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ESLint enforces append-only rule | `pnpm lint` | exit 0 (no false positives on real codebase) | ✓ PASS |
| All 7 audit integration tests pass | `pnpm --filter @meditrack/api test -- audit.integration.test.ts` | 7 passed, 1.73s | ✓ PASS |
| Postgres rejects UPDATE on AuditEvent | (via Test 4) | `Code: 42501 ... permission denied for table "AuditEvent"` | ✓ PASS |
| Diagnostic: rolled-back tx still writes orphan audit row | Custom diagnostic test (see report body) | Orphan audit row persisted; stock change rolled back correctly. **D-91 contract empirically broken.** | ✗ FAIL |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | No probes declared in PLAN files or conventional locations | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUD-01 | 05-01-PLAN.md, 05-03-PLAN.md | Every successful mutation writes an audit_events row with actor/entity/before/after/timestamp inside the same transaction as the mutation. | ⚠️ PARTIAL | Writes happen, redaction is correct, action overrides resolve correctly. **BUT** the "same transaction" guarantee (D-91, "the audit log doesn't lie") does not actually hold — orphan rows persist after rollback. AUD-01 is satisfied for non-rollback paths only. |
| AUD-02 | 05-02-PLAN.md, 05-03-PLAN.md | Admin browses `/admin/audit` in reverse-chrono order; filters by user/entity/action combine. | ✓ SATISFIED | Cursor pagination, three filters, URL-as-state, RBAC gates verified. Test 6 passes; manual flow described in Plan 02 SUMMARY demo path. The minor `invalid_quantity` reason-code bug (CR-02) affects malformed-cursor handling but does not block the requirement. |
| AUD-03 | 05-03-PLAN.md | Audit table cannot be modified from any code path; architectural guarantee (grep + ESLint + Postgres trigger). | ✓ SATISFIED | All three layers in place; tests 3 + 4 assert both grep-absence and DB-layer rejection. Verified by running the suite. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/db/auditExtension.ts` | 306 | `void AUDIT_ALLOWLIST;` (dead workaround for unused import) | ℹ️ Info | IN-01 from review — cosmetic, no behavioral impact. |
| `apps/api/src/services/audit.service.ts` | 86 | `reason: 'invalid_quantity'` for cursor decode error | 🛑 Blocker | Cross-subsystem reason-code leak (CR-02). |
| `apps/api/src/db/auditExtension.ts` | 105-118 etc. | `await client.auditEvent.create({data})` and `client.<model>.findUnique` on captured root client | 🛑 Blocker | Breaks the transactional contract D-91 advertises (CR-01). |
| `apps/api/src/routes/auth.ts` | 51-65 | logout handler does not call `setActor()` before `logout()` | 🛑 Blocker | All auth.logout audit rows have null actor (CR-04). |
| `apps/api/src/services/auth.service.ts` | 64 | `entityId: ''` sentinel for unknown-email failed-login | ⚠️ Warning | WR-07 — schema-permitted but filter-API-impedance issue. |
| `apps/api/src/plugins/requestContext.ts` | 144 | `als.enterWith(...)` instead of `als.run(...)` | ⚠️ Warning | WR-01 — leak-across-requests risk under keep-alive. |
| `apps/web/src/routes/admin/AuditDiffPanel.tsx` | 127-149 | unhandled `.then().catch()` chain after `navigator.clipboard.writeText` | ⚠️ Warning | WR-09 — code style; behavior is correct. |
| `apps/web/src/routes/admin/AuditTable.tsx` and `AuditCardList.tsx` | various | siblingCount recomputed on each render (no useMemo) | ℹ️ Info | WR-10 — perf only; v1-acceptable. |
| `apps/api/src/db/auditExtension.ts` | 150-182 | updateMany handler runs N sequential findUnique calls for afterRow loads | ⚠️ Warning | WR-03 — N+1 hot path; v1-acceptable but worth flagging. |
| `apps/api/src/services/audit.service.ts` | 200+ | module-scope filters cache (60s) not invalidated across replicas | ℹ️ Info | WR-04 — accept for v1; v2 candidate. |
| `apps/api/src/services/audit.service.ts` | 65-89 | `decodeCursor` accepts year-3000 timestamps without bound | ℹ️ Info | WR-06 — admin can already see everything; minor. |
| `apps/api/test/audit.integration.test.ts` | 129-153 | Test 2 (D-91 rollback) is vacuously passing | 🛑 Blocker | Hides CR-01. The empty-submit path throws BEFORE the audit-write site, so the test cannot falsify the bug it claims to verify. |
| `apps/api/src/db/auditAllowlist.ts` | 112 | Session allowlist includes `userId` which also appears as `entityId` via resolveEntityId | ⚠️ Warning | WR-08 — circular reference; harmless but confusing for future reviewers. |
| `README.md` | "How the audit hook works" section | Claims "If the mutation rolls back, the audit row rolls back with it" — factually incorrect | 🛑 Blocker | README drift. Documents behavior that does not actually hold. Especially damaging because the README is graded as part of the interview submission. |

### Human Verification Required

None — all checks resolved programmatically. The four BLOCKERs are empirically verified (CR-01 by diagnostic test, CR-02/CR-04 by code inspection, the vacuous-test gap by reading the test source against order.service.ts validation flow).

### Gaps Summary

Phase 5 ships a feature-complete audit log surface that satisfies AUD-02 (admin browse UI with filters + cursor pagination) and AUD-03 (append-only enforcement at code + DB layers) cleanly. The infrastructure scaffolding — the Prisma extension, the ALS plugin, the allowlist, resolveEntityId, the shared contracts, the admin UI, the ESLint rule, the DB triggers, the integration test suite — is all in place and most of it works.

The fatal gap is **AUD-01's transactional contract (D-91)**. The Prisma `$extends` middleware captures the base `client` argument from `Prisma.defineExtension((client) => ...)` and uses it for both pre-loads AND the audit-row INSERT. Sibling calls on that captured client do NOT propagate through the active `prisma.$transaction(async tx => ...)` block — they execute on the root pool. As a result, a mutation that rolls back leaves an **orphan audit row** that claims the mutation happened. The append-only triggers then make the orphan permanent (the application cannot delete it).

I empirically confirmed this with a diagnostic test that:
1. Started a `prisma.$transaction`,
2. Issued `tx.careUnitMedication.update(...)` to increment stock,
3. Forced a throw,
4. Verified the stock change rolled back (it did, sanity check),
5. Verified the audit row also rolled back (it did NOT — orphan persisted).

The existing test that claims to verify D-91 (`audit.integration.test.ts:129-153`) passes vacuously: it submits an empty draft order, which throws `ValidationFailedError` at `order.service.ts:441-446` BEFORE the audit-write site is reached. No audit-write is attempted, so the test passes regardless of whether the extension is transactional. This is a deceptive test that hides the bug — and the README + Plan 01 SUMMARY + audit extension's own header comment all assert the contract the test cannot actually verify.

The §6 interview phrase "the audit log doesn't lie" — central to the README and the project's forensics story — is currently **false in production behavior**. A failed deliver after a successful stock.increment commits an orphan stock.increment audit row. The forensics story unravels at exactly the question Medovia is most likely to probe.

Three other BLOCKERs add to this:
- **CR-02**: cursor-decode errors return `reason: 'invalid_quantity'` (a copy-paste from order validation). Breaks structured error taxonomy.
- **CR-04**: `auth.logout` audit rows have `actorUserId: null` because the logout route never calls `setActor()`. The audit log cannot answer "who logged out user X" — a core forensics question.
- The README claims behavior (D-91 same-tx guarantee) that does not hold. Reviewer-facing drift.

The 11 warnings and 7 info findings from the code review are real but not blockers — they document v2 work, code-style concerns, and edge cases that don't affect the phase goal.

**Bottom line:** AUD-02 and AUD-03 are met cleanly. AUD-01 is met for non-rollback paths but the D-91 contract — promised by ROADMAP, by the plan, by the Prisma extension header comment, by the integration test, and by the README — does not actually hold. This is a blocker for the phase goal as stated, and the README contains a factual misrepresentation that affects the graded deliverable.

---

_Verified: 2026-05-22T19:23:50Z_
_Verifier: Claude (gsd-verifier)_
