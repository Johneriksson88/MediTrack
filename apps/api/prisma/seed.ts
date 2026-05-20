import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';

/**
 * Walking Skeleton seed (Plan 02). Plan 05 expands to all three roles.
 *
 * Idempotency: both writes use `upsert`. Re-running `docker compose up` on
 * the same volume (Pattern P, Phase 1 success #4) MUST NOT fail — the data
 * model already tolerates seed reruns and this script does too.
 *
 * Demo credentials (committed only because they are intentionally trivial;
 * Plan 07 README will list them as the dev login):
 *   email:    admin@example.test
 *   password: demo1234
 */

const CARE_UNIT_ID = 'careunit-karolinska-01';
const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'demo1234';
const CARE_UNIT_NAME = 'Avdelning 4, Karolinska';
const ADMIN_NAME = 'Admin Demo';

const prisma = new PrismaClient();

async function main() {
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
      // We intentionally re-hash on every seed so a `pnpm db:seed` always
      // resets the demo password — useful when a previous run mutated it.
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

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Walking Skeleton ready — login as ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
