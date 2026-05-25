import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { dashboardOrdersResponse } from '@meditrack/shared';
import {
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  loginAs,
  mintTestOrderNumber,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 9 Plan 02 Task 3 — GET /api/dashboard/orders integration tests.
 *
 * Five scenarios covering ORD-09 SC#1 + D-141..D-144 + D-16:
 *
 *   Test 1 (nurse subview shape): TEST_SJUKSKOTERSKA → 200; Zod-parses
 *     against dashboardOrdersResponse; role === 'sjukskoterska';
 *     egnaUtkast.rows are ALL status='utkast' AND createdBy.id is the
 *     seeded sjukskoterska's userId; recentHistory rows all status
 *     !== 'utkast'.
 *
 *   Test 2 (apotekare subview shape): TEST_APOTEKARE → 200;
 *     role === 'apotekare'; skickad.rows all status='skickad';
 *     bekraftad.rows all status='bekraftad'.
 *
 *   Test 3 (cross-vårdenhet isolation, T-09-04 / T-06-01 carry-over):
 *     A second-vårdenhet user's egnaUtkast.rows ids are DISJOINT from
 *     the seeded-vårdenhet user's egnaUtkast.rows ids. Setup mirrors
 *     dashboard.integration.test.ts Test 2 (lines 112–208) — idempotent
 *     cleanup, findOrCreate, hashPassword, finally-block teardown.
 *
 *   Test 4 (top-5 cap): seed 6 utkast for the nurse; assert
 *     egnaUtkast.rows.length === 5 AND egnaUtkast.count >= 6. Cleanup
 *     the 6 in finally.
 *
 *   Test 5 (DESC by createdAt): seed 3 utkast with explicit
 *     staggered createdAt; assert rows are returned newest-first
 *     (ISO-8601 lex compare === time compare).
 *
 * Endpoint is gated by requireSession only (D-15/D-120/D-141 — all three
 * roles see the dashboard).
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

describe('GET /api/dashboard/orders', () => {
  it('Test 1 (nurse subview shape): role=sjukskoterska, egnaUtkast rows are own utkast, recentHistory excludes utkast', async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    // Resolve the seeded nurse's userId for the per-row authorship check.
    const nurseUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/orders',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const body = dashboardOrdersResponse.parse(res.json());
    // Narrow the discriminator so TypeScript sees the nurse subview.
    if (body.role !== 'sjukskoterska') {
      throw new Error(`expected role=sjukskoterska, got ${body.role}`);
    }

    expect(body.egnaUtkast.rows.length).toBeLessThanOrEqual(5);
    expect(body.egnaUtkast.count).toBeGreaterThanOrEqual(
      body.egnaUtkast.rows.length,
    );
    for (const row of body.egnaUtkast.rows) {
      expect(row.status).toBe('utkast');
      expect(row.createdBy.id).toBe(nurseUser.id);
      // Phase 10 ORD-11 / D-168 — every dashboard row carries orderNumber.
      expect(row.orderNumber).toMatch(/^ORD-\d{4}-\d{4,}$/);
    }

    expect(body.recentHistory.length).toBeLessThanOrEqual(5);
    for (const row of body.recentHistory) {
      expect(row.status).not.toBe('utkast');
      // Phase 10 ORD-11 / D-168
      expect(row.orderNumber).toMatch(/^ORD-\d{4}-\d{4,}$/);
    }
  });

  it('Test 2 (apotekare subview shape): role=apotekare, skickad/bekraftad rows match their section status', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/orders',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const body = dashboardOrdersResponse.parse(res.json());
    if (body.role !== 'apotekare') {
      throw new Error(`expected role=apotekare, got ${body.role}`);
    }

    expect(body.skickad.rows.length).toBeLessThanOrEqual(5);
    expect(body.skickad.count).toBeGreaterThanOrEqual(body.skickad.rows.length);
    for (const row of body.skickad.rows) {
      expect(row.status).toBe('skickad');
      // Phase 10 ORD-11 / D-168
      expect(row.orderNumber).toMatch(/^ORD-\d{4}-\d{4,}$/);
    }

    expect(body.bekraftad.rows.length).toBeLessThanOrEqual(5);
    expect(body.bekraftad.count).toBeGreaterThanOrEqual(
      body.bekraftad.rows.length,
    );
    for (const row of body.bekraftad.rows) {
      expect(row.status).toBe('bekraftad');
      // Phase 10 ORD-11 / D-168
      expect(row.orderNumber).toMatch(/^ORD-\d{4}-\d{4,}$/);
    }
  });

  it('Test 3 (cross-vårdenhet isolation, T-09-04): second-vårdenhet nurse sees disjoint egnaUtkast row ids', async () => {
    // Capture the seeded-vårdenhet nurse's egnaUtkast row ids.
    const seededCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const seededRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard/orders',
      headers: { cookie: seededCookie },
    });
    expect(seededRes.statusCode).toBe(200);
    const seededBody = dashboardOrdersResponse.parse(seededRes.json());
    if (seededBody.role !== 'sjukskoterska') {
      throw new Error(`expected role=sjukskoterska, got ${seededBody.role}`);
    }
    const seededIds = new Set(
      seededBody.egnaUtkast.rows.map((r) => r.id),
    );

    // Build a second vårdenhet + a sjukskoterska user in it, then seed
    // one utkast under that user so the disjoint assertion has something
    // to compare against.
    const { hashPassword } = await import('../src/auth/password.js');

    // Idempotent cleanup of any leftover from a prior interrupted run.
    // WR-05 (Phase 9 review) — also delete CareUnitMedication rows for the
    // stale care unit defensively: a future Phase 8/10 feature may seed
    // them, and careUnit.delete() would throw on the FK constraint if any
    // exist. Today there are none for this care-unit name; the deleteMany
    // is a no-op but keeps the cleanup correct under future seed paths.
    const stale = await prisma.user.findUnique({
      where: { email: 'other-nurse-dashboard-orders@test.example' },
    });
    if (stale) {
      await prisma.session.deleteMany({ where: { userId: stale.id } });
      await prisma.order.deleteMany({
        where: { createdByUserId: stale.id },
      });
      await prisma.user.delete({ where: { id: stale.id } });
    }
    const staleCu = await prisma.careUnit.findFirst({
      where: { name: 'Other CareUnit Dashboard Orders Test' },
    });
    if (staleCu) {
      await prisma.order.deleteMany({ where: { careUnitId: staleCu.id } });
      await prisma.careUnitMedication.deleteMany({
        where: { careUnitId: staleCu.id },
      });
      await prisma.careUnit.delete({ where: { id: staleCu.id } });
    }

    // WR-05 (Phase 9 review) — seed creates (otherCareUnit, otherUser,
    // otherOrder) moved INSIDE the try{} block so a partial failure does
    // not leak fixtures. Previously these three creates lived OUTSIDE the
    // try{}; if prisma.user.create succeeded but prisma.order.create threw,
    // the otherUser + otherCareUnit rows survived because finally{} only
    // runs after try{} is entered. Now: each create accumulates its row
    // into the per-resource holder; the finally{} block cleans whatever
    // exists (null-guarded). The matching `careUnitMedication.deleteMany`
    // is added on the finally side too for the same defensive reason.
    let otherCareUnit: { id: string } | null = null;
    let otherUser: { id: string; email: string } | null = null;
    let otherOrder: { id: string } | null = null;
    try {
      otherCareUnit = await prisma.careUnit.create({
        data: { name: 'Other CareUnit Dashboard Orders Test' },
      });
      const hash = await hashPassword('demo1234');
      otherUser = await prisma.user.create({
        data: {
          email: 'other-nurse-dashboard-orders@test.example',
          name: 'Other Nurse Dashboard Orders',
          role: 'sjukskoterska',
          careUnitId: otherCareUnit.id,
          passwordHash: hash,
        },
      });

      // Phase 10 D-160 / D-164 — mint orderNumber columns inline.
      const mintOther = await mintTestOrderNumber(otherCareUnit.id);
      otherOrder = await prisma.order.create({
        data: {
          careUnitId: otherCareUnit.id,
          createdByUserId: otherUser.id,
          status: 'utkast',
          orderNumberCounter: mintOther.orderNumberCounter,
          orderNumberYear: mintOther.orderNumberYear,
        },
      });

      const otherCookie = await loginAs(app, {
        email: otherUser.email,
        password: 'demo1234',
      });

      const otherRes = await app.inject({
        method: 'GET',
        url: '/api/dashboard/orders',
        headers: { cookie: otherCookie },
      });
      expect(otherRes.statusCode).toBe(200);
      const otherBody = dashboardOrdersResponse.parse(otherRes.json());
      if (otherBody.role !== 'sjukskoterska') {
        throw new Error(`expected role=sjukskoterska, got ${otherBody.role}`);
      }

      // The other vårdenhet sees AT LEAST the one we seeded.
      const otherIds = new Set(
        otherBody.egnaUtkast.rows.map((r) => r.id),
      );
      expect(otherIds.has(otherOrder.id)).toBe(true);

      // T-09-04: row id sets are disjoint — no overlap in either direction.
      for (const id of otherIds) {
        expect(seededIds.has(id)).toBe(false);
      }
      for (const id of seededIds) {
        expect(otherIds.has(id)).toBe(false);
      }
    } finally {
      if (otherUser) {
        await prisma.session.deleteMany({ where: { userId: otherUser.id } });
      }
      if (otherCareUnit) {
        await prisma.order.deleteMany({
          where: { careUnitId: otherCareUnit.id },
        });
        // WR-05 — same defensive CareUnitMedication cleanup on the
        // post-test side. No-op today; future-proof against Phase 8/10
        // seed paths that might add per-care-unit medications.
        await prisma.careUnitMedication.deleteMany({
          where: { careUnitId: otherCareUnit.id },
        });
      }
      if (otherUser) {
        await prisma.user.delete({ where: { id: otherUser.id } });
      }
      if (otherCareUnit) {
        await prisma.careUnit.delete({ where: { id: otherCareUnit.id } });
      }
      // otherOrder is referenced by the assertions above but cleaned up
      // by the careUnit-scoped deleteMany — no explicit delete needed.
      void otherOrder;
    }
  });

  it('Test 4 (top-5 cap): 6 utkast → rows.length === 5 AND count >= 6', async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const nurseUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const careUnitId = TEST_SJUKSKOTERSKA.careUnitId;

    const createdIds: string[] = [];
    try {
      for (let i = 0; i < 6; i++) {
        // Phase 10 D-160 / D-164 — mint per-iteration so each fixture order
        // gets a unique counter (the UPDATE branch advances nextValue by 1
        // each call; six iterations consume six counters).
        const mint = await mintTestOrderNumber(careUnitId);
        const o = await prisma.order.create({
          data: {
            careUnitId,
            createdByUserId: nurseUser.id,
            status: 'utkast',
            orderNumberCounter: mint.orderNumberCounter,
            orderNumberYear: mint.orderNumberYear,
          },
        });
        createdIds.push(o.id);
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/dashboard/orders',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = dashboardOrdersResponse.parse(res.json());
      if (body.role !== 'sjukskoterska') {
        throw new Error(`expected role=sjukskoterska, got ${body.role}`);
      }

      expect(body.egnaUtkast.rows.length).toBe(5);
      expect(body.egnaUtkast.count).toBeGreaterThanOrEqual(6);
    } finally {
      await prisma.order.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
  });

  it('Test 5 (DESC by createdAt): three utkast at staggered times return newest-first', async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const nurseUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_SJUKSKOTERSKA.email },
    });
    const careUnitId = TEST_SJUKSKOTERSKA.careUnitId;

    // Use createdAt values FAR in the future so these orders are
    // guaranteed to be the top-3 in DESC order regardless of other
    // existing rows in the test DB. Stagger by 1 hour so the relative
    // order is unambiguous.
    const baseMs = Date.now() + 365 * 24 * 60 * 60 * 1000; // +1 year

    // WR-04 (Phase 9 review) — seed creates moved INSIDE the try block so
    // a partial-failure (e.g. one create succeeds, the second throws on a
    // DB hiccup) does not leak orphan rows into the test DB. The previous
    // structure had three sibling prisma.order.create calls OUTSIDE the
    // try{}, so the finally{ deleteMany } only ran if all three succeeded.
    // IDs accumulate in `seededIds` as each create returns; the finally
    // block always cleans whatever made it in.
    const seededIds: string[] = [];
    try {
      // Phase 10 D-160 / D-164 — mint per-create so each staged order gets
      // a unique counter / year pair (mint runs before each create).
      const mintOldest = await mintTestOrderNumber(careUnitId);
      const oldestId = (
        await prisma.order.create({
          data: {
            careUnitId,
            createdByUserId: nurseUser.id,
            status: 'utkast',
            createdAt: new Date(baseMs),
            orderNumberCounter: mintOldest.orderNumberCounter,
            orderNumberYear: mintOldest.orderNumberYear,
          },
        })
      ).id;
      seededIds.push(oldestId);
      const mintMiddle = await mintTestOrderNumber(careUnitId);
      const middleId = (
        await prisma.order.create({
          data: {
            careUnitId,
            createdByUserId: nurseUser.id,
            status: 'utkast',
            createdAt: new Date(baseMs + 60 * 60 * 1000),
            orderNumberCounter: mintMiddle.orderNumberCounter,
            orderNumberYear: mintMiddle.orderNumberYear,
          },
        })
      ).id;
      seededIds.push(middleId);
      const mintNewest = await mintTestOrderNumber(careUnitId);
      const newestId = (
        await prisma.order.create({
          data: {
            careUnitId,
            createdByUserId: nurseUser.id,
            status: 'utkast',
            createdAt: new Date(baseMs + 2 * 60 * 60 * 1000),
            orderNumberCounter: mintNewest.orderNumberCounter,
            orderNumberYear: mintNewest.orderNumberYear,
          },
        })
      ).id;
      seededIds.push(newestId);

      const res = await app.inject({
        method: 'GET',
        url: '/api/dashboard/orders',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = dashboardOrdersResponse.parse(res.json());
      if (body.role !== 'sjukskoterska') {
        throw new Error(`expected role=sjukskoterska, got ${body.role}`);
      }

      // The three seeded rows have createdAt in the far future, so they
      // are guaranteed to occupy the top of egnaUtkast (DESC by createdAt).
      const top3 = body.egnaUtkast.rows.slice(0, 3);
      expect(top3.map((r) => r.id)).toEqual([newestId, middleId, oldestId]);

      // ISO-8601 lex compare === time compare — assert the strings are
      // strictly descending.
      expect(
        top3[0]!.createdAt > top3[1]!.createdAt,
      ).toBe(true);
      expect(
        top3[1]!.createdAt > top3[2]!.createdAt,
      ).toBe(true);
    } finally {
      if (seededIds.length > 0) {
        await prisma.order.deleteMany({
          where: { id: { in: seededIds } },
        });
      }
    }
  });
});
