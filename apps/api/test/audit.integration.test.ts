import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

// Resolve repo root from this test file's location:
// test/audit.integration.test.ts → apps/api → apps → repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
import { actorALS } from '../src/plugins/requestContext.js';
import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
  TEST_ADMIN,
  buildTestApp,
  captureSessionCookie,
  createEmptyOrder,
  ensureAllRolesSeeded,
  findTestCareUnitMedication,
  loginAs,
  prisma,
  progressOrderToBekraftad,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 5 Plan 03 — Audit log integration tests.
 *
 * 17 tests across 7 describe blocks covering AUD-01 / AUD-02 / AUD-03 with
 * the threat-model assertions T-05-02 (append-only) and T-05-03 (session
 * id leak via entityId), plus Plan 05, Plan 06, Plan 08, and Plan 09
 * gap-closure regression tests.
 *
 *   AUD-01 — full pipeline coverage
 *     Test 1: create draft → submit → confirm → deliver writes the
 *             canonical 4+N audit-row set; the deliver row and its
 *             stock.increment siblings share one requestId (D-94).
 *     Test 2: A forced rollback inside prisma.$transaction leaves zero audit
 *             rows for the rolled-back mutation (D-91 rollback contract —
 *             "the audit log doesn't lie"). Replaces the pre-CR-01 test
 *             which threw a validation error BEFORE reaching the audit-write
 *             site; the new test issues a mutation that SUCCEEDS first, then
 *             forces a throw, exercising the actual rollback path.
 *     Test 12 (CR-01): nested $transaction with outer-rollback after inner-commit.
 *             Outer-tx audit row is 0 (rolled back — CR-01 fixed). Inner-tx audit
 *             row is 1 (independent Prisma transaction committed before outer throw).
 *             Verifies activeTxStack correctly routes each tx's audit INSERTs; the
 *             pre-fix bug was the outer's row escaping to the root client after the
 *             inner's finally-block cleared activeTx to undefined.
 *             Plan 06 regression test for 05-REVIEWS.md HIGH #1 + HIGH #2.
 *     Test 13 (CR-01): parallel $transaction (Promise.all + setImmediate forced
 *             event-loop interleaving) writes one audit row per tx with no
 *             cross-attribution — hard CUM count assertion per LOW #16,
 *             no silent skip.
 *
 *   AUD-03 — append-only enforcement (two layers asserted together)
 *     Test 3: `git grep` finds zero `prisma.auditEvent.update`,
 *             `delete`, `updateMany`, `deleteMany`, or `upsert` calls
 *             in `apps/` and `packages/` (Layer 1 — architectural
 *             absence).
 *     Test 4: DB-layer rejection — UPDATE rejected with permission denied;
 *             runtime role is meditrack_app (named-role REVOKE binds, Layer 2b);
 *             owner role also rejects via trigger (Layer 2a, Plan 05-07 HIGH #3).
 *             Asserts: (a) current_user === 'meditrack_app', (b) meditrack_app
 *             lacks UPDATE privilege on AuditEvent, (c) if DIRECT_URL is set,
 *             the owner role (meditrack) ALSO rejects UPDATE via the trigger.
 *     Test 15: CI grep — no off-allowlist prisma.$executeRaw* in apps/ or
 *             packages/ (05-REVIEWS.md MEDIUM #5). Allowlist is hardcoded in
 *             the test; empty at Phase 5 close because Phase 4 D-79's FOR
 *             UPDATE uses $queryRaw (READ form), not $executeRaw (WRITE form).
 *             New off-allowlist matches fail the test; PR must add to allowlist
 *             with a reason or refactor to a Prisma model method.
 *     Test 16: DB-layer empty-entityId trigger rejection — INSERT with
 *             entityId='' rejects with SQLSTATE 23514 'must be a non-empty
 *             string' (05-REVIEWS.md LOW #12, migration 0011 backstop for
 *             Plan 05-05's WR-07 application-code fix). Runs via DIRECT_URL
 *             (owner role) because the trigger fires regardless of the role
 *             at the DB layer. Skipped if DIRECT_URL is unset.
 *
 *   AUD-01 — sensitive-field redaction (D-97 + T-05-03)
 *     Test 5: The `auth.login` audit row's `after` JSON does NOT contain
 *             `passwordHash` — the User model's allowlist excludes it.
 *     Test 7: The `auth.login` AND `auth.logout` audit rows' `entityId`
 *             column equals the actor User.id, NEVER the raw signed
 *             session token (Session.id). Closes the second leak path:
 *             the allowlist closes the `after` JSON leak; resolveEntityId
 *             closes the `entityId` column leak. Both layers MUST hold.
 *     Test 9 (CR-04): auth.logout audit row carries actorUserId equal to
 *             the session owner User.id (D-92 / CR-04). Pre-fix: the
 *             route never called setActor() before destroySession.
 *
 *   AUD-01 — failed-login entityType taxonomy (WR-07 + CR-03)
 *     Test 10: unknown-email failed-login writes entityType=auth_attempt
 *              with entityId=email (was entityType='session', entityId='').
 *     Test 11: known-user-wrong-password ALSO writes entityType=auth_attempt
 *              with entityId=email (CR-03 unified taxonomy across both
 *              failed-login branches); actorUserId distinguishes the two
 *              cases (set for known-user, null for unknown-email).
 *
 *   AUD-02 — admin-only access
 *     Test 6: `GET /api/audit/events` returns 403 for sjuksköterska,
 *             403 for apotekare, 200 for admin (requirePermission gate).
 *
 *   AUD-02 — cursor error envelope (CR-02)
 *     Test 8: GET /api/audit/events with a malformed cursor responds 422
 *             with details.reason === 'invalid_cursor' (not 'invalid_quantity').
 *
 *   AUD-01 — parallel actorALS-frame isolation (CR-04, W10 reframing per checker feedback)
 *     Test 14 (CR-04, W10): parallel actorALS-frame isolation under one Fastify app
 *             instance — three CONCURRENT logouts via Promise.all + app.inject each
 *             commit their own actorALS frame. Per-row assertions on actorUserId /
 *             entityId / distinct requestIds confirm no cross-attribution under
 *             concurrent keep-alive execution. Tests 7+9 verify sequential routing;
 *             Test 14 verifies parallel-frame isolation (the novel contract).
 *
 *   AUD-01 — failed-login tx-isolation invariant (Plan 09 / 05-REVIEWS.md MEDIUM #7 + LOW #19)
 *     Test 17: tx-isolation invariant — auth.login_failed audit row commits OUTSIDE
 *             any wrapping prisma.$transaction (05-REVIEWS.md MEDIUM #7 + LOW #19).
 *             Codifies the inline INVARIANT comment at auth.service.ts's two
 *             auth.login_failed write sites — protects D-91 same-tx contract from a
 *             silent regression if a future refactor wraps verifyCredentials in a tx.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await ensureAllRolesSeeded();
});

beforeEach(async () => {
  await resetSessions();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('AUD-01 — full pipeline coverage', () => {
  it('writes audit rows for every step of create-draft → submit → confirm → deliver', async () => {
    const testStartedAt = new Date();
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const order = await createEmptyOrder(app, nurseCookie);
    const cum1 = await findTestCareUnitMedication(TEST_SJUKSKOTERSKA.careUnitId);
    await progressOrderToBekraftad(app, nurseCookie, apotekareCookie, order.id, [
      { cumId: cum1.id, quantity: 5 },
    ]);

    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });
    expect(deliverRes.statusCode).toBe(200);

    const rows = await prisma.auditEvent.findMany({
      where: { createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: 'asc' },
    });

    // At least one auth.login row (we logged in two users; could be 2).
    expect(rows.find((r) => r.action === 'auth.login')).toBeDefined();

    // One order.submit row for this order.
    const submitRow = rows.find(
      (r) => r.action === 'order.submit' && r.entityId === order.id,
    );
    expect(submitRow).toBeDefined();

    // One order.confirm row for this order.
    const confirmRow = rows.find(
      (r) => r.action === 'order.confirm' && r.entityId === order.id,
    );
    expect(confirmRow).toBeDefined();

    // One order.deliver row for this order.
    const deliverRow = rows.find(
      (r) => r.action === 'order.deliver' && r.entityId === order.id,
    );
    expect(deliverRow).toBeDefined();

    // The deliver row carries a requestId (D-92 — request-scoped uuid).
    expect(deliverRow!.requestId).toBeTruthy();

    // 1+N sibling shape (D-94): N stock.increment rows share the
    // deliver row's requestId. Single CUM, single line — N=1.
    const stockIncRows = rows.filter(
      (r) =>
        r.action === 'stock.increment' && r.requestId === deliverRow!.requestId,
    );
    expect(stockIncRows.length).toBeGreaterThanOrEqual(1);
    expect(stockIncRows.every((r) => r.requestId === deliverRow!.requestId)).toBe(true);
  });

  it('forced-rollback inside prisma.$transaction leaves zero audit rows for the rolled-back mutation (D-91)', async () => {
    const testStartedAt = new Date();

    // Resolve the test user id and careUnitId before the als.run scope.
    const testUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
      select: { id: true, careUnitId: true },
    });

    // Find a CareUnitMedication row to use as the mutation target.
    const cum = await findTestCareUnitMedication(TEST_SJUKSKOTERSKA.careUnitId);

    // Capture the current stock so we can assert it rolled back.
    const cumBefore = await prisma.careUnitMedication.findUniqueOrThrow({
      where: { id: cum.id },
      select: { currentStock: true },
    });

    // The audit extension only writes rows when the actorALS store is
    // populated (D-92). The test wraps the prisma.$transaction in an
    // actorALS.run so the extension sees an actor context — and therefore
    // WILL attempt to write an audit row inside the tx. The forced
    // throw then proves the audit row also rolled back (D-91).
    await expect(
      actorALS.run(
        {
          actorUserId: testUser.id,
          careUnitId: testUser.careUnitId,
          requestId: 'test-rollback-' + Date.now(),
          requestSource: 'test',
          ipAddress: null,
        },
        async () => {
          await prisma.$transaction(async (tx) => {
            // Successful mutation inside the tx — the audit extension
            // intercepts this and attempts to write an audit row.
            await tx.careUnitMedication.update({
              where: { id: cum.id },
              data: { currentStock: { increment: 1 } },
            });
            // Forced throw rolls back the entire tx, including any
            // audit row the extension wrote against the tx context.
            throw new Error('forced rollback');
          });
        },
      ),
    ).rejects.toThrow('forced rollback');

    // Sanity check: the stock change rolled back correctly.
    const cumAfter = await prisma.careUnitMedication.findUniqueOrThrow({
      where: { id: cum.id },
      select: { currentStock: true },
    });
    expect(cumAfter.currentStock).toBe(cumBefore.currentStock);

    // D-91 assertion: zero audit rows for the rolled-back mutation.
    const orphanRows = await prisma.auditEvent.findMany({
      where: {
        entityType: 'care_unit_medication',
        entityId: cum.id,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(orphanRows).toHaveLength(0);

    // Extra forensic clarity: no audit row with this test's requestId
    // survived either (proves it's not an entity-filter false negative).
    const orphanByRequestId = await prisma.auditEvent.count({
      where: { requestId: { startsWith: 'test-rollback-' } },
    });
    expect(orphanByRequestId).toBe(0);
  });

  it('nested $transaction: outer rollback drops outer-tx audit row; inner-committed audit row persists (CR-01)', async () => {
    // Test 12 — CR-01 regression: Plan 06 activeTxStack must correctly
    // track both outer and inner tx clients.
    //
    // THE CR-01 BUG (Plan 04 single-slot design): the inner tx's `finally`
    // block cleared `store.activeTx = undefined`. After the inner tx
    // returned, the OUTER's tail mutations found `store.activeTx === undefined`
    // and fell back to the root client (bare INSERT outside the outer tx).
    // That audit row committed even though the outer tx rolled back — an orphan.
    //
    // THE FIX (Plan 06 activeTxStack): each `prisma.$transaction` push/pops its
    // own frame via `activeTxStackALS.run([...stack, tx], fn)`. The outer
    // handler reads `outerTx` (its own frame). After the inner returns, the
    // ALS frame restores to `[outerTx]` automatically — no asymmetric clear,
    // no fall-through to the root client.
    //
    // PRISMA NESTED TRANSACTION SEMANTICS: calling `prisma.$transaction(inner)`
    // on the ROOT client from inside an outer `$transaction` callback creates a
    // NEW INDEPENDENT Postgres transaction (not a savepoint within the outer).
    // Prisma 5 has no native savepoint support for `$transaction` interactive
    // mode. Consequently:
    //   - outer tx rolls back → outerTx audit row is gone (0 expected)
    //   - inner tx commits independently → innerTx audit row persists (1 expected)
    //
    // The test therefore asserts:
    //   a) OUTER mutation (careUnitMedication) audit row: 0 rows — CR-01 bug is fixed;
    //      the outer's audit row now correctly uses outerTx and rolls back with it.
    //   b) INNER mutation (medication) audit row: 1 row — inner tx committed;
    //      the inner's audit row correctly uses innerTx and commits with it.
    //   c) stock sanity: cumAfter.currentStock === cumBefore.currentStock (outer rolled back).
    const testStartedAt = new Date();

    const testUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
      select: { id: true, careUnitId: true },
    });
    await ensureAllRolesSeeded();
    const cum = await findTestCareUnitMedication(testUser.careUnitId);
    // Read currentStock separately — findTestCareUnitMedication only returns {id, careUnitId}.
    const cumBefore = await prisma.careUnitMedication.findUniqueOrThrow({
      where: { id: cum.id },
      select: { currentStock: true },
    });
    const med = await prisma.medication.findFirstOrThrow({ where: { name: { not: '' } } });

    await expect(
      actorALS.run(
        {
          actorUserId: testUser.id,
          careUnitId: testUser.careUnitId,
          requestId: 'test-nested-' + Date.now(),
          requestSource: 'test',
          ipAddress: null,
        },
        async () => {
          await prisma.$transaction(async (outer) => {
            // Outer-tx mutation — the audit extension intercepts via outerTx.
            // activeTxStack = [outerTx]; audit row INSERT via outerTx.
            await outer.careUnitMedication.update({
              where: { id: cum.id },
              data: { currentStock: { increment: 1 } },
            });
            // Nested inner $transaction — patchTransactionForAudit intercepts
            // and pushes innerTx onto the activeTxStack: [outerTx, innerTx].
            // The handler reads innerTx (top) for this mutation.
            // Prisma creates a NEW independent transaction (not a savepoint).
            await prisma.$transaction(async (inner) => {
              await inner.medication.update({ where: { id: med.id }, data: { name: med.name } });
            });
            // Force outer rollback — outer tx and its audit row roll back.
            // The inner tx already committed (independent connection); its
            // audit row persists — that is the CORRECT expected behavior.
            throw new Error('forced outer rollback');
          });
        },
      ),
    ).rejects.toThrow('forced outer rollback');

    // Sanity: outer-tx rollback restored stock to pre-test value.
    const cumAfter = await prisma.careUnitMedication.findUniqueOrThrow({
      where: { id: cum.id },
      select: { currentStock: true },
    });
    expect(cumAfter.currentStock).toBe(cumBefore.currentStock);

    // a) OUTER audit row: 0 expected. The CR-01 fix: activeTxStack correctly
    //    routes the outer's careUnitMedication audit INSERT through outerTx.
    //    When outerTx rolls back, the audit row is gone. Pre-fix, the inner's
    //    finally-block clear caused the outer's row to fall to root client and persist.
    const outerOrphanRows = await prisma.auditEvent.findMany({
      where: {
        entityType: 'care_unit_medication',
        entityId: cum.id,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(outerOrphanRows).toHaveLength(0);

    // b) INNER audit row: 1 expected. Inner tx committed independently before
    //    the outer throw. The activeTxStack correctly pushed innerTx, so the
    //    inner's medication audit row is written via innerTx and committed.
    const innerCommittedRows = await prisma.auditEvent.findMany({
      where: {
        entityType: 'medication',
        entityId: med.id,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(innerCommittedRows).toHaveLength(1);
  });

  it('parallel $transaction: no cross-attribution with forced event-loop interleaving (CR-01)', async () => {
    // Test 13 — CR-01 regression: Plan 06 activeTxStack gives each parallel
    // $transaction its own ALS frame from the start of withActiveTx(), so
    // there is no shared mutable slot that could cause cross-attribution.
    // The setImmediate() yield inside each callback forces the event-loop to
    // interleave callbacks (LOW #13). The hard expect(cums.length >= 2)
    // prevents silent skip if the seed regresses (LOW #16).
    const testStartedAt = new Date();

    const testUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
      select: { id: true, careUnitId: true },
    });
    await ensureAllRolesSeeded();

    const cums = await prisma.careUnitMedication.findMany({
      where: { careUnitId: testUser.careUnitId, deletedAt: null },
      take: 2,
      orderBy: { id: 'asc' },
    });
    // HARD assertion per LOW #16: never silent skip. If seed regresses below
    // 2 CUMs, the test must fail loudly so the seed gap is fixed, not papered over.
    expect(cums.length).toBeGreaterThanOrEqual(2);
    const [cumA, cumB] = cums;

    await actorALS.run(
      {
        actorUserId: testUser.id,
        careUnitId: testUser.careUnitId,
        requestId: 'test-parallel-' + Date.now(),
        requestSource: 'test',
        ipAddress: null,
      },
      async () => {
        const txA = prisma.$transaction(async (tx) => {
          // Yield to the event loop AFTER starting tx-A but BEFORE the mutation
          // lands. This forces interleaving with tx-B's callback if the executor's
          // event loop would otherwise serialize them. Without this yield, the test
          // could pass on machines where the Promise microtask queue happens to drain
          // tx-A first — making the test pass-by-luck instead of by design (LOW #13).
          await new Promise<void>((r) => setImmediate(r));
          await tx.careUnitMedication.update({
            where: { id: cumA!.id },
            data: { currentStock: { increment: 1 } },
          });
        });
        const txB = prisma.$transaction(async (tx) => {
          await new Promise<void>((r) => setImmediate(r));
          await tx.careUnitMedication.update({
            where: { id: cumB!.id },
            data: { currentStock: { increment: 1 } },
          });
        });
        await Promise.all([txA, txB]);
      },
    );

    // Both transactions committed — two audit rows expected, one per CUM.
    const rows = await prisma.auditEvent.findMany({
      where: {
        entityType: 'care_unit_medication',
        entityId: { in: [cumA!.id, cumB!.id] },
        createdAt: { gte: testStartedAt },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);

    // No cross-attribution: each row's entityId matches its originating CUM.
    const rowA = rows.find((r) => r.entityId === cumA!.id);
    const rowB = rows.find((r) => r.entityId === cumB!.id);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect((rowA!.after as Record<string, unknown>).id).toBe(cumA!.id);
    expect((rowB!.after as Record<string, unknown>).id).toBe(cumB!.id);

    // Cleanup: revert the stock increments so subsequent tests are not perturbed.
    // Wrapped in actorALS.run so symmetric audit rows are written for the decrements.
    await actorALS.run(
      {
        actorUserId: testUser.id,
        careUnitId: testUser.careUnitId,
        requestId: 'test-parallel-cleanup-' + Date.now(),
        requestSource: 'test',
        ipAddress: null,
      },
      async () => {
        await prisma.careUnitMedication.update({
          where: { id: cumA!.id },
          data: { currentStock: { decrement: 1 } },
        });
        await prisma.careUnitMedication.update({
          where: { id: cumB!.id },
          data: { currentStock: { decrement: 1 } },
        });
      },
    );
  });
});

describe('AUD-03 — append-only enforcement', () => {
  it('grep finds zero prisma.auditEvent.update*/delete*/upsert calls in apps and packages', () => {
    // `git grep` exits 0 when matches found, 1 when none found, >1 on
    // hard errors. We expect 1 (no matches) — that's the architectural
    // absence assertion Layer 1 of D-98.
    let exitCode = 0;
    try {
      execFileSync(
        'git',
        [
          'grep',
          '-nE',
          String.raw`prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b`,
          '--',
          'apps',
          'packages',
        ],
        { stdio: 'pipe' },
      );
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exitCode = (err as any).status ?? 0;
    }
    expect(exitCode).toBe(1);
  });

  it('Postgres rejects UPDATE on audit_events with permission denied (D-98)', async () => {
    // Plan 01's migration 0008 installs BEFORE UPDATE/DELETE/TRUNCATE
    // triggers on AuditEvent that RAISE EXCEPTION ... USING ERRCODE='42501'
    // (the canonical SQLSTATE behind "permission denied for table").
    // Plan 05-07 adds migration 0010 which REVOKEs UPDATE/DELETE/TRUNCATE
    // FROM meditrack_app — the named runtime role. After this plan, the
    // GRANT check fires BEFORE the trigger for the meditrack_app role.
    //
    // We need a REAL row id so the BEFORE-trigger fires (FOR EACH ROW
    // triggers only fire when at least one row is affected). A login
    // attempt creates an auth.login audit row we can target.
    await loginAs(app, TEST_APOTEKARE);
    const target = await prisma.auditEvent.findFirst({
      where: { action: 'auth.login' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    expect(target).not.toBeNull();

    // Existing assertion (D-100): UPDATE is rejected with permission denied.
    // After migration 0010, this fires via the REVOKE grant-check (Layer 2b),
    // not the trigger (Layer 2a) — but the observable error is identical.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "AuditEvent" SET action = $1 WHERE id = $2`,
        'hacked',
        target!.id,
      ),
    ).rejects.toThrow(/permission denied/i);

    // Plan 05-07 HIGH #3 — extended assertions:

    // (a) Assert the runtime role is meditrack_app (proves the role swap landed).
    // The named-role REVOKE binds this role; the REVOKE is what rejected the
    // UPDATE above (Layer 2b), not the trigger (Layer 2a).
    const [{ current_user }] = await prisma.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`;
    expect(current_user).toBe('meditrack_app');

    // (b) Assert meditrack_app lacks UPDATE on AuditEvent (the REVOKE from
    // migration 0010 is in effect). This confirms the privilege state
    // independently of the rejection test above.
    const [{ has_update }] = await prisma.$queryRaw<Array<{ has_update: boolean }>>`SELECT has_table_privilege('meditrack_app', '"AuditEvent"', 'UPDATE') AS has_update`;
    expect(has_update).toBe(false);

    // (c) Optionally assert the OWNER role ALSO cannot UPDATE due to the
    // trigger guard (Layer 2a — migration 0008). Only runs if DIRECT_URL
    // is exposed to the test environment. Guards with if() so the test does
    // NOT fail in environments where the owner URL is unavailable.
    if (process.env.DIRECT_URL) {
      const { PrismaClient } = await import('@prisma/client');
      const ownerPrisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
      try {
        await expect(
          ownerPrisma.$executeRawUnsafe(
            `UPDATE "AuditEvent" SET action = $1 WHERE id = $2`,
            'hacked',
            target!.id,
          ),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await ownerPrisma.$disconnect();
      }
    }
  });
});

describe('AUD-03 — defense-in-depth guards (Plan 05-08)', () => {
  it('CI grep: no off-allowlist prisma.$executeRaw* in apps/ or packages/ (05-REVIEWS.md MEDIUM #5)', () => {
    // ALLOWLIST: production-code files permitted to call $executeRaw or
    // $executeRawUnsafe (the WRITE forms). $queryRaw / $queryRawUnsafe
    // (the READ forms) are NOT banned — the audit extension cannot see
    // them, but reads don't mutate the audit-required entities.
    //
    // To add an entry: provide the file path + a one-line reason explaining
    // why a raw write is required AND why it cannot route through a Prisma
    // model method (which IS intercepted by the audit extension).
    //
    // Empty at Plan 05-08 time: Phase 4 D-79's FOR UPDATE uses $queryRaw
    // (READ form), which is not subject to this ban.
    const ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
      // No entries: all production-code raw operations use $queryRaw (READ).
    ];

    let matches: string[] = [];
    try {
      // Run git grep from the REPO ROOT so 'apps' and 'packages' resolve correctly.
      // process.cwd() is the vitest working dir (apps/api), not the repo root —
      // git grep would fail with "ambiguous argument 'apps'" from that directory.
      const output = execFileSync(
        'git',
        ['grep', '-nE', String.raw`prisma\.\$executeRaw(Unsafe)?`, '--', 'apps', 'packages'],
        { encoding: 'utf8', cwd: REPO_ROOT },
      ).trim();
      matches = output.split('\n').filter((l) => l.length > 0);
    } catch (err: unknown) {
      // git grep exits 1 with empty stdout when there are no matches.
      // execFileSync throws on non-zero exit; treat exit-1-with-empty as success.
      const e = err as { status?: number; stdout?: { toString(): string } };
      if (e.status === 1 && (e.stdout?.toString().trim() ?? '') === '') {
        matches = [];
      } else {
        throw err;
      }
    }

    // Exclude non-production files:
    // - Test files (e.g. Test 4's $executeRawUnsafe for REVOKE/trigger assertions)
    // - SQL migration files (comments in migrations mention patterns for documentation)
    // - Lines where the match is inside a SQL comment (starts with '--')
    const productionMatches = matches.filter((m) => {
      const filePath = m.split(':')[0] ?? '';
      // git grep format: "path:linenum:content"
      const content = m.split(':').slice(2).join(':').trimStart();
      return (
        !filePath.includes('/test/') &&
        !filePath.endsWith('.test.ts') &&
        !filePath.endsWith('.spec.ts') &&
        !filePath.includes('migrations/') &&
        !filePath.endsWith('.sql') &&
        // Exclude JS/TS comment-only lines (the pattern appears in a code comment, not as a call)
        !content.startsWith('//') &&
        !content.startsWith('*') &&
        !content.startsWith('/*')
      );
    });

    const allowlistFiles = new Set(ALLOWLIST.map((e) => e.file));
    const offAllowlist = productionMatches.filter((m) => {
      const filePath = m.split(':')[0] ?? '';
      return !allowlistFiles.has(filePath);
    });

    if (offAllowlist.length > 0) {
      throw new Error(
        `Off-allowlist $executeRaw* call sites found (05-REVIEWS.md MEDIUM #5):\n` +
          offAllowlist.join('\n') +
          `\n\nThese calls bypass the audit middleware (D-93 — the extension cannot see raw queries).\n` +
          `Either (a) refactor to a Prisma model method (which IS intercepted), or (b) add the file to the ALLOWLIST in this test with a reason.`,
      );
    }

    expect(offAllowlist).toHaveLength(0);
  });

  it('DB-layer: empty entityId INSERT is rejected with SQLSTATE 23514 (05-REVIEWS.md LOW #12)', async () => {
    // The migration-0011 BEFORE INSERT trigger rejects rows where
    // entityId = '' or IS NULL. This test runs as the OWNER role
    // (DIRECT_URL) because the trigger fires regardless of role —
    // we need the owner connection to verify the DB-layer contract.
    // If DIRECT_URL is unset, skip the test with a clear message.
    if (!process.env.DIRECT_URL) {
      console.warn('Skipping Test 16 — DIRECT_URL not set (migration 0011 trigger not verifiable without owner connection)');
      return;
    }
    const { PrismaClient } = await import('@prisma/client');
    const ownerPrisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
    try {
      await expect(
        ownerPrisma.auditEvent.create({
          data: {
            actorUserId: null,
            careUnitId: null,
            entityType: 'auth_attempt',
            entityId: '',
            action: 'auth.login_failed',
            before: null,
            after: {},
            requestId: 'test-low-12-' + Date.now(),
          },
        }),
      ).rejects.toThrow(/non-empty string/);
    } finally {
      await ownerPrisma.$disconnect();
    }
  });
});

describe('AUD-01 — sensitive-field redaction (D-97 / T-05-03)', () => {
  it('auth.login audit row does NOT contain passwordHash in after JSON', async () => {
    const testStartedAt = new Date();
    await loginAs(app, TEST_APOTEKARE);

    const row = await prisma.auditEvent.findFirst({
      where: { action: 'auth.login', createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeDefined();

    const after = row!.after as Record<string, unknown> | null;
    expect(after).toBeDefined();
    expect(after).not.toBeNull();

    // Structurally absent — not just nulled. The AUDIT_ALLOWLIST for
    // User excludes 'passwordHash' so it never enters the JSON.
    expect(Object.keys(after!)).not.toContain('passwordHash');
    expect(JSON.stringify(after)).not.toMatch(/"passwordHash"/);
  });

  it('auth.login + auth.logout entityId equals User.id, NEVER the raw Session.id (T-05-03)', async () => {
    const testStartedAt = new Date();
    const testUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_APOTEKARE.email },
      select: { id: true },
    });

    // --- auth.login ---
    const cookie = await loginAs(app, TEST_APOTEKARE);

    const sessionRows = await prisma.session.findMany({
      where: { userId: testUser.id, createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: 'desc' },
    });
    expect(sessionRows.length).toBeGreaterThanOrEqual(1);
    const sessionRow = sessionRows[0]!;

    const loginAuditRow = await prisma.auditEvent.findFirst({
      where: {
        action: 'auth.login',
        actorUserId: testUser.id,
        createdAt: { gte: testStartedAt },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(loginAuditRow).toBeDefined();

    // Critical assertion: entityId is the actor User.id, NOT the
    // session.id (the raw signed session token).
    expect(loginAuditRow!.entityId).toBe(testUser.id);
    expect(loginAuditRow!.entityId).not.toBe(sessionRow.id);

    // --- auth.logout ---
    // Phase 1 D-01: logout is `DELETE /api/auth/session` (idempotent).
    const logoutRes = await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(204);

    // Note: DELETE /api/auth/session has no requireSession preHandler
    // (idempotent logout works without a cookie). Plan 05 Task 2 fixed
    // CR-04 — the route now resolves session.userId via findSessionById
    // and calls setActor() BEFORE logout(), so the auth.logout audit row
    // carries actorUserId === session.userId. The actorUserId assertion
    // lives in the dedicated CR-04 test below (Test 9); here we focus on
    // the entityId convention from T-05-03.
    const logoutAuditRow = await prisma.auditEvent.findFirst({
      where: {
        action: 'auth.logout',
        createdAt: { gte: testStartedAt },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(logoutAuditRow).toBeDefined();
    expect(logoutAuditRow).not.toBeNull();
    // entityId comes from resolveEntityId(Session, row) which returns
    // row.userId — the actor User.id. NEVER row.id (which IS the raw
    // signed session token).
    expect(logoutAuditRow!.entityId).toBe(testUser.id);
    expect(logoutAuditRow!.entityId).not.toBe(sessionRow.id);

    // Neither audit row's `after` JSON should contain the session id
    // as a substring (the allowlist excludes Session.id, and the
    // resolveEntityId branch records User.id — together they close
    // BOTH leak paths).
    const loginAfter = loginAuditRow!.after as Record<string, unknown> | null;
    const logoutAfter = logoutAuditRow!.after as Record<string, unknown> | null;
    expect(JSON.stringify(loginAfter ?? {})).not.toContain(sessionRow.id);
    expect(JSON.stringify(logoutAfter ?? {})).not.toContain(sessionRow.id);
  });

  it('auth.logout audit row carries actorUserId equal to the session owner User.id (D-92 / CR-04)', async () => {
    // Test 9 — CR-04 regression: Plan 05 Task 2 fixed the logout route to
    // call setActor(session.userId, session.careUnitId, req.ip) BEFORE
    // logout(). Pre-fix: every auth.logout audit row had actorUserId: null
    // because no setActor() call happened before destroySession. Post-fix:
    // the ALS store carries the actor at the moment $extends writes the row.
    const testStartedAt = new Date();
    const testUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_APOTEKARE.email },
      select: { id: true },
    });
    const cookie = await loginAs(app, TEST_APOTEKARE);

    const logoutRes = await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(204);

    const logoutAuditRow = await prisma.auditEvent.findFirst({
      where: { action: 'auth.logout', createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: 'desc' },
    });
    expect(logoutAuditRow).not.toBeNull();
    // CR-04 assertion: pre-fix this was null; post-fix it equals the user id.
    expect(logoutAuditRow!.actorUserId).toBe(testUser.id);
  });
});

describe('AUD-01 — failed-login entityType taxonomy (WR-07 + CR-03)', () => {
  it('unknown-email failed-login writes entityType=auth_attempt with entityId=email (WR-07)', async () => {
    // Test 10 — WR-07 regression: unknown-email branch in auth.service.ts
    // previously wrote entityType='session', entityId=''. Now writes
    // entityType='auth_attempt', entityId=attemptedEmail. This makes the
    // admin brute-force filter `?entityType=auth_attempt&entityId=X` meaningful.
    const testStartedAt = new Date();
    const attemptedEmail = 'nonexistent-test-user-' + Date.now() + '@example.test';

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: attemptedEmail, password: 'whatever-wrong-password' },
    });
    // InvalidCredentialsError surfaces as 400 invalid_credentials (D-04/T-01-05)
    expect(res.statusCode).toBe(400);

    const row = await prisma.auditEvent.findFirst({
      where: { action: 'auth.login_failed', createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    // WR-07 assertions: new entityType and entityId convention.
    expect(row!.entityType).toBe('auth_attempt');
    expect(row!.entityId).toBe(attemptedEmail);
    // D-96: unknown-email → no actor (we don't know who tried).
    expect(row!.actorUserId).toBeNull();
    // D-96: after JSON contains ONLY the attempted email — no password material.
    const after = row!.after as Record<string, unknown> | null;
    expect(after).toEqual({ email: attemptedEmail });
  });

  it('known-user-wrong-password failed-login writes entityType=auth_attempt with entityId=email (CR-03 unified taxonomy)', async () => {
    // Test 11 — CR-03 unified taxonomy: both failed-login branches in
    // auth.service.ts now share entityType='auth_attempt' with
    // entityId=email. The two branches remain distinguishable via the
    // actorUserId column: known-user (this test) sets actorUserId=user.id;
    // unknown-email (Test 10) leaves actorUserId null. This test asserts
    // the unified contract — the prior "protect entityType='session'"
    // framing is superseded by CR-03.
    const testStartedAt = new Date();
    const testUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
      select: { id: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_SJUKSKOTERSKA.email, password: 'wrong-password-deliberately' },
    });
    expect(res.statusCode).toBe(400);

    const row = await prisma.auditEvent.findFirst({
      where: { action: 'auth.login_failed', actorUserId: testUser.id, createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    // CR-03 unified taxonomy: entityType='auth_attempt', entityId=email.
    expect(row!.entityType).toBe('auth_attempt');
    expect(row!.entityId).toBe(TEST_SJUKSKOTERSKA.email);
    // D-96: known user attempting → actorUserId is set (we know who tried).
    expect(row!.actorUserId).toBe(testUser.id);
  });

  it('auth.login_failed audit row commits outside any wrapping transaction (05-REVIEWS.md MEDIUM #7 + LOW #19)', async () => {
    // Test 17 — tx-isolation invariant.
    //
    // SCENARIO: a future refactor wraps verifyCredentials in a $transaction
    // that rolls back (e.g., for an "account lockout after N failures" feature).
    // The auth.login_failed audit row MUST commit independently — that is the
    // D-91 same-tx-contract carve-out for auth-attempt records. The INVARIANT
    // comment at auth.service.ts's two write sites codifies this assumption;
    // this test codifies it at CI time.
    //
    // How it works: we simulate the exact code pattern from auth.service.ts —
    // prisma.auditEvent.create() called with the OUTER prisma singleton (not a
    // tx-scoped client) — INSIDE a prisma.$transaction callback. The outer
    // singleton opens its own implicit micro-tx and commits immediately,
    // independently of the surrounding interactive tx. When the surrounding tx
    // rolls back (forced throw), the audit row is already committed and persists.
    //
    // If a future contributor accidentally routes the audit write through the
    // tx callback's `_tx` client, the row would roll back with the outer tx
    // and this test would fail — surfacing the regression at CI time.
    const testStartedAt = new Date();
    const attemptEmail = `test-tx-isolation-${Date.now()}@example.test`;

    await expect(
      prisma.$transaction(async (_tx) => {
        // Emulate auth.service.ts unknown-email branch: write an audit row
        // via the OUTER prisma singleton, NOT via the _tx client. This is
        // exactly how auth.service.ts is structured today (it imports the
        // module-level `prisma` singleton and calls prisma.auditEvent.create()
        // directly). The audit write commits independently of this outer tx.
        await prisma.auditEvent.create({
          data: {
            actorUserId: null,
            careUnitId: null,
            entityType: 'auth_attempt',
            entityId: attemptEmail,
            action: 'auth.login_failed',
            after: { email: attemptEmail },
            requestId: `test-tx-iso-${Date.now()}`,
          },
        });

        // Force the surrounding transaction to roll back. If the audit write
        // were routed through _tx instead of the outer singleton, this rollback
        // would also drop the audit row — breaking the D-91 contract.
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    // INVARIANT: the audit row is present despite the outer rollback.
    const rows = await prisma.auditEvent.findMany({
      where: {
        entityType: 'auth_attempt',
        entityId: attemptEmail,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('auth.login_failed');
    expect(rows[0].entityId).toBe(attemptEmail);
  });
});

describe('AUD-02 — admin-only access', () => {
  it('returns 403 for sjukskoterska, 403 for apotekare, 200 for admin', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const nurseRes = await app.inject({
      method: 'GET',
      url: '/api/audit/events',
      headers: { cookie: nurseCookie },
    });
    expect(nurseRes.statusCode).toBe(403);

    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const apotekareRes = await app.inject({
      method: 'GET',
      url: '/api/audit/events',
      headers: { cookie: apotekareCookie },
    });
    expect(apotekareRes.statusCode).toBe(403);

    const adminCookie = await loginAs(app, TEST_ADMIN);
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/audit/events',
      headers: { cookie: adminCookie },
    });
    expect(adminRes.statusCode).toBe(200);
    const body = JSON.parse(adminRes.payload) as {
      events: unknown[];
      nextCursor: string | null;
    };
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('nextCursor');
  });

  it('GET /api/audit/events with a malformed cursor responds 422 with details.reason === invalid_cursor (CR-02)', async () => {
    // Test 8 — CR-02 regression: decodeCursor used to throw ValidationFailedError
    // with details.reason: 'invalid_quantity' — the order-line validation reason
    // code (a cross-subsystem taxonomy leak). Fixed in Plan 05 Task 1 to use
    // 'invalid_cursor'. This test asserts both the positive value and the absence
    // of the wrong value so any future copy-paste regression is caught immediately.
    const adminCookie = await loginAs(app, TEST_ADMIN);

    const res = await app.inject({
      method: 'GET',
      url: '/api/audit/events?cursor=not-base64-anything%21%40%23',
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(422);

    const body = res.json() as { error: { code: string; message: string; details: { reason: string } } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.reason).toBe('invalid_cursor');
    // Explicit cross-subsystem-leak assertion: the order-domain reason
    // must NEVER appear on a cursor-decode failure.
    expect(body.error.details.reason).not.toBe('invalid_quantity');
  });
});

describe('AUD-01 — parallel actorALS-frame isolation (CR-04, W10)', () => {
  it('cross-request ALS frame: parallel-frame isolation prevents actor leakage under keep-alive (CR-04, W10 reframing)', async () => {
    // Test 14 — CR-04 regression: Plan 06 actorALS.run(scope, () => done())
    // binds each request's actor frame to the request pipeline via the 3-arg
    // Fastify onRequest hook. Subsequent requests on the same keep-alive TCP
    // connection each get their own actorALS frame from their own onRequest
    // invocation — there is no shared mutable store (the als.enterWith design
    // that caused CR-04).
    //
    // W10 reframing per checker feedback: Tests 7 + 9 already verify
    // sequential-request audit correctness. The novel contract Test 14 verifies
    // is PARALLEL-FRAME ISOLATION — three concurrent requests via Promise.all
    // each get a distinct actorALS frame with no cross-attribution. The per-row
    // assertions on actorUserId / entityId / distinct requestIds are cross-checks
    // confirming the frame content was bound to the originating request.
    const testStartedAt = new Date();
    await ensureAllRolesSeeded();

    // Resolve three user IDs to assert exact audit attribution.
    const apotekareUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_APOTEKARE.email },
      select: { id: true },
    });
    const sjukskoterskaUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
      select: { id: true },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_ADMIN.email },
      select: { id: true },
    });

    // Parallel logins — each gets its own actorALS frame via the onRequest hook.
    const [apotekareCookie, sjukskoterskaCookie, adminCookie] = await Promise.all([
      loginAs(app, TEST_APOTEKARE),
      loginAs(app, TEST_SJUKSKOTERSKA),
      loginAs(app, TEST_ADMIN),
    ]);

    // Parallel logouts via Promise.all — this is the concurrency scenario.
    // Each request enters the Fastify pipeline concurrently; each gets its
    // own actorALS frame from the onRequest hook. If frames leaked, one
    // user's actorUserId would appear on another user's auth.logout audit row.
    const [resA, resS, resAd] = await Promise.all([
      app.inject({
        method: 'DELETE',
        url: '/api/auth/session',
        headers: { cookie: apotekareCookie },
      }),
      app.inject({
        method: 'DELETE',
        url: '/api/auth/session',
        headers: { cookie: sjukskoterskaCookie },
      }),
      app.inject({
        method: 'DELETE',
        url: '/api/auth/session',
        headers: { cookie: adminCookie },
      }),
    ]);
    expect(resA.statusCode).toBe(204);
    expect(resS.statusCode).toBe(204);
    expect(resAd.statusCode).toBe(204);

    // Three auth.logout audit rows expected — one per concurrent logout.
    const auditRows = await prisma.auditEvent.findMany({
      where: {
        action: 'auth.logout',
        actorUserId: { in: [apotekareUser.id, sjukskoterskaUser.id, adminUser.id] },
        createdAt: { gte: testStartedAt },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditRows).toHaveLength(3);

    // Per-row assertions: each row's actorUserId + entityId matches its
    // originating user (T-05-03: entityId = actor User.id for Session rows).
    const rowA = auditRows.find((r) => r.actorUserId === apotekareUser.id);
    const rowS = auditRows.find((r) => r.actorUserId === sjukskoterskaUser.id);
    const rowAd = auditRows.find((r) => r.actorUserId === adminUser.id);
    expect(rowA).toBeDefined();
    expect(rowS).toBeDefined();
    expect(rowAd).toBeDefined();
    // T-05-03: entityId = actor User.id, not Session.id.
    expect(rowA!.entityId).toBe(apotekareUser.id);
    expect(rowS!.entityId).toBe(sjukskoterskaUser.id);
    expect(rowAd!.entityId).toBe(adminUser.id);
    // All three requestIds must be distinct — concurrent requests get independent
    // actorALS frames with independent randomUUID() requestIds.
    expect(new Set([rowA!.requestId, rowS!.requestId, rowAd!.requestId]).size).toBe(3);
  });
});

// Imports kept for grep-discoverability of helper coverage; the
// `captureSessionCookie` re-export is observed via the import block
// at the top of this file (it's also asserted indirectly by every
// test that calls loginAs, which uses it internally).
void captureSessionCookie;
