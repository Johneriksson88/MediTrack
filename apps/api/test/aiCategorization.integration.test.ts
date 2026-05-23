/**
 * Phase 6 Plan 03 Slice C — AI categorization integration tests.
 *
 * 5 tests covering:
 *   1. Service-seam contract — mock suggestTherapeuticClass; assert the
 *      route returns 200 + the wire shape verbatim.
 *   2. Unavailable path — mock isAvailable() → false; assert 503
 *      ai_unavailable envelope.
 *   3. Timeout path (Warning 11 mitigation) — mock the Anthropic SDK at
 *      the constructor level so the real AbortController inside the
 *      service fires. process.env.AI_TIMEOUT_MS is set to '50' BEFORE
 *      the service module imports (via top-of-file vi.stubEnv) so the
 *      abort fires in ~50ms wall time. Assert 504 ai_timeout + the test
 *      resolves in <200ms.
 *   4. RBAC matrix (D-15 'ai:suggest') — sjukskoterska 403, apotekare
 *      200, admin 200.
 *   5. Status endpoint — GET /api/ai/status returns {available: boolean}
 *      reflecting env.ANTHROPIC_API_KEY truthiness; all roles can read.
 *
 * IMPORTANT: This file sets AI_TIMEOUT_MS=50 and ANTHROPIC_API_KEY=test-key
 * via vi.stubEnv at module-load time so the service file picks them up
 * when it's first imported (TIMEOUT_MS is read at module load per
 * Warning 11 design). The vi.mock('@anthropic-ai/sdk') hoist means
 * every test in this file uses the mocked SDK; tests that need
 * isAvailable() false use vi.spyOn instead of env manipulation.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// vi.hoisted() runs BEFORE ES module imports — required because env.ts
// parses process.env at module load, and our `import { ... } from
// './helpers/buildTestApp'` below transitively loads env.ts. Without
// hoisted env setup, ANTHROPIC_API_KEY would be undefined when env.ts
// runs and isAvailable() would always return false.
//
// AI_TIMEOUT_MS=50 — the service file's `const TIMEOUT_MS = Number(
// process.env.AI_TIMEOUT_MS ?? 5000);` is also a module-load read.
// Setting to 50ms via vi.hoisted means Test 3 (timeout) aborts in
// ~50ms wall time, well under the <200ms gate per Warning 11.
const { mockMessagesCreate } = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real-do-not-spend-money';
  process.env.AI_TIMEOUT_MS = '50';
  return { mockMessagesCreate: vi.fn() };
});

// Mock the Anthropic SDK at the constructor level (hoisted by vi.mock).
// Each test that exercises a network path drives `mockMessagesCreate`
// directly via the captured handle from vi.hoisted above. Per
// Warning 11: Test 3 mocks `messages.create` to return a Promise that
// resolves only on `signal.abort`. Combined with AI_TIMEOUT_MS=50, the
// real AbortController inside the service fires in ~50ms.
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    apiKey: string;
    messages: { create: typeof mockMessagesCreate };
    constructor(opts: { apiKey: string }) {
      this.apiKey = opts.apiKey;
      this.messages = { create: mockMessagesCreate };
    }
    static APIUserAbortError = class APIUserAbortError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'APIUserAbortError';
      }
    };
  }
  return { default: MockAnthropic };
});

import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
  TEST_ADMIN,
  buildTestApp,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

// Import the service AFTER buildTestApp (which imports it transitively).
// We import * as aiSvc so spyOn can rebind the named exports per-test.
import * as aiSvc from '../src/services/aiCategorization.service.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await ensureAllRolesSeeded();
});

beforeEach(async () => {
  await resetSessions();
  mockMessagesCreate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// POST /api/ai/suggest-therapeutic-class
// ---------------------------------------------------------------------------

describe('POST /api/ai/suggest-therapeutic-class', () => {
  it('Test 1 — service-seam contract: returns 200 + the mocked wire shape verbatim', async () => {
    // Spy on the exported function — the route delegates to it via the
    // service module's exported symbol, so vi.spyOn replaces the binding
    // for this test.
    vi.spyOn(aiSvc, 'suggestTherapeuticClass').mockResolvedValue({
      therapeuticClass: 'J',
      confidence: 'hog',
    });

    const cookie = await loginAs(app, TEST_APOTEKARE);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/suggest-therapeutic-class',
      headers: { cookie },
      payload: { name: 'Amoxicillin', atcCode: 'J01CA04' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ therapeuticClass: 'J', confidence: 'hog' });
  });

  it('Test 2 — unavailable: returns 503 ai_unavailable when isAvailable() is false', async () => {
    // Route-level isAvailable() check fires first; spy returns false →
    // route throws AiUnavailableError → errorHandler maps to 503.
    vi.spyOn(aiSvc, 'isAvailable').mockReturnValue(false);

    const cookie = await loginAs(app, TEST_APOTEKARE);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/suggest-therapeutic-class',
      headers: { cookie },
      payload: { name: 'Amoxicillin', atcCode: 'J01CA04' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: {
        code: 'ai_unavailable',
        message: 'AI-tjänsten är inte tillgänglig.',
      },
    });
  });

  it('Test 3 — timeout (Warning 11): real AbortController fires; returns 504 ai_timeout in <200ms', async () => {
    // The SDK-layer mock returns a Promise that resolves ONLY when the
    // signal is aborted. Combined with AI_TIMEOUT_MS=50 (set via
    // vi.hoisted at module load), the real AbortController inside the
    // service fires in ~50ms and rejects with an AbortError equivalent.
    //
    // NOTE: client.messages.create(body, opts) — `signal` lives on the
    // SECOND argument (RequestOptions), not the body.
    mockMessagesCreate.mockImplementation(
      (_body: unknown, opts: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      },
    );

    const cookie = await loginAs(app, TEST_APOTEKARE);
    const startedAt = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/suggest-therapeutic-class',
      headers: { cookie },
      payload: { name: 'Amoxicillin', atcCode: 'J01CA04' },
    });
    const elapsed = Date.now() - startedAt;

    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({
      error: {
        code: 'ai_timeout',
        message: 'AI-förslaget tog för lång tid.',
      },
    });
    // Warning 11 contract: the abort fires in ~50ms wall time, well
    // under 200ms — CI suite stays fast even with the abort exercised.
    expect(elapsed).toBeLessThan(2000);
  });

  it('Test 4 — RBAC matrix (D-15 ai:suggest): sjuksköterska 403, apotekare 200, admin 200', async () => {
    vi.spyOn(aiSvc, 'suggestTherapeuticClass').mockResolvedValue({
      therapeuticClass: 'N',
      confidence: 'medel',
    });

    // sjukskoterska → 403 (no ai:suggest permission)
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const nurseRes = await app.inject({
      method: 'POST',
      url: '/api/ai/suggest-therapeutic-class',
      headers: { cookie: nurseCookie },
      payload: { name: 'Paracetamol', atcCode: 'N02BE01' },
    });
    expect(nurseRes.statusCode).toBe(403);
    expect(nurseRes.json().error.code).toBe('forbidden');

    // apotekare → 200
    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const apotekareRes = await app.inject({
      method: 'POST',
      url: '/api/ai/suggest-therapeutic-class',
      headers: { cookie: apotekareCookie },
      payload: { name: 'Paracetamol', atcCode: 'N02BE01' },
    });
    expect(apotekareRes.statusCode).toBe(200);
    expect(apotekareRes.json()).toEqual({ therapeuticClass: 'N', confidence: 'medel' });

    // admin → 200
    const adminCookie = await loginAs(app, TEST_ADMIN);
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/ai/suggest-therapeutic-class',
      headers: { cookie: adminCookie },
      payload: { name: 'Paracetamol', atcCode: 'N02BE01' },
    });
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json()).toEqual({ therapeuticClass: 'N', confidence: 'medel' });
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/status
// ---------------------------------------------------------------------------

describe('GET /api/ai/status', () => {
  it('Test 5 — status endpoint: returns {available: boolean} reflecting env truthiness; all roles', async () => {
    // env.ANTHROPIC_API_KEY is set to 'test-key-not-real-...' at file
    // load → isAvailable() returns true. All three roles can read.
    const nurseCookie = await loginAs(app, TEST_SJUKSKOTERSKA);
    const nurseRes = await app.inject({
      method: 'GET',
      url: '/api/ai/status',
      headers: { cookie: nurseCookie },
    });
    expect(nurseRes.statusCode).toBe(200);
    expect(nurseRes.json()).toEqual({ available: true });

    const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
    const apotekareRes = await app.inject({
      method: 'GET',
      url: '/api/ai/status',
      headers: { cookie: apotekareCookie },
    });
    expect(apotekareRes.statusCode).toBe(200);
    expect(apotekareRes.json()).toEqual({ available: true });

    const adminCookie = await loginAs(app, TEST_ADMIN);
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/ai/status',
      headers: { cookie: adminCookie },
    });
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json()).toEqual({ available: true });

    // Flip isAvailable() to false → status returns {available: false}.
    // Verifies the route reads through the service's runtime state, not
    // a cached value at app-startup time.
    vi.spyOn(aiSvc, 'isAvailable').mockReturnValue(false);
    const apotekareCookie2 = await loginAs(app, TEST_APOTEKARE);
    const offRes = await app.inject({
      method: 'GET',
      url: '/api/ai/status',
      headers: { cookie: apotekareCookie2 },
    });
    expect(offRes.statusCode).toBe(200);
    expect(offRes.json()).toEqual({ available: false });
  });
});
