import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_ADMIN,
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 1 success #4 — full pipeline smoke test, one iteration per role.
 *
 * Roles iterated (canonical Phase 1 demo seed — see prisma/seed.ts):
 *   - apotekare@example.test       (role: apotekare,     adminPing: 403)
 *   - sjukskoterska@example.test   (role: sjukskoterska, adminPing: 403)
 *   - admin@example.test           (role: admin,         adminPing: 200)
 *
 * For each role:
 *   1. POST /api/auth/login       → 200 + Set-Cookie meditrack.sid + body shape
 *   2. GET  /api/me                → 200 + correct role / careUnit / permissions
 *   3. GET  /api/admin/ping        → 200 (admin only) | 403 (non-admin)
 *   4. DELETE /api/auth/session    → 204
 *   5. GET  /api/me                → 401 (cookie cleared on the server)
 *
 * Final assertion: after all three role iterations log out, the Session
 * table is empty — proving logout actually destroyed every session.
 *
 * This is the canonical end-to-end test for Phase 1; Phases 2-7 layer
 * resource-specific RBAC and CRUD tests on top of this scaffold but the
 * "login → /me → logout" loop here remains the regression backstop.
 */

let app: FastifyInstance;

const ROLE_MATRIX = [
  {
    label: 'apotekare',
    user: TEST_APOTEKARE,
    expectedRole: 'apotekare' as const,
    // Phase 3 D-64: all three roles have all five order:* keys (ORD-01..03).
    // Phase 4 D-15: apotekare gains order:confirm + order:deliver.
    expectedPermissions: ['medication:read', 'medication:create', 'medication:update', 'medication:delete', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete', 'order:confirm', 'order:deliver'] as string[],
    adminPingStatus: 403,
  },
  {
    label: 'sjukskoterska',
    user: TEST_SJUKSKOTERSKA,
    expectedRole: 'sjukskoterska' as const,
    // Phase 3 D-64: sjukskoterska gains order:* (all roles per ORD-01..03).
    expectedPermissions: ['medication:read', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete'] as string[],
    adminPingStatus: 403,
  },
  {
    label: 'admin',
    user: TEST_ADMIN,
    expectedRole: 'admin' as const,
    // Phase 3 D-64: admin gains order:* (all roles per ORD-01..03).
    // Phase 4 D-15: admin gains order:confirm + order:deliver.
    expectedPermissions: ['admin:ping', 'medication:read', 'medication:create', 'medication:update', 'medication:delete', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete', 'order:confirm', 'order:deliver'] as string[],
    adminPingStatus: 200,
  },
] as const;

beforeAll(async () => {
  app = await buildTestApp();
  await ensureAllRolesSeeded();
});

// Reset sessions before each role iteration so each test starts from a
// clean session table. (resetSessions runs on EVERY `it`, but since each
// `it` is a full login→logout cycle this is correct.)
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

describe('Auth flow smoke — login → /me → admin:ping → logout per role', () => {
  for (const row of ROLE_MATRIX) {
    it(`completes the full pipeline for ${row.label}`, async () => {
      // 1. LOGIN
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: row.user.email, password: row.user.password },
      });
      expect(loginRes.statusCode).toBe(200);
      const loginBody = loginRes.json();
      expect(loginBody.user).toMatchObject({
        email: row.user.email,
        name: row.user.name,
        role: row.expectedRole,
        careUnit: {
          id: row.user.careUnitId,
          name: row.user.careUnitName,
        },
      });
      const cookie = captureSessionCookie(loginRes.headers['set-cookie']);

      // 2. /me — full shape + permissions
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = meRes.json();
      expect(meBody.role).toBe(row.expectedRole);
      expect(meBody.careUnit.name).toBe('Avdelning 4, Karolinska');
      expect(meBody.permissions).toEqual(row.expectedPermissions);

      // 3. /api/admin/ping — 200 for admin, 403 for non-admin
      const pingRes = await app.inject({
        method: 'GET',
        url: '/api/admin/ping',
        headers: { cookie },
      });
      expect(pingRes.statusCode).toBe(row.adminPingStatus);
      const pingBody = pingRes.json();
      if (row.adminPingStatus === 200) {
        expect(pingBody.pong).toBe(true);
        expect(typeof pingBody.at).toBe('string');
      } else {
        expect(pingBody.error.code).toBe('forbidden');
        expect(pingBody.error.message).toBe(
          'Du saknar behörighet att utföra denna åtgärd.',
        );
      }

      // 4. LOGOUT — 204
      const logoutRes = await app.inject({
        method: 'DELETE',
        url: '/api/auth/session',
        headers: { cookie },
      });
      expect(logoutRes.statusCode).toBe(204);

      // 5. /me after logout — 401
      const meAfter = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie },
      });
      expect(meAfter.statusCode).toBe(401);
      expect(meAfter.json().error.code).toBe('unauthenticated');
    });
  }

  it('Session table is empty after all three role round-trips', async () => {
    // Re-run all three role round-trips inside this test so the final
    // session count assertion is meaningful (each `it` has its own
    // beforeEach truncate, so the count would be 0 anyway — we verify
    // the logout-then-count contract end-to-end here.)
    for (const row of ROLE_MATRIX) {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: row.user.email, password: row.user.password },
      });
      expect(loginRes.statusCode).toBe(200);
      const cookie = captureSessionCookie(loginRes.headers['set-cookie']);

      const logoutRes = await app.inject({
        method: 'DELETE',
        url: '/api/auth/session',
        headers: { cookie },
      });
      expect(logoutRes.statusCode).toBe(204);
    }

    const sessionCount = await prisma.session.count();
    expect(sessionCount).toBe(0);
  });
});
