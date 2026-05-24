import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pickerSuggestionsResponse } from '@meditrack/shared';
import {
  TEST_ADMIN,
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  createEmptyOrder,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 8 Plan 03 Task 1 — picker-suggestions integration tests.
 *
 * Covers ORD-08 + D-135 + D-136 + D-138 + T-08-02.
 *
 * Seven test scenarios:
 *
 *   Test A (shape): GET /api/orders/picker-suggestions?orderId=<id> returns
 *     200 with a body that Zod-parses through pickerSuggestionsResponse.
 *
 *   Test B (RBAC positive 3-role matrix): all three seeded roles (sjukskoterska,
 *     apotekare, admin) have order:create and must all receive 200. The
 *     sjukskoterska creates the draft; all three roles then query it (they all
 *     share the same careUnit per ensureAllRolesSeeded).
 *
 *   Test C (unauthenticated → 401): GET without session returns 401 with
 *     envelope code 'unauthenticated'.
 *
 *   Test D (cross-tenant isolation — T-08-02): a user in vårdenhet B gets
 *     404 when querying an order that belongs to vårdenhet A.
 *
 *   Test E (dedupe invariant — D-135): a careUnitMedicationId that is both
 *     most-ordered AND below threshold appears ONLY in lowStock, NOT in
 *     mostOrdered.
 *
 *   Test F (dedupe fallthrough — D-135): with ≥6 CUMs with order lines and
 *     one of the top-5 deduped to lowStock, mostOrdered.length === 5
 *     (the 6th-ranked fills the gap).
 *
 *   Test G (size caps): mostOrdered.length <= 5 AND lowStock.length <= 5.
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

describe('GET /api/orders/picker-suggestions', () => {
  it('Test A (shape): returns 200 with pickerSuggestionsResponse shape', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);
    const order = await createEmptyOrder(app, cookie);

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${order.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = pickerSuggestionsResponse.parse(res.json());
    expect(Array.isArray(body.mostOrdered)).toBe(true);
    expect(Array.isArray(body.lowStock)).toBe(true);
  });

  it('Test B (RBAC positive 3-role matrix): all three roles get 200', async () => {
    // Sjuksköterska creates the order (she owns the draft)
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const order = await createEmptyOrder(app, nurseCookie);

    // 1. sjuksköterska herself can call the endpoint
    const nurseRes = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${order.id}`,
      headers: { cookie: nurseCookie },
    });
    expect(nurseRes.statusCode).toBe(200);
    expect(() => pickerSuggestionsResponse.parse(nurseRes.json())).not.toThrow();

    // 2. apotekare (same vårdenhet) can also call the endpoint
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const apotekareRes = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${order.id}`,
      headers: { cookie: apotekareCookie },
    });
    expect(apotekareRes.statusCode).toBe(200);
    expect(() => pickerSuggestionsResponse.parse(apotekareRes.json())).not.toThrow();

    // 3. admin (same vårdenhet) can also call the endpoint
    const adminCookie = await loginAs(app, TEST_ADMIN);
    const adminRes = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${order.id}`,
      headers: { cookie: adminCookie },
    });
    expect(adminRes.statusCode).toBe(200);
    expect(() => pickerSuggestionsResponse.parse(adminRes.json())).not.toThrow();
  });

  it('Test C (unauthenticated): returns 401 with code unauthenticated', async () => {
    // Need a valid-looking orderId — use a dummy UUID
    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/picker-suggestions?orderId=some-order-id',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('Test D (cross-tenant isolation — T-08-02): vårdenhet B user gets 404 for vårdenhet A order', async () => {
    // Create an order in vårdenhet A as apotekare
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const orderA = await createEmptyOrder(app, apotekareCookie);

    // Set up vårdenhet B with a fresh user
    const { hashPassword } = await import('../src/auth/password.js');

    // Clean up any leftover from a prior run (idempotency)
    const stale = await prisma.user.findUnique({
      where: { email: 'picker-suggestions-b@test.example' },
    });
    if (stale) {
      await prisma.session.deleteMany({ where: { userId: stale.id } });
      const staleCu = await prisma.careUnit.findFirst({
        where: { name: 'Vårdenhet B PickerSuggestions Test' },
      });
      if (staleCu) {
        await prisma.careUnitMedication.deleteMany({ where: { careUnitId: staleCu.id } });
        await prisma.order.deleteMany({ where: { careUnitId: staleCu.id } });
      }
      await prisma.user.delete({ where: { id: stale.id } });
      const cu2 = await prisma.careUnit.findFirst({
        where: { name: 'Vårdenhet B PickerSuggestions Test' },
      });
      if (cu2) {
        await prisma.careUnit.delete({ where: { id: cu2.id } });
      }
    }

    const careUnitB = await prisma.careUnit.create({
      data: { name: 'Vårdenhet B PickerSuggestions Test' },
    });
    const hash = await hashPassword('demo1234');
    const userB = await prisma.user.create({
      data: {
        email: 'picker-suggestions-b@test.example',
        name: 'User B PickerSuggestions',
        role: 'apotekare',
        careUnitId: careUnitB.id,
        passwordHash: hash,
      },
    });

    // Log in as vårdenhet B user and try to access vårdenhet A order
    const cookieB = await loginAs(app, {
      email: userB.email,
      password: 'demo1234',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${orderA.id}`,
      headers: { cookie: cookieB },
    });

    // D-73 / T-08-02: must return 404 (not 403) to avoid existence-probing
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');

    // Cleanup
    await prisma.session.deleteMany({ where: { userId: userB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
    await prisma.careUnit.delete({ where: { id: careUnitB.id } });
  });

  it('Test E (dedupe invariant — D-135): a CUM that is both most-ordered AND below threshold appears only in lowStock', async () => {
    // Create an isolated vårdenhet so we control exactly which CUMs exist
    const { hashPassword } = await import('../src/auth/password.js');

    // Cleanup any stale fixture
    const staleE = await prisma.user.findUnique({ where: { email: 'picker-dedup-e@test.example' } });
    if (staleE) {
      await prisma.session.deleteMany({ where: { userId: staleE.id } });
      const staleCuE = await prisma.careUnit.findFirst({ where: { name: 'Dedup Test E Unit' } });
      if (staleCuE) {
        await prisma.orderLine.deleteMany({ where: { order: { careUnitId: staleCuE.id } } });
        await prisma.order.deleteMany({ where: { careUnitId: staleCuE.id } });
        await prisma.careUnitMedication.deleteMany({ where: { careUnitId: staleCuE.id } });
      }
      await prisma.user.delete({ where: { id: staleE.id } });
      const staleCuE2 = await prisma.careUnit.findFirst({ where: { name: 'Dedup Test E Unit' } });
      if (staleCuE2) await prisma.careUnit.delete({ where: { id: staleCuE2.id } });
    }

    // Seed: one isolated vårdenhet with 2 CUMs
    const cuE = await prisma.careUnit.create({ data: { name: 'Dedup Test E Unit' } });
    const hash = await hashPassword('demo1234');
    const userE = await prisma.user.create({
      data: {
        email: 'picker-dedup-e@test.example',
        name: 'User Dedup E',
        role: 'apotekare',
        careUnitId: cuE.id,
        passwordHash: hash,
      },
    });

    // Pick two real global Medication rows
    const meds = await prisma.medication.findMany({ orderBy: { name: 'asc' }, take: 2 });
    const [med1, med2] = meds;
    if (!med1 || !med2) throw new Error('Need at least 2 medications in DB');

    // CUM A: below threshold (will be in lowStock) + will have order lines (high rank in most-ordered)
    const cumA = await prisma.careUnitMedication.create({
      data: {
        careUnitId: cuE.id,
        medicationId: med1.id,
        currentStock: 0,      // below threshold → goes to lowStock
        lowStockThreshold: 10,
      },
    });
    // CUM B: above threshold (safe)
    const cumB = await prisma.careUnitMedication.create({
      data: {
        careUnitId: cuE.id,
        medicationId: med2.id,
        currentStock: 100,    // above threshold → eligible for mostOrdered
        lowStockThreshold: 5,
      },
    });

    // Login as userE
    const cookieE = await loginAs(app, { email: userE.email, password: 'demo1234' });

    // Create order + add lines so cumA has order lines (making it rank in most-ordered)
    const order1 = await createEmptyOrder(app, cookieE);
    await app.inject({
      method: 'POST',
      url: `/api/orders/${order1.id}/lines`,
      headers: { cookie: cookieE },
      payload: { careUnitMedicationId: cumA.id, quantity: 2 },
    });
    // Also add cumB to the order so it's not alone
    await app.inject({
      method: 'POST',
      url: `/api/orders/${order1.id}/lines`,
      headers: { cookie: cookieE },
      payload: { careUnitMedicationId: cumB.id, quantity: 1 },
    });

    const testOrder = await createEmptyOrder(app, cookieE);
    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${testOrder.id}`,
      headers: { cookie: cookieE },
    });

    expect(res.statusCode).toBe(200);
    const body = pickerSuggestionsResponse.parse(res.json());

    // cumA (below threshold) must appear in lowStock
    const inLowStock = body.lowStock.some((r) => r.careUnitMedicationId === cumA.id);
    // cumA must NOT appear in mostOrdered (dedupe rule: Lågt lager wins)
    const inMostOrdered = body.mostOrdered.some((r) => r.careUnitMedicationId === cumA.id);

    expect(inLowStock).toBe(true);
    expect(inMostOrdered).toBe(false);

    // Zero overlap invariant: no careUnitMedicationId appears in both arrays
    const mostOrderedIds = new Set(body.mostOrdered.map((r) => r.careUnitMedicationId));
    const overlaps = body.lowStock.filter((r) => mostOrderedIds.has(r.careUnitMedicationId));
    expect(overlaps.length).toBe(0);

    // Cleanup
    await prisma.session.deleteMany({ where: { userId: userE.id } });
    await prisma.orderLine.deleteMany({ where: { order: { careUnitId: cuE.id } } });
    await prisma.order.deleteMany({ where: { careUnitId: cuE.id } });
    await prisma.careUnitMedication.deleteMany({ where: { careUnitId: cuE.id } });
    await prisma.user.delete({ where: { id: userE.id } });
    await prisma.careUnit.delete({ where: { id: cuE.id } });
  });

  it('Test F (dedupe fallthrough — D-135): when top-5 collides with lowStock, the 6th-ranked fills the slot', async () => {
    // Create an isolated vårdenhet with exactly 7 CUMs:
    //   CUM-0: below threshold + has order lines (deduped to lowStock)
    //   CUM-1..6: above threshold + have order lines (rank in most-ordered)
    // Expected: mostOrdered.length === 5 (CUM-1..5 + CUM-6 fills slot vacated by CUM-0)
    const { hashPassword } = await import('../src/auth/password.js');

    // Cleanup any stale fixture
    const staleF = await prisma.user.findUnique({ where: { email: 'picker-dedup-f@test.example' } });
    if (staleF) {
      await prisma.session.deleteMany({ where: { userId: staleF.id } });
      const staleCuF = await prisma.careUnit.findFirst({ where: { name: 'Dedup Test F Unit' } });
      if (staleCuF) {
        await prisma.orderLine.deleteMany({ where: { order: { careUnitId: staleCuF.id } } });
        await prisma.order.deleteMany({ where: { careUnitId: staleCuF.id } });
        await prisma.careUnitMedication.deleteMany({ where: { careUnitId: staleCuF.id } });
      }
      await prisma.user.delete({ where: { id: staleF.id } });
      const staleCuF2 = await prisma.careUnit.findFirst({ where: { name: 'Dedup Test F Unit' } });
      if (staleCuF2) await prisma.careUnit.delete({ where: { id: staleCuF2.id } });
    }

    const cuF = await prisma.careUnit.create({ data: { name: 'Dedup Test F Unit' } });
    const hash = await hashPassword('demo1234');
    const userF = await prisma.user.create({
      data: {
        email: 'picker-dedup-f@test.example',
        name: 'User Dedup F',
        role: 'apotekare',
        careUnitId: cuF.id,
        passwordHash: hash,
      },
    });

    // Need 7 real medications
    const meds = await prisma.medication.findMany({ orderBy: { name: 'asc' }, take: 7 });
    if (meds.length < 7) throw new Error('Need at least 7 medications in DB');

    // CUM-0: below threshold (the "deduped" one that goes to lowStock)
    const cum0 = await prisma.careUnitMedication.create({
      data: { careUnitId: cuF.id, medicationId: meds[0]!.id, currentStock: 0, lowStockThreshold: 10 },
    });
    // CUM-1..6: above threshold, eligible for mostOrdered
    const otherCums: Array<{ id: string }> = [];
    for (let i = 1; i <= 6; i++) {
      const cum = await prisma.careUnitMedication.create({
        data: { careUnitId: cuF.id, medicationId: meds[i]!.id, currentStock: 100, lowStockThreshold: 5 },
      });
      otherCums.push(cum);
    }

    const cookieF = await loginAs(app, { email: userF.email, password: 'demo1234' });

    // Create order lines: give cum0 AND each of CUM-1..6 order lines so all rank in most-ordered.
    // Give each the same order-line count so ties are broken by name (deterministic).
    const allCumIds = [cum0.id, ...otherCums.map((c) => c.id)];
    for (const cumId of allCumIds) {
      const order = await createEmptyOrder(app, cookieF);
      await app.inject({
        method: 'POST',
        url: `/api/orders/${order.id}/lines`,
        headers: { cookie: cookieF },
        payload: { careUnitMedicationId: cumId, quantity: 1 },
      });
    }

    const testOrder = await createEmptyOrder(app, cookieF);
    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${testOrder.id}`,
      headers: { cookie: cookieF },
    });

    expect(res.statusCode).toBe(200);
    const body = pickerSuggestionsResponse.parse(res.json());

    // cum0 must be in lowStock (below threshold)
    const inLowStock = body.lowStock.some((r) => r.careUnitMedicationId === cum0.id);
    expect(inLowStock).toBe(true);

    // cum0 must NOT be in mostOrdered (deduped)
    const inMostOrdered = body.mostOrdered.some((r) => r.careUnitMedicationId === cum0.id);
    expect(inMostOrdered).toBe(false);

    // mostOrdered must have exactly 5 (the 6th-ranked among the 6 non-deduped fills the gap)
    // All 7 CUMs have 1 order line each; cum0 is deduped. The remaining 6 all have 1 line,
    // top-5 by name (alphabetical) + 1 more = the 6th-ranked fills the vacated slot.
    expect(body.mostOrdered.length).toBe(5);

    // Zero overlap invariant
    const mostOrderedIds = new Set(body.mostOrdered.map((r) => r.careUnitMedicationId));
    const overlaps = body.lowStock.filter((r) => mostOrderedIds.has(r.careUnitMedicationId));
    expect(overlaps.length).toBe(0);

    // Cleanup
    await prisma.session.deleteMany({ where: { userId: userF.id } });
    await prisma.orderLine.deleteMany({ where: { order: { careUnitId: cuF.id } } });
    await prisma.order.deleteMany({ where: { careUnitId: cuF.id } });
    await prisma.careUnitMedication.deleteMany({ where: { careUnitId: cuF.id } });
    await prisma.user.delete({ where: { id: userF.id } });
    await prisma.careUnit.delete({ where: { id: cuF.id } });
  });

  it('Test G (size caps): mostOrdered.length <= 5 AND lowStock.length <= 5', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);
    const order = await createEmptyOrder(app, cookie);

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/picker-suggestions?orderId=${order.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = pickerSuggestionsResponse.parse(res.json());
    expect(body.mostOrdered.length).toBeLessThanOrEqual(5);
    expect(body.lowStock.length).toBeLessThanOrEqual(5);
  });
});
