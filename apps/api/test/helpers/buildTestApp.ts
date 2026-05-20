import { vi } from 'vitest';
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
if (!process.env.DATABASE_URL) {
  vi.stubEnv(
    'DATABASE_URL',
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
const ADMIN_PASSWORD = 'demo1234';
const CARE_UNIT_ID = 'careunit-karolinska-01';
const CARE_UNIT_NAME = 'Avdelning 4, Karolinska';
const ADMIN_NAME = 'Admin Demo';

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
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
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

export const TEST_ADMIN = {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  name: ADMIN_NAME,
  careUnitId: CARE_UNIT_ID,
  careUnitName: CARE_UNIT_NAME,
} as const;

export { prisma };
