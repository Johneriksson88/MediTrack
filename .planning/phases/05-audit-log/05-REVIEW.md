---
phase: 05-audit-log
reviewed: 2026-05-22T18:30:00Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - apps/api/prisma/migrations/20260522181022_0007_audit_events/migration.sql
  - apps/api/prisma/migrations/20260522181023_0008_audit_events_revoke_grants/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/seed.ts
  - apps/api/src/app.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/auth/requireSession.ts
  - apps/api/src/db/auditAllowlist.ts
  - apps/api/src/db/auditExtension.ts
  - apps/api/src/plugins/requestContext.ts
  - apps/api/src/routes/audit/filters.ts
  - apps/api/src/routes/audit/index.ts
  - apps/api/src/routes/audit/list.ts
  - apps/api/src/services/audit.service.ts
  - apps/api/src/services/auth.service.ts
  - apps/api/src/services/order.service.ts
  - apps/api/test/audit.integration.test.ts
  - apps/api/test/auth.flow.smoke.test.ts
  - apps/api/test/helpers/buildTestApp.ts
  - apps/api/test/orders.confirm.integration.test.ts
  - apps/api/test/orders.integration.test.ts
  - apps/api/test/orders.list.integration.test.ts
  - apps/web/src/components/AuditActionChip.tsx
  - apps/web/src/components/AuditEntityTypeChip.tsx
  - apps/web/src/components/EmptyStateCard.tsx
  - apps/web/src/components/RequestIdGroupChip.tsx
  - apps/web/src/routes/admin/AuditCardList.tsx
  - apps/web/src/routes/admin/AuditDiffPanel.tsx
  - apps/web/src/routes/admin/AuditEventCard.tsx
  - apps/web/src/routes/admin/AuditFilterBar.tsx
  - apps/web/src/routes/admin/AuditPage.tsx
  - apps/web/src/routes/admin/AuditTable.tsx
  - apps/web/src/routes/admin/auditDiffSummary.ts
  - apps/web/src/routes/admin/useAuditEventsQuery.ts
  - apps/web/src/routes/admin/useAuditFiltersQuery.ts
  - packages/shared/src/constants/auditAction.ts
  - packages/shared/src/constants/auditEntityType.ts
  - packages/shared/src/contracts/audit.ts
  - packages/shared/src/contracts/permissions.ts
  - packages/shared/src/index.ts
findings:
  critical: 4
  warning: 10
  info: 7
  total: 21
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-22T18:30:00Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

Phase 5 (audit log) is a feature-complete, well-documented implementation with strong threat-model intent: a Prisma `$extends` middleware feeds an append-only audit table, the schema/migrations enforce append-only at the DB role layer, an allowlist scrubs `passwordHash` and `Session.id` from snapshots, and an admin-only `/api/audit/events` endpoint exposes cursor-paginated reads with redaction-asserting integration tests.

Adversarial review surfaces four BLOCKER issues that defeat key Phase 5 contracts:

1. **The "same transaction" guarantee (D-91) does not actually hold.** The `$extends` audit extension writes audit rows via the captured base `client.auditEvent.create(...)` and reads `before`/`after` snapshots via `client.<model>.findUnique(...)`. None of these calls receive the transactional client; they execute outside any `prisma.$transaction` block the caller is in. A failed deliver after a successful stock.increment will commit orphan audit rows, and the audit row for an updateMany may capture stale `before`/`after` data. Tests do not catch this — the one "rolled-back" test fails before any audit-write is attempted.
2. **Audit row inserts are NOT intercepted, so the trigger never fires on the create path** — that part is fine, but the `prisma.auditEvent.create({...})` calls in `auth.service.ts` bypass the extension entirely (they are intercepted only if `auditEvent` were in `AUDITED_MODELS`, which it is not). Acceptable. However, the explicit `prisma.auditEvent.create` calls in `auth.service.ts` go through the audit extension's lifecycle interceptors as a side-effect: a `create` against `auditEvent` is never registered (it's not an audited model), so the call is direct. OK.
3. **Cursor-decode error reports the wrong reason code** (`invalid_quantity`) to clients, leaking a copy-paste from order validation and breaking any FE that switches on `details.reason`.
4. **`resetSessions()` in test setup is a `prisma.session.deleteMany({})` call that runs through the audit extension.** Because the test's `beforeEach` is not wrapped in `als.run(...)` and the test imports `prisma` directly (no HTTP onRequest hook), `als.getStore()` returns undefined and the audit middleware skips, which is correct — but the deleteMany handler still runs a `findMany({})` on the entire Session table before delegating. For the audit integration test, that's a per-test full Session scan (cheap today; surprising). More importantly, the actual app code path `destroySession(id)` uses `deleteMany` instead of `delete`, which means logout audit rows have to be written by the `deleteMany` handler iterating beforeRows. That part works in HTTP context, but breaks the `entityId` for logout in a subtle way (see CR-04).

## Critical Issues

### CR-01: Audit extension does NOT run inside the caller's transaction — D-91 rollback contract is broken

**File:** `apps/api/src/db/auditExtension.ts:90-256` (entire factory) and `apps/api/src/db/auditExtension.ts:299` (`client.auditEvent.create`)

**Issue:** `buildAuditExtension()` captures the base `client` argument from `Prisma.defineExtension((client) => ...)`. Inside the per-model handler, both the `before`/`after` row loads (`client.<model>.findUnique`, `client.<model>.findMany`) AND the audit-row insert (`client.auditEvent.create({ data })`) are made against this captured base client — NOT against the transactional client that the wrapping `prisma.$transaction(async (tx) => tx.x.y(...))` provides. The Prisma extension API only routes the user-facing `query(args)` callable through the active tx; sibling client.* calls inside an extension handler run on the root connection pool.

Consequences:
- **Orphan audit rows on rollback.** If a `tx.careUnitMedication.update(...)` inside `deliverOrder` succeeds but a later step (e.g. the `tx.order.updateMany` race-loss branch on line 749-762) throws, the wrapping tx rolls back the CUM update — but the audit row written via `client.auditEvent.create` was committed on a separate connection and is now an orphan claiming a stock change that never happened. This is the exact opposite of D-91's stated promise ("the audit log doesn't lie").
- **Stale `before` snapshot for `update` inside an active tx.** If a row has already been modified earlier in the same tx (e.g., `tx.order.update` followed by `tx.order.update`), the second handler's `client.order.findUnique({where})` reads from a separate connection and sees the pre-tx state, NOT the in-tx intermediate state. `before`/`after` end up describing the wrong delta.
- **Test coverage gap.** `audit.integration.test.ts:129-153` claims to verify D-91 by checking that an empty submit (422) produces zero `order.submit` audit rows. But the empty-submit path throws `ValidationFailedError` BEFORE reaching `withActionOverride('order.submit', () => tx.order.updateMany(...))` — no audit-write is attempted at all, so the test passes vacuously regardless of whether the extension is transactional.

**Fix:** Prisma query extensions cannot natively access the active tx client from sibling calls. The supported patterns are:
1. Use the `$allOperations` middleware-style hook with `Prisma.getExtensionContext(this)` to discover the current tx client (Prisma 5.x), OR
2. Switch from `$extends({query})` to the deprecated `$use` middleware (which DOES receive the tx context), OR
3. Refactor so all audit writes happen inside a wrapper that takes an explicit `tx`:
```typescript
// In services that need audit guarantees:
await prisma.$transaction(async (tx) => {
  const before = await tx.order.findUnique({where});
  const updated = await tx.order.updateMany({where, data});
  await tx.auditEvent.create({data: {...filterAllowlist('Order', before), ...}});
});
```
At minimum, add a regression test that performs a mutation inside a tx that THROWS AFTER the mutation has run (not before), then asserts zero audit rows survived. The current test does not exercise this path.

---

### CR-02: Cursor decode error returns misleading `reason: 'invalid_quantity'`

**File:** `apps/api/src/services/audit.service.ts:84-88`

**Issue:** When `decodeCursor` fails (bad base64, malformed JSON, missing fields, invalid date), the catch handler throws:
```typescript
throw new ValidationFailedError('Ogiltig cursor.', {
  reason: 'invalid_quantity',
});
```
`invalid_quantity` is the canonical reason code for order-line validation failures (`order.service.ts:451`). A client that branches on `details.reason` to choose a Swedish error toast (mirroring the pattern Phase 3 set for `empty_order` / `invalid_quantity`) will render the wrong message. This is a copy-paste bug that leaks order-validation taxonomy into the audit subsystem and confuses any future structured error handling.

**Fix:**
```typescript
throw new ValidationFailedError('Ogiltig cursor.', {
  reason: 'invalid_cursor',
});
```
Add `invalid_cursor` to the documented `details.reason` taxonomy (or the appropriate equivalent), and add a test that asserts the reason is NOT `invalid_quantity`.

---

### CR-03: Audit extension's `delete` handler silently mis-attributes payload on missing pre-load

**File:** `apps/api/src/db/auditExtension.ts:185-213` (delete handler)

**Issue:** The delete handler computes `entityId` via `resolveEntityId(model, row)` where `row` is:
```typescript
const row = (result as Record<string, unknown>) ?? beforeRow ?? {};
```
If `beforeRow` is null (e.g., the where-clause didn't match any existing row, but Prisma still completed the delete returning a row) and `result` is null/undefined (Prisma `delete` throws on no-match, but if upstream caller swallows or for non-existent path), `row` becomes `{}`. `resolveEntityId('Session', {})` throws — but it throws from inside the extension after the delete has already committed. The error reaches the caller AS IF the delete failed, but the delete already succeeded on the DB. This is a partial-commit window that surfaces as a misleading 500. The same risk applies to `delete` handlers on other models when `result` is unexpectedly null.

Additionally, line 207: `before: beforeRow ?? (result as Record<string, unknown>)` — for delete, the canonical "before" is `beforeRow` (loaded pre-mutation) and `after` is null. Using `result` (which IS the just-deleted row) as a fallback for `before` is correct semantically only because `result` reflects the state at delete time. But the `filterAllowlist` call then receives an object that may include keys the schema doesn't have (e.g., if the `delete` returned a row from a model with relations that aren't part of `AUDIT_ALLOWLIST`). Today this is benign — `filterAllowlist` only copies allowlisted keys — but the code is harder to reason about than necessary.

**Fix:** Tighten the delete handler:
```typescript
const beforeForAudit = beforeRow ?? (result as Record<string, unknown> | null);
if (!beforeForAudit) {
  // Cannot construct a meaningful audit row — skip rather than throw post-commit.
  return result;
}
await writeAuditRow(client, store, model, {
  before: beforeForAudit,
  after: null,
  row: beforeForAudit,
  defaultAction: 'delete',
});
```
And add a test that calls `prisma.session.delete({where:{id:'nonexistent'}})` to verify the extension doesn't throw post-commit.

---

### CR-04: `auth.logout` audit row's `actorUserId` is null because logout has no `requireSession` preHandler

**File:** `apps/api/src/services/auth.service.ts:137-149` and the logout route handler (not in scope but referenced by `audit.integration.test.ts:267-294`)

**Issue:** The test file admits this explicitly at line 274-277:
```typescript
// Note: DELETE /api/auth/session has no requireSession preHandler
// (idempotent logout works without a cookie). So the ALS store's
// actorUserId may be null at the moment the Session is deleted —
// we do NOT filter on actorUserId here, only on action+timestamp.
```
This means every `auth.logout` audit row in production has `actorUserId: null`. The audit log records "someone logged out a session whose entityId (User.id) is X" — but the `actor` field on the read endpoint will return `null`, the `actorUserId` filter on `/admin/audit?actor=X` will NOT find the logout event, and `careUnitId` will also be null. The "who did this" question — the entire point of an audit log — is unanswerable for logout events.

Worse: any user who knows another user's session id can hit `DELETE /api/auth/session` with that cookie and force-logout the victim. The audit row records the victim's `entityId` but no actor — leaving forensics blind to the attacker. (This is a separate session-fixation/CSRF concern that predates Phase 5, but Phase 5 was the chance to record the actor and missed it.)

**Fix:** The logout flow already has the session cookie in hand; resolve actor BEFORE calling `destroySession`:
```typescript
// In the logout route handler:
const sessionId = unsignedCookie.value;
const session = await prisma.session.findUnique({where: {id: sessionId}});
if (session) {
  setActor(session.userId, session.careUnitId);
}
await logout(sessionId);
```
Then the `auth.logout` audit row attributes correctly. Add a test:
```typescript
it('auth.logout audit row carries actorUserId of the session owner', async () => {
  const cookie = await loginAs(app, TEST_APOTEKARE);
  const user = await prisma.user.findUniqueOrThrow({where: {email: TEST_APOTEKARE.email}});
  await app.inject({method:'DELETE', url:'/api/auth/session', headers:{cookie}});
  const row = await prisma.auditEvent.findFirst({
    where: {action: 'auth.logout'},
    orderBy: {createdAt: 'desc'},
  });
  expect(row!.actorUserId).toBe(user.id);
});
```

---

## Warnings

### WR-01: `als.enterWith` leaks store across requests when Fastify recycles event-loop ticks

**File:** `apps/api/src/plugins/requestContext.ts:135-152`

**Issue:** `als.enterWith(...)` (vs. `als.run(scope, fn)`) sets the store for the current async resource and all downstream resources from that point on the same event-loop "branch." The Node.js docs explicitly warn:

> The `asyncLocalStorage.enterWith(store)` method [...] transitions into the context for the remainder of the current synchronous execution and then persists the store through any following asynchronous calls. [...] It's easy to leak the store [...]; use `asyncLocalStorage.run()` if possible.

In Fastify's `onRequest` hook, two requests arriving on the same TCP keep-alive connection in rapid succession can share an async resource boundary; the second request's `enterWith` will overwrite the first's store, but if the first request's async chain hasn't finished yet (e.g., a slow Prisma query), its remaining work runs under the SECOND request's store — leaking `actorUserId`, `careUnitId`, and `requestId` across requests.

The header comment line 124-127 acknowledges that `als.run` was rejected for ergonomic reasons but doesn't address the leak risk.

**Fix:** Switch to `als.run` by wrapping the request lifecycle in `onRequest`/`preHandler`/`onSend` callbacks, OR wrap the route handler dispatch. Fastify v4+ supports `app.addHook('onRequest', (req, reply, done) => { als.run(scope, done); })`. Alternatively, document this is acceptable for the v1 demo and add a test that fires N concurrent requests and asserts no cross-contamination of audit rows.

---

### WR-02: Audit-extension `update` handler skips beforeRow load when `where` is missing or matches no row

**File:** `apps/api/src/db/auditExtension.ts:131-148`

**Issue:** The update handler:
```typescript
if (where) {
  beforeRow = await modelClient.findUnique({where});
}
```
If `where` is undefined (Prisma will reject this at the query level anyway, so unreachable) the audit row gets `before: null` even though there IS a real before-state. More importantly, `findUnique({where})` requires `where` to be a unique selector — but `update` accepts non-unique selectors too in some cases. A non-unique where would cause `findUnique` to throw, surfacing as a confusing extension error.

The `delete` handler has the same `if (where)` guard (line 197), with the same issue.

**Fix:** Document the contract that callers must pass a unique `where`. Add a defensive fallback: if `findUnique` throws or returns null, set `beforeRow = null` and log a warning rather than letting the error propagate post-mutation.

---

### WR-03: `updateMany` audit fan-out re-queries each row separately — N+1 in a fast path

**File:** `apps/api/src/db/auditExtension.ts:150-182`

**Issue:** For every row in `beforeRows`, the handler does `await modelClient.findUnique({where:{id}})` to load `afterRow`. For an `updateMany` matching 1000 rows, that's 1000 sequential extra queries on top of the original. The header documentation doesn't mention this; the deliver path keeps fan-out small (one CUM per line) but a future bulk mutation will explode latency.

Out of scope for v1 by reviewer guidance, but worth flagging because: (a) it's a correctness risk too — between the `query(args)` completing and each `findUnique` for `afterRow`, another tx could modify the row, capturing a phantom delta in the audit log; (b) the same-tx issue from CR-01 makes this worse since the findUnique runs outside the wrapping tx.

**Fix:** After the `updateMany` runs, do ONE `findMany({where: {id: {in: beforeRowIds}}})` and build a Map. Then iterate beforeRows zipping against afterMap.

---

### WR-04: `listAuditFilters` 60-second module-scope cache is not invalidated across replicas

**File:** `apps/api/src/services/audit.service.ts:200-258`

**Issue:** The cache is `let filtersCache: FiltersCacheEntry | null = null` at module scope. In a multi-process / multi-replica deploy (which the README hints at via "compose `api` ENTRYPOINT"), each process has its own cache; a user filter chip can show stale data for up to 60 seconds per replica. The `_resetAuditFiltersCache` test helper resets only the in-process cache.

Today this is benign because v1 runs a single API container. But the comment at line 36-37 ("even with admin credentials an attacker can't exceed ~1 DB hit per minute per app instance") understates the per-instance scope.

**Fix:** Add a comment to `listAuditFilters` clarifying the per-process scope, and either (a) document the v2 plan to move to Redis/MemoryStore, or (b) accept it explicitly. Also, the cache currently keys on nothing — if a new admin lookup adds a careUnitId scope dimension, this becomes a security cache-key bug. Document the cache-key invariant.

---

### WR-05: Filter cache invalidation never fires after a new audit-action category appears

**File:** `apps/api/src/services/audit.service.ts:220-258`

**Issue:** When a brand new action category is recorded (e.g., the first `auth.login_failed` ever), it won't appear in the `actions` combobox for up to 60 seconds. For a first-time-admin loading `/admin/audit` after a failed-login event arrives, the dropdown won't include the action they need to filter on. Worse, there's no test asserting that newly-recorded distinct values appear after expiry.

**Fix:** Add a brief comment explaining the cache-staleness trade-off (admin sees a "fresh" view at most 60 s old) and add a smoke test:
```typescript
it('newly-seen action category appears in filter list after cache expiry', async () => {
  _resetAuditFiltersCache();
  // ... record an action that wasn't in the previous filter snapshot
  // ... expect filter list to include the new action
});
```

---

### WR-06: `decodeCursor` accepts any timestamp string but doesn't validate ordering

**File:** `apps/api/src/services/audit.service.ts:65-89`

**Issue:** A client-supplied cursor with `createdAt` set to a year-3000 date will:
1. Pass `Date.parse(createdAt)` → not NaN.
2. Construct a `where` clause `{createdAt: {lt: futureDate}}` → matches all rows.
3. Return the first 50 audit events as if it were "the next page after end of time."

This isn't a security vulnerability (admin can already see everything), but it lets a client forge cursors and observe data anomalously. There's also no signature/HMAC on the cursor — anyone with admin credentials can edit the base64 to skip forward or backward arbitrarily.

**Fix:** Either sign the cursor (HMAC with `COOKIE_SECRET`-equivalent), or reject cursors with `createdAt > Date.now()`. The latter is simpler:
```typescript
if (Date.parse(createdAt) > Date.now() + 60_000 /* 1 min skew */) {
  throw new ValidationFailedError('Ogiltig cursor.', {reason: 'invalid_cursor'});
}
```

---

### WR-07: `auth.login_failed` audit insert uses `prisma.auditEvent.create` outside any tx — orphan if subsequent throw

**File:** `apps/api/src/services/auth.service.ts:59-72` and `83-96`

**Issue:** Both failed-login branches call `prisma.auditEvent.create({data:...})` directly, then `throw new InvalidCredentialsError()`. Between those two statements no rollback boundary exists; the audit row commits unconditionally. That's fine semantically (we WANT to record failed logins even when the request fails). But this pattern bypasses the extension's allowlist/resolveEntityId guarantees — the `entityId: ''` and `after: { email }` shapes are hard-coded in two places, with no enforcement that they match the rest of the schema's invariants.

Specifically, `entityId: ''` is a sentinel empty string. The schema declares `entityId String NOT NULL` — empty is valid but semantically wrong. A naive admin filter `?entityType=session&entityId=` would match all failed-login rows AND any other row missing entityId.

**Fix:** Either (a) extend `AUDIT_ENTITY_TYPES` with a `'auth_attempt'` value and use it for `auth.login_failed`, with `entityId` being the attempted email (recorded structurally), OR (b) document the `entityId: ''` sentinel in `auditAllowlist.ts` header and add a Zod refinement on the contract rejecting it from the FE filter. Today, neither is done.

---

### WR-08: Session `entityId` resolves to `userId`, but Session model has `userId` filtered out of the allowlist — circular reference

**File:** `apps/api/src/db/auditAllowlist.ts:108-118`

**Issue:** The Session allowlist includes `userId` (line 112), and `resolveEntityId('Session', row)` uses `row.userId` as the entityId. So userId appears TWICE in the audit row: once as the resolved `entityId` and once as the `userId` field inside the `after` JSON. This is internally consistent — but the comment on lines 109-111 says "id excluded: id IS the raw signed session token" without flagging that the userId field is redundantly stored in two places. A reviewer skimming might mistake one occurrence for a bug.

**Fix:** Either drop `userId` from the Session allowlist (entityId already carries it via resolveEntityId), or add a comment justifying the duplication ("entityId is the search key; userId in after-json keeps the snapshot self-describing").

---

### WR-09: `AuditDiffPanel.copyPermalink` swallows clipboard rejection in unhandled promise

**File:** `apps/web/src/routes/admin/AuditDiffPanel.tsx:127-149`

**Issue:**
```typescript
// eslint-disable-next-line @typescript-eslint/no-floating-promises
const p = navigator.clipboard.writeText(url);
p.then(() => toast.success('Permalink kopierad.'))
  .catch(() => toast.error('Kunde inte kopiera permalink.'));
```
This works, but the variable `p` is unused after the `.then().catch()` chain (the result of the chain is discarded). Also, `navigator.clipboard.writeText` is rejected in non-secure contexts (http://) and in some embedded WebViews — the user sees only "Kunde inte kopiera permalink" with no diagnostic. The eslint-disable for `no-floating-promises` is masking the fact that the chain itself is floating (the comment is misleading; `p.then().catch()` returns a new promise that IS being discarded).

**Fix:**
```typescript
async function copyPermalink() {
  // ... build URL ...
  if (!navigator.clipboard) {
    toast.error('Kunde inte kopiera permalink.');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Permalink kopierad.');
  } catch {
    toast.error('Kunde inte kopiera permalink.');
  }
}
```

---

### WR-10: `AuditTable` and `AuditCardList` rebuild siblingCounts on every render

**File:** `apps/web/src/routes/admin/AuditTable.tsx:54-60` and `apps/web/src/routes/admin/AuditCardList.tsx:31-36`

**Issue:** Both components compute `siblingCounts` outside `useMemo`. On every parent re-render (filter change, expand toggle, fetch), the Map is rebuilt. For 50 events per page, this is cheap — but every `toggleExpand` triggers a full re-render of the table, which re-allocates this Map for no reason. Acceptable for v1, but the comment "O(N) per page-set is acceptable for v1's page-size 50" assumes ONE pass per page-load, which isn't true.

**Fix:** Wrap in `useMemo`:
```typescript
const siblingCounts = useMemo(() => {
  const m = new Map<string, number>();
  for (const ev of events) {
    if (!ev.requestId) continue;
    m.set(ev.requestId, (m.get(ev.requestId) ?? 0) + 1);
  }
  return m;
}, [events]);
```
Out-of-scope under v1 perf guidance, but worth fixing while the file is open.

---

## Info

### IN-01: Dead/unused import — `void AUDIT_ALLOWLIST` workaround

**File:** `apps/api/src/db/auditExtension.ts:302-306`

**Issue:** `void AUDIT_ALLOWLIST` at the bottom of the file suppresses an unused-import warning. But `AUDIT_ALLOWLIST` IS imported at line 5 and IS used indirectly through `filterAllowlist` — which is itself imported. The `void` statement is misleading; the symbol could simply be removed from the import list since `filterAllowlist` is the actual entry point.

**Fix:** Drop `AUDIT_ALLOWLIST` from the import on line 5 and remove the `void` statement entirely.

---

### IN-02: `entityId` filter is documented but not exposed in the query schema

**File:** `packages/shared/src/contracts/audit.ts:86-93` and `apps/api/src/routes/audit/list.ts:18`

**Issue:** The route header (line 18) advertises `?actor=...&entity=...&action=...&requestId=...&cursor=...&limit=50`. The Zod schema accepts `actorUserId`, `entityType`, `action`, `requestId`. There's no `entity` parameter — the URL example in the route header uses a shortened name that doesn't match the schema. FE code (`useAuditEventsQuery.ts:31`) uses the correct names; the doc-comment is just out of sync.

**Fix:** Update the doc comment to read `?actorUserId=...&entityType=...&action=...&requestId=...&cursor=...&limit=50`.

---

### IN-03: Commented-out code in `seed.ts` — duplicate `// eslint-disable-next-line no-console` everywhere

**File:** `apps/api/prisma/seed.ts` (10+ occurrences)

**Issue:** Every `console.log` in seed.ts is preceded by an inline `// eslint-disable-next-line no-console`. The seed file is the right place to log progress; either disable the rule for the whole file once at the top (`/* eslint-disable no-console */`) or change the rule scope so seed scripts can log freely.

**Fix:**
```typescript
/* eslint-disable no-console */
import { createReadStream } from 'node:fs';
// ... rest of file, drop all inline disables
```

---

### IN-04: `EmptyStateCard` body default leaks Phase 1 stub copy into Phase 5 callers that forget the body prop

**File:** `apps/web/src/components/EmptyStateCard.tsx:32-35`

**Issue:** The default `body = 'Den här vyn fylls i nästa fas.'` is correct for Phase 1 stub pages but wrong for any Phase 5+ caller that forgets to pass a body. A `<EmptyStateCard icon={X} heading="Inga händelser ännu" />` will render "Den här vyn fylls i nästa fas." — actively wrong for shipped Phase 5 features. Today's only Phase 5 caller (`AuditPage:128-132`) passes the body, but the default is a foot-gun.

**Fix:** Make `body` required, or change the default to a non-Phase-1-specific generic string like `''`. If kept, document the trade-off explicitly.

---

### IN-05: Diff summary `pickPrimaryKey` non-null assertion is unguarded

**File:** `apps/web/src/routes/admin/auditDiffSummary.ts:62-66`

**Issue:**
```typescript
function pickPrimaryKey(changedKeys: string[]): string {
  if (changedKeys.includes('status')) return 'status';
  if (changedKeys.includes('currentStock')) return 'currentStock';
  return [...changedKeys].sort()[0]!;
}
```
The `sort()[0]!` non-null assertion holds only if `changedKeys.length > 0` — which the caller (line 87-88) guards. But if `pickPrimaryKey` is ever called with an empty array directly, `sort()[0]` returns `undefined` and the `!` lies to TypeScript. The diff panel would then render `undefined: ...` to users.

**Fix:** Add an explicit guard:
```typescript
function pickPrimaryKey(changedKeys: string[]): string {
  if (changedKeys.length === 0) return '';
  if (changedKeys.includes('status')) return 'status';
  // ...
}
```

---

### IN-06: `audit.integration.test.ts` git-grep test does not exclude planning artifacts

**File:** `apps/api/test/audit.integration.test.ts:157-180`

**Issue:** The grep command:
```typescript
['grep', '-nE', String.raw`prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b`, '--', 'apps', 'packages']
```
This DOES exclude `.planning/`, good. But it does NOT exclude test files themselves — if a future debug test directly uses `prisma.auditEvent.deleteMany` to clean up between tests, the test will fail. The current code has no such usage, but the lint surface is brittle.

**Fix:** Document the test's contract explicitly in a header comment: "If you need to delete audit rows for test cleanup, use `$executeRawUnsafe` with a SECURITY DEFINER bypass, NOT `prisma.auditEvent.deleteMany`." Or scope the grep to `apps/api/src` + `apps/web/src` + `packages/*/src` (i.e., exclude tests).

---

### IN-07: TypeScript `any` casts inside audit extension scatter type-safety holes

**File:** `apps/api/src/db/auditExtension.ts:74, 134, 162, 198, 227, 264`

**Issue:** Six `eslint-disable-next-line @typescript-eslint/no-explicit-any` markers, mostly to work around Prisma's strict typing for dynamic model access (`(client as any)[propName]`). Each one is justified individually, but the cumulative effect is a file where ~10% of the lines are `any`-related. The `LooseQueryHandlers = any` type alias makes the whole handler map untyped at the runtime contract. A typo in a model name (`carUnitMedication` instead of `careUnitMedication`) would compile and silently miss audit coverage.

**Fix:** Build the handlers with explicit per-model types (Prisma exports `Prisma.MedicationDelegate` etc.) and use a typed registry. Out-of-scope for this fix-up but worth a follow-up issue.

---

_Reviewed: 2026-05-22T18:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
