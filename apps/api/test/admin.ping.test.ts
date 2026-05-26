import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_ADMIN,
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 1 success #2 / AUTH-05 / D-15 / D-18 — RBAC matrix on `/api/admin/ping`.
 *
 * The four canonical paths Plan 03 demands:
 *   - no cookie               → 401 + `unauthenticated` envelope
 *   - sjukskoterska cookie    → 403 + `forbidden` envelope
 *   - apotekare cookie        → 403 + `forbidden` envelope
 *   - admin cookie            → 200 + { pong: true, at: <ISO timestamp> }
 *
 * Plus the `/me` regression that proves `permissions: ActionKey[]` is now
 * populated from the centralized PERMISSIONS map (D-18 — replaces Plan 02's
 * always-empty stub).
 *
 * Plan 05 cleanup: replaced Plan 03's inline `*-ping@example.test` upserts
 * with the canonical seed users via `ensureAllRolesSeeded()` so the test
 * fixture and the production seed agree on the same three emails.
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

// loginAs is imported from helpers/buildTestApp per Phase 5 Plan 03 Task 2 Step A.0.

describe('GET /api/admin/ping — RBAC matrix (Phase 1 success #2)', () => {
  it('returns 401 + unauthenticated envelope when no cookie is sent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/ping' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Du måste logga in.' },
    });
  });

  it('returns 403 + forbidden envelope for a sjuksköterska session', async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/ping',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: {
        code: 'forbidden',
        message: 'Du saknar behörighet att utföra denna åtgärd.',
      },
    });
  });

  it('returns 403 + forbidden envelope for an apotekare session', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/ping',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: {
        code: 'forbidden',
        message: 'Du saknar behörighet att utföra denna åtgärd.',
      },
    });
  });

  it('returns 200 + { pong: true, at: <ISO 8601> } for an admin session', async () => {
    const cookie = await loginAs(app, TEST_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/ping',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      pong: true,
      at: expect.any(String),
    });
    // ISO 8601 — `2026-05-20T19:32:09.000Z` shape.
    expect(body.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });
});

describe('GET /api/me — permissions[] regression (D-18)', () => {
  // Phase 3 D-64: all roles gain order:* keys (ORD-01..03 — no role restriction).
  it("returns admin:ping + medication:* + order:* permissions for an admin session", async () => {
    const cookie = await loginAs(app, TEST_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    // Phase 4 D-15: admin gains order:confirm + order:deliver
    // Phase 5 D-15: admin gains audit:read (cross-tenant audit log access)
    // Phase 6 D-15: admin gains ai:suggest (AI categorization)
    // Sortiment: admin gains medication:bulk_manage (bulk catalog ops)
    // Admin user management: admin gains user:manage (/admin/users CRUD)
    expect(res.json().permissions).toEqual(['admin:ping', 'medication:read', 'medication:create', 'medication:update', 'medication:delete', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete', 'order:confirm', 'order:deliver', 'audit:read', 'ai:suggest', 'medication:bulk_manage', 'user:manage']);
  });

  it("returns medication:read + order:* permissions for a sjuksköterska session", async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().permissions).toEqual(['medication:read', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete']);
  });

  it("returns medication:read/create/update/delete + order:* permissions for an apotekare session", async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    // Phase 4 D-15: apotekare gains order:confirm + order:deliver
    // Phase 6 D-15: apotekare gains ai:suggest (AI categorization)
    // Sortiment: apotekare gains medication:bulk_manage (bulk catalog ops)
    expect(res.json().permissions).toEqual(['medication:read', 'medication:create', 'medication:update', 'medication:delete', 'order:read', 'order:create', 'order:update', 'order:submit', 'order:delete', 'order:confirm', 'order:deliver', 'ai:suggest', 'medication:bulk_manage']);
  });
});
