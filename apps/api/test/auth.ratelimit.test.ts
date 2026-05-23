/**
 * Plan 05-09 — auth.ratelimit.test.ts
 *
 * Rate-limit contract integration tests for POST /api/auth/login.
 * Covers 05-REVIEWS.md MEDIUM #8 (rate-limit to bound audit.login_failed row growth).
 *
 * Test inventory:
 *   Test A: 11th failed login for the same (email, IP) within 1 minute returns 429
 *           (05-REVIEWS.md MEDIUM #8 — per-email + per-IP combined keyGenerator).
 *   Test B: rate-limited attempt does NOT write an additional audit.login_failed row
 *           (the rejection happens BEFORE verifyCredentials runs — no row growth).
 *   Test C: different email from the same IP is NOT affected by another email's bucket
 *           (per-email isolation: saturating email A's bucket does not rate-limit email B).
 *   Test D: successful login from a low-rate (email, IP) returns 200, not 429
 *           (a first-time login for a real seeded user is unaffected by the rate limit).
 *
 * Isolation strategy:
 *   This file builds its OWN app instance in beforeAll with RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE=10
 *   set directly on process.env before buildApp() is called. Since buildApp() reads process.env
 *   at plugin registration time (not module-import time), this ensures the fresh app instance
 *   uses the real rate-limit value (10/min), regardless of what other test files have stubbed.
 *
 *   Each test uses a unique email (Date.now() suffix) so buckets never collide across tests
 *   within this file. The app instance is closed in afterAll so the in-memory rate-limit store
 *   is discarded.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Import helpers — buildTestApp.ts may already be in the Vitest module cache
// from prior test files (it sets RATE_LIMIT_LOGIN_* to 10000 via vi.stubEnv).
// We override process.env in beforeAll (before calling buildApp()) so that the
// FRESH app instance built in this file uses the real rate-limit value.
import {
  buildTestApp,
  ensureAllRolesSeeded,
  resetSessions,
  prisma,
  TEST_APOTEKARE,
} from './helpers/buildTestApp.js';

let app: FastifyInstance;

beforeAll(async () => {
  // Override the rate-limit env vars to realistic values BEFORE building the app.
  // buildApp() reads these at plugin-registration time (inside await app.register(fastifyRateLimit, {...})),
  // so setting them here (before buildTestApp() calls buildApp()) is sufficient.
  // vi.stubEnv ensures the values are restored after the test file completes.
  vi.stubEnv('RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE', '10');
  vi.stubEnv('RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE', '30');

  // Fresh app instance — independent from the shared instance used by other test files.
  // In-memory rate-limit store starts empty so no bucket state bleeds in.
  app = await buildTestApp();
  await ensureAllRolesSeeded();
});

beforeEach(async () => {
  await resetSessions();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

describe('POST /api/auth/login — rate-limit contract (05-REVIEWS.md MEDIUM #8)', () => {
  it('Test A: 11th failed login for the same (email, IP) within 1 minute returns 429', async () => {
    // Each test uses a unique email so this bucket is fresh. The keyGenerator is
    // `login:${email.toLowerCase().trim()}|${req.ip}`, so (email, IP) uniquely
    // identifies the bucket. app.inject defaults all requests to the loopback IP.
    const email = `ratelimit-test-a-${Date.now()}@example.test`;

    // 10 attempts at wrong password — all should return 400 invalid_credentials
    // (unknown-email branch: writes auth.login_failed audit row; reaches verifyCredentials).
    // Note: POST /api/auth/login maps InvalidCredentialsError to 400 (D-04 / T-01-05),
    // not 401 — the status code is 400 with error.code='invalid_credentials'.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'wrong' },
      });
      expect(res.statusCode).toBe(400);
    }

    // 11th attempt — should hit the per-(email, IP) rate limit.
    const overLimit = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'wrong' },
    });
    expect(overLimit.statusCode).toBe(429);

    // D-19 canonical envelope: {error: {code: 'rate_limited', message: ...}}
    const body = overLimit.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.message).toMatch(/inloggningsförsök/);
  });

  it('Test B: rate-limited attempt does NOT write an audit.login_failed row (bounds row growth)', async () => {
    // Per-plan: verifyCredentials never runs for a rate-limited request.
    // Writing an auth.login_failed row for rate-limited attempts would defeat the
    // row-growth-bounding purpose of the rate limit.
    const testStartedAt = new Date();
    const email = `ratelimit-test-b-${Date.now()}@example.test`;

    // Push the (email, IP) bucket to the limit.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'wrong' },
      });
      expect(res.statusCode).toBe(400);
    }

    // The 10 attempts above wrote 10 auth.login_failed rows (the unknown-email branch).
    const rowsBefore = await prisma.auditEvent.count({
      where: {
        entityType: 'auth_attempt',
        entityId: email,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(rowsBefore).toBe(10);

    // 11th attempt — should be rate-limited.
    const rateLimitedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'wrong' },
    });
    expect(rateLimitedRes.statusCode).toBe(429);

    // Row count MUST NOT have increased. The rate-limit rejection happened BEFORE
    // verifyCredentials ran, so no audit row was written (D-96 carve-out).
    const rowsAfter = await prisma.auditEvent.count({
      where: {
        entityType: 'auth_attempt',
        entityId: email,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(rowsAfter).toBe(10);
  });

  it("Test C: different email from the same IP is NOT rate-limited by another email's exhausted bucket", async () => {
    // Per-plan: the keyGenerator uses `login:${email}|${ip}`. Saturating email A's
    // bucket does NOT affect email B's bucket (they are independent per-email keys).
    const ts = Date.now();
    const emailA = `ratelimit-test-c-emailA-${ts}@example.test`;
    const emailB = `ratelimit-test-c-emailB-${ts + 1}@example.test`;

    // Saturate email A's bucket (10 attempts — reaches the max).
    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: emailA, password: 'wrong' },
      });
    }

    // Email A is now rate-limited.
    const resA = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailA, password: 'wrong' },
    });
    expect(resA.statusCode).toBe(429);

    // Email B from the same IP — first attempt should get 400 (unknown email /
    // invalid_credentials), NOT 429. Its bucket is independent from email A's.
    const resB = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailB, password: 'wrong' },
    });
    expect(resB.statusCode).toBe(400);
  });

  it('Test D: successful login from a low-rate (email, IP) returns 200, not 429', async () => {
    // A real seeded user logging in for the first time is unaffected by the rate limit.
    // This test uses TEST_APOTEKARE — a seeded credential from the test helpers.
    // Since this app instance is FRESH (built in beforeAll of THIS file) and each
    // test above uses unique unknown emails, the TEST_APOTEKARE bucket is clean here.
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_APOTEKARE.email, password: TEST_APOTEKARE.password },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { user: { email: string } };
    expect(body.user.email).toBe(TEST_APOTEKARE.email);
  });
});
