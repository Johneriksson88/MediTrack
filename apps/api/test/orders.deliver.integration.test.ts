import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
  buildTestApp,
  ensureAllRolesSeeded,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';
// D-86: Import deliverOrder directly (NOT via app.inject) for the concurrency test.
// Two concurrent calls on parallel DB connections truly race at the DB level;
// app.inject serializes on Fastify's single event loop and would false-pass a sequential impl.
import { deliverOrder } from '../src/services/order.service.js';
import type { OrderTransitionError } from '../src/plugins/errorHandler.js';

/**
 * Phase 4 D-78 / D-79 / D-81 / D-84 / D-86 / D-87 / D-88 / D-89
 * Deliver order integration tests (Slice B).
 *
 * 8-scenario suite:
 *   1. Happy path — full pipeline create→submit→confirm→deliver; two CUMs with
 *      aggregated lines; verifies status, deliveredAt, deliveredByUserId, deliveredBy.name,
 *      confirmedBy+submittedBy+createdBy still populated; per-CUM stock incremented correctly.
 *   2. Wrong-status 409 — deliver on Skickad order returns order_transition_invalid.
 *   3. Double-deliver 409 — deliver once (200) → deliver again (409); stock incremented exactly once.
 *   4. Cross-careUnit 404 — apotekare from other careUnit delivers Bekräftad order gets 404.
 *   5. Sjuksköterska 403 — requirePermission preHandler blocks non-apotekare.
 *   6. Soft-deleted CUM → 422 medication_removed — tx rolls back, no stock change.
 *   7. Line aggregation — same CUM on 3 lines; stock incremented by sum (3×qty=3).
 *   8. Concurrency (OPS-03/D-88) — two parallel deliverOrder calls, one wins, stock +5 exactly once.
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

// ---------------------------------------------------------------------------
// Local helpers (verbatim from orders.confirm.integration.test.ts per PATTERNS.md)
// ---------------------------------------------------------------------------

function captureSessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
  const match = header.match(/(meditrack\.sid=[^;]+)/);
  expect(match).not.toBeNull();
  return match![1]!;
}

async function loginAs(user: { email: string; password: string }): Promise<string> {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: user.password },
  });
  expect(loginRes.statusCode).toBe(200);
  return captureSessionCookie(loginRes.headers['set-cookie']);
}

async function createEmptyOrder(cookie: string): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: { cookie },
    payload: {},
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function findTestCareUnitMedication(): Promise<{ id: string; careUnitId: string }> {
  const cum = await prisma.careUnitMedication.findFirst({
    where: {
      careUnitId: TEST_SJUKSKOTERSKA.careUnitId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!cum) {
    throw new Error('No CareUnitMedication found in test DB — run seed first');
  }
  return { id: cum.id, careUnitId: cum.careUnitId };
}

async function findSecondTestCareUnitMedication(excludeId: string): Promise<{ id: string; careUnitId: string }> {
  const cum = await prisma.careUnitMedication.findFirst({
    where: {
      careUnitId: TEST_SJUKSKOTERSKA.careUnitId,
      deletedAt: null,
      id: { not: excludeId },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!cum) {
    throw new Error('No second CareUnitMedication found in test DB — run seed first');
  }
  return { id: cum.id, careUnitId: cum.careUnitId };
}

/**
 * D-87: Composite helper — advances an order from empty draft to Bekräftad.
 * Issues line-adds as sjuksköterska, submits, then confirms as apotekare.
 */
async function progressOrderToBekraftad(
  nurseCookie: string,
  apotekareCookie: string,
  orderId: string,
  lineSpecs: Array<{ cumId: string; quantity: number }>,
): Promise<void> {
  // Add each line as sjuksköterska
  for (const spec of lineSpecs) {
    const lineRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/lines`,
      headers: { cookie: nurseCookie },
      payload: { careUnitMedicationId: spec.cumId, quantity: spec.quantity },
    });
    expect(lineRes.statusCode).toBe(200);
  }
  // Submit as sjuksköterska
  const submitRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/submit`,
    headers: { cookie: nurseCookie },
  });
  expect(submitRes.statusCode).toBe(200);
  // Confirm as apotekare
  const confirmRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/confirm`,
    headers: { cookie: apotekareCookie },
  });
  expect(confirmRes.statusCode).toBe(200);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Deliver order — Phase 4 Slice B (8-scenario D-78/D-79/D-81/D-88 suite)', () => {
  it('Test 1 (happy path): full pipeline create→submit→confirm→deliver; two CUMs with aggregated lines; stock incremented, actor trail populated', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum1 = await findTestCareUnitMedication();
    const cum2 = await findSecondTestCareUnitMedication(cum1.id);

    // Snapshot starting stock for both CUMs
    const before1 = await prisma.careUnitMedication.findUnique({ where: { id: cum1.id } });
    const before2 = await prisma.careUnitMedication.findUnique({ where: { id: cum2.id } });
    expect(before1).not.toBeNull();
    expect(before2).not.toBeNull();

    const order = await createEmptyOrder(nurseCookie);

    // Progress to Bekräftad with: 2 lines on CUM1 (qty 2+3=5) and 1 line on CUM2 (qty 4)
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum1.id, quantity: 2 },
      { cumId: cum1.id, quantity: 3 },
      { cumId: cum2.id, quantity: 4 },
    ]);

    // Deliver as apotekare
    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });

    expect(deliverRes.statusCode).toBe(200);
    const body = deliverRes.json<{
      id: string;
      status: string;
      deliveredAt: string | null;
      deliveredByUserId: string | null;
      deliveredBy: { id: string; name: string } | null;
      confirmedAt: string | null;
      confirmedBy: { id: string; name: string } | null;
      submittedBy: { id: string; name: string } | null;
      createdBy: { id: string; name: string };
    }>();

    // Status flipped to levererad
    expect(body.status).toBe('levererad');

    // deliveredAt is a recent ISO datetime
    expect(body.deliveredAt).not.toBeNull();
    const deliveredDate = new Date(body.deliveredAt!);
    expect(isNaN(deliveredDate.getTime())).toBe(false);
    expect(Date.now() - deliveredDate.getTime()).toBeLessThan(30_000);

    // Actor stamps correct
    const apotekareUser = await prisma.user.findUnique({ where: { email: TEST_APOTEKARE.email } });
    expect(apotekareUser).not.toBeNull();
    expect(body.deliveredByUserId).toBe(apotekareUser!.id);
    expect(body.deliveredBy).toEqual({ id: apotekareUser!.id, name: TEST_APOTEKARE.name });

    // Prior actor stamps still populated
    expect(body.confirmedBy).not.toBeNull();
    expect(body.submittedBy).not.toBeNull();
    expect(body.createdBy).not.toBeNull();

    // Stock incremented: CUM1 by 5 (aggregated 2+3), CUM2 by 4
    const after1 = await prisma.careUnitMedication.findUnique({ where: { id: cum1.id } });
    const after2 = await prisma.careUnitMedication.findUnique({ where: { id: cum2.id } });
    expect(after1!.currentStock).toBe(before1!.currentStock + 5);
    expect(after2!.currentStock).toBe(before2!.currentStock + 4);
  });

  it('Test 2 (wrong-status 409): deliver on Skickad order returns order_transition_invalid with from=skickad', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    // Create and submit but do NOT confirm (status stays skickad)
    const order = await createEmptyOrder(nurseCookie);
    await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie: nurseCookie },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/submit`,
      headers: { cookie: nurseCookie },
    });

    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });

    expect(deliverRes.statusCode).toBe(409);
    const body = deliverRes.json<{
      error: { code: string; details: { from: string; to: string; expected: string } };
    }>();
    expect(body.error.code).toBe('order_transition_invalid');
    expect(body.error.details.from).toBe('skickad');
    expect(body.error.details.expected).toBe('bekraftad');
  });

  it('Test 3 (double-deliver 409): second deliver returns 409; stock incremented exactly once', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const before = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });

    const order = await createEmptyOrder(nurseCookie);
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum.id, quantity: 3 },
    ]);

    // First deliver: should succeed
    const first = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });
    expect(first.statusCode).toBe(200);

    // Second deliver: should fail with 409
    const second = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });
    expect(second.statusCode).toBe(409);
    const body = second.json<{
      error: { code: string; details: { expected: string } };
    }>();
    expect(body.error.code).toBe('order_transition_invalid');
    expect(body.error.details.expected).toBe('bekraftad');

    // Stock incremented exactly once
    const after = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });
    expect(after!.currentStock).toBe(before!.currentStock + 3);
  });

  it('Test 4 (cross-careUnit 404): apotekare from different careUnit gets 404, not 403', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum.id, quantity: 2 },
    ]);

    // Create a second careUnit and an apotekare user in it
    const { hashPassword } = await import('../src/auth/password.js');
    const hash = await hashPassword('demo1234');

    const existing = await prisma.user.findUnique({
      where: { email: 'other-apotekare-deliver@test.example' },
    });
    if (existing) {
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
      const cu = await prisma.careUnit.findFirst({ where: { name: 'Other CareUnit Deliver Test' } });
      if (cu) {
        await prisma.careUnit.delete({ where: { id: cu.id } });
      }
    }

    const otherCareUnit = await prisma.careUnit.create({
      data: { name: 'Other CareUnit Deliver Test' },
    });
    const otherApotekare = await prisma.user.create({
      data: {
        email: 'other-apotekare-deliver@test.example',
        name: 'Other Apotekare Deliver',
        role: 'apotekare',
        careUnitId: otherCareUnit.id,
        passwordHash: hash,
      },
    });

    const otherCookie = await loginAs({ email: otherApotekare.email, password: 'demo1234' });

    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: otherCookie },
    });

    // Must be 404 not 403 (D-73)
    expect(deliverRes.statusCode).toBe(404);
    const body = deliverRes.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');

    // Cleanup
    await prisma.user.delete({ where: { id: otherApotekare.id } });
    await prisma.careUnit.delete({ where: { id: otherCareUnit.id } });
  });

  it('Test 5 (sjuksköterska 403): sjuksköterska POSTing /deliver gets 403 from requirePermission', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum.id, quantity: 1 },
    ]);

    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: nurseCookie }, // sjukskoterska, not apotekare
    });

    expect(deliverRes.statusCode).toBe(403);
    const body = deliverRes.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('forbidden');

    // Verify order status is still bekraftad (unchanged)
    const reload = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reload!.status).toBe('bekraftad');
  });

  it('Test 6 (soft-deleted CUM → 422 medication_removed): tx rolls back, no stock change', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum1 = await findTestCareUnitMedication();
    const cum2 = await findSecondTestCareUnitMedication(cum1.id);

    const before1 = await prisma.careUnitMedication.findUnique({ where: { id: cum1.id } });
    const before2 = await prisma.careUnitMedication.findUnique({ where: { id: cum2.id } });

    const order = await createEmptyOrder(nurseCookie);
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum1.id, quantity: 5 },
      { cumId: cum2.id, quantity: 3 },
    ]);

    // Soft-delete CUM2 so deliver will fail with 422 medication_removed
    await prisma.careUnitMedication.update({
      where: { id: cum2.id },
      data: { deletedAt: new Date() },
    });

    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });

    expect(deliverRes.statusCode).toBe(422);
    const body = deliverRes.json<{
      error: { code: string; details: { reason: string; medicationName: string } };
    }>();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.reason).toBe('medication_removed');
    expect(typeof body.error.details.medicationName).toBe('string');
    expect(body.error.details.medicationName.length).toBeGreaterThan(0);

    // No stock change on either CUM (entire tx rolled back)
    const after1 = await prisma.careUnitMedication.findUnique({ where: { id: cum1.id } });
    // CUM2 is soft-deleted; reload via findFirst with deletedAt check
    const after2 = await prisma.careUnitMedication.findFirst({
      where: { id: cum2.id },
    });
    expect(after1!.currentStock).toBe(before1!.currentStock);
    expect(after2!.currentStock).toBe(before2!.currentStock);

    // Restore CUM2 for subsequent tests
    await prisma.careUnitMedication.update({
      where: { id: cum2.id },
      data: { deletedAt: null },
    });
  });

  it('Test 7 (line aggregation): same CUM on 3 lines (qty 1+1+1=3); stock incremented by sum', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const before = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });

    const order = await createEmptyOrder(nurseCookie);
    // Three lines on the same CUM
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum.id, quantity: 1 },
      { cumId: cum.id, quantity: 1 },
      { cumId: cum.id, quantity: 1 },
    ]);

    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });

    expect(deliverRes.statusCode).toBe(200);

    // CUM stock incremented by 3 (aggregated 1+1+1), NOT three separate +1 assertions
    const after = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });
    expect(after!.currentStock).toBe(before!.currentStock + 3);
  });

  it('Test 8 (concurrency OPS-03/D-88): two concurrent deliveries on same Bekraftad order — one commits, other gets 409, stock incremented exactly once', async () => {
    /**
     * D-88 two-phase barrier proof: two parallel deliverOrder calls on the same
     * Bekräftad order. The FOR UPDATE on the Order row serializes them at the DB level.
     * The updateMany WHERE status='bekraftad' precondition makes the second one fail.
     *
     * Shape (simpler allSettled form per D-88 §Step B follow-up):
     *   - Tx-A and Tx-B are both started as deliverOrder() calls.
     *   - The DB FOR UPDATE on the Order row serializes them; whichever gets the lock first
     *     commits the levererad status flip + stock increment.
     *   - The second one unblocks and observes status='levererad' in its own read;
     *     the updateMany WHERE status='bekraftad' returns count=0 → OrderTransitionError.
     *   - pg_locks proof: poll pg_locks between start and resolution to observe Tx-B blocked.
     *
     * We use Promise.allSettled([txA, txB]) for stability. The pg_locks poll runs in the
     * background as both txs are in flight — it captures the blocked state.
     */
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await progressOrderToBekraftad(nurseCookie, apotekareCookie, order.id, [
      { cumId: cum.id, quantity: 5 },
    ]);

    // Snapshot starting stock
    const before = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });
    expect(before).not.toBeNull();

    // Obtain the apotekare's userId for the direct service calls
    const apotekareUser = await prisma.user.findUnique({ where: { email: TEST_APOTEKARE.email } });
    expect(apotekareUser).not.toBeNull();
    const careUnitId = TEST_APOTEKARE.careUnitId;

    // D-86: fire TWO parallel deliverOrder() calls directly (not via app.inject).
    // The DB-level FOR UPDATE serializes them; allSettled captures both outcomes.
    // Attach noop rejection handlers immediately to prevent unhandled rejection warnings
    // before Promise.allSettled can capture the results.
    let blockedRowsObserved: { granted: boolean }[] = [];

    // Start Tx-A and Tx-B genuinely in parallel — the FOR UPDATE will produce
    // contention regardless. Removing the 50ms delay tightens the race window
    // and makes the pg_locks observation below a real correctness check.
    const txAPromise = deliverOrder(careUnitId, order.id, apotekareUser!.id);
    // Suppress unhandled rejection until allSettled captures it
    txAPromise.catch(() => { /* captured by allSettled below */ });

    const txBPromise = deliverOrder(careUnitId, order.id, apotekareUser!.id);
    // Suppress unhandled rejection until allSettled captures it
    txBPromise.catch(() => { /* captured by allSettled below */ });

    // Poll pg_locks while both txs are in flight: look for a blocked request on "Order"
    // (D-88 §6: assert tx-B is in Lock wait state at least once during the barrier window).
    const pollStart = Date.now();
    while (Date.now() - pollStart < 300) {
      const rows = await prisma.$queryRaw<{ granted: boolean }[]>`
        SELECT granted
        FROM pg_locks l
        JOIN pg_stat_activity a USING (pid)
        WHERE a.wait_event_type = 'Lock'
          AND a.query ILIKE '%Order%'
      `;
      if (rows.length > 0) {
        blockedRowsObserved = rows;
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    // Await both — one should fulfill, the other reject
    const [aResult, bResult] = await Promise.allSettled([txAPromise, txBPromise]);

    // Exactly one succeeds
    const successCount = [aResult, bResult].filter((r) => r.status === 'fulfilled').length;
    const failCount = [aResult, bResult].filter((r) => r.status === 'rejected').length;
    expect(successCount).toBe(1);
    expect(failCount).toBe(1);

    // The failing one is OrderTransitionError with code order_transition_invalid
    const failing = [aResult, bResult].find((r) => r.status === 'rejected') as PromiseRejectedResult;
    const err = failing.reason as OrderTransitionError;
    expect(err.code).toBe('order_transition_invalid');
    expect(err.details.expected).toBe('bekraftad');

    // pg_locks proof: we observed tx-B blocked (granted=false) at the DB level at
    // least once. A truly sequential implementation could not block at the
    // pg_locks level, so this assertion is what makes the test a real
    // correctness check rather than a stock-count-by-coincidence check. If this
    // fails in CI, widen the polling window above before relaxing the assert.
    expect(blockedRowsObserved.length).toBeGreaterThan(0);

    // Stock incremented by EXACTLY 5 (not 10) — proves only one tx committed
    const after = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });
    expect(after!.currentStock).toBe(before!.currentStock + 5);

    // Verify the order is now levererad (the winning tx committed the status flip)
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.status).toBe('levererad');
  }, 10_000); // 10s timeout as a safety net (target <500ms per D-88)
});
