---
phase: 05-audit-log-gap-closure
reviewed: 2026-05-22T21:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - README.md
  - apps/api/prisma/migrations/20260522210000_0009_audit_events_purge_orphans/migration.sql
  - apps/api/src/db/auditExtension.ts
  - apps/api/src/db/client.ts
  - apps/api/src/plugins/errorHandler.ts
  - apps/api/src/plugins/requestContext.ts
  - apps/api/src/routes/auth.ts
  - apps/api/src/services/audit.service.ts
  - apps/api/src/services/auth.service.ts
  - apps/api/test/audit.integration.test.ts
  - packages/shared/src/constants/auditEntityType.ts
findings:
  critical: 4
  warning: 9
  info: 5
  total: 18
status: issues_found
---

# Phase 5 Gap Closure: Code Review Report (Plans 05-04 + 05-05)

**Reviewed:** 2026-05-22T21:00:00Z
**Depth:** standard
**Files Reviewed:** 10 (gap-closure diff vs base `5dd2015`)
**Status:** issues_found

## Summary

Plans 05-04 + 05-05 set out to close CR-01 (D-91 same-tx audit contract), CR-02
(cursor error taxonomy), CR-04 (logout actor attribution), and WR-07 (failed-login
entityType). The executor closed the surface symptom of CR-01 with a real
regression test, fixed CR-02 and CR-04 cleanly, and addressed WR-07 partially.

**However, the deviation from the planned `Prisma.getExtensionContext(this)`
approach to an "activeTx ALS slot + runtime `patchTransactionForAudit`" pattern
introduces new race + nesting hazards that the regression test does not cover.**
The current single-threaded happy path passes; nested or concurrent
`prisma.$transaction(...)` calls within the same request will corrupt audit
attribution and re-introduce the very orphan-row class of bug that 05-04
purportedly closes. Migration 0009 also documents itself as idempotent when
it is in fact destructive on re-run, and WR-07's fix only updated one of the
two failed-login branches, leaving the audit taxonomy internally inconsistent.

Four BLOCKERs, nine WARNINGs, five INFOs.

## Critical Issues

### CR-01: `patchTransactionForAudit` does not save/restore `activeTx` — nested or sibling transactions corrupt audit attribution

**File:** `apps/api/src/db/auditExtension.ts:344-385` (the `$transaction` patch)

**Issue:** The runtime patch sets `store.activeTx = tx` before the user callback
and clears it with `store.activeTx = undefined` in `finally`. This is asymmetric
with the proven `withActionOverride` pattern in the same codebase
(`requestContext.ts:118-126`), which saves `previous = store.actionOverride`
and restores it in `finally`. The asymmetry creates two real failure modes:

1. **Nested `$transaction` clobbers the outer tx slot.** If any service ever
   does `prisma.$transaction(async (outer) => { ... await prisma.$transaction(async (inner) => {...}); ... })`,
   the inner patch invocation overwrites `store.activeTx = inner`, then on
   inner-finally sets `store.activeTx = undefined`. The outer block's
   *remaining* mutations (the `... ` after the inner finishes) then resolve
   `activeClient = store.activeTx ?? client === client` — back to the **root
   pool**. We have just re-introduced the original CR-01 orphan-audit-row
   bug for the outer tx's tail mutations.

2. **Concurrent sibling `$transaction` calls within the same request share
   one slot.** `als.enterWith` produces a single mutable store per request
   (see also CR-04 below). If any code does
   `await Promise.all([prisma.$transaction(fnA), prisma.$transaction(fnB)])`,
   both patches race on the same `store.activeTx` slot. The second push
   clobbers the first, then either finally sets it back to `undefined`,
   pulling the rug out from under audit writes that are still in flight
   in the other branch.

The fix exposes the design flaw the executor's SUMMARY admits: D-91 spec'd a
**per-call-bound** context (`Prisma.getExtensionContext(this)`); the
implementation substitutes a **shared mutable slot**. These are not
"functionally equivalent" — they have different concurrency contracts. Today
no service nests transactions or runs them in parallel, so the contract
violation is latent — but the Plan 05-04 SUMMARY claims D-91 "now holds in
code", which is only true under the unverified assumption that no future
caller nests or parallelizes.

**Fix:**
1. Save/restore symmetrically:
```typescript
const previous = store.activeTx;
store.activeTx = tx;
try {
  return await fnOrOps(tx);
} finally {
  store.activeTx = previous;
}
```
2. Add a regression test that nests `prisma.$transaction` inside another
`prisma.$transaction` and asserts the outer's tail mutation writes its audit
row through the OUTER tx (verify by forcing an outer-tail rollback after
inner-success and asserting zero audit rows for the outer tail).
3. Add a second test running two `prisma.$transaction` calls via `Promise.all`
inside one `als.run` and asserting each tx's audit rows belong to its own
mutation (no cross-attribution).

---

### CR-02: Migration 0009 self-describes as "idempotent re-run safe" but is destructive on every re-run

**File:** `apps/api/prisma/migrations/20260522210000_0009_audit_events_purge_orphans/migration.sql:46-52, 66-69`

**Issue:** Step 2 executes:
```sql
DELETE FROM "AuditEvent" WHERE "createdAt" < CURRENT_TIMESTAMP;
```
The header comment at lines 46-52 claims:
> Re-running this migration is a no-op: the second run's DELETE targets rows
> older than the re-run timestamp, which will be the post-fix rows (if any) —
> in practice zero rows because the fixed extension only writes correct rows.

This is wrong. `CURRENT_TIMESTAMP` is **the moment of execution**, not the
moment of original migration apply. Every row written between the first
apply and any second apply has `createdAt < CURRENT_TIMESTAMP-on-re-run`, so
the second apply **deletes them all** — including all correct, post-fix
audit history. Step 1 disables the trigger before the DELETE, so there is
no DB-layer guard.

Prisma's migration system prevents re-application by default, but operators
hit this in practice via:
- `prisma migrate resolve --rolled-back <name>` followed by `migrate deploy`
  (a documented recovery workflow);
- manual application via raw `psql` (the file is checked-in SQL);
- `prisma migrate reset` in non-prod (intentional wipe — but the comments
  give the impression this is also safe in prod);
- any future automated migration replay (audit replicas, DR drills).

The comment "in practice zero rows because the fixed extension only writes
correct rows" conflates "the post-fix extension doesn't write orphans" with
"the migration only deletes orphans." The migration does not distinguish
orphans from history; it deletes by timestamp.

**Fix:** Either gate the DELETE on a marker (`pg_advisory_lock` + a row in a
`schema_migrations_audit_purge` table that records the cutoff timestamp from
first apply), OR change the DELETE to an explicit one-shot:
```sql
-- Bound to the FIRST apply: load cutoff from a metadata row created during
-- this migration's own DDL prologue, NOT CURRENT_TIMESTAMP at each re-run.
DELETE FROM "AuditEvent" WHERE "createdAt" < <first_apply_cutoff>;
```
At minimum, rewrite the comment block to read:
> WARNING: re-running this migration deletes ALL existing audit rows. It is
> meant to be applied once. Operators triggering re-application must
> understand the data loss implications.

The Step 4 trigger-state guard does NOT protect against this — by the time
Step 4 runs, the DELETE has already obliterated history.

---

### CR-03: `auth.login_failed` taxonomy is internally inconsistent — WR-07 only fixed one of two failure branches

**File:** `apps/api/src/services/auth.service.ts:60-73` (unknown-email branch, FIXED)
and `apps/api/src/services/auth.service.ts:85-98` (known-user-wrong-password
branch, UNCHANGED)

**Issue:** Plan 05-05's WR-07 fix updated the unknown-email branch to write
`entityType: 'auth_attempt', entityId: email`, but left the
known-user-wrong-password branch at `entityType: 'session', entityId: user.id`.
Both branches write the **same `action: 'auth.login_failed'`**. Net effect:

- Admin filter `?entityType=auth_attempt&action=auth.login_failed` surfaces
  ONLY the unknown-email failures.
- Admin filter `?entityType=session&action=auth.login_failed` surfaces ONLY
  the known-user-wrong-password failures.
- The "brute force against alice@example.test" forensic question (the
  motivating use case quoted in the WR-07 fix's comment block at
  `auth.service.ts:55-59`) is answerable only for unknown emails — by
  definition the LESS interesting case, since unknown emails are likely
  enumeration probes, while known-user-wrong-password is the actual
  credential-stuffing signal.

The test suite enshrines this inconsistency: Test 11
(`audit.integration.test.ts:432-460`) explicitly asserts
`entityType === 'session'` for the known-user branch under the banner
"protects the unchanged convention." Anyone who later fixes the
inconsistency will have to update this test, which the comment frames as
"accidental regression."

Worse, the known-user branch comment block (`auth.service.ts:80-84`)
explicitly invokes `resolveEntityId` semantics ("for Session writes
entityId is the User.id per resolveEntityId — we mirror that convention
here even though the `$extends` path isn't involved") — but no Session row
exists for a wrong-password attempt. The entityType label is factually
wrong: there is no session.

**Fix:** Use `entityType: 'auth_attempt'` for both branches; pick `entityId`
consistently (the attempted email is forensically richest; `user.id` if you
prefer the database key for known users). Then either:
- a single value: always email → admin filters get one consistent
  taxonomy and the brute-force banner v2 (mentioned in README at line 350)
  has a single index dimension; OR
- two related values: `entityId: user.id` for known-user, `entityId: email`
  for unknown — but document this disambiguation in the entityType label
  ("auth_attempt:user_id" vs "auth_attempt:email") OR via a new column /
  `before` JSON field; do not silently reuse the same entityType with
  different entityId semantics.

Update Test 11 to assert the new contract.

---

### CR-04: `als.enterWith` cross-request leakage now has materially worse blast radius

**File:** `apps/api/src/plugins/requestContext.ts:135-159` (still `als.enterWith`)
and `apps/api/src/db/auditExtension.ts:369-377` (the new `activeTx` write into
the shared store)

**Issue:** The prior 05-REVIEW.md flagged `als.enterWith` (vs `als.run`) as a
WARNING-level cross-request leak risk (WR-01). Plan 05-04 did not address this
and instead added a NEW mutable slot (`activeTx`) to the same shared-store
design. The pre-existing leak risk now carries a much sharper consequence: a
keep-alive HTTP request that escapes the original `enterWith` scope will,
mid-async-tail, observe a *subsequent* request's `activeTx` value and route
its audit-row INSERT through the wrong transaction client.

Concretely, in Fastify's keep-alive connection model:
1. Request A's onRequest enters the ALS store with A's actor + requestId.
2. Request A starts a slow `prisma.$transaction(...)` — `store.activeTx = txA`.
3. Request A is still resolving its tx callback when Request B arrives on
   the same TCP connection. B's onRequest calls `als.enterWith({...B values})`
   — but because A's async chain has not yielded back to the event loop in
   a way that creates a new async resource boundary, A's continuation may
   resolve into B's store.
4. A's audit handler reads `store.activeTx` and finds — at best `undefined`
   (B has not opened a tx), at worst `txB` (B has). The audit row is
   written through the wrong tx or against the root pool.

The single-store mutable-slot design makes this risk severe for D-91: it is
no longer "the actor label is wrong"; it is "the audit row may commit or
roll back with a different mutation than the one it claims to describe."

This combines with CR-01 and CR-03 to make the D-91 guarantee unprovable
under load — exactly the property the §6 interview answer ("the audit log
doesn't lie") depends on.

**Fix:** Switch from `enterWith` to `als.run` and wrap the entire route
handler dispatch in the `run` callback. The Fastify pattern is to register
the ALS scope at the `onRequest` hook with a `done()` continuation that
runs the rest of the lifecycle inside `als.run`. The README "what I'm
proud of" passage at line 309-316 lists "Postgres GRANTs + BEFORE-trigger"
as the append-only proof; that proof remains valid, but the D-91 claim
("the audit log doesn't lie about what actually happened") at line 286-290
requires fixing this concurrency contract before it can be defended in
the interview.

The fix is non-trivial — Fastify's `onRequest` hooks don't naturally wrap
the rest of the pipeline in a continuation. The two options are:
1. Use `app.addHook('onRequest', (req, reply, done) => als.run(scope, done))`
   and verify Fastify's done-callback contract preserves the ALS frame
   through subsequent hooks (preHandler, handler, onSend);
2. Document this as a known v1 gap matching the §"What I'm least proud
   of" pattern, mention it explicitly in README, and add a concurrency
   smoke test that fires N parallel requests through the same keep-alive
   connection and asserts no cross-request audit-row contamination.

---

## Warnings

### WR-01: `auth.ts` doubles logout DB load (now read + write per logout) without performance disclosure

**File:** `apps/api/src/routes/auth.ts:60-88`

**Issue:** Pre-CR-04 logout was one DB write (`session.deleteMany`). Post-fix
logout is `findSessionById` (read) + `destroySession` (`deleteMany`). On every
logout, regardless of whether the cookie is valid. For a session-fixation
attacker spamming `DELETE /api/auth/session` with random cookies, each request
now performs a DB roundtrip even though the result is the same 204. This is
a DoS amplification factor of 2x with no rate-limit guard.

The cost is also paid by legitimate clients (every logout button click).

**Fix:** Make the lookup conditional on at least the basic cookie shape
validation already in place (line 63: `unsigned.valid && unsigned.value`).
That is already done — so this is a known cost. Document the trade-off in
the route header comment: "logout costs 1 read + 1 deleteMany; the read is
required to attribute the auth.logout audit row." Consider rate-limiting
logout at the Fastify layer if the audit log shows high-volume probes.

---

### WR-02: `auth.ts` calls `setActor` with possibly-orphaned `session.userId` when User row was deleted out-of-band

**File:** `apps/api/src/routes/auth.ts:75-78`

**Issue:** `findSessionById` returns a Session row regardless of whether
its `userId` foreign key still points at an existing User. (The schema's
FK is `ON DELETE CASCADE` — see `schema.prisma` — so this is usually
prevented, but if a future change loosens that to `SET NULL` or if a
stale Session row survives a DB recovery, `setActor` will populate the
ALS store with a non-existent `actorUserId`.) The `$extends` middleware
then writes an `auth.logout` audit row with a dangling foreign-key
`actorUserId`. The audit row's `actor` JOIN on the read endpoint will
return null with no diagnostic, masking the data inconsistency.

**Fix:** Defensive sanity check before `setActor`:
```typescript
const session = await findSessionById(unsigned.value);
if (session !== null) {
  // Verify the user still exists before attributing the audit row.
  // A dangling session.userId reference is an invariant violation we
  // want to surface, not silently absorb.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  if (user) {
    setActor(session.userId, session.careUnitId, req.ip ?? null);
  } else {
    req.log.warn({ sessionId: unsigned.value, userId: session.userId },
      'logout: session.userId points at non-existent User');
  }
}
```
Or rely on the FK CASCADE invariant and assert it in a startup health check.

---

### WR-03: `decodeCursor` still ignores upper-bound on `createdAt` (WR-06 from prior review carried over)

**File:** `apps/api/src/services/audit.service.ts:68-92`

**Issue:** Plan 05-05 fixed the reason-code copy-paste (CR-02) but did not
address the pre-existing WR-06: an admin can supply a cursor with
`createdAt = year-3000`, which passes `Date.parse(createdAt)` (not NaN),
constructs `{createdAt: {lt: futureDate}}`, and trivially page-zero-restarts.
The cursor is also unsigned — any admin can edit the base64 to skip arbitrary
pages, leaking nothing they couldn't otherwise see, but enabling
test-suite forgery and obscuring intent in audit logs.

**Fix:** Either HMAC-sign the cursor against `COOKIE_SECRET`, or reject
cursors with `createdAt > Date.now() + 60_000`:
```typescript
if (Date.parse(createdAt) > Date.now() + 60_000) {
  throw new ValidationFailedError('Ogiltig cursor.', { reason: 'invalid_cursor' });
}
```

---

### WR-04: `patchTransactionForAudit` accepts overly permissive generic bound

**File:** `apps/api/src/db/auditExtension.ts:344-345`

**Issue:**
```typescript
export function patchTransactionForAudit<T extends { $transaction: unknown }>(
  extendedClient: T,
): T {
  const original$transaction = (extendedClient as any).$transaction.bind(extendedClient);
```
`{ $transaction: unknown }` accepts ANY object where `$transaction` is any
type — including `null`, `undefined`, or a non-function value. The
`.bind(extendedClient)` call will crash with `TypeError: Cannot read
properties of null (reading 'bind')` at runtime instead of failing at
compile time. Mocks and tests that pass partial Prisma stubs will hit this.

**Fix:** Narrow the bound:
```typescript
export function patchTransactionForAudit<
  T extends { $transaction: (...args: any[]) => Promise<any> }
>(extendedClient: T): T {
```

---

### WR-05: `auth.service.ts` action override leak path on throw between login set/clear

**File:** `apps/api/src/services/auth.service.ts:109-122`

**Issue:** The login flow sets `store.actionOverride = 'auth.login'`
(line 113) and clears it after `createSession` (line 121). If
`createSession` throws (DB error, unique constraint, etc.), the
`actionOverride` is NOT cleared — control returns up the stack with the
override still set on the ALS store. Subsequent operations in the same
request (none expected, since login throws on failure) inherit the
`auth.login` override. The risk is small in practice (the same request
would terminate), but the pattern is inconsistent with
`withActionOverride` (which uses try/finally) and the new `logout`
function (which DOES use try/finally — `auth.service.ts:144-150`).

**Fix:** Wrap in try/finally:
```typescript
if (store) {
  store.actionOverride = 'auth.login';
}
let session: Session;
try {
  session = await createSession(user.id, user.careUnitId);
} finally {
  if (store) store.actionOverride = undefined;
}
```

---

### WR-06: README documentation drift — `patchTransactionForAudit` location misstated

**File:** `README.md:201-204`

**Issue:** README states: "The extension intercepts `$transaction` calls
at runtime (via `patchTransactionForAudit` in
`apps/api/src/db/client.ts`)" — but `patchTransactionForAudit` is
defined in `apps/api/src/db/auditExtension.ts:344`. `client.ts` only
*calls* it. The Plan 05-04 commit message and SUMMARY mention this
relocation but the README's pointer was not updated.

**Fix:** Replace "in `apps/api/src/db/client.ts`" with "defined in
`apps/api/src/db/auditExtension.ts`, applied once in `apps/api/src/db/client.ts`".

---

### WR-07: Migration 0009's `WHEN OTHERS THEN NULL` blocks swallow all exception classes, not just "trigger absent"

**File:** `apps/api/prisma/migrations/.../migration.sql:57-64, 73-79`

**Issue:** Both DO-blocks catch `WHEN OTHERS THEN NULL`, with inline
comments framing this as "swallow: trigger absent, already disabled, or
table missing." But `WHEN OTHERS` in plpgsql catches **everything** —
permission errors, lock timeouts, connection failures, anything that
isn't a `RAISE` from `RAISE EXCEPTION`. If a privilege error prevents
DISABLE TRIGGER on Step 1, the DELETE then proceeds anyway, only to fail
or succeed with the trigger still active (in the failure case, it
silently does nothing useful and Step 4 catches that). In the rarer
case where Step 3's re-enable fails for any reason other than
"already enabled," Step 4's gate fires and rolls back — good — but only
if `pg_trigger.tgenabled <> 'D'` correctly captures the failure mode.

The Step 4 gate is the saving grace, but the catch-all `WHEN OTHERS`
makes the migration's failure mode opaque to operators.

**Fix:** Narrow the EXCEPTION blocks to specific SQLSTATE classes:
```sql
EXCEPTION
  WHEN object_not_in_prerequisite_state THEN NULL; -- trigger absent / already disabled
  WHEN undefined_table THEN NULL; -- table missing on fresh DB
  -- All other exceptions propagate up; migration transaction aborts.
END $$;
```

---

### WR-08: `audit.service.ts` cursor decode bypasses Zod refinement on `requestId` filter

**File:** `apps/api/src/services/audit.service.ts:130-136` and contract
`packages/shared/src/contracts/audit.ts:90`

**Issue:** `auditEventListQuery` declares `requestId: z.string().optional()`
(open), so a client can supply `?requestId=' OR 1=1 --`. Prisma parameterizes
the value safely against SQL injection, but the filter is unbounded —
any string value is accepted and round-trips through the `where AND`
clause. An admin scanning by requestId could be tricked into rendering
poisoned values (the FE displays the requestId in the chip primitive
`RequestIdGroupChip.tsx` per AUDIT-02 spec). XSS risk depends on FE
sanitization which is out of this review scope.

**Fix:** Tighten the schema to a UUID shape (which is what
`requestContext.ts:144` emits via `randomUUID`):
```typescript
requestId: z.string().uuid().optional(),
```
This both rejects garbage and prevents future misuse.

---

### WR-09: Test suite enshrines the WR-07 inconsistency as a "regression protection" test

**File:** `apps/api/test/audit.integration.test.ts:432-460` (Test 11)

**Issue:** See CR-03 above. Test 11's header comment says it "guards
against accidental regression" of the known-user-wrong-password branch
keeping `entityType: 'session'`. This is back-projecting; the test
should instead be marked with a `// TODO: align with WR-07 — see CR-03
in 05-gap-closure REVIEW` comment so future readers understand the
inconsistency was knowingly preserved by Plan 05-05's reading of WR-07.

**Fix:** Add the TODO comment with a link to this review, OR fix
the underlying inconsistency per CR-03 and update Test 11 to assert
the new contract.

---

## Info

### IN-01: Initialization of `activeTx` is implicit / undocumented in `enterWith`

**File:** `apps/api/src/plugins/requestContext.ts:152-158`

**Issue:** The `als.enterWith({...})` literal does not include `activeTx`
— relying on TypeScript's optional-field semantics and the per-handler
`store.activeTx ?? client` nullish coalescing. Functionally correct, but
the omission means a reader skimming `enterWith` does not see `activeTx`
declared next to `actionOverride`, breaking grep-discoverability of the
new D-91 design.

**Fix:** Add `activeTx: undefined` to the literal so the contract is
visible at the same level as `actionOverride`.

---

### IN-02: `void AUDIT_ALLOWLIST` workaround at end of `auditExtension.ts` is still present and still misleading

**File:** `apps/api/src/db/auditExtension.ts:387-391`

**Issue:** Same as IN-01 in the prior 05-REVIEW.md — the `void
AUDIT_ALLOWLIST` statement at the end of the file is a workaround for an
unused-import warning, but `AUDIT_ALLOWLIST` is imported and indirectly
used via `filterAllowlist`. The cleaner fix is to drop the import.

**Fix:** Drop `AUDIT_ALLOWLIST` from line 5's import and delete the
`void` statement on line 391.

---

### IN-03: `writeAuditRow` filteredBefore/filteredAfter truthy gate fails for empty objects

**File:** `apps/api/src/db/auditExtension.ts:317-318`

**Issue:**
```typescript
if (filteredBefore) data.before = filteredBefore;
if (filteredAfter) data.after = filteredAfter;
```
The truthy-gate passes `{}` (an empty object is truthy). If a future
allowlist tightening shrinks `AUDIT_ALLOWLIST[model]` to zero keys, the
filter returns `{}` and the audit row stores `before: {}` rather than
`before: null`. Harmless today (all models have non-empty allowlists),
but the gate should be on emptiness:
```typescript
if (filteredBefore && Object.keys(filteredBefore).length > 0) {
  data.before = filteredBefore;
}
```

---

### IN-04: `audit.integration.test.ts` cleanup of audit rows is implicit, leaks across tests in non-isolated runs

**File:** `apps/api/test/audit.integration.test.ts:81-83`

**Issue:** `beforeEach(async () => { await resetSessions(); })` resets
sessions but not audit rows. Each test relies on `where: { createdAt:
{ gte: testStartedAt } }` filters to isolate its rows. This is fine for
serial test runs but vulnerable to clock drift (`testStartedAt` captured
in JS, audit row `createdAt` set by Postgres — different sources). The
windowing also leaks across the file: a row from Test 1 created at
T+50ms can be visible in Test 2 if `testStartedAt` for Test 2 is T+0ms
(possible if Vitest reuses the JS clock too aggressively).

**Fix:** Either capture `testStartedAt` from the DB (`SELECT
CURRENT_TIMESTAMP`) or accept this as a known quirk and document the
serial-runs assumption at the top of the file.

---

### IN-05: `auditEntityType.ts` enum widened without a matching DB CHECK constraint

**File:** `packages/shared/src/constants/auditEntityType.ts:21-29`

**Issue:** `AUDIT_ENTITY_TYPES` now includes `'auth_attempt'` (good for
the FE label map). The DB schema `AuditEvent.entityType` is `String NOT
NULL` with no CHECK constraint — any string can be written, so the
shared constant is a one-sided contract. If a future code path writes
`entityType: 'auth_atempt'` (typo), it persists silently and breaks
admin filtering. The README at line 230-236 documents the audited model
table but does not declare that `entityType` is a closed set.

**Fix:** Add a CHECK constraint in a future migration:
```sql
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_entityType_check"
  CHECK ("entityType" IN ('medication', 'care_unit_medication', 'order',
    'order_line', 'user', 'session', 'auth_attempt'));
```
Or accept the open-string contract explicitly and document it.

---

_Reviewed: 2026-05-22T21:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
