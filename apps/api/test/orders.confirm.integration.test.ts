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

/**
 * Phase 4 D-74 / D-75 / D-84 — Confirm order integration tests (Slice A).
 *
 * 6-scenario suite:
 *   1. Happy path — create → add-line → submit → confirm; verifies status,
 *      confirmedAt, confirmedByUserId, confirmedBy.name, deliveredBy still null.
 *   2. Wrong-status 409 — confirm on utkast order returns order_transition_invalid.
 *   3. Double-confirm 409 — second confirm on bekraftad order returns 409.
 *   4. Cross-careUnit 404 — apotekare from different careUnit gets 404, not 403.
 *   5. Sjuksköterska 403 — requirePermission preHandler blocks non-apotekare.
 *   6. Not-found 404 — fabricated orderId returns 404.
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
// Local helpers (verbatim from orders.integration.test.ts per PATTERNS.md)
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

/**
 * Helper: advance an order from empty draft to Skickad (submitted).
 * Adds one line and submits as the provided nurse cookie.
 */
async function submitOrder(nurseCookie: string, orderId: string, cumId: string): Promise<void> {
  const lineRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/lines`,
    headers: { cookie: nurseCookie },
    payload: { careUnitMedicationId: cumId, quantity: 2 },
  });
  expect(lineRes.statusCode).toBe(200);

  const submitRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/submit`,
    headers: { cookie: nurseCookie },
  });
  expect(submitRes.statusCode).toBe(200);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Confirm order — Phase 4 Slice A (6-scenario D-74 suite)', () => {
  it('Test 1 (happy path): create → add-line → submit → confirm; response is bekraftad with actor stamps', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await submitOrder(nurseCookie, order.id, cum.id);

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/confirm`,
      headers: { cookie: apotekareCookie },
    });

    expect(confirmRes.statusCode).toBe(200);
    const body = confirmRes.json<{
      id: string;
      status: string;
      confirmedAt: string | null;
      confirmedByUserId: string | null;
      confirmedBy: { id: string; name: string } | null;
      deliveredAt: string | null;
      deliveredBy: null;
      submittedBy: { id: string; name: string } | null;
    }>();

    // Status flipped to bekraftad
    expect(body.status).toBe('bekraftad');

    // confirmedAt is a recent ISO datetime (non-null)
    expect(body.confirmedAt).not.toBeNull();
    const confirmedDate = new Date(body.confirmedAt!);
    expect(isNaN(confirmedDate.getTime())).toBe(false);
    // Confirmed within last 30 seconds
    expect(Date.now() - confirmedDate.getTime()).toBeLessThan(30_000);

    // Actor stamps correct
    // We need the apotekare user id — look up from DB
    const apotekareUser = await prisma.user.findUnique({
      where: { email: TEST_APOTEKARE.email },
    });
    expect(apotekareUser).not.toBeNull();
    expect(body.confirmedByUserId).toBe(apotekareUser!.id);
    expect(body.confirmedBy).toEqual({ id: apotekareUser!.id, name: TEST_APOTEKARE.name });

    // submittedBy populated (nurse submitted it)
    expect(body.submittedBy).not.toBeNull();

    // deliveredBy still null (not yet delivered)
    expect(body.deliveredAt).toBeNull();
    expect(body.deliveredBy).toBeNull();
  });

  it('Test 2 (wrong-status 409): confirm on utkast order returns order_transition_invalid', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    // Create draft but do NOT submit
    const order = await createEmptyOrder(nurseCookie);
    // Add a line so the order isn't empty, but skip submit
    await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/lines`,
      headers: { cookie: nurseCookie },
      payload: { careUnitMedicationId: cum.id, quantity: 1 },
    });

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/confirm`,
      headers: { cookie: apotekareCookie },
    });

    expect(confirmRes.statusCode).toBe(409);
    const body = confirmRes.json<{
      error: { code: string; details: { from: string; to: string; expected: string } };
    }>();
    expect(body.error.code).toBe('order_transition_invalid');
    expect(body.error.details.from).toBe('utkast');
    expect(body.error.details.to).toBe('bekraftad');
    expect(body.error.details.expected).toBe('skickad');
  });

  it('Test 3 (double-confirm 409): second confirm on bekraftad returns 409 with from=bekraftad', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(TEST_APOTEKARE);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await submitOrder(nurseCookie, order.id, cum.id);

    // First confirm succeeds
    const firstConfirm = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/confirm`,
      headers: { cookie: apotekareCookie },
    });
    expect(firstConfirm.statusCode).toBe(200);

    // Second confirm fails with 409
    const secondConfirm = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/confirm`,
      headers: { cookie: apotekareCookie },
    });
    expect(secondConfirm.statusCode).toBe(409);
    const body = secondConfirm.json<{
      error: { code: string; details: { from: string; expected: string } };
    }>();
    expect(body.error.code).toBe('order_transition_invalid');
    expect(body.error.details.from).toBe('bekraftad');
    expect(body.error.details.expected).toBe('skickad');
  });

  it('Test 4 (cross-careUnit 404): apotekare from different careUnit gets 404, not 403', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await submitOrder(nurseCookie, order.id, cum.id);

    // Create a second careUnit and an apotekare user in it
    const { hashPassword } = await import('../src/auth/password.js');
    const hash = await hashPassword('demo1234');

    // Clean up any leftover user from a prior test run before creating
    const existing = await prisma.user.findUnique({
      where: { email: 'other-apotekare@test.example' },
    });
    if (existing) {
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
      // Also clean up the associated careUnit if it was the test one
      const cu = await prisma.careUnit.findFirst({ where: { name: 'Other CareUnit Test' } });
      if (cu) {
        await prisma.careUnit.delete({ where: { id: cu.id } });
      }
    }

    const otherCareUnit = await prisma.careUnit.create({
      data: { name: 'Other CareUnit Test' },
    });
    const otherApotekare = await prisma.user.create({
      data: {
        email: 'other-apotekare@test.example',
        name: 'Other Apotekare',
        role: 'apotekare',
        careUnitId: otherCareUnit.id,
        passwordHash: hash,
      },
    });

    const otherCookie = await loginAs({ email: otherApotekare.email, password: 'demo1234' });

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/confirm`,
      headers: { cookie: otherCookie },
    });

    // Must be 404 not 403 (D-73 existence-probe protection)
    expect(confirmRes.statusCode).toBe(404);
    const body = confirmRes.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');

    // Cleanup
    await prisma.user.delete({ where: { id: otherApotekare.id } });
    await prisma.careUnit.delete({ where: { id: otherCareUnit.id } });
  });

  it('Test 5 (RBAC 403): sjuksköterska POSTing /confirm gets 403 from requirePermission', async () => {
    const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
    const cum = await findTestCareUnitMedication();

    const order = await createEmptyOrder(nurseCookie);
    await submitOrder(nurseCookie, order.id, cum.id);

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/confirm`,
      headers: { cookie: nurseCookie }, // sjukskoterska, not apotekare
    });

    expect(confirmRes.statusCode).toBe(403);
    const body = confirmRes.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('forbidden');

    // Verify order status is still skickad (unchanged)
    const reload = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reload!.status).toBe('skickad');
  });

  it('Test 6 (not-found 404): apotekare POSTing /confirm with fabricated orderId gets 404', async () => {
    const apotekareCookie = await loginAs(TEST_APOTEKARE);

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/orders/nonexistent-order-id/confirm',
      headers: { cookie: apotekareCookie },
    });

    expect(confirmRes.statusCode).toBe(404);
    const body = confirmRes.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');
  });
});
