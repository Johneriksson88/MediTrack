import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';

/**
 * Phase 1 demo seed (Plan 05) — three roles on one shared vårdenhet.
 *
 * Idempotency: every write uses `upsert` keyed by stable PK (CareUnit id
 * literal) or unique field (User email). Running `pnpm db:seed` twice
 * against the same DB exits 0 both times; `SELECT COUNT(*) FROM "User"`
 * stays at 3. The compose `api` ENTRYPOINT chains migrate → seed → serve
 * (Pattern P) so a fresh `docker compose up` always lands on this exact
 * three-row state.
 *
 * Demo credentials (shared, dev/demo only — documented in README.md):
 *   apotekare@example.test       / demo1234  → role: apotekare
 *   sjukskoterska@example.test   / demo1234  → role: sjukskoterska
 *   admin@example.test           / demo1234  → role: admin
 *   all three bound to CareUnit { name: 'Avdelning 4, Karolinska' }
 *
 * Performance: we hash the shared password ONCE and reuse the resulting
 * argon2id digest for all three users. Each hash costs ~150-300ms under
 * the OWASP 2025 defaults; hashing per-user would add ~600ms to every
 * seed run, including every `docker compose up`. The shared hash is safe
 * here only because this is a dev/demo seed — production users MUST
 * never share a hash.
 */

const CARE_UNIT_ID = 'careunit-karolinska-01';
const CARE_UNIT_NAME = 'Avdelning 4, Karolinska';
const SHARED_PASSWORD = 'demo1234';

interface SeedUser {
  email: string;
  name: string;
  role: 'apotekare' | 'sjukskoterska' | 'admin';
}

const SEED_USERS: readonly SeedUser[] = [
  {
    email: 'apotekare@example.test',
    name: 'Anna Apotekare',
    role: 'apotekare',
  },
  {
    email: 'sjukskoterska@example.test',
    name: 'Sara Sjuksköterska',
    role: 'sjukskoterska',
  },
  {
    email: 'admin@example.test',
    name: 'Admin Demo',
    role: 'admin',
  },
] as const;

const prisma = new PrismaClient();

async function main() {
  // One care unit. Fixed id so re-runs match the same row.
  await prisma.careUnit.upsert({
    where: { id: CARE_UNIT_ID },
    update: { name: CARE_UNIT_NAME },
    create: { id: CARE_UNIT_ID, name: CARE_UNIT_NAME },
  });

  // Hash the shared password ONCE (see top-of-file note on the trade-off).
  const passwordHash = await hashPassword(SHARED_PASSWORD);

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      // `update: {}` keeps the existing row unchanged on re-run so the seed
      // is observably idempotent — re-running does not bump `updatedAt`,
      // does not re-write the hash, does not rotate anything. The first
      // run does the work; subsequent runs are no-ops.
      update: {},
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        careUnitId: CARE_UNIT_ID,
        passwordHash,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Seeded users (password=${SHARED_PASSWORD}): ${SEED_USERS.map((u) => u.email).join(', ')}`,
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
