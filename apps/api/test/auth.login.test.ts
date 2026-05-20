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
 * AUTH-01 — POST /api/auth/login.
 *
 * Covers the happy path (200 + cookie + Session row) and three sad paths
 * that all must return the same envelope `{ code: 'invalid_credentials' }`
 * (D-04 / T-01-05 anti-enumeration). Plus the malformed-body 400 case
 * that surfaces as `validation_failed` via the canonical error handler.
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

describe('POST /api/auth/login', () => {
  it('returns 200 + sets meditrack.sid cookie + inserts a Session row on valid credentials', async () => {
    const before = await prisma.session.count();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      user: {
        email: TEST_ADMIN.email,
        name: TEST_ADMIN.name,
        role: 'admin',
        careUnit: {
          id: TEST_ADMIN.careUnitId,
          name: TEST_ADMIN.careUnitName,
        },
      },
    });
    expect(body.user.id).toEqual(expect.any(String));
    expect(body.user).not.toHaveProperty('passwordHash');

    const setCookie = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieHeader).toMatch(/meditrack\.sid=/);
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/SameSite=Lax/i);
    expect(cookieHeader).toMatch(/Path=\//);

    const after = await prisma.session.count();
    expect(after).toBe(before + 1);
  });

  it('returns 400 + invalid_credentials envelope on wrong password (no Set-Cookie)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_ADMIN.email, password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'invalid_credentials',
        message: 'Fel e-post eller lösenord.',
      },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 400 + invalid_credentials envelope on unknown email (no Set-Cookie, no enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.test', password: 'demo1234' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'invalid_credentials',
        message: 'Fel e-post eller lösenord.',
      },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 400 + validation_failed envelope on malformed body (missing email)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'demo1234' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.message).toBe('Felaktig indata.');
    expect(body.error.details).toBeDefined();
  });
});
