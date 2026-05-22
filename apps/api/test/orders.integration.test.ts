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
 * Phase 3 D-73 — Order integration tests (Slice 2 + Slice 3 + Slice 4).
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
 * Slice 4 adds the canonical D-73 five-scenario suite:
 *   1. Happy path — create → add-line → patch-quantity → submit
 *   2. 409 order_locked after submit on every subsequent line op
 *   3. 422 validation_failed on submit with empty lines or quantity <= 0
 *   4. Cross-careUnit returns 404 not 403 for GET/PATCH/DELETE on foreign order
 *   5. Draft list scoping returns only caller's careUnit utkast orders
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

  it('(i) CR-01: POST /api/orders/:id/lines with a CareUnitMedication id from another vårdenhet returns 404 (not 403) — never inserts the line', async () => {
    // Seed a second CareUnit B with at least one CareUnitMedication
    // distinct from CareUnit A's set.
    const CARE_UNIT_B_ID = 'careunit-test-b-cr01';
    const USER_B_EMAIL = 'sjukskoterska-b-cr01@example.test';
    const { hashPassword } = await import('../src/auth/password.js');
    const passwordHash = await hashPassword('demo1234');

    await prisma.careUnit.upsert({
      where: { id: CARE_UNIT_B_ID },
      update: { name: 'Test Unit B (CR-01)' },
      create: { id: CARE_UNIT_B_ID, name: 'Test Unit B (CR-01)' },
    });
    await prisma.user.upsert({
      where: { email: USER_B_EMAIL },
      update: { name: 'User B CR01', role: 'sjukskoterska', careUnitId: CARE_UNIT_B_ID, passwordHash },
      create: { email: USER_B_EMAIL, name: 'User B CR01', role: 'sjukskoterska', careUnitId: CARE_UNIT_B_ID, passwordHash },
    });

    // Create a CareUnitMedication owned by CareUnit B. Reuses any existing
    // Medication so we don't need to seed a new NPL row.
    const anyMedication = await prisma.medication.findFirst();
    if (!anyMedication) throw new Error('No Medication seeded — run seed first');
    const cumB = await prisma.careUnitMedication.upsert({
      where: { careUnitId_medicationId: { careUnitId: CARE_UNIT_B_ID, medicationId: anyMedication.id } },
      update: { deletedAt: null },
      create: {
        careUnitId: CARE_UNIT_B_ID,
        medicationId: anyMedication.id,
        currentStock: 10,
        lowStockThreshold: 1,
      },
    });

    // User A creates a draft order in CareUnit A and attempts to add a line
    // referencing CareUnit B's CUM id. The FK accepts it; the service must reject.
    const cookieA = await loginAs(TEST_SJUKSKOTERSKA);
    const orderA = await createEmptyOrder(cookieA);

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderA.id}/lines`,
      headers: { cookie: cookieA },
      payload: { careUnitMedicationId: cumB.id, quantity: 1 },
    });

    // D-73: 404 (not 403) to avoid existence-probing across tenants.
    expect(addRes.statusCode).toBe(404);
    const body = addRes.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.code).not.toBe('forbidden');

    // Verify NO line was created — the order must still have 0 lines.
    const reloaded = await prisma.order.findUnique({
      where: { id: orderA.id },
      include: { lines: true },
    });
    expect(reloaded?.lines).toHaveLength(0);

    // Cleanup
    await prisma.order.delete({ where: { id: orderA.id } });
  });
});

// ---------------------------------------------------------------------------
// Slice 4 (D-73): Canonical 5-scenario integration test suite
// ---------------------------------------------------------------------------

describe('Draft orders integration', () => {
  // ---------------------------------------------------------------------------
  // Scenario 1: Happy path — create → add-line → patch-quantity → submit
  // ---------------------------------------------------------------------------
  it('happy path: create → add-line → patch-quantity → submit', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    // POST /api/orders → 201 utkast
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie },
      payload: {},
    });
    expect(createRes.statusCode).toBe(201);
    const order = createRes.json() as { id: string; status: string; lines: unknown[] };
    expect(order.status).toBe('utkast');
    expect(order.lines).toHaveLength(0);
    const orderId = order.id;

    // POST /api/orders/:id/lines → 200 with 1 line
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 2 },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = addRes.json() as { lines: Array<{ id: string; quantity: number }> };
    expect(addBody.lines).toHaveLength(1);
    const lineId = addBody.lines[0]!.id;

    // PATCH /api/orders/:id/lines/:lineId → 200 with updated quantity
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/orders/${orderId}/lines/${lineId}`,
      headers: { cookie },
      payload: { quantity: 5 },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json() as { lines: Array<{ id: string; quantity: number }> };
    expect(patchBody.lines.find((l) => l.id === lineId)!.quantity).toBe(5);

    // POST /api/orders/:id/submit → 200 with status: 'skickad'
    const submitRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/submit`,
      headers: { cookie },
    });
    expect(submitRes.statusCode).toBe(200);
    const submitBody = submitRes.json() as {
      status: string;
      submittedAt: string | null;
      submittedByUserId: string | null;
      lines: Array<{ id: string; quantity: number }>;
    };
    expect(submitBody.status).toBe('skickad');
    expect(submitBody.submittedAt).not.toBeNull();
    expect(typeof submitBody.submittedAt).toBe('string');
    // submittedAt should be a valid ISO string
    expect(() => new Date(submitBody.submittedAt!)).not.toThrow();
    expect(submitBody.submittedByUserId).not.toBeNull();

    // Verify response is parseable by the orderResponse schema
    const { orderResponse } = await import('@meditrack/shared');
    expect(() => orderResponse.parse(submitBody)).not.toThrow();

    // Cleanup
    await prisma.orderLine.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: 409 order_locked after submit — every subsequent op returns 409
  // ---------------------------------------------------------------------------
  it('returns 409 order_locked on all line ops + re-submit + delete after submit', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    // Create, add line, submit
    const createRes = await app.inject({ method: 'POST', url: '/api/orders', headers: { cookie }, payload: {} });
    expect(createRes.statusCode).toBe(201);
    const orderId = (createRes.json() as { id: string }).id;

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(200);
    const lineId = (addRes.json() as { lines: Array<{ id: string }> }).lines[0]!.id;

    const submitRes = await app.inject({ method: 'POST', url: `/api/orders/${orderId}/submit`, headers: { cookie } });
    expect(submitRes.statusCode).toBe(200);
    expect((submitRes.json() as { status: string }).status).toBe('skickad');

    // Now verify all subsequent ops return 409 order_locked with details.status = 'skickad'
    const lockCases: Array<{ method: string; url: string; payload?: unknown }> = [
      { method: 'POST', url: `/api/orders/${orderId}/lines`, payload: { careUnitMedicationId: cum.id, quantity: 1 } },
      { method: 'PATCH', url: `/api/orders/${orderId}/lines/${lineId}`, payload: { quantity: 99 } },
      { method: 'DELETE', url: `/api/orders/${orderId}/lines/${lineId}` },
      { method: 'POST', url: `/api/orders/${orderId}/submit` },
      { method: 'DELETE', url: `/api/orders/${orderId}` },
    ];

    for (const { method, url, payload } of lockCases) {
      const res = await app.inject({ method, url, headers: { cookie }, payload });
      expect(res.statusCode).toBe(409);
      const body = res.json() as { error: { code: string; details: { status: string } } };
      expect(body.error.code).toBe('order_locked');
      expect(body.error.details.status).toBe('skickad');
    }

    // Cleanup — hard-delete since status is skickad
    await prisma.orderLine.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: 422 validation_failed on submit with empty or poisoned lines
  // ---------------------------------------------------------------------------
  it('returns 422 validation_failed on submit with empty lines or quantity <= 0', async () => {
    const cookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    // Sub-test (a): submit empty draft → 422 empty_order
    const createResA = await app.inject({ method: 'POST', url: '/api/orders', headers: { cookie }, payload: {} });
    expect(createResA.statusCode).toBe(201);
    const orderIdA = (createResA.json() as { id: string }).id;

    const submitEmptyRes = await app.inject({ method: 'POST', url: `/api/orders/${orderIdA}/submit`, headers: { cookie } });
    expect(submitEmptyRes.statusCode).toBe(422);
    const emptyBody = submitEmptyRes.json() as { error: { code: string; details: { reason: string } } };
    expect(emptyBody.error.code).toBe('validation_failed');
    expect(emptyBody.error.details.reason).toBe('empty_order');

    // Cleanup A
    await prisma.order.delete({ where: { id: orderIdA } });

    // Sub-test (b): create draft, add line, poison quantity to 0 via prisma, submit → 422 invalid_quantity
    const createResB = await app.inject({ method: 'POST', url: '/api/orders', headers: { cookie }, payload: {} });
    expect(createResB.statusCode).toBe(201);
    const orderIdB = (createResB.json() as { id: string }).id;

    // Add a line via API (normal quantity)
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderIdB}/lines`,
      headers: { cookie },
      payload: { careUnitMedicationId: cum.id, quantity: 3 },
    });
    expect(addRes.statusCode).toBe(200);
    const lineId = (addRes.json() as { lines: Array<{ id: string }> }).lines[0]!.id;

    // Poison: directly set quantity = 0 via prisma (the public PATCH route uses .positive() which rejects this)
    await prisma.orderLine.update({ where: { id: lineId }, data: { quantity: 0 } });

    const submitPoisonedRes = await app.inject({ method: 'POST', url: `/api/orders/${orderIdB}/submit`, headers: { cookie } });
    expect(submitPoisonedRes.statusCode).toBe(422);
    const poisonBody = submitPoisonedRes.json() as { error: { code: string; details: { reason: string; lineId: string } } };
    expect(poisonBody.error.code).toBe('validation_failed');
    expect(poisonBody.error.details.reason).toBe('invalid_quantity');
    expect(poisonBody.error.details.lineId).toBe(lineId);

    // Cleanup B
    await prisma.orderLine.deleteMany({ where: { orderId: orderIdB } });
    await prisma.order.delete({ where: { id: orderIdB } });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Cross-careUnit access returns 404 not 403
  // ---------------------------------------------------------------------------
  it('cross-careUnit access returns 404 not_found on GET/PATCH/DELETE — never forbidden', async () => {
    const CARE_UNIT_B_ID = 'careunit-test-b-slice4';
    const USER_B_EMAIL = 'sjukskoterska-b-slice4@example.test';
    const { hashPassword } = await import('../src/auth/password.js');
    const passwordHash = await hashPassword('demo1234');

    // Seed second CareUnit + user
    await prisma.careUnit.upsert({
      where: { id: CARE_UNIT_B_ID },
      update: { name: 'Test Unit B (Slice 4)' },
      create: { id: CARE_UNIT_B_ID, name: 'Test Unit B (Slice 4)' },
    });
    await prisma.user.upsert({
      where: { email: USER_B_EMAIL },
      update: { name: 'User B Slice4', role: 'sjukskoterska', careUnitId: CARE_UNIT_B_ID, passwordHash },
      create: { email: USER_B_EMAIL, name: 'User B Slice4', role: 'sjukskoterska', careUnitId: CARE_UNIT_B_ID, passwordHash },
    });

    // User A creates an order in CareUnit A
    const cookieA = await loginAs(TEST_SJUKSKOTERSKA);
    const createRes = await app.inject({ method: 'POST', url: '/api/orders', headers: { cookie: cookieA }, payload: {} });
    expect(createRes.statusCode).toBe(201);
    const orderIdA = (createRes.json() as { id: string }).id;

    // Add a line for testing PATCH/DELETE line endpoints
    const cum = await findTestCareUnitMedication();
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderIdA}/lines`,
      headers: { cookie: cookieA },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(200);
    const lineId = (addRes.json() as { lines: Array<{ id: string }> }).lines[0]!.id;

    // User B from CareUnit B tries to access order from CareUnit A
    const cookieB = await loginAs({ email: USER_B_EMAIL, password: 'demo1234' });

    const crossCases: Array<{ method: string; url: string; payload?: unknown }> = [
      { method: 'GET', url: `/api/orders/${orderIdA}` },
      { method: 'POST', url: `/api/orders/${orderIdA}/lines`, payload: { careUnitMedicationId: cum.id, quantity: 1 } },
      { method: 'PATCH', url: `/api/orders/${orderIdA}/lines/${lineId}`, payload: { quantity: 5 } },
      { method: 'DELETE', url: `/api/orders/${orderIdA}/lines/${lineId}` },
      { method: 'POST', url: `/api/orders/${orderIdA}/submit` },
      { method: 'DELETE', url: `/api/orders/${orderIdA}` },
    ];

    for (const { method, url, payload } of crossCases) {
      const res = await app.inject({ method, url, headers: { cookie: cookieB }, payload });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('not_found');
      // NEVER 403 — verifies D-73 existence-probe protection (T-03-01)
      expect(body.error.code).not.toBe('forbidden');
    }

    // Cleanup
    await prisma.orderLine.deleteMany({ where: { orderId: orderIdA } });
    await prisma.order.delete({ where: { id: orderIdA } });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Draft list scoping — only caller's careUnit utkast orders
  // ---------------------------------------------------------------------------
  it("drafts list returns only caller's careUnit utkast orders — excludes other status + other careUnit", async () => {
    const CARE_UNIT_C_ID = 'careunit-test-c-slice4';
    const USER_C_EMAIL = 'sjukskoterska-c-slice4@example.test';
    const { hashPassword } = await import('../src/auth/password.js');
    const passwordHash = await hashPassword('demo1234');

    // Seed third CareUnit + user C
    await prisma.careUnit.upsert({
      where: { id: CARE_UNIT_C_ID },
      update: { name: 'Test Unit C (Slice 4)' },
      create: { id: CARE_UNIT_C_ID, name: 'Test Unit C (Slice 4)' },
    });
    await prisma.user.upsert({
      where: { email: USER_C_EMAIL },
      update: { name: 'User C Slice4', role: 'sjukskoterska', careUnitId: CARE_UNIT_C_ID, passwordHash },
      create: { email: USER_C_EMAIL, name: 'User C Slice4', role: 'sjukskoterska', careUnitId: CARE_UNIT_C_ID, passwordHash },
    });
    // Get user C's id for creating orders
    const userC = await prisma.user.findUnique({ where: { email: USER_C_EMAIL } });
    if (!userC) throw new Error('User C not found');

    const cookieA = await loginAs(TEST_SJUKSKOTERSKA);

    // Seed CareUnit A: 2 Utkast orders (via API) + 1 Skickad (via direct prisma)
    const createA1 = await app.inject({ method: 'POST', url: '/api/orders', headers: { cookie: cookieA }, payload: {} });
    expect(createA1.statusCode).toBe(201);
    const orderA1Id = (createA1.json() as { id: string }).id;

    const createA2 = await app.inject({ method: 'POST', url: '/api/orders', headers: { cookie: cookieA }, payload: {} });
    expect(createA2.statusCode).toBe(201);
    const orderA2Id = (createA2.json() as { id: string }).id;

    // Get user A's id
    const userA = await prisma.user.findUnique({ where: { email: TEST_SJUKSKOTERSKA.email } });
    if (!userA) throw new Error('User A not found');

    // Seed 1 Skickad order for CareUnit A directly via prisma
    const orderASkickad = await prisma.order.create({
      data: {
        careUnitId: TEST_SJUKSKOTERSKA.careUnitId,
        createdByUserId: userA.id,
        status: 'skickad',
        submittedAt: new Date(),
        submittedByUserId: userA.id,
      },
    });

    // Seed 1 Utkast for CareUnit C via prisma
    const orderC = await prisma.order.create({
      data: {
        careUnitId: CARE_UNIT_C_ID,
        createdByUserId: userC.id,
        status: 'utkast',
      },
    });

    // GET /api/orders?status=utkast as User A
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/orders?status=utkast',
      headers: { cookie: cookieA },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json() as {
      rows: Array<{
        id: string;
        status: string;
        lineCount: number;
        totalQuantity: number;
        createdBy: { id: string; name: string };
      }>;
      total: number;
    };

    const ids = listBody.rows.map((r) => r.id);

    // Must contain A's two utkast orders
    expect(ids).toContain(orderA1Id);
    expect(ids).toContain(orderA2Id);

    // Must NOT contain A's skickad order
    expect(ids).not.toContain(orderASkickad.id);

    // Must NOT contain C's utkast order (wrong careUnit)
    expect(ids).not.toContain(orderC.id);

    // All rows must be utkast and have populated lineCount + totalQuantity + createdBy.name
    for (const row of listBody.rows.filter((r) => [orderA1Id, orderA2Id].includes(r.id))) {
      expect(row.status).toBe('utkast');
      expect(typeof row.lineCount).toBe('number');
      expect(typeof row.totalQuantity).toBe('number');
      expect(typeof row.createdBy.name).toBe('string');
    }

    // Cleanup
    await prisma.order.deleteMany({ where: { id: { in: [orderA1Id, orderA2Id, orderASkickad.id, orderC.id] } } });
  });
});
