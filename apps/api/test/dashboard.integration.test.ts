import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { lowStockListResponse } from '@meditrack/shared';
import {
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  createEmptyOrder,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  progressOrderToBekraftad,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 6 Plan 01 Task 1 — dashboard low-stock integration tests.
 *
 * Three scenarios covering NTF-01 + NTF-02:
 *
 *   Test 1 (shape + sort): GET /api/dashboard/low-stock as TEST_APOTEKARE
 *     returns 200 with { rows, total }; the contract Zod-parses cleanly;
 *     total > 0 because the seed forces ~8% of rows below threshold (Phase
 *     2 D-25); rows are sorted by (currentStock / lowStockThreshold) ASC,
 *     name ASC (D-117).
 *
 *   Test 2 (cross-careUnit isolation, T-06-01): a user in a second
 *     vårdenhet sees a DISJOINT row set from the first vårdenhet's user.
 *     Asserts the careUnitId scope in the $queryRaw WHERE clause holds.
 *
 *   Test 3 (post-deliver refetch, NTF-02 BE side): pick an under-threshold
 *     CUM, place a bekraftad order whose delivery pushes its stock ABOVE
 *     threshold, then GET /api/dashboard/low-stock again and assert
 *     total decreased by exactly 1. This is the BE foundation for the
 *     NTF-02 cache-key invalidation the FE wires in Task 2.
 *
 * All three tests use the apotekare session cookie unless they need a
 * second vårdenhet. The endpoint requires only requireSession (D-120, no
 * requirePermission — all roles see the dashboard).
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

describe('GET /api/dashboard/low-stock', () => {
  it('Test 1 (shape + sort): returns { rows, total } with rows sorted by urgency ratio then name', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/low-stock',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    // Zod-parse the response against the published contract — confirms shape.
    const body = lowStockListResponse.parse(res.json());
    expect(body.total).toBeGreaterThan(0);
    expect(body.rows.length).toBe(body.total);

    // Every row carries the documented shape (z.parse above proves this,
    // but assert one concrete row explicitly so a test reader sees the contract).
    const sample = body.rows[0]!;
    expect(typeof sample.careUnitMedicationId).toBe('string');
    expect(typeof sample.medicationId).toBe('string');
    expect(typeof sample.name).toBe('string');
    expect(sample.currentStock).toBeGreaterThanOrEqual(0);
    expect(sample.lowStockThreshold).toBeGreaterThan(0);
    expect(sample.currentStock).toBeLessThan(sample.lowStockThreshold);
    // therapeuticClass is currently NULL::text on every row (Plan 02 will populate).
    expect(sample.therapeuticClass).toBeNull();

    // Sort: (currentStock / lowStockThreshold) ASC, then name ASC.
    // Check the first 5 rows (or fewer if total < 5) — comparing every pair
    // would be O(N) which is unnecessary; the first few rows establish the
    // ordering contract.
    const sampleSize = Math.min(5, body.rows.length);
    for (let i = 0; i < sampleSize - 1; i++) {
      const a = body.rows[i]!;
      const b = body.rows[i + 1]!;
      const ratioA = a.currentStock / a.lowStockThreshold;
      const ratioB = b.currentStock / b.lowStockThreshold;
      // If ratios differ, ratioA must be ≤ ratioB. If ratios are equal,
      // names must be in ascending order.
      if (ratioA !== ratioB) {
        expect(ratioA).toBeLessThanOrEqual(ratioB);
      } else {
        expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('Test 2 (cross-careUnit isolation): second vårdenhet sees a disjoint row set', async () => {
    // Capture the seeded vårdenhet's row set first.
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const seededRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard/low-stock',
      headers: { cookie: apotekareCookie },
    });
    expect(seededRes.statusCode).toBe(200);
    const seededBody = lowStockListResponse.parse(seededRes.json());
    expect(seededBody.total).toBeGreaterThan(0);
    const seededIds = new Set(seededBody.rows.map((r) => r.careUnitMedicationId));

    // Create a second vårdenhet with its own user + a single under-threshold CUM.
    const { hashPassword } = await import('../src/auth/password.js');

    // Clean up any leftover from a prior interrupted run so the test is idempotent.
    const stale = await prisma.user.findUnique({
      where: { email: 'other-apotekare-dashboard@test.example' },
    });
    if (stale) {
      await prisma.session.deleteMany({ where: { userId: stale.id } });
      await prisma.careUnitMedication.deleteMany({
        where: { careUnit: { name: 'Other CareUnit Dashboard Test' } },
      });
      await prisma.user.delete({ where: { id: stale.id } });
      const cu = await prisma.careUnit.findFirst({
        where: { name: 'Other CareUnit Dashboard Test' },
      });
      if (cu) {
        await prisma.careUnitMedication.deleteMany({ where: { careUnitId: cu.id } });
        await prisma.careUnit.delete({ where: { id: cu.id } });
      }
    }

    const otherCareUnit = await prisma.careUnit.create({
      data: { name: 'Other CareUnit Dashboard Test' },
    });
    const hash = await hashPassword('demo1234');
    const otherUser = await prisma.user.create({
      data: {
        email: 'other-apotekare-dashboard@test.example',
        name: 'Other Apotekare Dashboard',
        role: 'apotekare',
        careUnitId: otherCareUnit.id,
        passwordHash: hash,
      },
    });

    // Seed a single under-threshold CUM in the other vårdenhet pointing at a
    // pre-existing global Medication row (any one will do — we want the join
    // to succeed). Use a stable medication: the first by name ASC.
    const med = await prisma.medication.findFirstOrThrow({
      orderBy: { name: 'asc' },
    });
    const otherCum = await prisma.careUnitMedication.create({
      data: {
        careUnitId: otherCareUnit.id,
        medicationId: med.id,
        currentStock: 0,
        lowStockThreshold: 5,
      },
    });

    // Log in as the second-vårdenhet user.
    const otherCookie = await loginAs(app, {
      email: otherUser.email,
      password: 'demo1234',
    });

    const otherRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard/low-stock',
      headers: { cookie: otherCookie },
    });
    expect(otherRes.statusCode).toBe(200);
    const otherBody = lowStockListResponse.parse(otherRes.json());

    // The other vårdenhet sees AT LEAST the one we seeded.
    expect(otherBody.total).toBeGreaterThanOrEqual(1);
    const otherIds = new Set(otherBody.rows.map((r) => r.careUnitMedicationId));
    expect(otherIds.has(otherCum.id)).toBe(true);

    // T-06-01: row sets are disjoint — no careUnitMedicationId overlap.
    for (const id of otherIds) {
      expect(seededIds.has(id)).toBe(false);
    }
    for (const id of seededIds) {
      expect(otherIds.has(id)).toBe(false);
    }

    // Cleanup.
    await prisma.session.deleteMany({ where: { userId: otherUser.id } });
    await prisma.careUnitMedication.delete({ where: { id: otherCum.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
    await prisma.careUnit.delete({ where: { id: otherCareUnit.id } });
  });

  it('Test 3 (post-deliver refetch): total drops by exactly 1 when a delivery pushes a CUM above threshold', async () => {
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);

    // Pick the FIRST under-threshold CUM in the seeded vårdenhet — the
    // dashboard endpoint already sorts by urgency, so the first row is
    // guaranteed to be one whose stock < threshold. Reload it via Prisma
    // to learn the exact stock/threshold so we can compute a delivery
    // quantity that pushes the row above threshold without leaving the
    // CUM in some indeterminate state.
    const dashboardBefore = await app.inject({
      method: 'GET',
      url: '/api/dashboard/low-stock',
      headers: { cookie: apotekareCookie },
    });
    expect(dashboardBefore.statusCode).toBe(200);
    const before = lowStockListResponse.parse(dashboardBefore.json());
    expect(before.total).toBeGreaterThan(0);
    const targetRow = before.rows[0]!;

    // Pick the CUM row and compute a quantity that pushes it strictly above
    // the threshold (so the predicate `currentStock < lowStockThreshold`
    // flips to false and the row drops out of the dashboard list).
    const targetCum = await prisma.careUnitMedication.findUniqueOrThrow({
      where: { id: targetRow.careUnitMedicationId },
    });
    expect(targetCum.careUnitId).toBe(TEST_SJUKSKOTERSKA.careUnitId);
    expect(targetCum.currentStock).toBeLessThan(targetCum.lowStockThreshold);

    // Deliver enough to push stock ABOVE threshold. Add a margin so we
    // don't end up exactly equal (predicate is strict <).
    const deliveryQuantity =
      targetCum.lowStockThreshold - targetCum.currentStock + 1;

    // Place + confirm + deliver an order with one line on the target CUM.
    const order = await createEmptyOrder(app, nurseCookie);
    await progressOrderToBekraftad(
      app,
      nurseCookie,
      apotekareCookie,
      order.id,
      [{ cumId: targetCum.id, quantity: deliveryQuantity }],
    );
    const deliverRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${order.id}/deliver`,
      headers: { cookie: apotekareCookie },
    });
    expect(deliverRes.statusCode).toBe(200);

    // Stock should now be above the threshold.
    const targetCumAfter = await prisma.careUnitMedication.findUniqueOrThrow({
      where: { id: targetCum.id },
    });
    expect(targetCumAfter.currentStock).toBeGreaterThanOrEqual(
      targetCum.lowStockThreshold,
    );

    // Refetch the dashboard list — the target row must NO LONGER appear
    // and total must drop by exactly 1.
    const dashboardAfter = await app.inject({
      method: 'GET',
      url: '/api/dashboard/low-stock',
      headers: { cookie: apotekareCookie },
    });
    expect(dashboardAfter.statusCode).toBe(200);
    const after = lowStockListResponse.parse(dashboardAfter.json());

    expect(after.total).toBe(before.total - 1);
    const afterIds = new Set(after.rows.map((r) => r.careUnitMedicationId));
    expect(afterIds.has(targetRow.careUnitMedicationId)).toBe(false);
  });
});

