import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { als } from '../src/plugins/requestContext.js';
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
 * 7 tests across 4 describe blocks covering AUD-01 / AUD-02 / AUD-03 with
 * the threat-model assertions T-05-02 (append-only) and T-05-03 (session
 * id leak via entityId).
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
 *
 *   AUD-03 — append-only enforcement (two layers asserted together)
 *     Test 3: `git grep` finds zero `prisma.auditEvent.update`,
 *             `delete`, `updateMany`, `deleteMany`, or `upsert` calls
 *             in `apps/` and `packages/` (Layer 1 — architectural
 *             absence).
 *     Test 4: `prisma.$executeRawUnsafe('UPDATE "AuditEvent" SET ...')`
 *             is rejected by Postgres with `permission denied` (Layer 2
 *             — REVOKE + BEFORE-trigger at the DB role).
 *
 *   AUD-01 — sensitive-field redaction (D-97 + T-05-03)
 *     Test 5: The `auth.login` audit row's `after` JSON does NOT contain
 *             `passwordHash` — the User model's allowlist excludes it.
 *     Test 7: The `auth.login` AND `auth.logout` audit rows' `entityId`
 *             column equals the actor User.id, NEVER the raw signed
 *             session token (Session.id). Closes the second leak path:
 *             the allowlist closes the `after` JSON leak; resolveEntityId
 *             closes the `entityId` column leak. Both layers MUST hold.
 *
 *   AUD-02 — admin-only access
 *     Test 6: `GET /api/audit/events` returns 403 for sjuksköterska,
 *             403 for apotekare, 200 for admin (requirePermission gate).
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

    // The audit extension only writes rows when the ALS store is
    // populated (D-92). The test wraps the prisma.$transaction in an
    // als.run so the extension sees an actor context — and therefore
    // WILL attempt to write an audit row inside the tx. The forced
    // throw then proves the audit row also rolled back (D-91).
    await expect(
      als.run(
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
    // Even though the meditrack role OWNS the table (so REVOKE alone is
    // bypassed by owner privileges), the trigger fires UNCONDITIONALLY
    // on the matched-row UPDATE path and produces the verbatim
    // "permission denied" message D-98 promised.
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

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "AuditEvent" SET action = $1 WHERE id = $2`,
        'hacked',
        target!.id,
      ),
    ).rejects.toThrow(/permission denied/i);
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
    // (idempotent logout works without a cookie). So the ALS store's
    // actorUserId may be null at the moment the Session is deleted —
    // we do NOT filter on actorUserId here, only on action+timestamp.
    // The entityId assertion (resolveEntityId returns the row's userId
    // for Session deletes) is what proves T-05-03 — the raw session
    // token is NEVER the entityId.
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
});

// Imports kept for grep-discoverability of helper coverage; the
// `captureSessionCookie` re-export is observed via the import block
// at the top of this file (it's also asserted indirectly by every
// test that calls loginAs, which uses it internally).
void captureSessionCookie;
