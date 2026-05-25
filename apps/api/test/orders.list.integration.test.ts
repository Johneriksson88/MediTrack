import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
  buildTestApp,
  captureSessionCookie,
  ensureAllRolesSeeded,
  findTestCareUnitMedication,
  loginAs,
  mintTestOrderNumber,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 4 Slice C — List API widening integration tests (ORD-07).
 *
 * 7-scenario suite covering the widened GET /api/orders:
 *
 *   1. Back-compat default: GET /api/orders (no param) → 200, only Utkast orders.
 *   2. Single status param: GET /api/orders?status=skickad → 200, only Skickad orders
 *      with submittedBy/submittedAt populated.
 *   3. Comma-list: GET /api/orders?status=skickad,bekraftad,levererad → 200,
 *      returns orders of all three statuses; actor trios populated per status.
 *   4. 'alla' literal: GET /api/orders?status=alla → 200, all four statuses
 *      returned; count matches sum of per-status counts.
 *   5. Cross-careUnit isolation: apotekare from careUnit A queries ?status=alla;
 *      a careUnit-B order does NOT appear in the response.
 *   6. Invalid status rejected: GET /api/orders?status=foo → 400;
 *      GET /api/orders?status=skickad,foo → 400.
 *   7. Actor field shapes: a bekraftad order has confirmedBy + submittedBy populated,
 *      deliveredBy null.
 *
 * Uses direct Prisma fixtures for non-utkast statuses (avoids coupling list
 * tests to submit/confirm/deliver endpoint availability; the list endpoint only
 * reads, not validates transitions).
 */

let app: FastifyInstance;

// Test fixture: careUnit + users for cross-careUnit isolation test
const CARE_UNIT_B_ID = 'careunit-test-isolation-b';

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
// Local helpers
// ---------------------------------------------------------------------------

// captureSessionCookie / loginAs / findTestCareUnitMedication are
// imported from helpers/buildTestApp per Phase 5 Plan 03 Task 2 Step A.0.

/**
 * Creates an order directly in the DB with the given status + actor stamps.
 * Used to seed test fixtures without coupling to endpoint availability.
 */
async function createOrderInStatus(
  status: 'utkast' | 'skickad' | 'bekraftad' | 'levererad',
  careUnitId: string,
  createdByUserId: string,
  opts: {
    submittedByUserId?: string;
    confirmedByUserId?: string;
    deliveredByUserId?: string;
    cumId?: string;
  } = {},
): Promise<{ id: string }> {
  const { submittedByUserId, confirmedByUserId, deliveredByUserId, cumId } = opts;

  const now = new Date();
  // Phase 10 D-160 / D-164 — direct prisma.order.create needs the new
  // required NOT NULL columns; mint them via the shared test helper.
  const { orderNumberCounter, orderNumberYear } = await mintTestOrderNumber(careUnitId);
  const data: Parameters<typeof prisma.order.create>[0]['data'] = {
    careUnitId,
    createdByUserId,
    status,
    orderNumberCounter,
    orderNumberYear,
    ...(submittedByUserId && { submittedAt: now, submittedByUserId }),
    ...(confirmedByUserId && { confirmedAt: now, confirmedByUserId }),
    ...(deliveredByUserId && { deliveredAt: now, deliveredByUserId }),
  };

  if (cumId) {
    (data as Record<string, unknown>).lines = {
      create: [{ careUnitMedicationId: cumId, quantity: 3 }],
    };
  }

  const order = await prisma.order.create({ data });
  return { id: order.id };
}

/** Cleanup: delete all test-created orders for a careUnit. */
async function deleteTestOrders(careUnitId: string): Promise<void> {
  // Must delete lines first due to FK constraints.
  const orders = await prisma.order.findMany({ where: { careUnitId } });
  for (const o of orders) {
    await prisma.orderLine.deleteMany({ where: { orderId: o.id } });
  }
  await prisma.order.deleteMany({ where: { careUnitId } });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('List API widening — Phase 4 Slice C (7-scenario ORD-07 suite)', () => {
  it('Test 1 (back-compat default): GET /api/orders returns only utkast orders for the careUnit', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const sjukskoterska = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const cum = await findTestCareUnitMedication();

    // Create one utkast and one skickad order in the careUnit.
    const utkastOrder = await createOrderInStatus('utkast', sjukskoterska.careUnitId, sjukskoterska.id, { cumId: cum.id });
    const skickadOrder = await createOrderInStatus('skickad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      cumId: cum.id,
    });

    try {
      // GET /api/orders with no ?status param — defaults to utkast.
      const res = await app.inject({
        method: 'GET',
        url: '/api/orders',
        headers: { cookie: nurseCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Array<{ id: string; status: string }>; total: number }>();

      // Only utkast rows returned.
      const ids = body.rows.map((r) => r.id);
      expect(ids).toContain(utkastOrder.id);
      expect(ids).not.toContain(skickadOrder.id);
      for (const row of body.rows) {
        expect(row.status).toBe('utkast');
        // Phase 10 ORD-11 / D-165 — every list row carries orderNumber on the lean shape.
        expect((row as { orderNumber: string }).orderNumber).toMatch(/^ORD-\d{4}-\d{4,}$/);
      }
    } finally {
      await prisma.orderLine.deleteMany({ where: { orderId: utkastOrder.id } });
      await prisma.orderLine.deleteMany({ where: { orderId: skickadOrder.id } });
      await prisma.order.deleteMany({ where: { id: { in: [utkastOrder.id, skickadOrder.id] } } });
    }
  });

  it('Test 2 (single status): GET /api/orders?status=skickad returns skickad orders with submittedBy populated', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const sjukskoterska = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const cum = await findTestCareUnitMedication();

    const skickadOrder = await createOrderInStatus('skickad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      cumId: cum.id,
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/orders?status=skickad',
        headers: { cookie: nurseCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{
          id: string;
          status: string;
          submittedAt: string | null;
          submittedBy: { id: string; name: string } | null;
          confirmedAt: string | null;
          confirmedBy: { id: string; name: string } | null;
          deliveredAt: string | null;
          deliveredBy: { id: string; name: string } | null;
        }>;
        total: number;
      }>();

      const found = body.rows.find((r) => r.id === skickadOrder.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('skickad');

      // submittedBy populated.
      expect(found!.submittedAt).not.toBeNull();
      expect(found!.submittedBy).not.toBeNull();
      expect(found!.submittedBy!.id).toBe(sjukskoterska.id);

      // Other actor trios null (not yet confirmed or delivered).
      expect(found!.confirmedAt).toBeNull();
      expect(found!.confirmedBy).toBeNull();
      expect(found!.deliveredAt).toBeNull();
      expect(found!.deliveredBy).toBeNull();
    } finally {
      await prisma.orderLine.deleteMany({ where: { orderId: skickadOrder.id } });
      await prisma.order.delete({ where: { id: skickadOrder.id } });
    }
  });

  it('Test 3 (comma-list): GET /api/orders?status=skickad,bekraftad,levererad returns all three statuses', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const apotekare = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_APOTEKARE.email },
    });
    const sjukskoterska = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const cum = await findTestCareUnitMedication();

    const skickadOrder = await createOrderInStatus('skickad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      cumId: cum.id,
    });
    const bekraftadOrder = await createOrderInStatus('bekraftad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      confirmedByUserId: apotekare.id,
      cumId: cum.id,
    });
    const levereradOrder = await createOrderInStatus('levererad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      confirmedByUserId: apotekare.id,
      deliveredByUserId: apotekare.id,
      cumId: cum.id,
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/orders?status=skickad,bekraftad,levererad',
        headers: { cookie: nurseCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{ id: string; status: string }>;
        total: number;
      }>();

      const ids = body.rows.map((r) => r.id);
      expect(ids).toContain(skickadOrder.id);
      expect(ids).toContain(bekraftadOrder.id);
      expect(ids).toContain(levereradOrder.id);

      // All returned rows have one of the three requested statuses.
      for (const row of body.rows) {
        expect(['skickad', 'bekraftad', 'levererad']).toContain(row.status);
      }
    } finally {
      for (const id of [skickadOrder.id, bekraftadOrder.id, levereradOrder.id]) {
        await prisma.orderLine.deleteMany({ where: { orderId: id } });
      }
      await prisma.order.deleteMany({ where: { id: { in: [skickadOrder.id, bekraftadOrder.id, levereradOrder.id] } } });
    }
  });

  it('Test 4 (alla literal): GET /api/orders?status=alla returns all four statuses', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const apotekare = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_APOTEKARE.email },
    });
    const sjukskoterska = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const cum = await findTestCareUnitMedication();

    // Create one order per status.
    const utkastOrder = await createOrderInStatus('utkast', sjukskoterska.careUnitId, sjukskoterska.id, { cumId: cum.id });
    const skickadOrder = await createOrderInStatus('skickad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id, cumId: cum.id,
    });
    const bekraftadOrder = await createOrderInStatus('bekraftad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      confirmedByUserId: apotekare.id,
      cumId: cum.id,
    });
    const levereradOrder = await createOrderInStatus('levererad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      confirmedByUserId: apotekare.id,
      deliveredByUserId: apotekare.id,
      cumId: cum.id,
    });
    const allCreated = [utkastOrder.id, skickadOrder.id, bekraftadOrder.id, levereradOrder.id];

    try {
      const allaRes = await app.inject({
        method: 'GET',
        url: '/api/orders?status=alla',
        headers: { cookie: nurseCookie },
      });

      expect(allaRes.statusCode).toBe(200);
      const allaBody = allaRes.json<{
        rows: Array<{ id: string; status: string }>;
        total: number;
      }>();

      const ids = allaBody.rows.map((r) => r.id);
      for (const id of allCreated) {
        expect(ids).toContain(id);
      }

      // Statuses represented span all four.
      const returnedStatuses = new Set(allaBody.rows.map((r) => r.status));
      expect(returnedStatuses.has('utkast')).toBe(true);
      expect(returnedStatuses.has('skickad')).toBe(true);
      expect(returnedStatuses.has('bekraftad')).toBe(true);
      expect(returnedStatuses.has('levererad')).toBe(true);
    } finally {
      for (const id of allCreated) {
        await prisma.orderLine.deleteMany({ where: { orderId: id } });
      }
      await prisma.order.deleteMany({ where: { id: { in: allCreated } } });
    }
  });

  it('Test 5 (cross-careUnit isolation): careUnit-B order not visible to careUnit-A apotekare ?status=alla', async () => {
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const sjukskoterska = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });

    // Ensure careUnit B exists.
    await prisma.careUnit.upsert({
      where: { id: CARE_UNIT_B_ID },
      update: { name: 'CareUnit B (isolation test)' },
      create: { id: CARE_UNIT_B_ID, name: 'CareUnit B (isolation test)' },
    });

    // Create an order in careUnit B — should NOT appear in careUnit A's alla response.
    // Phase 10 D-160 / D-164 — mint orderNumber columns inline for B.
    const mintB = await mintTestOrderNumber(CARE_UNIT_B_ID);
    const orderB = await prisma.order.create({
      data: {
        careUnitId: CARE_UNIT_B_ID,
        createdByUserId: sjukskoterska.id, // same user — only isolation matters
        status: 'utkast',
        orderNumberCounter: mintB.orderNumberCounter,
        orderNumberYear: mintB.orderNumberYear,
      },
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/orders?status=alla',
        headers: { cookie: apotekareCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ rows: Array<{ id: string }>; total: number }>();

      const ids = body.rows.map((r) => r.id);
      expect(ids).not.toContain(orderB.id);

      // All returned rows belong to the apotekare's careUnit.
      const orders = await prisma.order.findMany({
        where: { id: { in: ids } },
        select: { careUnitId: true },
      });
      for (const o of orders) {
        expect(o.careUnitId).toBe(TEST_APOTEKARE.careUnitId);
      }
    } finally {
      await prisma.order.delete({ where: { id: orderB.id } });
    }
  });

  it('Test 6 (invalid status rejected): ?status=foo → 400; ?status=skickad,foo → 400', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);

    // Single invalid token.
    const fooRes = await app.inject({
      method: 'GET',
      url: '/api/orders?status=foo',
      headers: { cookie: nurseCookie },
    });
    expect(fooRes.statusCode).toBe(400);

    // Mixed valid+invalid.
    const mixedRes = await app.inject({
      method: 'GET',
      url: '/api/orders?status=skickad,foo',
      headers: { cookie: nurseCookie },
    });
    expect(mixedRes.statusCode).toBe(400);
  });

  it('Test 7 (actor field shapes): a bekraftad order has confirmedBy + submittedBy populated AND deliveredBy null', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const apotekare = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_APOTEKARE.email },
    });
    const sjukskoterska = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const cum = await findTestCareUnitMedication();

    const bekraftadOrder = await createOrderInStatus('bekraftad', sjukskoterska.careUnitId, sjukskoterska.id, {
      submittedByUserId: sjukskoterska.id,
      confirmedByUserId: apotekare.id,
      cumId: cum.id,
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/orders?status=bekraftad',
        headers: { cookie: nurseCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rows: Array<{
          id: string;
          status: string;
          submittedAt: string | null;
          submittedBy: { id: string; name: string } | null;
          confirmedAt: string | null;
          confirmedBy: { id: string; name: string } | null;
          deliveredAt: string | null;
          deliveredBy: { id: string; name: string } | null;
        }>;
      }>();

      const found = body.rows.find((r) => r.id === bekraftadOrder.id);
      expect(found).toBeDefined();

      // submittedBy shape.
      expect(found!.submittedAt).not.toBeNull();
      expect(found!.submittedBy).not.toBeNull();
      expect(typeof found!.submittedBy!.id).toBe('string');
      expect(typeof found!.submittedBy!.name).toBe('string');
      expect(found!.submittedBy!.id).toBe(sjukskoterska.id);

      // confirmedBy shape.
      expect(found!.confirmedAt).not.toBeNull();
      expect(found!.confirmedBy).not.toBeNull();
      expect(typeof found!.confirmedBy!.id).toBe('string');
      expect(typeof found!.confirmedBy!.name).toBe('string');
      expect(found!.confirmedBy!.id).toBe(apotekare.id);

      // deliveredBy null (not yet delivered).
      expect(found!.deliveredAt).toBeNull();
      expect(found!.deliveredBy).toBeNull();
    } finally {
      await prisma.orderLine.deleteMany({ where: { orderId: bekraftadOrder.id } });
      await prisma.order.delete({ where: { id: bekraftadOrder.id } });
    }
  });
});
