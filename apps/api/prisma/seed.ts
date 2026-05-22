import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse';
import { defaultLowStockThreshold, ORDER_STATUS_LABELS } from '@meditrack/shared';
import { hashPassword } from '../src/auth/password.js';

/**
 * Phase 1 demo seed (Plan 05) — three roles on one shared vårdenhet.
 * Phase 2 extension — 43 538 NPL Medication rows + matching CareUnitMedication
 * rows for the seeded vårdenhet with deterministic stock/threshold (D-23..D-25).
 *
 * Idempotency: every write uses `upsert` (CareUnit, User) or `createMany` with
 * `skipDuplicates: true` (Medication, CareUnitMedication) keyed by unique
 * constraints. Running `pnpm db:seed` twice against the same DB exits 0 both
 * times; row counts stay identical. The compose `api` ENTRYPOINT chains
 * migrate → seed → serve (Pattern P) so a fresh `docker compose up` always
 * lands on this exact state.
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
 *
 * Phase 2 Performance (D-24): Medication rows are inserted via `createMany`
 * in 1000-row chunks (~44 batches). On a modern laptop with a local Postgres,
 * first run targets ≤30 s; second run is a no-op (skipDuplicates + unique
 * on nplId / @@unique([careUnitId, medicationId])).
 */

const CARE_UNIT_ID = 'careunit-karolinska-01';
const CARE_UNIT_NAME = 'Avdelning 4, Karolinska';
const SHARED_PASSWORD = 'demo1234';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ---------------------------------------------------------------------------
// Deterministic PRNG — keyed on nplId (D-25)
//
// Chosen algorithm: FNV-1a (32-bit) as the hash, then mulberry32 as the PRNG.
// Both are reproducible across runs (no runtime entropy), compact (no deps),
// and fast (no crypto overhead for 43k rows). The combination ensures that
// every nplId maps to the same stock/threshold on every seed run, so
// screenshots in the README match what the interviewer sees live (D-25).
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash — fast, reproducible, avalanche-friendly for short strings.
 * Used to derive a stable integer seed from an nplId string (D-25).
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime: 0x01000193 (16777619). Use Math.imul for safe 32-bit multiply.
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit.
  return hash >>> 0;
}

/**
 * mulberry32 PRNG seeded from an integer — returns a closure that produces
 * reproducible floats in [0, 1). Called once per nplId to generate
 * independent stock + threshold values (D-25).
 */
function prngFromSeed(seed: number): () => number {
  let s = seed;
  return function () {
    s += 0x6d2b79f5;
    let z = Math.imul(s ^ (s >>> 15), s | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * D-25 — Derive deterministic { currentStock, lowStockThreshold } for a
 * CareUnitMedication row. About 8% of rows are forced below threshold
 * (stock < threshold) so screenshots consistently show red badges.
 *
 * The PRNG is seeded from fnv1a(nplId) — same nplId → same values across
 * all seed runs. Threshold baseline is derived from defaultLowStockThreshold(form)
 * (STK-03) with minor jitter to avoid all rows having the exact same threshold.
 */
function derive(
  nplId: string,
  form: string,
): { currentStock: number; lowStockThreshold: number } {
  const seed = fnv1a(nplId);
  const rng = prngFromSeed(seed);

  const baseThreshold = defaultLowStockThreshold(form);
  // Jitter threshold ±2 around the base to add variety without losing the tier shape.
  const lowStockThreshold = Math.max(1, baseThreshold + Math.floor(rng() * 5) - 2);

  // ~8% of rows: force stock < threshold (produces red badge in UI).
  // ~92% of rows: stock is in [threshold, threshold + 180] (normal range).
  const isLow = rng() < 0.08;
  const currentStock = isLow
    ? Math.floor(rng() * Math.max(1, lowStockThreshold))
    : lowStockThreshold + Math.floor(rng() * 180);

  return { currentStock, lowStockThreshold };
}

// ---------------------------------------------------------------------------
// CSV → Medication createMany
// ---------------------------------------------------------------------------

interface CsvRow {
  nplid: string;
  namn: string;
  atc_kod: string;
  form: string;
  form_kod: string;
  styrka: string;
}

const CHUNK_SIZE = 1000;

/**
 * Stream-parse the committed NPL CSV and batch-insert Medication rows.
 * Returns the total number of rows processed (not necessarily inserted —
 * skipDuplicates means re-runs skip existing rows).
 */
async function seedMedications(prisma: PrismaClient): Promise<number> {
  const csvPath = path.resolve(__dirname, 'seed-data', 'lakemedel.csv');

  return new Promise((resolve, reject) => {
    const parser = parse({
      columns: true,
      delimiter: ';',
      bom: true,
      skip_empty_lines: true,
      trim: true,
    });

    const stream = createReadStream(csvPath);
    let chunk: Parameters<typeof prisma.medication.createMany>[0]['data'] = [];
    let totalProcessed = 0;
    const insertPromises: Promise<unknown>[] = [];

    function flushChunk() {
      if (chunk.length === 0) return;
      const toInsert = chunk;
      chunk = [];
      insertPromises.push(
        prisma.medication.createMany({
          data: toInsert,
          skipDuplicates: true,
        }),
      );
    }

    parser.on('readable', () => {
      let row: CsvRow | null;
      while ((row = parser.read() as CsvRow | null) !== null) {
        if (!row.nplid || !row.namn) continue; // skip malformed rows
        chunk.push({
          nplId: row.nplid,
          name: row.namn,
          atcCode: row.atc_kod,
          form: row.form,
          strength: row.styrka?.trim() || null,
          source: 'npl',
        });
        totalProcessed++;
        if (chunk.length >= CHUNK_SIZE) {
          flushChunk();
        }
      }
    });

    parser.on('error', reject);

    parser.on('end', async () => {
      flushChunk(); // flush remaining rows
      try {
        await Promise.all(insertPromises);
        resolve(totalProcessed);
      } catch (err) {
        reject(err);
      }
    });

    stream.pipe(parser);
  });
}

/**
 * Second pass: load all npl Medication ids + forms, derive stock/threshold,
 * batch-insert CareUnitMedication rows for the seeded vårdenhet.
 * skipDuplicates handles idempotency via @@unique([careUnitId, medicationId]).
 */
async function seedCareUnitMedications(prisma: PrismaClient): Promise<{ total: number; belowThreshold: number }> {
  // Fetch only what we need: id, nplId (for PRNG seed), form (for threshold tier).
  const meds = await prisma.medication.findMany({
    where: { source: 'npl' },
    select: { id: true, nplId: true, form: true },
  });

  let total = 0;
  let belowThreshold = 0;
  let chunk: Parameters<typeof prisma.careUnitMedication.createMany>[0]['data'] = [];

  async function flushChunk() {
    if (chunk.length === 0) return;
    await prisma.careUnitMedication.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    chunk = [];
  }

  for (const med of meds) {
    if (!med.nplId) continue; // safety guard (npl rows always have nplId)
    const { currentStock, lowStockThreshold } = derive(med.nplId, med.form);
    chunk.push({
      careUnitId: CARE_UNIT_ID,
      medicationId: med.id,
      currentStock,
      lowStockThreshold,
    });
    total++;
    if (currentStock < lowStockThreshold) belowThreshold++;
    if (chunk.length >= CHUNK_SIZE) {
      await flushChunk();
    }
  }
  await flushChunk();

  return { total, belowThreshold };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  // Phase 2: seed 43 538 NPL Medication rows from the committed CSV (D-23, D-24).
  // eslint-disable-next-line no-console
  console.log('[seed] Streaming NPL CSV into Medication table (skipDuplicates)…');
  const medCount = await seedMedications(prisma);
  // eslint-disable-next-line no-console
  console.log(`[seed] Medications processed from CSV: ${medCount}`);

  // Phase 2: seed CareUnitMedication rows for the seeded vårdenhet (D-25).
  // eslint-disable-next-line no-console
  console.log(`[seed] Seeding CareUnitMedication rows for ${CARE_UNIT_ID}…`);
  const { total: cumTotal, belowThreshold } = await seedCareUnitMedications(prisma);
  const pct = ((belowThreshold / cumTotal) * 100).toFixed(1);
  // eslint-disable-next-line no-console
  console.log(
    `[seed] CareUnitMedications inserted for ${CARE_UNIT_ID}: ${cumTotal} (~${pct}% below threshold)`,
  );

  // Phase 4 D-85: seed one demo order per status (Utkast, Skickad, Bekräftad, Levererad).
  // seedDemoOrders replaces Phase 3's single-draft seedDraftOrder for the demo path.
  await seedDemoOrders(prisma);
}

// ---------------------------------------------------------------------------
// Phase 4 D-85 — Demo orders fan-out (one per status, idempotent)
// ---------------------------------------------------------------------------

/**
 * Picks up to `n` low-stock CareUnitMedications for the given careUnit.
 * Falls back to any available meds if fewer than `n` are below threshold.
 *
 * Extracted from seedDraftOrder so all four status-seeders call the same
 * helper and produce the same 3 demo CUMs (predictable 30-second demo path
 * per D-85). Prisma doesn't support column-to-column comparisons in WHERE
 * so filtering is done in JS.
 */
async function pickLowStockCumsFor(
  prisma: PrismaClient,
  careUnitId: string,
  n: number,
): Promise<string[]> {
  const candidates = await prisma.careUnitMedication.findMany({
    where: { careUnitId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, currentStock: true, lowStockThreshold: true },
  });

  const lowStock = candidates.filter((m) => m.currentStock < m.lowStockThreshold).slice(0, n);
  let ids = lowStock.map((m) => m.id);

  if (ids.length < n) {
    const fallback = await prisma.careUnitMedication.findMany({
      where: { careUnitId, deletedAt: null, id: { notIn: ids } },
      take: n - ids.length,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    ids = [...ids, ...fallback.map((m) => m.id)];
  }

  return ids;
}

/**
 * Phase 4 D-85 — Seed one demo order for the given status, idempotently.
 *
 * Idempotency key: (careUnitId, createdByUserId, status, deletedAt: null).
 * Per-status guard so re-running seed after a partial run tops up only the
 * missing statuses without re-creating or re-applying stock increments for
 * statuses that already exist.
 *
 * For 'levererad': applies post-step stock increment per line INSIDE the same
 * idempotency block — the findFirst early-return guards both the order create
 * AND the stock UPDATE so re-running produces no double-increment (T-04-21).
 */
async function seedOrderInStatus(
  prisma: PrismaClient,
  status: 'utkast' | 'skickad' | 'bekraftad' | 'levererad',
  sjukskoterska: { id: string; careUnitId: string; email: string },
  apotekare?: { id: string },
  cumIds?: string[],
): Promise<void> {
  // Idempotency check: one per (careUnitId, createdByUserId, status).
  const existing = await prisma.order.findFirst({
    where: {
      careUnitId: sjukskoterska.careUnitId,
      createdByUserId: sjukskoterska.id,
      status,
      deletedAt: null,
    },
  });

  const statusLabel = ORDER_STATUS_LABELS[status];

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[seed] ${statusLabel} order already exists — skipping (idempotent).`);
    return;
  }

  // Resolve the demo CUMs (passed in from the caller so all four orders share the same set).
  const ids = cumIds ?? [];
  if (ids.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[seed] No CareUnitMedications available — skipping ${statusLabel} order seed.`);
    return;
  }

  const now = new Date();

  // Build actor stamps based on how far through the lifecycle this status is.
  const data: Parameters<typeof prisma.order.create>[0]['data'] = {
    careUnitId: sjukskoterska.careUnitId,
    createdByUserId: sjukskoterska.id,
    status,
    lines: {
      create: ids.map((careUnitMedicationId) => ({
        careUnitMedicationId,
        quantity: 5, // predictable quantity for the demo path
      })),
    },
  };

  if (status === 'skickad' || status === 'bekraftad' || status === 'levererad') {
    data.submittedAt = now;
    data.submittedByUserId = sjukskoterska.id;
  }
  if ((status === 'bekraftad' || status === 'levererad') && apotekare) {
    data.confirmedAt = now;
    data.confirmedByUserId = apotekare.id;
  }
  if (status === 'levererad' && apotekare) {
    data.deliveredAt = now;
    data.deliveredByUserId = apotekare.id;
  }

  // D-85: for the Levererad order, atomically create the order AND apply
  // per-CUM stock increments in one transaction. Without this, a crash
  // between the two non-transactional steps would leave the order in
  // 'levererad' status with no stock change — and the idempotency guard
  // above would prevent recovery on the next seed run.
  if (status === 'levererad') {
    await prisma.$transaction(async (tx) => {
      await tx.order.create({ data });
      for (const cumId of ids) {
        await tx.careUnitMedication.update({
          where: { id: cumId },
          data: { currentStock: { increment: 5 } }, // mirrors the line quantity above
        });
      }
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] ${statusLabel} order created.`);
    // eslint-disable-next-line no-console
    console.log(`[seed] Levererad order stock incremented for ${ids.length} CUM(s).`);
    return;
  }

  await prisma.order.create({ data });

  // eslint-disable-next-line no-console
  console.log(`[seed] ${statusLabel} order created.`);
}

/**
 * Phase 4 D-85 — Orchestrate seeding of one demo order per status.
 *
 * Idempotent per status: each seedOrderInStatus call checks independently
 * before inserting. Running seedDemoOrders N times produces exactly 4 orders
 * (one per status) and stock incremented exactly once.
 *
 * The same 3 low-stock CUMs are used across all four orders so the demo
 * path is predictable (D-85: apotekare login → Skickade tab → confirm →
 * deliver → /lakemedel shows updated stock).
 */
async function seedDemoOrders(prisma: PrismaClient): Promise<void> {
  const sjukskoterska = await prisma.user.findUnique({
    where: { email: 'sjukskoterska@example.test' },
  });
  const apotekare = await prisma.user.findUnique({
    where: { email: 'apotekare@example.test' },
  });

  if (!sjukskoterska) {
    // eslint-disable-next-line no-console
    console.log('[seed] sjukskoterska user not found — skipping demo order seed.');
    return;
  }
  if (!apotekare) {
    // eslint-disable-next-line no-console
    console.log('[seed] apotekare user not found — skipping demo order seed.');
    return;
  }

  // Pick the same 3 demo CUMs once; reuse across all four status-seeders (D-85).
  const cumIds = await pickLowStockCumsFor(prisma, sjukskoterska.careUnitId, 3);
  if (cumIds.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[seed] No CareUnitMedications available — skipping demo order seed.');
    return;
  }

  await seedOrderInStatus(prisma, 'utkast', sjukskoterska, undefined, cumIds);
  await seedOrderInStatus(prisma, 'skickad', sjukskoterska, apotekare, cumIds);
  await seedOrderInStatus(prisma, 'bekraftad', sjukskoterska, apotekare, cumIds);
  await seedOrderInStatus(prisma, 'levererad', sjukskoterska, apotekare, cumIds);
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
