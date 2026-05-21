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
 * Phase 3 D-73 — Order integration tests (Slice 2 skeleton).
 *
 * Slice 2 ships two `it` blocks:
 *   (a) POST /api/orders — creates Utkast order scoped to caller's careUnit;
 *       Zod .strict() rejects stray body fields (T-03-02 mass-assignment guard).
 *   (b) GET /api/orders?status=utkast — returns only the caller's careUnit orders,
 *       sorted createdAt DESC, including lineCount, totalQuantity, createdBy.name.
 *
 * Full coverage (happy path, 409, 422, cross-careUnit, list scoping) lands in Slice 4.
 * The Slice 4 executor must call ensureSecondCareUnitSeeded() (see TODO below) for
 * the D-73 scenario 4 cross-tenant tests.
 *
 * Harness mirrors apps/api/test/auth.flow.smoke.test.ts exactly.
 */

// TODO Slice 4 D-73 scenario 4 needs ensureSecondCareUnitSeeded().
// Add a second CareUnit (CARE_UNIT_ID_B = 'careunit-test-b-01') + a user
// (SJUKSKOTERSKA_B) in buildTestApp.ts so the cross-tenant 404 test can login
// as user-A, create an order, then attempt GET/PATCH/DELETE from user-B's
// session and assert 404 not_found (never 403).

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
