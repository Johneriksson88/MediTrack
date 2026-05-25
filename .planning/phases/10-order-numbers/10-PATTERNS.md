# Phase 10: Order Numbers — Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 21 (3 new, 18 modified)
**Analogs found:** 21 / 21 (100% coverage — Phase 10 introduces no genuinely new pattern; `OrderNumberCounter` table is new but the lock primitive on it is inherited from Phase 4 STK-02)

---

## File Classification

### Slice 1 — BE foundation (schema + service + contracts + audit + tests)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/migrations/20260525XXXXXX_0013_order_numbers/migration.sql` | migration (NEW) | DDL + backfill DML | `migrations/20260522181022_0007_audit_events/migration.sql` (CREATE TABLE + indexes) + `migrations/20260523124435_0012_medication_therapeutic_class/migration.sql` (ALTER TABLE ADD COLUMN) | role-match (no prior backfill-then-NOT-NULL exists) |
| `apps/api/prisma/schema.prisma` (edit `model Order` ~line 213; add `model OrderNumberCounter`) | schema | DDL | self (existing `model Order` + `model AuditEvent`) | exact |
| `packages/shared/src/utils/orderNumber.ts` (NEW; directory does NOT exist — verified) | utility | pure transform | `packages/shared/src/constants/orderStatus.ts` (one exported const + type, zero side effects) | role-match (constants/ is closest sibling shape; utils/ is a brand-new sibling directory) |
| `packages/shared/src/utils/__tests__/orderNumber.test.ts` (NEW) | test (unit) | pure assertions | None found in `packages/shared/` (no existing test infrastructure under shared) — will follow vitest `describe/it/expect` shape from `apps/web/src/routes/.../__tests__/SubmitConfirmationBanner.test.tsx` | role-match |
| `packages/shared/src/index.ts` (add `export { formatOrderNumber }`) | barrel export | re-export | self (existing barrel ~140 lines) | exact |
| `packages/shared/src/contracts/order.ts` (extend `orderResponse` + `orderListItem` with `orderNumber`) | contract | Zod schema | self lines 68–88 (`orderResponse`) and 100–115 (`orderListItem`) | exact |
| `packages/shared/src/contracts/dashboard.ts` (extend `dashboardOrderRow` with `orderNumber`) | contract | Zod schema | self lines 138–153 (`dashboardOrderRow`) | exact |
| `apps/api/src/services/order.service.ts:createDraftOrder` (add `mintOrderNumber` inside `$transaction`) | service | DB tx + write lock | self `submitOrder` (lines 406–500) + `deliverOrder` (lines 645–787): `$transaction(async tx => …)` + `$queryRaw` lock + `updateMany` precondition | exact (same primitive, different locked row) |
| `apps/api/src/services/order.service.ts` (mapper updates `toOrderResponse`, `toOrderListItem`) | service | row → contract mapping | self lines 78–157 | exact |
| `apps/api/src/services/dashboard.service.ts:listDashboardOrdersForUser` (widen `dashboardOrderInclude` + `toDashboardOrderRow` with orderNumberCounter/Year) | service | row → contract mapping | self lines 166–197 (`dashboardOrderInclude` + `toDashboardOrderRow`) | exact |
| `apps/api/src/db/auditAllowlist.ts` (extend `Order` array with 3 new fields) | config (allowlist) | static list | self lines 79–93 (`Order` entry) — Phase 6 added `therapeuticClass` to `Medication` (lines 62–67) as the canonical extension pattern | exact |
| `apps/api/test/orders.orderNumber.integration.test.ts` (NEW: concurrency + year-boundary + cross-vårdenhet + lifecycle stability + backfill SQL) | test (integration) | full BE roundtrip + raw SQL + Promise.allSettled race | `apps/api/test/orders.deliver.integration.test.ts` Test 8 (lines 384–488) — the canonical pg_locks concurrency test (Promise.allSettled + pg_locks poll) | exact |
| `apps/api/test/orders.integration.test.ts` (extend assertions with `orderNumber`) | test (integration) | response-body assertions | self (existing assertions on `order.status`, `order.careUnitId`) | exact |
| `apps/api/test/orders.confirm.integration.test.ts` | test (integration) | response-body assertions | self + sibling `orders.deliver.integration.test.ts` | exact |
| `apps/api/test/orders.deliver.integration.test.ts` | test (integration) | response-body assertions | self | exact |
| `apps/api/test/orders.list.integration.test.ts` | test (integration) | response-body assertions | self | exact |
| `apps/api/test/dashboard.orders.integration.test.ts` (extend Test 1/2 row assertions with `orderNumber`) | test (integration) | discriminated-union response assertion | self lines 64–80 (Test 1 nurse subview Zod parse via `dashboardOrdersResponse.parse(res.json())`) | exact |
| `apps/api/test/contracts.orderEnvelope.test.ts` (verify shape includes `orderNumber`) | test (contract) | Zod schema assertions | self | exact |

### Slice 2 — FE rendering surfaces

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/routes/bestallningar/OrdersTable.tsx` (add leftmost `Best.nr` column) | component (table) | render row.orderNumber | self (existing column declarations lines 100–124) | exact |
| `apps/web/src/routes/bestallningar/DraftsTable.tsx` (add leftmost `Best.nr` column) | component (table) | render row.orderNumber | sibling `OrdersTable.tsx` (already widened for tab variants) + self lines 43–61 | exact |
| `apps/web/src/routes/bestallningar/OrdersCardList.tsx` (heading slot → orderNumber) | component (card) | render row.orderNumber | self lines 94–98 (CardTitle slot today renders `formatRelative(relevantAt)`) | exact |
| `apps/web/src/routes/bestallningar/DraftsCardList.tsx` (heading slot → orderNumber; thin shell over `DraftCard`) | component (card) | render item.orderNumber | sibling `DraftCard.tsx` lines 72–79 (CardTitle slot today renders `formatRelative(item.createdAt)`) | exact |
| `apps/web/src/routes/bestallningar/DraftCard.tsx` (heading → orderNumber; demote `formatRelative` to secondary) | component (card) | render item.orderNumber | self lines 73–79 | exact |
| `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` (new `<h1>Beställning ORD-2026-0042</h1>` above OrderStatusPill) | route page (header) | render order.orderNumber | self lines 168–184 (`header` JSX — h1 currently reads `heading` const from status, line 180) | exact |
| `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` (row primary → orderNumber; demote createdBy.name) | component (card list) | render row.orderNumber | self lines 240–263 (`Section` row Link content) | exact |
| `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` (copy gains orderNumber) | component (banner) | render order.orderNumber | self lines 45–53 | exact |
| `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` | test (component) | renderWithProviders + screen assertions | self + sibling `ComposeOrderPage.test.tsx` | exact |
| `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` | test (component) | renderWithProviders + screen assertions | self | exact |
| `apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx` | test (component) | render + screen.getByRole('status') + toHaveTextContent | self lines 16–50 | exact |
| `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` | test (component) | renderWithProviders + screen assertions | self | exact |
| `apps/web/scripts/captureSc04Screenshots.ts` (re-run only; no edits expected) | script (one-shot Playwright) | screenshot capture | self (the script is self-contained) | exact |

---

## Pattern Assignments

### `apps/api/prisma/migrations/20260525XXXXXX_0013_order_numbers/migration.sql` (migration, DDL + backfill DML)

**Analog A — Phase 7 audit_events CREATE TABLE shape** (`migrations/20260522181022_0007_audit_events/migration.sql` lines 70–101):

```sql
-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    ...
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt" DESC, "id");
```

**Analog B — Phase 6 ADD COLUMN nullable then index** (`migrations/20260523124435_0012_medication_therapeutic_class/migration.sql` lines 22–35):

```sql
-- CreateEnum
CREATE TYPE "TherapeuticClass" AS ENUM ('A', 'B', 'C', 'D', 'G', 'H', 'J', 'L', 'M', 'N', 'P', 'R', 'S', 'V');

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN     "therapeuticClass" "TherapeuticClass";

-- CreateIndex
CREATE INDEX "Medication_therapeuticClass_idx" ON "Medication"("therapeuticClass");
```

**Header-comment pattern** (analog 0007 lines 1–60): generous block comment explaining WHAT THIS RECORDS, WHY NO FOREIGN KEY, WHY N INDEXES, CONNECTION TO THE NEXT MIGRATION. Phase 10 should mirror — explain the backfill SQL, why structured columns + derived display, and the locking promise.

**Hand-edit warning to inherit** (analog 0012 lines 8–19 + 24–29): if `prisma migrate diff` is used to generate, watch for spurious `DROP INDEX "Medication_name_trgm_idx"` injection — strip by hand and document the strip.

**Filename prefix convention:** `0013_*` — sequential zero-padded prefix continuing from `0012_medication_therapeutic_class` (per CONTEXT.md `<code_context>` line 164).

**No prior analog** for the `WITH numbered AS (ROW_NUMBER() OVER PARTITION BY) UPDATE … FROM numbered` backfill CTE — CONTEXT.md `<specifics>` Step 3 (lines 203–216) is the locked SQL.

---

### `apps/api/prisma/schema.prisma` (schema edits)

**Analog — `model Order` itself** (lines 213–261):

```prisma
model Order {
  id String @id @default(cuid())

  careUnitId String
  careUnit   CareUnit @relation(fields: [careUnitId], references: [id])

  createdByUserId String
  createdBy       User   @relation(name: "OrderCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)

  status OrderStatus @default(utkast)

  /// D-49 — stamped by the submit transition; null while in utkast.
  submittedAt DateTime?
  ...
  @@index([careUnitId, status])
  @@index([careUnitId, createdAt])
  @@index([createdByUserId])
}
```

**Insertion pattern** (mirror Phase 4 D-84 confirmedAt/deliveredAt addition style, lines 234–247): each new field gets a `/// Phase 10 D-160 — comment`. Two new fields:

```prisma
  /// Phase 10 D-160 / D-165 — per-(careUnit, year) monotonic counter.
  /// Stamped at createDraftOrder time; immutable thereafter (D-162).
  orderNumberCounter Int

  /// Phase 10 D-161 / D-165 — year segment derived server-side at insert
  /// from Postgres NOW() (DB clock, not app clock) to defeat clock-skew.
  orderNumberYear Int
```

**New `@@unique`** (mirror `@@unique([careUnitId, medicationId])` from `CareUnitMedication` line 158):

```prisma
  @@unique([careUnitId, orderNumberYear, orderNumberCounter])
```

**New `model OrderNumberCounter`** (mirror compound-PK shape from `Session` line 88 + relation pattern from `CareUnit` references):

```prisma
model OrderNumberCounter {
  careUnitId String
  careUnit   CareUnit @relation(fields: [careUnitId], references: [id], onDelete: Cascade)
  year       Int
  nextValue  Int

  @@id([careUnitId, year])
}
```

---

### `packages/shared/src/utils/orderNumber.ts` (NEW utility — single exported function)

**Analog — `packages/shared/src/constants/orderStatus.ts`** (the canonical single-file shared utility shape, full file = 19 lines):

```typescript
import { z } from 'zod';

/**
 * UI-SPEC §Copy — order status vocabulary locked Phase 1, rendered Phase 3+.
 * Strings live here so all later phases (and shared TS types) import from one place.
 */
export const ORDER_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusEnum = z.enum(ORDER_STATUSES);
...
```

**Apply to Phase 10:** one file, one exported function (no class, no side effects, no imports beyond what's strictly needed). Locked content per CONTEXT.md `<specifics>` lines 270–278:

```typescript
// packages/shared/src/utils/orderNumber.ts

/**
 * Phase 10 D-157 / D-165 — single source of truth for the rendered
 * order-number shape. Format: ORD-YYYY-#### (4-digit zero-padded counter).
 * Used by BE serialization (toOrderResponse, toOrderListItem,
 * toDashboardOrderRow) and FE display (OrdersTable, DraftsTable,
 * ComposeOrderPage H1, DashboardOrdersCard, SubmitConfirmationBanner).
 */
export function formatOrderNumber(input: {
  year: number;
  counter: number;
}): string {
  return `ORD-${input.year}-${String(input.counter).padStart(4, '0')}`;
}
```

**Directory note:** `packages/shared/src/utils/` does NOT currently exist (verified by `ls packages/shared/src` returns only `constants/`, `contracts/`, `index.ts`). Phase 10 creates the directory.

---

### `packages/shared/src/index.ts` (add barrel export)

**Analog — existing export grouping** (lines 39–46, therapeuticClass block):

```typescript
// Phase 6 D-113 / D-114 / D-115 — therapeutic class vocabulary (closed enum
// of the 14 WHO ATC level-1 anatomical groups).
export {
  THERAPEUTIC_CLASSES,
  THERAPEUTIC_CLASS_LABELS,
  therapeuticClassEnum,
  type TherapeuticClass,
} from './constants/therapeuticClass.js';
```

**Insertion pattern:** add a new comment-headed export block (Phase 10 D-157 / D-165) for `formatOrderNumber` from `./utils/orderNumber.js`. `.js` extension is the established convention (NodeNext module resolution).

---

### `packages/shared/src/contracts/order.ts` (extend `orderResponse` + `orderListItem`)

**Analog — `orderResponse` itself** (lines 68–88):

```typescript
export const orderResponse = z.object({
  id: z.string(),
  careUnitId: z.string(),
  createdByUserId: z.string(),
  status: orderStatusEnum,
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
  // Phase 4 D-84 — confirm/deliver actor trios; null until the respective transition.
  confirmedAt: z.string().datetime().nullable(),
  ...
});
```

**Insertion pattern** (mirror Phase 4 D-84 mid-object extension): insert new fields with `// Phase 10 D-165 —` comment between `updatedAt` and `lines` (or right after `status` for prominence). Per CONTEXT.md `<specifics>` lines 285–291:

```typescript
  // Phase 10 D-165 — rendered + structured columns.
  orderNumber: z.string(),                            // formatted via formatOrderNumber
  orderNumberCounter: z.number().int().positive(),
  orderNumberYear: z.number().int().positive(),
```

**For `orderListItem`** (lines 100–115): add only `orderNumber: z.string()` — counter + year stay off the lean list shape (per Claude's discretion locked in CONTEXT.md `<specifics>` line 297, "counter + year not surfaced on list items").

---

### `packages/shared/src/contracts/dashboard.ts` (extend `dashboardOrderRow`)

**Analog — `dashboardOrderRow` itself** (lines 138–153):

```typescript
export const dashboardOrderRow = z.object({
  id: z.string(),
  status: orderStatusEnum, // 'utkast' | 'skickad' | 'bekraftad' | 'levererad'
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  // WR-01 (Phase 9 review) — tightened from `z.string()` to
  // `z.string().datetime()` so the wire shape enforces what the service
  // already emits...
  createdAt: z.string().datetime(),
});
```

**Insertion pattern:** add `orderNumber: z.string()` with a `// Phase 10 D-168 —` comment, after `createdAt` (last field today). Per CONTEXT.md `<specifics>` line 303.

---

### `apps/api/src/services/order.service.ts:createDraftOrder` (add `mintOrderNumber` inside `$transaction`)

**Analog A — `submitOrder` `$transaction` shape with row-level write lock** (lines 411–497):

```typescript
export async function submitOrder(
  careUnitId: string,
  orderId: string,
  actorUserId: string,
): Promise<OrderResponse> {
  const result = await prisma.$transaction(async (tx) => {
    // Step 0 — CR-02: lock the Order row FOR UPDATE so concurrent line
    // mutations (which call assertOrderEditable() inside their own tx) wait
    // until this submit commits. ...
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

    // Step 1 — Load the order with lines inside the transaction.
    const order = await tx.order.findUnique({ where: { id: orderId }, ... });

    // Step 5 — Atomic UPDATE with status precondition (D-54).
    const updated = await withActionOverride('order.submit', () =>
      tx.order.updateMany({
        where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null },
        data: { status: 'skickad', submittedAt: new Date(), ... },
      }),
    );
    ...
  });
  return toOrderResponse(result);
}
```

**Analog B — `deliverOrder` STK-02 CUM batch lock pattern** (lines 645–787):

```typescript
// Step 7 — D-79: SELECT FOR UPDATE on ALL affected CUMs in sorted-id order.
const sortedCumIds = [...byCum.keys()].sort();
await tx.$queryRaw`
  SELECT id FROM "CareUnitMedication"
  WHERE id = ANY(${sortedCumIds}::text[])
  ORDER BY id
  FOR UPDATE
`;

// Step 8 — Per-CUM stock increment (one Prisma update per distinct CUM).
for (const [cumId, qty] of byCum) {
  await withActionOverride('stock.increment', () =>
    tx.careUnitMedication.update({
      where: { id: cumId },
      data: { currentStock: { increment: qty } },
    }),
  );
}
```

**Analog C — current `createDraftOrder`** (lines 174–199, the insertion point):

```typescript
export async function createDraftOrder(
  careUnitId: string,
  createdByUserId: string,
): Promise<OrderResponse> {
  const order = await prisma.order.create({
    data: {
      careUnitId,
      createdByUserId,
      status: 'utkast',
    },
    include: { ... },
  });

  return toOrderResponse(order);
}
```

**Phase 10 transformation pattern:** wrap the existing `prisma.order.create` in a `$transaction(async (tx) => { … })`, run `mintOrderNumber(tx, careUnitId)` FIRST (its UPSERT-with-`ON CONFLICT` is the lock primitive — STK-02-equivalent on `OrderNumberCounter`), then call `tx.order.create({ data: { …, orderNumberCounter: counter, orderNumberYear: year } })`. Per CONTEXT.md `<specifics>` lines 234–264 the mint helper is locked:

```typescript
async function mintOrderNumber(
  tx: Prisma.TransactionClient,
  careUnitId: string
): Promise<{ year: number; counter: number }> {
  // 1. Try UPDATE first (common case: counter row already exists)
  const updated = await tx.$queryRaw<{ year: number; counter: number }[]>`
    UPDATE "OrderNumberCounter"
    SET "nextValue" = "nextValue" + 1
    WHERE "careUnitId" = ${careUnitId}
      AND "year" = EXTRACT(YEAR FROM NOW())::int
    RETURNING "year", "nextValue" - 1 AS "counter"
  `;
  if (updated.length === 1) return updated[0];

  // 2. UPSERT to materialize the row (first order of a new (careUnit, year) pair)
  const inserted = await tx.$queryRaw<{ year: number; counter: number }[]>`
    INSERT INTO "OrderNumberCounter" ("careUnitId", "year", "nextValue")
    VALUES (${careUnitId}, EXTRACT(YEAR FROM NOW())::int, 2)
    ON CONFLICT ("careUnitId", "year")
    DO UPDATE SET "nextValue" = "OrderNumberCounter"."nextValue" + 1
    RETURNING "year",
              CASE WHEN xmax = 0 THEN 1
                   ELSE "OrderNumberCounter"."nextValue" - 1
              END AS "counter"
  `;
  return inserted[0];
}
```

**Helper placement decision (deferred to planner per CONTEXT.md `<code_context>` line 171):** private function inside `order.service.ts` is fine; co-locating to `orderNumber.service.ts` is also defensible if file grows. Mirror Analog A's "Internal helper" comment block (`order.service.ts:998-1022 assertOrderEditable`).

---

### `apps/api/src/services/order.service.ts` (mapper updates `toOrderResponse`, `toOrderListItem`)

**Analog — current `toOrderResponse`** (lines 78–105):

```typescript
export function toOrderResponse(row: OrderWithRelations): OrderResponse {
  return {
    id: row.id,
    careUnitId: row.careUnitId,
    createdByUserId: row.createdByUserId,
    status: row.status as OrderResponse['status'],
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    ...
  };
}
```

**Insertion pattern:** add three new lines in `toOrderResponse`:

```typescript
    orderNumberCounter: row.orderNumberCounter,
    orderNumberYear: row.orderNumberYear,
    orderNumber: formatOrderNumber({ year: row.orderNumberYear, counter: row.orderNumberCounter }),
```

Add the import at the top: `import { formatOrderNumber } from '@meditrack/shared';`. For `toOrderListItem` (lines 135–157): single line `orderNumber: formatOrderNumber({ year: row.orderNumberYear, counter: row.orderNumberCounter })`.

---

### `apps/api/src/services/dashboard.service.ts` (widen `dashboardOrderInclude` + `toDashboardOrderRow`)

**Analog — current `dashboardOrderInclude` + `toDashboardOrderRow`** (lines 166–197):

```typescript
const dashboardOrderInclude = {
  createdBy: { select: { id: true, name: true } },
  lines: { select: { id: true, quantity: true } },
} as const;

function toDashboardOrderRow(order: {
  id: string;
  status: DashboardOrderRow['status'];
  createdAt: Date;
  createdBy: { id: string; name: string };
  lines: Array<{ id: string; quantity: number }>;
}): DashboardOrderRow {
  return {
    id: order.id,
    status: order.status,
    lineCount: order.lines.length,
    totalQuantity: order.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: { id: order.createdBy.id, name: order.createdBy.name },
    createdAt: order.createdAt.toISOString(),
  };
}
```

**Insertion pattern:** since `findMany` defaults to selecting all scalar columns when no `select:` is given, `orderNumberCounter` + `orderNumberYear` flow in for free — but the row type needs widening AND the mapper needs to call `formatOrderNumber`. Import `formatOrderNumber` and add `orderNumber: formatOrderNumber({...})` to the returned object. The `dashboardOrderInclude` shape itself does not need editing (it currently only declares `include:`, not `select:`).

---

### `apps/api/src/db/auditAllowlist.ts` (extend `Order` array)

**Analog — current `Order` entry** (lines 79–93):

```typescript
  Order: [
    'id',
    'careUnitId',
    'createdByUserId',
    'status',
    'submittedAt',
    'submittedByUserId',
    'confirmedAt',
    'confirmedByUserId',
    'deliveredAt',
    'deliveredByUserId',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
```

**Phase 6 precedent for additive extension** (lines 62–68, `Medication` entry was extended with `therapeuticClass`):

```typescript
    'createdAt',
    // Phase 6 D-97 + D-95 — diff-at-read surfaces therapeuticClass changes
    // via the existing $extends middleware (D-93). One-file extension; the
    // first user-driven AI suggest + apply produces an audit row showing
    // `therapeuticClass: null → N` automatically — no new audit action.
    'therapeuticClass',
  ],
```

**Apply to Phase 10:** add three lines with a Phase 10 D-165 comment before them. No code outside this file needs editing — `$extends` middleware (D-90 / D-95) surfaces them automatically.

**Path correction:** CONTEXT.md hedged "verify path — likely `apps/api/src/audit/AUDIT_ALLOWLIST.ts`". Actual path: `apps/api/src/db/auditAllowlist.ts` (camelCase, under `db/`, exports `AUDIT_ALLOWLIST` const). Confirmed via grep.

---

### `apps/api/test/orders.orderNumber.integration.test.ts` (NEW concurrency + year-boundary + isolation + lifecycle + backfill test)

**Analog — `apps/api/test/orders.deliver.integration.test.ts` Test 8** (lines 384–488, full pg_locks concurrency proof):

```typescript
it('Test 8 (concurrency OPS-03/D-88): two concurrent deliveries on same Bekraftad order — one commits, other gets 409, stock incremented exactly once', async () => {
  // ...
  // D-86: fire TWO parallel deliverOrder() calls directly (not via app.inject).
  // The DB-level FOR UPDATE serializes them; allSettled captures both outcomes.
  let blockedRowsObserved: { granted: boolean }[] = [];

  const txAPromise = deliverOrder(careUnitId, order.id, apotekareUser!.id);
  txAPromise.catch(() => { /* captured by allSettled below */ });

  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const txBPromise = deliverOrder(careUnitId, order.id, apotekareUser!.id);
  txBPromise.catch(() => { /* captured by allSettled below */ });

  // Poll pg_locks while both txs are in flight
  const pollStart = Date.now();
  while (Date.now() - pollStart < 300) {
    const rows = await prisma.$queryRaw<{ granted: boolean }[]>`
      SELECT granted
      FROM pg_locks l
      JOIN pg_stat_activity a USING (pid)
      WHERE a.wait_event_type = 'Lock'
        AND a.query ILIKE '%Order%'
    `;
    if (rows.length > 0) { blockedRowsObserved = rows; break; }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  const [aResult, bResult] = await Promise.allSettled([txAPromise, txBPromise]);

  const successCount = [aResult, bResult].filter((r) => r.status === 'fulfilled').length;
  expect(successCount).toBe(1);
  // ...
  // Stock incremented by EXACTLY 5 (not 10) — proves only one tx committed
}, 10_000);
```

**Test harness boilerplate** (lines 1–53, shared across all `apps/api/test/orders.*.integration.test.ts`):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
  buildTestApp,
  captureSessionCookie,
  createEmptyOrder,
  ensureAllRolesSeeded,
  findTestCareUnitMedication,
  loginAs,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';
// Import service directly (NOT via app.inject) for concurrency tests.
import { createDraftOrder } from '../src/services/order.service.js';

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
```

**Phase 10 transformation:** swap `deliverOrder` → `createDraftOrder`; the test asserts that two concurrent `createDraftOrder(careUnitId, userId)` calls produce DISTINCT sequential counter values (e.g. 0042 vs 0043), with NO duplicates and NO gaps. The `pg_locks` poll watches for blocked queries against `"OrderNumberCounter"` instead of `"Order"`. For the year-boundary + cross-vårdenhet tests, follow the same harness with seed-then-assert pattern from `dashboard.orders.integration.test.ts` lines 64–80 (Zod-parse the response, narrow on discriminator, assert field shape).

---

### `apps/web/src/routes/bestallningar/OrdersTable.tsx` (add leftmost `Best.nr` column)

**Analog — current TableHeader + TableBody column structure** (lines 100–168):

```tsx
<TableHeader>
  <TableRow className="bg-muted/50 hover:bg-muted/50">
    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {timeHeader}
    </TableHead>
    {tab === 'alla' && (
      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Status
      </TableHead>
    )}
    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[80px]">
      Rader
    </TableHead>
    ...
  </TableRow>
</TableHeader>
<TableBody>
  {rows.map((row) => {
    ...
    return (
      <TableRow
        key={row.id}
        tabIndex={0}
        aria-label={`Öppna beställning från ${formatRelative(relevantAt)}`}
        onClick={() => navigate(`/bestallningar/${row.id}?from=${tab}`)}
        ...
      >
        <TableCell className="px-4 py-3 text-sm font-normal">
          {formatRelative(relevantAt)}
        </TableCell>
        ...
      </TableRow>
    );
  })}
</TableBody>
```

**Insertion pattern:** add a new leftmost `<TableHead>` `Best.nr` before the existing `{timeHeader}` head, and a matching `<TableCell>` with `font-mono text-sm` rendering `row.orderNumber` before the existing first cell. The `aria-label` template literal becomes ``Öppna beställning ${row.orderNumber}`` (per CONTEXT.md `<domain>` line 23).

```tsx
<TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">
  Best.nr
</TableHead>
...
<TableCell className="px-4 py-3 font-mono text-sm">
  {row.orderNumber}
</TableCell>
```

**Recommended header text** (per CONTEXT.md `<decisions>` line 86): `Best.nr`.

---

### `apps/web/src/routes/bestallningar/DraftsTable.tsx` (mirror OrdersTable shape)

**Analog — current DraftsTable column structure** (lines 43–93, simpler than OrdersTable because no tab variants):

```tsx
<TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
  Skapad
</TableHead>
...
<TableCell className="px-4 py-3 text-sm font-normal">
  {formatRelative(item.createdAt)}
</TableCell>
```

**Insertion pattern:** identical to `OrdersTable.tsx` — leftmost `Best.nr` head + leftmost `font-mono text-sm` cell rendering `item.orderNumber`. aria-label becomes ``Öppna utkast ${item.orderNumber}``.

---

### `apps/web/src/routes/bestallningar/OrdersCardList.tsx` (heading slot → orderNumber)

**Analog — current top-of-card heading slot** (lines 94–105):

```tsx
{/* Top row: relative time + (alla: StatusPill) + chevron */}
<div className="flex items-center justify-between gap-2 mb-1">
  <span className="text-sm font-semibold text-foreground">
    {formatRelative(relevantAt)}
  </span>
  <div className="flex items-center gap-2 flex-shrink-0">
    {tab === 'alla' && (
      <OrderStatusPill status={row.status} />
    )}
    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  </div>
</div>
```

**Insertion pattern:** swap the `<span>` content from `formatRelative(relevantAt)` to `row.orderNumber` (with `font-mono`); demote `formatRelative(relevantAt)` to a new secondary line (parallel to today's middle "actor" line). aria-label on the outer `<button>` becomes ``Öppna beställning ${row.orderNumber}``.

---

### `apps/web/src/routes/bestallningar/DraftCard.tsx` (heading slot → orderNumber)

**Analog — current top row of DraftCard** (lines 72–79):

```tsx
{/* Top row: relative time + chevron */}
<div className="flex items-center justify-between gap-2 mb-1">
  <span className="text-sm font-semibold text-foreground">
    {formatRelative(item.createdAt)}
  </span>
  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
</div>
```

**Insertion pattern:** identical to OrdersCardList — `<span>` content swaps to `item.orderNumber` with `font-mono`; existing `formatRelative` demotes to secondary line. `aria-label` (line 60) updates to ``Öppna utkast ${item.orderNumber}``.

---

### `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` (new `<h1>Beställning ORD-2026-0042</h1>` above OrderStatusPill)

**Analog — current `header` JSX block** (lines 168–184):

```tsx
const header = (
  <>
    <div>
      <Link
        to={backLink.to}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {backLink.label}
      </Link>
    </div>
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-2xl font-semibold leading-tight">{heading}</h1>
      <OrderStatusPill status={order.status} />
    </div>
  </>
);
```

**Insertion pattern:** the `<h1>` already exists — Phase 10 changes its CONTENT from the status-derived `heading` const (lines 161–166: `'Nytt utkast' | 'Beställning · Skickad' | ...`) to ``Beställning ${order.orderNumber}`` (per CONTEXT.md `<decisions>` D-167 + recommended copy line 87). The status-derived heading becomes redundant (the `OrderStatusPill` already carries the status). The `heading` const block can be deleted.

**Loading-state skeleton update** (line 116): `<Skeleton className="h-8 w-48" />` — width may need bumping to accommodate the longer `Beställning ORD-YYYY-####` text.

**Document title** (lines 90–97): consider widening from status-only to also include the orderNumber (e.g. `'Beställning ORD-2026-0042 — MediTrack'`). Defer to planner.

---

### `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` (row primary → orderNumber)

**Analog — current Section row Link content** (lines 240–263):

```tsx
<Link
  to={`/bestallningar/${row.id}?from=${row.status}`}
  className="flex items-center justify-between py-2 min-h-[44px] ..."
>
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-sm font-semibold text-foreground">
      {formatRelative(row.createdAt)}
    </span>
    <span className="text-xs text-muted-foreground">
      Skapad av {row.createdBy.name}
    </span>
    <span className="text-xs text-muted-foreground">
      {row.lineCount} {row.lineCount === 1 ? 'rad' : 'rader'} ·
      {' '}totalt {row.totalQuantity}
    </span>
  </div>
  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
</Link>
```

**Insertion pattern:** swap the first `<span>` (primary text) from `formatRelative(row.createdAt)` to `row.orderNumber` (with `font-mono`). Demote `formatRelative(row.createdAt)` to merge with the second `<span>` (alongside `createdBy.name`). Per D-168.

---

### `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` (copy gains orderNumber)

**Analog — current banner content** (lines 45–53):

```tsx
return (
  <div
    role="status"
    className="mt-4 mx-4 sm:mx-0 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2"
  >
    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
    Beställningen är skickad till apotekare.
  </div>
);
```

**Phase 10 transformation per D-169:** copy becomes ``Beställning ${order.orderNumber} är skickad.`` Component needs a new prop `orderNumber: string` (or pass full `order` and read `.orderNumber`). The current props are `status` + `justSubmitted` (lines 23–35) — extend with `orderNumber: string`. The test file (`SubmitConfirmationBanner.test.tsx` lines 17–34) needs to pass `orderNumber="ORD-2026-0042"` and assert the new copy verbatim.

---

### `apps/web/src/routes/bestallningar/__tests__/SubmitConfirmationBanner.test.tsx` (extend assertions)

**Analog — current test shape** (lines 17–34):

```tsx
it('renders with role="status" and the confirmation copy when justSubmitted + status=skickad', () => {
  render(<SubmitConfirmationBanner status="skickad" justSubmitted={true} />);

  // role="status" triggers non-interrupting SR announcement on mount (UI-SPEC §12)
  const banner = screen.getByRole('status');
  expect(banner).toBeInTheDocument();

  // Locked Swedish copy (D-70)
  expect(banner).toHaveTextContent('Beställningen är skickad till apotekare.');
});
```

**Phase 10 transformation:** add `orderNumber="ORD-2026-0042"` to every render call; update the literal `toHaveTextContent('Beställning ORD-2026-0042 är skickad.')` per D-169.

---

### `apps/web/scripts/captureSc04Screenshots.ts` (re-run only)

**Analog — itself** (lines 33–47 ROUTES + VIEWPORTS arrays):

```typescript
const ROUTES = [
  { slug: 'login',                path: '/login',            anonymous: true  },
  { slug: 'lakemedel',            path: '/lakemedel',        anonymous: false },
  { slug: 'bestallningsskapande', path: '/bestallningar/ny', anonymous: false },
  { slug: 'bestallningshistorik', path: '/bestallningar',    anonymous: false },
  { slug: 'audit',                path: '/admin/audit',      anonymous: false },
  { slug: 'dashboard',            path: '/dashboard',        anonymous: false },
] as const;

const VIEWPORTS = [
  { width: 360,  height: 800  },
  ...
];
```

**Invocation pattern** (line 16):

```bash
pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts
```

**Prereqs (lines 13–15):** `docker compose up` running; `pnpm exec playwright install chromium` first-time. The script handles login as admin (`admin@example.test` / `demo1234`) and re-captures the four 360 px screenshots that Phase 10 visually changes: `sc04-360-bestallningshistorik.png`, `sc04-360-dashboard.png`, plus `sc04-360-lakemedel.png` (unchanged but re-shot) and `sc04-360-audit.png`. No code edits needed.

---

## Shared Patterns

### Phase 4 STK-02 row-level write lock primitive

**Source:** `apps/api/src/services/order.service.ts:submitOrder` lines 411–425 (`SELECT … FOR UPDATE`) + `deliverOrder` lines 713–719 (`WHERE id = ANY(${ids}::text[]) FOR UPDATE`).
**Apply to:** Phase 10 `mintOrderNumber` UPSERT — same Postgres `FOR UPDATE` write-lock semantics, just on `OrderNumberCounter` instead of `Order`/`CareUnitMedication`. The `ON CONFLICT DO UPDATE … RETURNING …` flavor (CONTEXT.md `<specifics>` lines 253–262) is the UPSERT analog of the explicit `FOR UPDATE` pattern; both produce the same DB-level serialization for concurrent transactions on the same row.

```typescript
// Phase 4 explicit lock:
await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

// Phase 10 UPSERT lock (same primitive, different syntax):
await tx.$queryRaw`
  INSERT INTO "OrderNumberCounter" (...) VALUES (...)
  ON CONFLICT (...) DO UPDATE SET "nextValue" = ... RETURNING ...
`;
```

### `withActionOverride` for audit action labels

**Source:** `apps/api/src/services/order.service.ts` lines 9 (import) + 463 / 572 / 728 / 741 / 821 (calls).
**Apply to:** Phase 10 — NO new override needed. The `createDraftOrder` write is already audited as `order.create` via the default Prisma method name (per AuditEvent comment lines 358–362). The three new columns surface in `after` JSON automatically via the AUDIT_ALLOWLIST.Order extension. Zero new audit code; this is exactly the pattern Phase 6 used for `Medication.therapeuticClass` (auditAllowlist.ts lines 62–67 commentary).

### Test harness boilerplate (vitest + buildTestApp + helpers)

**Source:** `apps/api/test/orders.deliver.integration.test.ts` lines 1–53 (canonical shape) + `dashboard.orders.integration.test.ts` lines 1–61.
**Apply to:** every new + extended integration test in Phase 10. Same `beforeAll/beforeEach/afterAll`, same helpers (`loginAs`, `buildTestApp`, `prisma`, `resetSessions`), same `app.inject` shape for HTTP boundary tests + direct service import for concurrency tests.

### Zod-parse-the-response for shape assertions

**Source:** `apps/api/test/dashboard.orders.integration.test.ts` line 79 (`const body = dashboardOrdersResponse.parse(res.json())`).
**Apply to:** Phase 10 — extend existing tests with `orderResponse.parse(...)` after asserting status, so a missing `orderNumber` field fails at Zod parse time (not at the assertion below). Reinforces the Zod-contract-as-test-oracle pattern.

### Filename + scope convention

**Source:** `.planning/phases/06-...`, `07-...`, `08-...`, `09-...` commits in `git log` + CONTEXT.md `<specifics>` lines 312–316.
**Apply to:** every Phase 10 commit. Use `chore(10-NN):` / `feat(10-NN):` / `test(10-NN):` / `docs(10-NN):` scopes. Migration filename: `20260525XXXXXX_0013_order_numbers` continuing the `0013_*` sequential prefix from `0012_medication_therapeutic_class`.

---

## No Analog Found

| File / Pattern | Why it's genuinely new | Planner guidance |
|----------------|------------------------|------------------|
| `model OrderNumberCounter` (Prisma) | First multi-column primary key with `@@id([careUnitId, year])` in the schema. Existing `Session` has a single-column `@id` set by the app; `CareUnitMedication` has `@@unique` but not `@@id`. | Mirror Postgres-compatible compound-PK syntax from Prisma docs; structure already locked in CONTEXT.md `<specifics>` lines 194–200. |
| Migration backfill CTE (`WITH numbered AS (ROW_NUMBER() OVER PARTITION BY …)`) | No prior migration in `apps/api/prisma/migrations/` uses a CTE backfill; all prior migrations have been pure DDL or single-statement DML. | SQL is locked verbatim in CONTEXT.md `<specifics>` lines 187–229; no analog needed — follow CONTEXT.md verbatim. |
| ADD NULLABLE → backfill → ALTER NOT NULL in a single migration file | Phase 6 Plan 02 added `therapeuticClass` as nullable PERMANENTLY (the column stays nullable because 43k NPL rows have no AI suggestion yet). No prior migration uses the full three-step nullable→backfill→NOT-NULL pattern. | Combine: (1) Phase 7 `0007` ALTER TABLE shape (line 32 of `0012`); (2) Phase 5 `0007` migration header-comment shape (lines 1–60 of `0007_audit_events`); (3) the locked CTE backfill from CONTEXT.md `<specifics>`. Concatenate all five steps in one `migration.sql`. |
| `packages/shared/src/utils/` directory | Does not exist in the codebase today (verified — `packages/shared/src/` contains only `constants/`, `contracts/`, `index.ts`). | First file in a new sibling directory under `packages/shared/src/`. Mirror the `constants/` directory's no-`index.ts` flat shape (each file self-contained, imported directly from `./utils/orderNumber.js`); update the main barrel (`packages/shared/src/index.ts`) with a new export block. |

---

## Metadata

**Analog search scope:**
- `apps/api/prisma/migrations/` (12 migrations enumerated; 0007 + 0012 read)
- `apps/api/prisma/schema.prisma` (full file read — 391 lines)
- `apps/api/src/services/` (`order.service.ts` full + `dashboard.service.ts` full)
- `apps/api/src/db/` (`auditAllowlist.ts` full)
- `apps/api/src/routes/orders/create.ts` (full)
- `apps/api/test/` (24 test files enumerated; `orders.deliver.integration.test.ts` lines 1–488, `orders.integration.test.ts` lines 1–100, `dashboard.orders.integration.test.ts` lines 1–80, `medications.therapeuticClass.integration.test.ts` lines 1–80 read)
- `packages/shared/src/` (full tree enumerated; `index.ts`, `constants/orderStatus.ts`, `constants/therapeuticClass.ts`, `contracts/order.ts`, `contracts/dashboard.ts` full reads)
- `apps/web/src/routes/bestallningar/` (18 files enumerated; `OrdersTable.tsx`, `DraftsTable.tsx`, `OrdersCardList.tsx`, `DraftsCardList.tsx`, `DraftCard.tsx`, `ComposeOrderPage.tsx`, `SubmitConfirmationBanner.tsx` full reads)
- `apps/web/src/routes/dashboard/` (3 files enumerated; `DashboardOrdersCard.tsx` full read)
- `apps/web/src/routes/bestallningar/__tests__/` (6 files enumerated; `SubmitConfirmationBanner.test.tsx` full, `ComposeOrderPage.test.tsx` head, `BestallningarPage.test.tsx` head)
- `apps/web/scripts/captureSc04Screenshots.ts` (full)

**Pattern extraction date:** 2026-05-25
