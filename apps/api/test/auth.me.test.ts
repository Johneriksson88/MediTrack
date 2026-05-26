import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_ADMIN,
  buildTestApp,
  ensureAdminSeed,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 1 success #4 / AUTH-02 / AUTH-07 / D-18 — login → /me smoke test.
 *
 * The single most important behavior of Plan 02: a real session cookie
 * round-trips successfully and `/me` returns the user joined with their
 * `careUnit`. Plus the two unauthenticated paths (no cookie, tampered
 * cookie) that both 401 with the canonical envelope.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await ensureAdminSeed();
});

beforeEach(async () => {
  await resetSessions();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function loginAndCaptureCookie(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
  // `Set-Cookie: meditrack.sid=<signed-value>; Path=/; ...`
  const match = cookieHeader.match(/(meditrack\.sid=[^;]+)/);
  expect(match).not.toBeNull();
  return match![1]!;
}

describe('GET /api/me', () => {
  it('returns 200 + meResponse shape on a valid session cookie', async () => {
    const cookie = await loginAndCaptureCookie();
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      id: expect.any(String),
      email: TEST_ADMIN.email,
      name: TEST_ADMIN.name,
      role: 'admin',
      careUnit: {
        id: TEST_ADMIN.careUnitId,
        name: TEST_ADMIN.careUnitName,
      },
      // Phase 2 D-43 — admin gains medication:* via PERMISSIONS map.
      // Phase 3 D-64 — all roles gain order:* (ORD-01..03 no role restriction).
      // Phase 4 D-15 — admin gains order:confirm + order:deliver.
      // Phase 5 D-15 — admin gains audit:read (cross-tenant audit log).
      // Phase 6 D-15 — admin gains ai:suggest (AI categorization).
      // Sortiment — admin gains medication:bulk_manage (bulk catalog ops).
      // Admin user management — admin gains user:manage (/admin/users CRUD).
      permissions: ['admin:ping', 'medication:read', 'medication:create', 'medication:update', 'medication:delete', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete', 'order:confirm', 'order:deliver', 'audit:read', 'ai:suggest', 'medication:bulk_manage', 'user:manage'],
    });
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('returns 401 + unauthenticated envelope when no cookie is sent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Du måste logga in.' },
    });
  });

  it('returns 401 + unauthenticated envelope when the cookie signature is tampered', async () => {
    const cookie = await loginAndCaptureCookie();
    // Mutate the signed suffix of the cookie value to break HMAC.
    const tampered = cookie.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: tampered },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Du måste logga in.' },
    });
  });
});
