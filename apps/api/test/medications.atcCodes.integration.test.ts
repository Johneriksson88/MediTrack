import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { atcCodesResponse } from '@meditrack/shared';
import {
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 8 Plan 01 Task 1 — GET /api/medications/atc-codes integration tests.
 *
 * Three assertions covering D-132 + T-08-01:
 *
 *   Test A (shape + sort): Login as TEST_SJUKSKOTERSKA (proves no requirePermission
 *     gate beyond requireSession). GET /api/medications/atc-codes returns 200;
 *     body Zod-parses through atcCodesResponse; codes.length > 100 (the NPL seed
 *     has ~3,000 unique codes — assert a generous floor); the array is sorted
 *     ascending (codes.every((c, i) => i === 0 || codes[i-1] <= c)).
 *
 *   Test B (unauthenticated → 401): GET without a session cookie returns 401
 *     with envelope code `unauthenticated` (T-08-01 enforcement).
 *
 *   Test C (distinct): assert `new Set(codes).size === codes.length` — no
 *     duplicates emitted (proves the DISTINCT clause is the source of truth).
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

describe('GET /api/medications/atc-codes', () => {
  it('Test A (shape + sort): returns { codes: string[] } sorted ascending, length > 100', async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);

    const res = await app.inject({
      method: 'GET',
      url: '/api/medications/atc-codes',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    // Zod-parse the response against the published contract — confirms shape.
    const body = atcCodesResponse.parse(res.json());

    // The NPL seed has ~3,000 unique ATC codes — assert a generous floor.
    expect(body.codes.length).toBeGreaterThan(100);

    // Array must be sorted ascending (D-132 ORDER BY "atcCode" ASC).
    const isSorted = body.codes.every(
      (c, i) => i === 0 || (body.codes[i - 1] ?? '') <= c,
    );
    expect(isSorted).toBe(true);

    // Verify an individual code has the expected string type.
    const sample = body.codes[0];
    expect(typeof sample).toBe('string');
    expect(sample!.length).toBeGreaterThan(0);
  });

  it('Test B (unauthenticated → 401): returns 401 with code unauthenticated (T-08-01)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/medications/atc-codes',
      // No cookie — unauthenticated request.
    });

    expect(res.statusCode).toBe(401);

    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('Test C (distinct): no duplicates in the returned codes array', async () => {
    const cookie = await loginAs(app, TEST_SJUKSKOTERSKA);

    const res = await app.inject({
      method: 'GET',
      url: '/api/medications/atc-codes',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const body = atcCodesResponse.parse(res.json());

    // DISTINCT clause in the SQL query means no duplicates.
    expect(new Set(body.codes).size).toBe(body.codes.length);
  });
});
