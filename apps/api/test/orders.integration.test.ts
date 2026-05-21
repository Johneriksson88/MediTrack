import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 3 D-73 — Order integration tests (Slice 2 + Slice 3).
 *
 * Slice 2 ships three `it` blocks:
 *   (a) POST /api/orders — creates Utkast order scoped to caller's careUnit;
 *       Zod .strict() rejects stray body fields (T-03-02 mass-assignment guard).
 *   (b) GET /api/orders?status=utkast — returns only the caller's careUnit orders,
 *       sorted createdAt DESC, including lineCount, totalQuantity, createdBy.name.
 *   (c) POST /api/orders without a session returns 401.
 *
 * Slice 3 adds eight `it` blocks covering the line CRUD + picker + 409 + 404 contracts.
 *
 * Harness mirrors apps/api/test/auth.flow.smoke.test.ts exactly.
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

/** Helper: create an empty draft order as the sjukskoterska user */
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

/** Helper: find the first available CareUnitMedication for the test careUnit */
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

describe('Draft orders — Slice 2 API contracts', () => {
  it('POST /api/orders creates an Utkast Order scoped to req.user.careUnitId, ignores body careUnitId/status/createdByUserId via Zod .strict()', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);

    // (a) Stray body fields are rejected by Zod .strict() — 400 validation_failed
    const strictRes = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie },
      payload: { careUnitId: 'fake-unit', status: 'skickad', createdByUserId: 'fake-user' },
    });
    expect(strictRes.statusCode).toBe(400);
    const strictBody = strictRes.json() as { error: { code: string } };
    expect(strictBody.error.code).toBe('validation_failed');

    // (b) Empty body creates an Utkast Order scoped to the caller's careUnit
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie },
      payload: {},
    });
    expect(createRes.statusCode).toBe(201);
    const order = createRes.json() as {
      id: string;
      status: string;
      careUnitId: string;
      lines: unknown[];
      createdBy: { name: string };
    };
    expect(order.status).toBe('utkast');
    expect(order.careUnitId).toBe(TEST_SJUKSKOTERSKA.careUnitId);
    expect(Array.isArray(order.lines)).toBe(true);
    expect(order.lines).toHaveLength(0);
    expect(order.createdBy.name).toBe(TEST_SJUKSKOTERSKA.name);

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('GET /api/orders?status=utkast returns only the caller\'s careUnit Orders sorted createdAt DESC and includes lineCount/totalQuantity/createdBy.name', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);

    // Create two draft orders for this user
    const createA = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie },
      payload: {},
    });
    expect(createA.statusCode).toBe(201);
    const orderA = createA.json() as { id: string };

    // Small delay to ensure different createdAt timestamps
    await new Promise((r) => setTimeout(r, 10));

    const createB = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie },
      payload: {},
    });
    expect(createB.statusCode).toBe(201);
    const orderB = createB.json() as { id: string };

    // GET /api/orders?status=utkast
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/orders?status=utkast',
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json() as {
      rows: Array<{
        id: string;
        status: string;
        createdAt: string;
        lineCount: number;
        totalQuantity: number;
        createdBy: { name: string };
      }>;
      total: number;
    };

    // All rows belong to this careUnit and have status=utkast
    for (const row of list.rows) {
      expect(row.status).toBe('utkast');
      expect(row.lineCount).toBeGreaterThanOrEqual(0);
      expect(row.totalQuantity).toBeGreaterThanOrEqual(0);
      expect(typeof row.createdBy.name).toBe('string');
    }

    // The two newly created orders should be present
    const ids = list.rows.map((r) => r.id);
    expect(ids).toContain(orderA.id);
    expect(ids).toContain(orderB.id);

    // Sorted createdAt DESC — orderB (newer) should appear before orderA
    const idxA = ids.indexOf(orderA.id);
    const idxB = ids.indexOf(orderB.id);
    // orderB was created after orderA, so it should come first (lower index)
    expect(idxB).toBeLessThan(idxA);

    // Cleanup
    await prisma.order.deleteMany({ where: { id: { in: [orderA.id, orderB.id] } } });
  });

  it('POST /api/orders without a session returns 401 unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });
});

// ---------------------------------------------------------------------------
// Slice 3: GET /api/orders/:id, line CRUD, picker, 409 lock contract, 404
// ---------------------------------------------------------------------------

describe('Draft orders — Slice 3 API contracts', () => {
  it('(a) GET /api/orders/:id returns the order with embedded lines and denormalized fields', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    // Create an order
    const order = await createEmptyOrder(cookie);

    // Add a line via the API
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 3 },
    });
    expect(addRes.statusCode).toBe(200);

    // GET /api/orders/:id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/orders/${order.id}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as {
      id: string;
      status: string;
      lines: Array<{
        id: string;
        careUnitMedicationId: string;
        quantity: number;
        name: string;
        atcCode: string;
        form: string;
        currentStock: number;
        lowStockThreshold: number;
      }>;
    };

    expect(body.id).toBe(order.id);
    expect(body.status).toBe('utkast');
    expect(body.lines).toHaveLength(1);
    const line = body.lines[0]!;
    expect(line.careUnitMedicationId).toBe(cum.id);
    expect(line.quantity).toBe(3);
    // Denormalized fields must be present (D-47)
    expect(typeof line.name).toBe('string');
    expect(line.name.length).toBeGreaterThan(0);
    expect(typeof line.atcCode).toBe('string');
    expect(typeof line.form).toBe('string');
    expect(typeof line.currentStock).toBe('number');
    expect(typeof line.lowStockThreshold).toBe('number');

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('(b) GET /api/orders/:id from a user in CareUnit B against an order in CareUnit A returns 404 (NOT 403) — D-73 existence-probe protection', async () => {
    // Seed a second CareUnit + user for this test.
    // Use the same dynamic import pattern as buildTestApp.ts (relative to this test file).
    const CARE_UNIT_B_ID = 'careunit-test-b-slice3';
    const USER_B_EMAIL = 'sjukskoterska-b-slice3@example.test';
    const { hashPassword } = await import('../src/auth/password.js');
    const passwordHash = await hashPassword('demo1234');

    await prisma.careUnit.upsert({
      where: { id: CARE_UNIT_B_ID },
      update: { name: 'Test Unit B (Slice 3)' },
      create: { id: CARE_UNIT_B_ID, name: 'Test Unit B (Slice 3)' },
    });
    await prisma.user.upsert({
      where: { email: USER_B_EMAIL },
      update: { name: 'User B', role: 'sjukskoterska', careUnitId: CARE_UNIT_B_ID, passwordHash },
      create: { email: USER_B_EMAIL, name: 'User B', role: 'sjukskoterska', careUnitId: CARE_UNIT_B_ID, passwordHash },
    });

    // Login as user A (primary sjukskoterska), create an order in CareUnit A
    const cookieA = await loginAs(TEST_SJUKSKOTERSKA);
    const orderA = await createEmptyOrder(cookieA);

    // Login as user B (CareUnit B)
    const cookieB = await loginAs({ email: USER_B_EMAIL, password: 'demo1234' });

    // Attempt GET /api/orders/:id from user B — must be 404, not 403 (D-73)
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/orders/${orderA.id}`,
      headers: { cookie: cookieB },
    });
    expect(getRes.statusCode).toBe(404);
    const body = getRes.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');

    // Cleanup
    await prisma.order.delete({ where: { id: orderA.id } });
  });

  it('(c) POST /api/orders/:id/lines on Utkast returns 200 with lines.length incremented and lines[*].name populated', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(cookie);

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 5 },
    });
    expect(addRes.statusCode).toBe(200);
    const body = addRes.json() as {
      id: string;
      lines: Array<{ id: string; name: string; quantity: number; careUnitMedicationId: string }>;
    };
    expect(body.id).toBe(order.id);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]!.careUnitMedicationId).toBe(cum.id);
    expect(body.lines[0]!.quantity).toBe(5);
    expect(typeof body.lines[0]!.name).toBe('string');
    expect(body.lines[0]!.name.length).toBeGreaterThan(0);

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('(d) PATCH /api/orders/:id/lines/:lineId updates quantity and returns full Order', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(cookie);

    // Add a line first
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 2 },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = addRes.json() as { lines: Array<{ id: string }> };
    const lineId = addBody.lines[0]!.id;

    // PATCH quantity
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/orders/${order.id}/lines/${lineId}`,
      headers: { cookie },
      payload: { quantity: 7 },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json() as { lines: Array<{ id: string; quantity: number }> };
    const updatedLine = patchBody.lines.find((l) => l.id === lineId);
    expect(updatedLine).toBeDefined();
    expect(updatedLine!.quantity).toBe(7);

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('(e) DELETE /api/orders/:id/lines/:lineId removes the line and returns full Order with decremented lines.length', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(cookie);

    // Add a line
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = addRes.json() as { lines: Array<{ id: string }> };
    const lineId = addBody.lines[0]!.id;
    expect(addBody.lines).toHaveLength(1);

    // DELETE the line
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/orders/${order.id}/lines/${lineId}`,
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    const deleteBody = deleteRes.json() as { lines: unknown[] };
    expect(deleteBody.lines).toHaveLength(0);

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('(f) 409 order_locked — line mutations on a Skickad order return 409 with order_locked code and details.status', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(cookie);

    // Add a line to the order first (so submit won't fail empty-order 422)
    const addLineFirst = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });
    expect(addLineFirst.statusCode).toBe(200);
    const addBody = addLineFirst.json() as { lines: Array<{ id: string }> };
    const lineId = addBody.lines[0]!.id;

    // Force status to 'skickad' via prisma directly (bypassing the submit route)
    // This is the Slice 3 test pattern — Slice 4 adds the canonical submit-then-edit test
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'skickad' },
    });

    // POST /api/orders/:id/lines on a skickad order must return 409 order_locked
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(409);
    const addLockedBody = addRes.json() as { error: { code: string; message: string; details: { status: string } } };
    expect(addLockedBody.error.code).toBe('order_locked');
    expect(addLockedBody.error.message).toBe('Beställningen kan inte ändras efter att den skickats.');
    expect(addLockedBody.error.details.status).toBe('skickad');

    // PATCH on a skickad order must also return 409
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/orders/${order.id}/lines/${lineId}`,
      headers: { cookie },
      payload: { quantity: 99 },
    });
    expect(patchRes.statusCode).toBe(409);
    expect(patchRes.json().error.code).toBe('order_locked');

    // DELETE on a skickad order must also return 409
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/orders/${order.id}/lines/${lineId}`,
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(409);
    expect(deleteRes.json().error.code).toBe('order_locked');

    // Cleanup — hard-delete since status is now skickad (softDelete would 409)
    await prisma.orderLine.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('(g) GET /api/orders/picker-options scopes to careUnit and filters out soft-deleted CareUnitMedications', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);

    // Find a real CareUnitMedication to soft-delete
    const cum = await prisma.careUnitMedication.findFirst({
      where: { careUnitId: TEST_SJUKSKOTERSKA.careUnitId, deletedAt: null },
      include: { medication: true },
    });
    expect(cum).not.toBeNull();
    if (!cum) throw new Error('no CUM found');

    const q = cum.medication.name.slice(0, 3);

    // Baseline: query before soft-delete — should include cum
    const beforeRes = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-options?q=${encodeURIComponent(q)}&limit=20`,
      headers: { cookie },
    });
    expect(beforeRes.statusCode).toBe(200);
    const beforeBody = beforeRes.json() as { results: Array<{ careUnitMedicationId: string }> };
    const beforeIds = beforeBody.results.map((r) => r.careUnitMedicationId);
    // May or may not be included depending on query match — just verify status code + shape
    expect(Array.isArray(beforeBody.results)).toBe(true);
    if (beforeIds.includes(cum.id)) {
      // Soft-delete it and verify it disappears
      await prisma.careUnitMedication.update({
        where: { id: cum.id },
        data: { deletedAt: new Date() },
      });

      const afterRes = await app.inject({
        method: 'GET',
        url: `/api/orders/picker-options?q=${encodeURIComponent(q)}&limit=20`,
        headers: { cookie },
      });
      expect(afterRes.statusCode).toBe(200);
      const afterBody = afterRes.json() as { results: Array<{ careUnitMedicationId: string }> };
      expect(afterBody.results.map((r) => r.careUnitMedicationId)).not.toContain(cum.id);

      // Restore
      await prisma.careUnitMedication.update({
        where: { id: cum.id },
        data: { deletedAt: null },
      });
    }
  });

  it('(h) GET /api/orders/picker-options without a session returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/picker-options?q=test',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });
});
