import type { FastifyInstance } from 'fastify';
import { expect, vi } from 'vitest';
import { prisma } from '../../src/db/client.js';

/**
 * Pattern O — Vitest harness.
 *
 * `buildTestApp()` constructs a Fastify instance via `buildApp()` against
 * the real Prisma client. Tests should:
 *
 *   1. Truncate the `Session` table in `beforeEach` so cookie carry-over
 *      between tests is impossible.
 *   2. Ensure the admin seed is present (lazily via `ensureAdminSeed()`).
 *
 * The DB itself is the same Postgres instance the dev / compose stack
 * uses — tests don't spin up a separate DB in Plan 02 (Plan 03 may
 * add a `?schema=test_*` connection string). Task 3 (the [BLOCKING]
 * migration) is what makes these tests runnable; before then, importing
 * `prisma` will surface a connection error which is the expected RED
 * signal for the TDD plan-level gate.
 */

// Vitest sets `NODE_ENV=test` automatically. We need a `COOKIE_SECRET` for
// `@fastify/cookie` to register; stub one if the runner didn't load `.env`.
vi.stubEnv('NODE_ENV', 'test');
if (!process.env.COOKIE_SECRET) {
  vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-32-bytes-min-len-xxx');
}
// Plan 05-09: set a very high rate-limit for the shared test app instance so
// the existing integration tests (which reuse fixed credential sets across the
// full suite) are not affected by the per-email bucket. The auth.ratelimit.test.ts
// file uses a FRESH app instance and realistic limits so the rate-limit behavior
// is tested in isolation.
if (!process.env.RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE) {
  vi.stubEnv('RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE', '10000');
}
if (!process.env.RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE) {
  vi.stubEnv('RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE', '10000');
}
if (!process.env.DATABASE_URL) {
  // Plan 05-07: runtime queries use the named non-owner role meditrack_app.
  // REVOKE on AuditEvent UPDATE/DELETE/TRUNCATE binds this role (D-98 Layer 2b).
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://meditrack_app:meditrack_app_dev@localhost:5432/meditrack',
  );
}
if (!process.env.DIRECT_URL) {
  // The owner role is used by prisma migrate deploy; in tests we only need
  // it for the schema.prisma datasource directUrl field (no migrations run
  // during vitest). Stub it so Prisma doesn't complain about a missing env var.
  vi.stubEnv(
    'DIRECT_URL',
    'postgres://meditrack:meditrack@localhost:5432/meditrack',
  );
}

// Import buildApp AFTER env stubs so its env-validation sees the stubs.
const { buildApp } = await import('../../src/app.js');

export async function buildTestApp() {
  const app = await buildApp();
  // Eagerly run plugins / decorators so `app.inject` sees them.
  await app.ready();
  return app;
}

export async function resetSessions() {
  await prisma.session.deleteMany({});
}

const ADMIN_EMAIL = 'admin@example.test';
const APOTEKARE_EMAIL = 'apotekare@example.test';
const SJUKSKOTERSKA_EMAIL = 'sjukskoterska@example.test';
const SHARED_PASSWORD = 'demo1234';
const CARE_UNIT_ID = 'careunit-karolinska-01';
const CARE_UNIT_NAME = 'Avdelning 4, Karolinska';
const ADMIN_NAME = 'Admin Demo';
const APOTEKARE_NAME = 'Anna Apotekare';
const SJUKSKOTERSKA_NAME = 'Sara Sjuksköterska';

/**
 * Ensures the demo admin user exists. Tests can call this in `beforeAll`
 * instead of relying on a separate `pnpm db:seed` run.
 */
export async function ensureAdminSeed() {
  const { hashPassword } = await import('../../src/auth/password.js');
  await prisma.careUnit.upsert({
    where: { id: CARE_UNIT_ID },
    update: { name: CARE_UNIT_NAME },
    create: { id: CARE_UNIT_ID, name: CARE_UNIT_NAME },
  });
  const passwordHash = await hashPassword(SHARED_PASSWORD);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      role: 'admin',
      careUnitId: CARE_UNIT_ID,
      passwordHash,
    },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: 'admin',
      careUnitId: CARE_UNIT_ID,
      passwordHash,
    },
  });
}

/**
 * Ensures all three Phase 1 demo users exist (apotekare, sjukskoterska,
 * admin) on the shared CareUnit. Mirrors the canonical `prisma/seed.ts`
 * shape from Plan 05 so tests and the seed agree on the user roster.
 *
 * Plan 05 — moves the inline non-admin upserts that lived in
 * `admin.ping.test.ts`'s `beforeAll` into this shared helper. The smoke
 * test and the RBAC matrix both call it and observe the same three
 * canonical emails (no `*-ping@example.test` shadow users).
 */
export async function ensureAllRolesSeeded() {
  const { hashPassword } = await import('../../src/auth/password.js');
  await prisma.careUnit.upsert({
    where: { id: CARE_UNIT_ID },
    update: { name: CARE_UNIT_NAME },
    create: { id: CARE_UNIT_ID, name: CARE_UNIT_NAME },
  });
  const passwordHash = await hashPassword(SHARED_PASSWORD);

  for (const u of [
    { email: APOTEKARE_EMAIL, name: APOTEKARE_NAME, role: 'apotekare' as const },
    {
      email: SJUKSKOTERSKA_EMAIL,
      name: SJUKSKOTERSKA_NAME,
      role: 'sjukskoterska' as const,
    },
    { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'admin' as const },
  ]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        careUnitId: CARE_UNIT_ID,
        passwordHash,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        careUnitId: CARE_UNIT_ID,
        passwordHash,
      },
    });
  }
}

export const TEST_ADMIN = {
  email: ADMIN_EMAIL,
  password: SHARED_PASSWORD,
  name: ADMIN_NAME,
  careUnitId: CARE_UNIT_ID,
  careUnitName: CARE_UNIT_NAME,
} as const;

export const TEST_APOTEKARE = {
  email: APOTEKARE_EMAIL,
  password: SHARED_PASSWORD,
  name: APOTEKARE_NAME,
  careUnitId: CARE_UNIT_ID,
  careUnitName: CARE_UNIT_NAME,
} as const;

export const TEST_SJUKSKOTERSKA = {
  email: SJUKSKOTERSKA_EMAIL,
  password: SHARED_PASSWORD,
  name: SJUKSKOTERSKA_NAME,
  careUnitId: CARE_UNIT_ID,
  careUnitName: CARE_UNIT_NAME,
} as const;

// ---------------------------------------------------------------------------
// Phase 5 Plan 03 Task 2 Step A.0 — promoted composite test helpers.
//
// These five helpers previously lived as LOCAL function declarations in
// six different test files (orders.deliver, orders.confirm, orders.integration,
// orders.list, auth.flow.smoke, admin.ping). The canonical source was
// orders.deliver.integration.test.ts lines 54-145. They are promoted here
// so audit.integration.test.ts has a single, well-known import target —
// and so future phases (6+) get them for free without copy-paste drift.
//
// Signatures match the deliver test's variant (the most general form):
//   - loginAs(app, { email, password }) — `app` parameter is explicit so
//     the helper has no module-level dependency on which `app` it targets.
//   - findTestCareUnitMedication(careUnitId?) — defaults to TEST_SJUKSKOTERSKA
//     so existing call sites that pass no arg keep working.
// ---------------------------------------------------------------------------

/**
 * Parse the `Set-Cookie` header(s) returned from a login and extract the
 * raw `meditrack.sid=...` token (without the surrounding cookie
 * attributes). Asserts the cookie is present so the calling test fails
 * fast if the login response didn't include a session cookie.
 */
export function captureSessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
  const match = header.match(/(meditrack\.sid=[^;]+)/);
  expect(match).not.toBeNull();
  return match![1]!;
}

/**
 * Log in via `POST /api/auth/login` against the provided Fastify
 * instance and return the captured session cookie. Asserts the login
 * succeeded (200). The returned cookie is the value you pass as
 * `headers.cookie` on subsequent app.inject calls.
 */
export async function loginAs(
  app: FastifyInstance,
  user: { email: string; password: string },
): Promise<string> {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: user.password },
  });
  expect(loginRes.statusCode).toBe(200);
  return captureSessionCookie(loginRes.headers['set-cookie']);
}

/**
 * Create an empty draft order via `POST /api/orders` (no body). Returns
 * the `{ id }` of the new order. Asserts the create succeeded (201).
 */
export async function createEmptyOrder(
  app: FastifyInstance,
  cookie: string,
): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: { cookie },
    payload: {},
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

/**
 * Look up the first available `CareUnitMedication` row for the given
 * careUnit (defaults to `TEST_SJUKSKOTERSKA.careUnitId`). Throws if
 * none exist — the caller is expected to have seeded the test database
 * before invoking this helper.
 */
export async function findTestCareUnitMedication(
  careUnitId: string = TEST_SJUKSKOTERSKA.careUnitId,
): Promise<{ id: string; careUnitId: string }> {
  const cum = await prisma.careUnitMedication.findFirst({
    where: { careUnitId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!cum) {
    throw new Error('No CareUnitMedication found in test DB — run seed first');
  }
  return { id: cum.id, careUnitId: cum.careUnitId };
}

/**
 * Composite helper: advances a draft order from empty to `bekraftad`.
 * Adds each line as the nurse, submits as the nurse, then confirms as
 * the apotekare. Each step asserts the corresponding endpoint returned
 * 200 so test failures point to the exact step that broke.
 *
 * The fan-out produces the Phase 5 D-94 audit-row pattern: one
 * `order.submit` row, then one `order.confirm` row, all sharing one
 * `requestId` per HTTP call. The audit-integration test asserts this
 * shape directly via `prisma.auditEvent.findMany`.
 */
export async function progressOrderToBekraftad(
  app: FastifyInstance,
  nurseCookie: string,
  apotekareCookie: string,
  orderId: string,
  lineSpecs: Array<{ cumId: string; quantity: number }>,
): Promise<void> {
  for (const spec of lineSpecs) {
    const lineRes = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/lines`,
      headers: { cookie: nurseCookie },
      payload: { careUnitMedicationId: spec.cumId, quantity: spec.quantity },
    });
    expect(lineRes.statusCode).toBe(200);
  }
  const submitRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/submit`,
    headers: { cookie: nurseCookie },
  });
  expect(submitRes.statusCode).toBe(200);
  const confirmRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/confirm`,
    headers: { cookie: apotekareCookie },
  });
  expect(confirmRes.statusCode).toBe(200);
}

/**
 * Phase 10 D-160 / D-164 — mint a per-(careUnit, current-year) order number
 * for test fixtures that insert Order rows directly via prisma.order.create.
 *
 * Mirrors the runtime mintOrderNumber() in apps/api/src/services/order.service.ts
 * (the UPDATE-then-INSERT-with-ON-CONFLICT pattern). Returns
 * { orderNumberCounter, orderNumberYear } ready to spread into a
 * prisma.order.create({ data }) call.
 *
 * Tests that go through the route layer (createEmptyOrder) do NOT need this
 * helper — createDraftOrder already mints inside its $transaction. Only the
 * direct-prisma-create fixtures (orders.list, orders.integration's bulk
 * fixtures, dashboard.orders test cleanups) need to call this.
 */
export async function mintTestOrderNumber(
  careUnitId: string,
): Promise<{ orderNumberCounter: number; orderNumberYear: number }> {
  const updated = await prisma.$queryRaw<{ year: number; counter: number }[]>`
    UPDATE "OrderNumberCounter"
    SET "nextValue" = "nextValue" + 1
    WHERE "careUnitId" = ${careUnitId}
      AND "year" = EXTRACT(YEAR FROM NOW())::int
    RETURNING "year", "nextValue" - 1 AS "counter"
  `;
  if (updated.length === 1) {
    return { orderNumberCounter: updated[0]!.counter, orderNumberYear: updated[0]!.year };
  }
  const inserted = await prisma.$queryRaw<{ year: number; counter: number }[]>`
    INSERT INTO "OrderNumberCounter" ("careUnitId", "year", "nextValue")
    VALUES (${careUnitId}, EXTRACT(YEAR FROM NOW())::int, 2)
    ON CONFLICT ("careUnitId", "year")
    DO UPDATE SET "nextValue" = "OrderNumberCounter"."nextValue" + 1
    RETURNING "year",
              CASE WHEN xmax = 0 THEN 1
                   ELSE "OrderNumberCounter"."nextValue" - 1
              END AS "counter"
  `;
  return { orderNumberCounter: inserted[0]!.counter, orderNumberYear: inserted[0]!.year };
}

export { prisma };
