# Phase 3: Draft Orders — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 19 new + 5 modified
**Analogs found:** 22 / 24 (2 have no analog — long-press stepper, sticky compose footer)

This pattern map binds every file Phase 3 will create or modify to a concrete analog from the Phase 1 + 2 codebase, with verbatim excerpts the planner can paste into `<read_first>` blocks. Mirror the structure exactly; do not invent new conventions.

---

## File Classification

### Backend (`apps/api/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/schema.prisma` (extend) | Prisma model + enum | schema | self — existing `CareUnitMedication` + `MedicationSource` enum | exact |
| `apps/api/prisma/migrations/00040000000_order_flow_drafts/migration.sql` | Prisma migration | DDL | `apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql` | exact |
| `apps/api/prisma/seed.ts` (extend) | seed script | batch insert | self (existing seed adds 1 draft) | n/a — extension only |
| `apps/api/src/auth/permissions.ts` (extend) | RBAC map extension | config | self — existing `medication:*` entries | exact |
| `apps/api/src/services/order.service.ts` | Fastify service | CRUD + atomic UPDATE | `apps/api/src/services/medication.service.ts` | exact (role + careUnitId-first pattern); the `OrderLockedError` precondition has no analog (introduced here) |
| `apps/api/src/plugins/errorHandler.ts` (extend) | error class + envelope mapping | request-response | self — existing `NotFoundError` / `ConflictDuplicateMedicationError` | exact |
| `apps/api/src/routes/orders/index.ts` | Fastify route barrel | request-response | `apps/api/src/routes/medications/index.ts` | exact |
| `apps/api/src/routes/orders/create.ts` | Fastify POST route | request-response | `apps/api/src/routes/medications/create.ts` | exact |
| `apps/api/src/routes/orders/list.ts` | Fastify GET (paginated) route | request-response | `apps/api/src/routes/medications/list.ts` | exact |
| `apps/api/src/routes/orders/get.ts` | Fastify GET-by-id route | request-response | `apps/api/src/routes/medications/update.ts` (params + 404 pattern) | role-match |
| `apps/api/src/routes/orders/lines.ts` | Fastify POST/PATCH/DELETE bundle | request-response | `apps/api/src/routes/medications/{create,update,delete}.ts` (combined; same preHandlers) | role-match |
| `apps/api/src/routes/orders/submit.ts` | Fastify POST transition route | request-response (atomic UPDATE) | `apps/api/src/routes/medications/update.ts` (PATCH shape) | role-match — submit is a special-case transition with no existing analog |
| `apps/api/src/routes/orders/delete.ts` | Fastify DELETE route (soft) | request-response | `apps/api/src/routes/medications/delete.ts` | exact |
| `apps/api/src/routes/orders/pickerOptions.ts` | Fastify GET typeahead route | request-response | `apps/api/src/routes/medications/search.ts` | exact (different scope: CareUnitMedication × Medication instead of global Medication) |
| `apps/api/src/app.ts` (extend) | route registration | composition | self — existing `medicationRoutes` registration | exact |
| `apps/api/test/orders.integration.test.ts` | vitest BE integration | request-response | `apps/api/test/auth.flow.smoke.test.ts` (full pipeline harness) | role-match — no medication CRUD integration test exists, only the auth smoke harness |

### Shared (`packages/shared/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `packages/shared/src/contracts/order.ts` | Zod schemas + inferred types | contract | `packages/shared/src/contracts/medication.ts` | exact |
| `packages/shared/src/contracts/permissions.ts` (extend) | RBAC literal tuple | config | self | exact |
| `packages/shared/src/index.ts` (extend) | barrel re-export | n/a | self (existing medication block) | exact |

### Frontend (`apps/web/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/web/src/router.tsx` (extend) | React Router route map | n/a | self — existing `/lakemedel` route | exact |
| `apps/web/src/features/orders/useOrderQueries.ts` (new) | TanStack Query hook | request-response | `apps/web/src/features/medications/useMedicationsQuery.ts` | exact |
| `apps/web/src/features/orders/useOrderMutations.ts` (new) | TanStack Query mutation hooks | request-response (mixed optimistic + pessimistic) | `apps/web/src/features/medications/useMedicationMutations.ts` | exact |
| `apps/web/src/routes/bestallningar/BestallningarPage.tsx` (replace stub) | React page | data composition | `apps/web/src/routes/lakemedel/LakemedelPage.tsx` | exact |
| `apps/web/src/routes/bestallningar/DraftsTable.tsx` (new) | React table | render | `apps/web/src/routes/lakemedel/MedicationTable.tsx` | exact |
| `apps/web/src/routes/bestallningar/DraftsCardList.tsx` (new) | React card list | render | `apps/web/src/routes/lakemedel/MedicationCardList.tsx` | exact |
| `apps/web/src/routes/bestallningar/DraftCard.tsx` (new) | React card | render | `apps/web/src/routes/lakemedel/MedicationCard.tsx` | exact |
| `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` (new) | React page | data composition + mutations | `apps/web/src/routes/lakemedel/LakemedelPage.tsx` (skeleton + branches) | role-match — single-resource page rather than paginated list |
| `apps/web/src/routes/bestallningar/OrderLineTable.tsx` (new) | React table | render + mutation | `apps/web/src/routes/lakemedel/MedicationTable.tsx` | exact |
| `apps/web/src/routes/bestallningar/OrderLineCardList.tsx` (new) | React card list | render | `apps/web/src/routes/lakemedel/MedicationCardList.tsx` | exact |
| `apps/web/src/routes/bestallningar/OrderLineCard.tsx` (new) | React card | render + mutation | `apps/web/src/routes/lakemedel/MedicationCard.tsx` | role-match |
| `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx` (new) | React sticky bar | render + mutation trigger | (none — new pattern; closest geometric reference is `SheetFooter` `pb-[calc(...)]` in `MedicationSheet.tsx`) | no analog (geometry pattern only) |
| `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx` (new) | React Sheet | typeahead + mutation | `apps/web/src/routes/lakemedel/MedicationSheet.tsx` (typeahead + Sheet shell) | exact (strip create form) |
| `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx` (new) | React AlertDialog | mutation | `apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx` | exact |
| `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` (new) | React banner | render | `apps/web/src/components/LowStockBadge.tsx` (geometry only — informational accent variant) | role-match |
| `apps/web/src/components/OrderStatusPill.tsx` (new) | React badge primitive | render | `apps/web/src/components/RoleBadge.tsx` | exact |
| `apps/web/src/components/QuantityStepper.tsx` (new) | React input control | mutation (optimistic + debounce) | `apps/web/src/components/InlineEditThreshold.tsx` (optimistic mutation shape; debounce / long-press auto-repeat are new) | role-match |

---

## Pattern Assignments — Backend

### `apps/api/prisma/schema.prisma` (extend — add `OrderStatus` enum + `Order` + `OrderLine` models)

**Analog:** existing `MedicationSource` enum + `CareUnitMedication` model in the same file.

**Enum declaration pattern** (`schema.prisma:38-41`):

```prisma
/// Phase 2 D-27 — MedicationSource discriminates NPL-seeded rows from
/// user-created rows ('Skapa nytt läkemedel' fallback, D-31).
/// NPL-sourced rows have locked name/atcCode/form/strength (D-32).
enum MedicationSource {
  npl
  user
}
```

Phase 3 mirrors this — declare `enum OrderStatus { utkast skickad bekraftad levererad }` with a triple-slash doc comment referencing D-46. **All four values declared even though Phase 3 only uses two** (D-46).

**careUnit-scoped model with soft-delete pattern** (`schema.prisma:100-127`):

```prisma
/// Phase 2 D-28 — Per-vårdenhet join table. Carries currentStock,
/// lowStockThreshold, and a soft-delete flag (D-33: always soft-delete;
/// global Medication is never deleted). @@unique([careUnitId, medicationId])
/// is the database guard against duplicate active rows (T-02-06).
/// Phase 4 adds SELECT … FOR UPDATE on the stock-decrement path (STK-02).
model CareUnitMedication {
  id String @id @default(cuid())

  careUnitId String
  careUnit   CareUnit @relation(fields: [careUnitId], references: [id])

  medicationId String
  medication   Medication @relation(fields: [medicationId], references: [id])

  currentStock      Int
  lowStockThreshold Int

  /// CAT-07 / D-33 — soft-delete flag. SET deletedAt = now() on delete;
  /// never hard-delete. Read queries always filter deletedAt: null.
  deletedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([careUnitId, medicationId])
  @@index([careUnitId])
  @@index([deletedAt])
}
```

**Mirror for `Order`** (per D-62 columns):

- `id String @id @default(cuid())`
- `careUnitId String` + relation (no FK constraint to `careUnit` is shown for `User` in the existing schema's `User` model — match that style: keep the back-relation on `CareUnit`)
- `createdByUserId` + relation to `User` with `onDelete: Restrict` (D-62)
- `status OrderStatus @default(utkast)`
- `submittedAt DateTime?` + `submittedByUserId String?` with relation `onDelete: Restrict` (D-49) — use a `name:` argument on `@relation` to disambiguate the two FK-to-User relations (`createdBy` vs `submittedBy`); Prisma will fail to compile otherwise
- `deletedAt DateTime?` (D-62 / D-33 carry-over)
- `createdAt` / `updatedAt` standard pair (verbatim from `CareUnitMedication`)
- Indexes: `@@index([careUnitId, status])`, `@@index([careUnitId, createdAt])`, `@@index([createdByUserId])` (D-62)
- `lines OrderLine[]` back-relation
- Triple-slash doc comment referencing D-46 / D-48 / D-62 + the Phase 4 hook (`/// Phase 4 adds confirm/deliver transitions (ORD-04, ORD-05).`)

**Mirror for `OrderLine`** (per D-63 columns):

- `id String @id @default(cuid())`
- `orderId` + relation to `Order` with `onDelete: Cascade` (D-63: lines die with their order)
- `careUnitMedicationId` + relation to `CareUnitMedication` with `onDelete: Restrict` (D-63: preserve history if a med is removed)
- `quantity Int` (the positive constraint lives at the Zod boundary per D-63, not at the DB level)
- `createdAt` / `updatedAt`
- Indexes: `@@index([orderId])`, `@@index([careUnitMedicationId])` (D-63)
- Add back-relations on `Order` (`lines OrderLine[]`) and `CareUnitMedication` (`orderLines OrderLine[]`)
- Add back-relations on `User` for `createdOrders Order[] @relation("OrderCreatedBy")` + `submittedOrders Order[] @relation("OrderSubmittedBy")`
- **No `@@unique` on `OrderLine`** per D-63 — same med can appear on two lines.

---

### `apps/api/prisma/migrations/.../migration.sql`

**Analog:** `apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql` (full content read above).

The migration is generated by `prisma migrate dev --name order_flow_drafts`; the analog shows the expected output shape — `CREATE TYPE … AS ENUM`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`. No raw SQL hand-edits needed (Phase 2 added `CREATE EXTENSION pg_trgm` + GIN index manually after Prisma's output; **Phase 3 does NOT add any raw SQL** — the trgm index Phase 2 created is reused by the picker, D-59).

---

### `apps/api/src/auth/permissions.ts` (extend — add five `order:*` entries)

**Analog:** self — the existing `medication:*` block.

**Extension pattern** (`permissions.ts:21-29`):

```typescript
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
  // Phase 2 D-43 — medication permission matrix.
  // All three roles can read (view catalog); only apotekare+admin can mutate.
  'medication:read':   ['apotekare', 'sjukskoterska', 'admin'],
  'medication:create': ['apotekare', 'admin'],
  'medication:update': ['apotekare', 'admin'],
  'medication:delete': ['apotekare', 'admin'],
};
```

Append after the medication block (D-64): all three roles on all five `order:*` keys per REQUIREMENTS.md ORD-01..03 having no role restriction. Add a comment referencing D-64 + a Phase 4 note that `order:confirm` / `order:deliver` will be apotekare+admin-only.

---

### `apps/api/src/plugins/errorHandler.ts` (extend — add `OrderLockedError` class + envelope mapping)

**Analog:** existing `NotFoundError` + `ConflictDuplicateMedicationError` classes (lines 45-67).

**Error class pattern** (`errorHandler.ts:45-67`):

```typescript
export class NotFoundError extends Error {
  readonly code = 'not_found' as const;
  constructor(message = 'Resursen hittades inte.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictDuplicateMedicationError extends Error {
  readonly code = 'conflict_duplicate_medication' as const;
  constructor() {
    super('Läkemedlet finns redan i registret för din vårdenhet.');
    this.name = 'ConflictDuplicateMedicationError';
  }
}
```

**Envelope mapping in `setErrorHandler`** (`errorHandler.ts:134-145`):

```typescript
if (err instanceof NotFoundError) {
  return send(reply, 404, envelope('not_found', err.message));
}

if (err instanceof ConflictDuplicateMedicationError) {
  return send(reply, 409, envelope('conflict_duplicate_medication', err.message));
}

if (err instanceof ForbiddenScopeError) {
  return send(reply, 403, envelope('forbidden', err.message));
}
```

**Phase 3 additions** (D-55):

1. `OrderLockedError extends Error` with `readonly code = 'order_locked' as const`, default message `'Beställningen kan inte ändras efter att den skickats.'`. Accept an optional `details?: { status?: OrderStatus }` constructor arg and stash it on the instance.
2. `OrderEmptyError` and `OrderInvalidQuantityError` are NOT new classes — D-56 surfaces these as `code: 'validation_failed'` with `details: { reason: 'empty_order' | 'invalid_quantity', lineId?: string }`. The service throws a generic `ValidationFailedError` (new) with explicit `details`, and the envelope mapping path becomes a 422 with `details` populated. Confirm by re-reading the envelope shape — `errorEnvelope.error.details` is `z.unknown().optional()` so the details payload is free-form.
3. Add the 409 + 422 mappings to `setErrorHandler` in the order they appear above. **422, not 400, for `validation_failed` from the submit path** (D-56) — overrides the existing Zod `validation_failed → 400` by using the `OrderLockedError` / `ValidationFailedError` class branch first.

---

### `apps/api/src/services/order.service.ts` (NEW — primary BE business logic)

**Analog:** `apps/api/src/services/medication.service.ts` (read in full above).

**Imports + careUnitId-first contract** (`medication.service.ts:1-40`):

```typescript
import type { Medication, CareUnitMedication } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  ConflictDuplicateMedicationError,
  NotFoundError,
  ForbiddenScopeError,
} from '../plugins/errorHandler.js';
import type {
  MedicationListResponse,
  MedicationListQuery,
  MedicationListItem,
  MedicationSearchResult,
  MedicationCreateRequest,
  MedicationUpdateRequest,
} from '@meditrack/shared';
import { OVRIGA_FILTER_VALUE, TOP_MEDICATION_FORMS } from '@meditrack/shared';

/**
 * Pattern D / D-16 — careUnitId-first service layer for medication CRUD.
 * …
 * Security: every function asserts that returned/modified rows belong to
 *   the provided careUnitId (last line of defense per D-16).
 */
```

Mirror exactly for `order.service.ts` — Prisma client from `../db/client.js`, error classes from `../plugins/errorHandler.js`, types from `@meditrack/shared`, and a top-of-file block comment locking the careUnitId-first contract + the `assertOrderEditable` helper preamble (D-66).

**careUnitId-first read function** (`medication.service.ts:79-101`):

```typescript
export async function listMedicationsForUnit(
  careUnitId: string,
  filters: MedicationListQuery,
): Promise<MedicationListResponse> {
  const { q, atc, form, belowThreshold, page, pageSize } = filters;
  const skip = (page - 1) * pageSize;

  // We always scope to the caller's vårdenhet and exclude soft-deleted rows.
  const baseWhere = {
    careUnitId,
    deletedAt: null,
    ...(Object.keys(medicationWhereConditions).length > 0
      ? { medication: medicationWhereConditions }
      : {}),
  } as any;
```

Mirror for `listOrdersForUnit(careUnitId, filters: { status?: OrderStatus })` and `getOrderForUnit(careUnitId, orderId)`. **Every where-clause must include `careUnitId` + `deletedAt: null`.**

**Cross-tenant 404 (existence-probing protection)** (`medication.service.ts:412-421`):

```typescript
// Step 1 — Scoped reload with medication joined (source field required for step 3).
const row = await prisma.careUnitMedication.findUnique({
  where: { id: careUnitMedicationId },
  include: { medication: true },
});

// Step 2 — Existence + scope check (D-19: 404 on cross-tenant, never 403).
if (!row || row.deletedAt !== null || row.careUnitId !== careUnitId) {
  throw new NotFoundError('Läkemedlet hittades inte.');
}
```

Mirror in `getOrderForUnit` + every line/submit/delete service function. Message: `'Beställningen hittades inte.'`. D-73 explicitly requires this 404 (not 403) for cross-careUnit access.

**Soft-delete pattern** (`medication.service.ts:493-513`):

```typescript
export async function softDeleteCareUnitMedication(
  careUnitId: string,
  careUnitMedicationId: string,
): Promise<void> {
  const existing = await prisma.careUnitMedication.findUnique({
    where: { id: careUnitMedicationId },
  });

  if (!existing || existing.deletedAt !== null) {
    throw new NotFoundError('Läkemedlet finns inte i din vårdenhet.');
  }

  if (existing.careUnitId !== careUnitId) {
    throw new NotFoundError('Läkemedlet finns inte i din vårdenhet.');
  }

  await prisma.careUnitMedication.update({
    where: { id: careUnitMedicationId },
    data: { deletedAt: new Date() },
  });
}
```

Mirror for `softDeleteOrder(careUnitId, orderId)`. **Additional precondition for Phase 3** (D-54): also reject if `status !== 'utkast'` — throw `OrderLockedError`. The existence check goes first (404 wins over 409), then the status precondition.

**Atomic-UPDATE-with-precondition pattern** — NO existing analog. Phase 3 introduces this. Per D-54, every mutating service function (`addLineToOrder`, `updateOrderLine`, `removeOrderLine`, `submitOrder`, `softDeleteOrder`) uses `prisma.order.updateMany({ where: { id, careUnitId, status: 'utkast', deletedAt: null }, data: {...} })` and inspects `count`. If `count === 0`, distinguish: did the row exist at all? Reload once. If still no row → `NotFoundError`. If row exists but `status !== 'utkast'` → `OrderLockedError({ details: { status: row.status } })`. The flow is **reload first to disambiguate**, **then run the atomic UPDATE for line / submit operations** — TOCTOU window is zero because the UPDATE is itself the precondition check.

For `submitOrder`, the entire transition runs inside `prisma.$transaction(async (tx) => {...})` (mirror `createCareUnitMedication`'s `$transaction` pattern — `medication.service.ts:312-377`):

```typescript
const result = await prisma.$transaction(async (tx) => {
  // ... reads, asserts, writes ...
});
```

Inside the tx, perform: (1) `tx.order.findUnique({ where: { id }, include: { lines: true } })` and assert non-empty + all `quantity > 0` (else throw `ValidationFailedError({ details: { reason: 'empty_order' | 'invalid_quantity', lineId } })`); (2) `tx.order.updateMany({ where: { id, careUnitId, status: 'utkast', deletedAt: null }, data: { status: 'skickad', submittedAt: new Date(), submittedByUserId: actorUserId } })` and assert `count === 1` (else `OrderLockedError`); (3) `tx.order.findUnique({ where: { id }, include: { lines: { include: { careUnitMedication: { include: { medication: true } } } } } })` to return the full updated order. The validation pre-check inside the same TX guarantees we don't burn the TX writing on a doomed submit (D-56).

**Picker query — pg_trgm reuse** — analog `searchGlobalMedications` (`medication.service.ts:252-289`):

```typescript
export async function searchGlobalMedications(
  careUnitId: string,
  filters: { q: string; limit: number },
): Promise<MedicationSearchResult[]> {
  const { q, limit } = filters;

  const results = await prisma.medication.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { atcCode: { startsWith: q, mode: 'insensitive' } },
      ],
      // Exclude medications already actively stocked at this vårdenhet (D-45).
      careUnitMedications: {
        none: { careUnitId, deletedAt: null },
      },
    },
    take: limit,
    orderBy: [{ name: 'asc' }],
    select: { id: true, name: true, atcCode: true, form: true, strength: true, source: true },
  });
  // ...
}
```

**Mirror for `searchPickerOptions(careUnitId, { q, limit })`** but **invert the scope** (D-59): query `prisma.careUnitMedication.findMany({ where: { careUnitId, deletedAt: null, medication: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { atcCode: { startsWith: q, mode: 'insensitive' } }] } }, include: { medication: true }, take: limit, orderBy: [{ medication: { name: 'asc' } }] })`. The trgm index Phase 2 added on `lower(Medication.name)` is automatically used by Postgres because the `ILIKE` predicate hits the same column. Return shape: `{ careUnitMedicationId, name, atcCode, form, strength, currentStock, lowStockThreshold }` (D-59 + D-61 picker row needs).

**Mapper helper** — analog `toListItem` (`medication.service.ts:46-64`):

```typescript
type MedicationWithJoin = CareUnitMedication & { medication: Medication };

export function toListItem(row: MedicationWithJoin): MedicationListItem {
  return {
    careUnitMedicationId: row.id,
    medicationId: row.medicationId,
    name: row.medication.name,
    // ...
    source: row.medication.source as 'npl' | 'user',
  };
}
```

Mirror with `toOrderResponse`, `toOrderListItem`, `toOrderLineResponse` mappers in `order.service.ts`. Each takes a Prisma row with the right `include` shape and returns the matching shared-contract type. **Exported** so route files can map without re-importing Prisma.

---

### `apps/api/src/routes/orders/index.ts`

**Analog:** `apps/api/src/routes/medications/index.ts` (read above):

```typescript
import type { FastifyInstance } from 'fastify';
import { listMedicationsRoute } from './list.js';
import { searchMedicationsRoute } from './search.js';
import { createMedicationRoute } from './create.js';
import { updateMedicationRoute } from './update.js';
import { deleteMedicationRoute } from './delete.js';

/**
 * Medication routes barrel — registers all Phase 2 medication sub-routes.
 *
 * Registration order: list → search → create → update → delete.
 *
 * Pattern: mirrors apps/api/src/app.ts route registration block.
 */
export async function medicationRoutes(app: FastifyInstance) {
  await app.register(listMedicationsRoute);
  await app.register(searchMedicationsRoute);
  await app.register(createMedicationRoute);
  await app.register(updateMedicationRoute);
  await app.register(deleteMedicationRoute);
}
```

Mirror with `orderRoutes` — registration order per D-65: `createOrderRoute → listOrdersRoute → getOrderRoute → linesRoute → submitOrderRoute → deleteOrderRoute → pickerOptionsRoute`. (Order is documentation only; Fastify route matching is path-based, not registration-order-based.)

---

### `apps/api/src/routes/orders/list.ts`

**Analog:** `apps/api/src/routes/medications/list.ts` (full content above).

```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { medicationListQuery, medicationListResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listMedicationsForUnit } from '../../services/medication.service.js';

/**
 * GET /api/medications — paginated medication list for the caller's vårdenhet.
 *
 * D-15 preHandler ordering: requireSession first (decorates req.user),
 * requirePermission second (reads req.user.role). NEVER reorder.
 *
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 *
 * D-44: supports q, atc, form, belowThreshold, page, pageSize query params.
 * Returns { rows, total, belowThresholdTotal, page, pageSize }.
 */
export async function listMedicationsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/medications',
    {
      preHandler: [requireSession, requirePermission('medication:read')],
      schema: {
        querystring: medicationListQuery,
        response: { 200: medicationListResponse },
      },
    },
    async (req) => {
      return listMedicationsForUnit(req.user!.careUnitId, req.query);
    },
  );
}
```

Mirror exactly for `GET /api/orders`: preHandler `[requireSession, requirePermission('order:read')]`, querystring `orderListQuery` (defaults `status: 'utkast'`), response `200: orderListResponse`. Hand-off: `listOrdersForUnit(req.user!.careUnitId, req.query)`.

---

### `apps/api/src/routes/orders/create.ts`

**Analog:** `apps/api/src/routes/medications/create.ts` (full content above):

```typescript
export async function createMedicationRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/medications',
    {
      preHandler: [requireSession, requirePermission('medication:create')],
      schema: {
        body: medicationCreateRequest,
        response: { 201: medicationListItem },
      },
    },
    async (req, reply) => {
      const row = await createCareUnitMedication(req.user!.careUnitId, req.body);
      reply.status(201);
      return row;
    },
  );
}
```

Mirror for `POST /api/orders` — body is an empty object schema (`z.object({}).strict()` per D-50 / D-65), response is `201: orderResponse` with `{ id, status: 'utkast', lines: [], …}`. Service call: `createDraftOrder(req.user!.careUnitId, req.user!.id)` — pass the actor's user id second so it lands on `Order.createdByUserId`.

---

### `apps/api/src/routes/orders/get.ts`

**Analog:** `apps/api/src/routes/medications/update.ts` (params + scoping pattern):

```typescript
r.patch(
  '/api/medications/:careUnitMedicationId',
  {
    preHandler: [requireSession, requirePermission('medication:update')],
    schema: {
      params: z.object({ careUnitMedicationId: z.string().min(1) }),
      body: medicationUpdateRequest,
      response: { 200: medicationListItem },
    },
  },
  async (req) =>
    updateCareUnitMedication(
      req.user!.careUnitId,
      req.params.careUnitMedicationId,
      req.body,
    ),
);
```

Mirror as `r.get('/api/orders/:id', { preHandler, schema: { params: z.object({ id: z.string().min(1) }), response: { 200: orderResponse } } }, async (req) => getOrderForUnit(req.user!.careUnitId, req.params.id))`. preHandler: `[requireSession, requirePermission('order:read')]`. The service returns the order with embedded lines + per-line denormalized `{ name, atcCode, form, strength, currentStock, lowStockThreshold }` joined at read time (D-47).

---

### `apps/api/src/routes/orders/lines.ts` (combined POST/PATCH/DELETE for line operations)

**Analog:** `apps/api/src/routes/medications/{create,update,delete}.ts` combined (`requirePermission` chain + `z.object({ id })` params shape on update + 204 reply on delete pattern).

Three handlers, all gated by `requirePermission('order:update')`:

1. `r.post('/api/orders/:id/lines', …)` — body `addOrderLineRequest` (`{ careUnitMedicationId, quantity }`), response `200: orderResponse` (return the full updated order so the FE cache hydrates atomically per D-57 precedent).
2. `r.patch('/api/orders/:id/lines/:lineId', …)` — body `updateOrderLineRequest` (`{ quantity }`), response `200: orderResponse`. Params: `z.object({ id: z.string().min(1), lineId: z.string().min(1) })`.
3. `r.delete('/api/orders/:id/lines/:lineId', …)` — no body, response `200: orderResponse`. Returning the full Order on every line op (vs `204 No Content` for medication delete) is **intentional**: it lets `useOrderMutations.ts` cache-hydrate via `queryClient.setQueryData(['order', id], response)` in one round-trip without a follow-up GET, mirroring D-57's submit-response pattern.

All three service calls take `(careUnitId, orderId, … , actorUserId?)` — the service runs the atomic UPDATE with the `status: 'utkast'` precondition (D-54) and throws `OrderLockedError` on count===0 mismatch.

**Reference for the `DELETE` ergonomics in the medication module (although we return 200 here, not 204)** (`medications/delete.ts:31-52`):

```typescript
export async function deleteMedicationRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.delete(
    '/api/medications/:careUnitMedicationId',
    {
      preHandler: [requireSession, requirePermission('medication:delete')],
      schema: {
        params: z.object({ careUnitMedicationId: z.string().min(1) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await softDeleteCareUnitMedication(
        req.user!.careUnitId,
        req.params.careUnitMedicationId,
      );
      reply.status(204);
      return null;
    },
  );
}
```

---

### `apps/api/src/routes/orders/submit.ts`

**Analog:** `apps/api/src/routes/medications/update.ts` (PATCH-with-params shape; the actual atomic-UPDATE behavior is in the service per D-54). Excerpt above.

Mirror as `r.post('/api/orders/:id/submit', { preHandler: [requireSession, requirePermission('order:submit')], schema: { params: z.object({ id: z.string().min(1) }), response: { 200: orderResponse } } }, async (req) => submitOrder(req.user!.careUnitId, req.params.id, req.user!.id))`. The third arg `req.user!.id` lands on `Order.submittedByUserId` (D-49). Service is responsible for validation (422 with details), atomic UPDATE (409 on race), and returning the full updated Order (D-57).

---

### `apps/api/src/routes/orders/delete.ts`

**Analog:** `apps/api/src/routes/medications/delete.ts` (verbatim above).

Mirror exactly — `r.delete('/api/orders/:id', { preHandler: [requireSession, requirePermission('order:delete')], schema: { params: z.object({ id: z.string().min(1) }), response: { 204: z.null() } } }, async (req, reply) => { await softDeleteOrder(req.user!.careUnitId, req.params.id); reply.status(204); return null; })`. The service throws `OrderLockedError` if status !== 'utkast' (D-54 / D-67).

---

### `apps/api/src/routes/orders/pickerOptions.ts`

**Analog:** `apps/api/src/routes/medications/search.ts` (full content above):

```typescript
export async function searchMedicationsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/medications/search',
    {
      preHandler: [requireSession, requirePermission('medication:read')],
      schema: {
        querystring: medicationSearchQuery,
        response: {
          200: z.object({ results: z.array(medicationSearchResult) }),
        },
      },
    },
    async (req) => {
      const rows = await searchGlobalMedications(req.user!.careUnitId, {
        q: req.query.q,
        limit: req.query.limit,
      });
      return { results: rows };
    },
  );
}
```

Mirror exactly for `GET /api/orders/picker-options`. preHandler: `[requireSession, requirePermission('order:create')]` (only users who can create orders can search the picker — D-64). Querystring: `pickerOptionsQuery` (mirror `medicationSearchQuery`: `{ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(20).default(20) }`). Response: `200: z.object({ results: z.array(pickerOption) })`. Service: `searchPickerOptions(req.user!.careUnitId, { q: req.query.q, limit: req.query.limit })`.

---

### `apps/api/src/app.ts` (extend — register `orderRoutes`)

**Analog:** existing `medicationRoutes` registration (`app.ts:13` + `app.ts:56`):

```typescript
import { medicationRoutes } from './routes/medications/index.js';
// ...
// Phase 2: medication catalog routes (list, search, create; update/delete in Plans 03/04).
await app.register(medicationRoutes);
```

Append `import { orderRoutes } from './routes/orders/index.js';` at the top and `await app.register(orderRoutes);` after `medicationRoutes` registration in `buildApp`.

---

### `apps/api/test/orders.integration.test.ts`

**Analog:** `apps/api/test/auth.flow.smoke.test.ts` (full pipeline harness, read above).

**Harness setup pattern** (`auth.flow.smoke.test.ts:1-78`):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_ADMIN,
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

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

function captureSessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
  const match = header.match(/(meditrack\.sid=[^;]+)/);
  expect(match).not.toBeNull();
  return match![1]!;
}
```

**Login + inject pattern** (`auth.flow.smoke.test.ts:89-106`):

```typescript
const loginRes = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { email: row.user.email, password: row.user.password },
});
expect(loginRes.statusCode).toBe(200);
const cookie = captureSessionCookie(loginRes.headers['set-cookie']);

const meRes = await app.inject({
  method: 'GET',
  url: '/api/me',
  headers: { cookie },
});
```

**Mirror for Phase 3** (D-73): one `describe('Draft orders integration')` block with five `it` blocks:

1. `'happy path: create → add-line → patch-quantity → submit'` — login as `sjukskoterska`; `POST /api/orders` → expect 201 + `{ status: 'utkast', lines: [] }`; `POST /api/orders/:id/lines` → expect 200 + 1 line; `PATCH /api/orders/:id/lines/:lineId` → expect 200 with updated quantity; `POST /api/orders/:id/submit` → expect 200 + `{ status: 'skickad', submittedAt: <ISO>, submittedByUserId: <user.id> }`.
2. `'returns 409 order_locked on edit-after-submit'` — repeat happy path through submit, then `PATCH … /lines/...` → expect 409 + `{ error: { code: 'order_locked', message: 'Beställningen kan inte ändras efter att den skickats.', details: { status: 'skickad' } } }`. Repeat for all line endpoints + submit-again + delete.
3. `'returns 422 validation_failed on submit with empty lines or quantity <= 0'` — create order, then `POST /api/orders/:id/submit` → expect 422 + `{ error: { code: 'validation_failed', details: { reason: 'empty_order' } } }`. Second sub-case: add a line then PATCH to `quantity = 0` (this should be blocked by Zod at the boundary at 400), confirm BE rejection. Third sub-case: poison the DB directly via prisma to set quantity = 0, then submit → expect 422 with `{ reason: 'invalid_quantity', lineId }`.
4. `'cross-careUnit access returns 404, not 403'` (D-73) — needs a second CareUnit + a second user. Extend `ensureAllRolesSeeded` or use prisma directly inside the test to set up. Login as user from CareUnit A, hit `GET/PATCH/DELETE /api/orders/:idFromB` → expect 404 `not_found`. **Never 403.**
5. `'drafts list returns only status=utkast, scoped to careUnit'` — seed multiple orders across two CareUnits in mixed statuses, login as user from CareUnit A, `GET /api/orders?status=utkast` → expect only A's utkast orders.

Use `vi.mocked`-free integration style (real DB, real prisma) per the analog's posture.

---

## Pattern Assignments — Shared

### `packages/shared/src/contracts/order.ts` (NEW)

**Analog:** `packages/shared/src/contracts/medication.ts` (read in full above).

**File preamble + section dividers pattern** (`medication.ts:1-21`):

```typescript
import { z } from 'zod';

/**
 * Phase 2 D-08 / D-44 / D-45 / D-31 — Medication contracts.
 *
 * D-44: `GET /api/medications` response shape with `belowThresholdTotal` …
 *
 * Pattern: mirrors packages/shared/src/contracts/me.ts + login.ts.
 * All schemas are followed by `export type X = z.infer<typeof x>`.
 * Do NOT split by HTTP verb — all shapes in this one file (Shared anti-pattern).
 */

// ---------------------------------------------------------------------------
// List — paginated CareUnitMedication × Medication join rows (D-44)
// ---------------------------------------------------------------------------
```

Mirror exactly — top-of-file block comment referencing D-08 / D-46..D-49 / D-55 / D-65, then `// ---` section dividers for List / Single / Lines / Submit / Picker.

**Schema-then-type pattern** (`medication.ts:34-45`):

```typescript
export const medicationListItem = z.object({
  careUnitMedicationId: z.string(),
  medicationId: z.string(),
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
  source: z.enum(['npl', 'user']),
});
export type MedicationListItem = z.infer<typeof medicationListItem>;
```

Mirror for **every** Phase 3 schema:

- `orderStatus` — re-use `orderStatusEnum` from `@meditrack/shared` (already exists, D-46). Do NOT re-declare.
- `orderLineResponse` — `{ id, careUnitMedicationId, quantity, name, atcCode, form, strength, currentStock, lowStockThreshold }`. The denormalized fields (everything from `name` onward) are **read-time joined**, not snapshotted (D-47).
- `orderResponse` — `{ id, careUnitId, createdByUserId, status: orderStatusEnum, submittedAt: z.string().datetime().nullable(), submittedByUserId: z.string().nullable(), createdAt, updatedAt, lines: z.array(orderLineResponse), createdBy: z.object({ id, name }), submittedBy: z.object({ id, name }).nullable() }`.
- `orderListItem` — lean row shape for the drafts table (D-72 columns): `{ id, status, createdAt, lineCount, totalQuantity, createdBy: { id, name } }`.
- `orderListQuery` — `{ status: orderStatusEnum.default('utkast'), page?: …, pageSize?: … }`. Mirror the `medicationListQuery`'s `z.coerce.number().int()` pattern for paging (medication.ts:59-69) — for Phase 3 pagination is "deferred to Phase 7" per UI-SPEC, so include sensible defaults but no pageSize cap discipline beyond `min(1).max(100).default(50)`.
- `orderListResponse` — `{ rows: z.array(orderListItem), total: z.number().int().nonnegative() }`.
- `addOrderLineRequest` — `{ careUnitMedicationId: z.string().min(1), quantity: z.number().int().positive() }`.
- `updateOrderLineRequest` — `z.object({ quantity: z.number().int().positive() }).strict()`. The `.strict()` modifier matches the medication update precedent (`medication.ts:191-206`).
- `pickerOptionsQuery` — `{ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(20).default(20) }`. Verbatim mirror of `medicationSearchQuery` (`medication.ts:105-109`).
- `pickerOption` — `{ careUnitMedicationId, name, atcCode, form, strength: z.string().nullable(), currentStock, lowStockThreshold }`. D-59 + D-61 picker row needs.
- `pickerOptionsResponse` — `{ results: z.array(pickerOption) }`.

Every schema followed by `export type X = z.infer<typeof x>`. No verb-split files (medication.ts line 19 explicit anti-pattern).

**Strict + refine pattern for the empty `POST /api/orders` body** (`medication.ts:191-206`):

```typescript
export const medicationUpdateRequest = z
  .object({…})
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Minst ett fält måste anges.',
  });
```

For Phase 3's empty-body `POST /api/orders`, use `export const createOrderRequest = z.object({}).strict();` — `.strict()` rejects stray fields with 400 `validation_failed` (D-50 says POST with empty body is the contract; future flexibility would be additive).

---

### `packages/shared/src/contracts/permissions.ts` (extend)

**Analog:** self (read above). Append five literals to `ACTION_KEYS`:

```typescript
export const ACTION_KEYS = [
  'admin:ping',
  'medication:read',
  'medication:create',
  'medication:update',
  'medication:delete',
  // Phase 3 D-64 — order permissions; all 3 roles per REQUIREMENTS.md ORD-01..03.
  'order:read',
  'order:create',
  'order:update',
  'order:submit',
  'order:delete',
] as const;
```

The `actionKey = z.enum(ACTION_KEYS)` and `type ActionKey = (typeof ACTION_KEYS)[number]` lines update automatically. The BE `PERMISSIONS: Record<ActionKey, Role[]>` map will then fail to compile until five entries are added — the canonical drift-prevention contract (file header comment).

---

### `packages/shared/src/index.ts` (extend)

**Analog:** existing medication block (`index.ts:15-36` read above):

```typescript
export {
  medicationListItem,
  type MedicationListItem,
  // ...
  medicationUpdateRequest,
  type MedicationUpdateRequest,
} from './contracts/medication.js';
```

Append an `order.js` block immediately after, re-exporting every schema + inferred type from `contracts/order.ts`. Keep the schema-and-type pairing on adjacent lines per the existing precedent.

---

## Pattern Assignments — Frontend

### `apps/web/src/router.tsx` (extend — add `/bestallningar/:id`)

**Analog:** self — existing flat route map (file read above).

**Current route block** (`router.tsx:39-45`):

```typescript
children: [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/lakemedel', element: <LakemedelPage /> },
  { path: '/bestallningar', element: <BestallningarPage /> },
  { path: '/konto', element: <KontoPage /> },
```

Add a sibling `'/bestallningar/:id'` entry pointing to the new `<ComposeOrderPage />`. Per UI-SPEC §IA (lines 174-177), the design contract is "two flat sibling routes under the existing AuthGate+AppShell wrapper" — NOT a nested layout with shared chrome. Match `lakemedel` (sibling, not nested) for style consistency:

```typescript
{ path: '/bestallningar', element: <BestallningarPage /> },
{ path: '/bestallningar/:id', element: <ComposeOrderPage /> },
```

Add the import next to `BestallningarPage`. No new top-level nav items (the tab bar already points at `/bestallningar`).

---

### `apps/web/src/features/orders/useOrderQueries.ts` (NEW)

**Analog:** `apps/web/src/features/medications/useMedicationsQuery.ts` (full content above).

**Query hook pattern** (`useMedicationsQuery.ts:23-37`):

```typescript
export function useMedicationsQuery(filters: MedicationListQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') {
      params.set(k, String(v));
    }
  }

  return useQuery<MedicationListResponse, ApiError>({
    queryKey: ['medications', filters],
    queryFn: () =>
      fetchJson<MedicationListResponse>(`/api/medications?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}
```

**Mirror for Phase 3** — three exports:

1. `useDraftsQuery()` — `queryKey: ['orders', { status: 'utkast' }]` (D-69), `queryFn` hits `GET /api/orders?status=utkast`, `placeholderData: keepPreviousData`.
2. `useOrderQuery(id: string)` — `queryKey: ['order', id]` (D-69), `queryFn` hits `GET /api/orders/${id}`. `enabled: !!id`. `retry: false` to surface 404s quickly (same posture as `useMedicationSearchQuery`).
3. `usePickerOptionsQuery(q: string, enabled: boolean)` — `queryKey: ['order-picker', q]` (D-69), `queryFn` hits `GET /api/orders/picker-options?q=…&limit=20`. **Verbatim mirror** of `useMedicationSearchQuery` (`useMedicationsQuery.ts:51-61`):

```typescript
export function useMedicationSearchQuery(q: string, enabled: boolean) {
  return useQuery<MedicationSearchResponse, ApiError>({
    queryKey: ['medication-search', q],
    queryFn: () =>
      fetchJson<MedicationSearchResponse>(
        `/api/medications/search?q=${encodeURIComponent(q)}&limit=20`,
      ),
    enabled,
    retry: false,
  });
}
```

---

### `apps/web/src/features/orders/useOrderMutations.ts` (NEW)

**Analog:** `apps/web/src/features/medications/useMedicationMutations.ts` (full content above).

**Pessimistic mutation pattern (line add / remove / submit / discard / create-empty)** (`useMedicationMutations.ts:64-86`):

```typescript
export function useUpdateMedication() {
  const queryClient = useQueryClient();

  return useMutation<
    MedicationListItem,
    ApiError,
    { careUnitMedicationId: string; payload: MedicationUpdateRequest }
  >({
    mutationFn: ({ careUnitMedicationId, payload }) =>
      fetchJson<MedicationListItem>(`/api/medications/${careUnitMedicationId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
      toast.success('Sparat');
    },
    onError: () => {
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}
```

Mirror with: `useCreateDraftOrder`, `useAddOrderLine`, `useRemoveOrderLine`, `useDiscardOrder`, `useSubmitOrder`. Each:

- `mutationFn` hits the appropriate endpoint.
- `onSuccess`: per D-57 / D-69, the line-op endpoints return the **full updated Order**, so use `queryClient.setQueryData(['order', id], response)` directly **instead of** invalidating, except `useSubmitOrder` and `useDiscardOrder` also invalidate `['orders', { status: 'utkast' }]` (D-57). Toast policy per UI-SPEC §Toast Feedback table:
  - `useAddOrderLine` success: silent (line appearing is the feedback).
  - `useRemoveOrderLine` success: `toast.success('Sparat')`.
  - `useSubmitOrder` success: silent (banner + status flip is the feedback).
  - `useDiscardOrder` success: silent (navigation is the feedback).
- `onError`: per UI-SPEC §Toast Feedback — `'Kunde inte spara — försök igen.'` for general errors, **except** when `err.envelope.error.code === 'order_locked'` → `'Beställningen kan inte ändras efter att den skickats.'` + `queryClient.invalidateQueries({ queryKey: ['order', id] })` so the page re-renders into Mode B.

**Code pattern for the 409 special-case** (mirror the `conflict_duplicate_medication` carve-out at `useMedicationMutations.ts:49-53`):

```typescript
onError: (err) => {
  // 409 conflict_duplicate_medication — Sheet handles inline; no toast.
  if (err.envelope.error.code === 'conflict_duplicate_medication') return;
  toast.error('Kunde inte spara — försök igen.');
},
```

For Phase 3:

```typescript
onError: (err, vars) => {
  if (err.envelope.error.code === 'order_locked') {
    toast.error('Beställningen kan inte ändras efter att den skickats.');
    void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
    return;
  }
  toast.error('Kunde inte spara — försök igen.');
},
```

**Optimistic mutation pattern (quantity edit only — `useUpdateOrderLineQuantity`)** — analog `useUpdateThresholdOptimistic` (`useMedicationMutations.ts:106-167`):

```typescript
export function useUpdateThresholdOptimistic() {
  const queryClient = useQueryClient();

  return useMutation<
    MedicationListItem,
    ApiError,
    { careUnitMedicationId: string; lowStockThreshold: number },
    { snapshot: [readonly unknown[], unknown][] }
  >({
    mutationFn: ({ careUnitMedicationId, lowStockThreshold }) =>
      fetchJson<MedicationListItem>(`/api/medications/${careUnitMedicationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lowStockThreshold }),
      }),

    onMutate: async ({ careUnitMedicationId, lowStockThreshold }) => {
      // Cancel any in-flight refetches so they don't clobber our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['medications'] });

      // Snapshot all matching cache entries for rollback on error.
      const snapshot = queryClient.getQueriesData<MedicationListResponse>({
        queryKey: ['medications'],
      });

      // Apply optimistic update to all cached pages.
      queryClient.setQueriesData<MedicationListResponse>(
        { queryKey: ['medications'] },
        (old) => {
          if (!old) return old;
          const newRows = old.rows.map((row) =>
            row.careUnitMedicationId === careUnitMedicationId
              ? { ...row, lowStockThreshold }
              : row,
          );
          // …
          return { ...old, rows: newRows, belowThresholdTotal };
        },
      );

      return { snapshot: snapshot as [readonly unknown[], unknown][] };
    },

    onError: (_err, _vars, ctx) => {
      // Rollback: restore all snapshotted cache entries.
      if (ctx?.snapshot) {
        for (const [key, val] of ctx.snapshot) {
          queryClient.setQueryData(key as Parameters<typeof queryClient.setQueryData>[0], val);
        }
      }
      toast.error('Kunde inte spara — försök igen.');
    },

    onSettled: () => {
      // Always invalidate so server-authoritative belowThresholdTotal replaces
      // the locally-recomputed estimate (regardless of success or error).
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
  });
}
```

Mirror as `useUpdateOrderLineQuantity` with variables `{ orderId, lineId, quantity }`. Snapshot key is `['order', orderId]` instead of `['medications']`. Optimistic update mutates `OrderResponse.lines[*].quantity` in place; rollback restores the snapshot. The same 409 `order_locked` carve-out as the pessimistic mutations applies — on `onError`, check `err.envelope.error.code` first.

---

### `apps/web/src/routes/bestallningar/BestallningarPage.tsx` (REPLACE stub)

**Analog:** `apps/web/src/routes/lakemedel/LakemedelPage.tsx` (read in full above).

**Page chrome + state composition pattern** (`LakemedelPage.tsx:154-228`):

```tsx
return (
  <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
    {/* Page heading row */}
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold leading-tight">Läkemedel</h1>
      <AddMedicationButton onCreate={() => setSheet({ mode: 'create' })} />
    </div>

    {/* Low-stock count banner */}
    {!isLoading && (
      <LowStockBanner belowThresholdTotal={belowThresholdTotal} />
    )}

    {/* Loading state */}
    {isLoading && (
      <>
        <div className="hidden md:flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </>
    )}

    {/* Empty state: zero rows in DB */}
    {rowsEmpty && !hasActiveFilters && (
      <div className="flex items-center justify-center flex-1 p-8">
        <div className="max-w-md w-full p-8 text-center bg-card border border-border rounded-lg shadow-sm">
          <Pill className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Inga läkemedel ännu
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Lägg till från NPL-registret eller skapa nytt.
          </p>
          <Can action="medication:create">
            <Button onClick={() => setSheet({ mode: 'create' })}>
              Lägg till läkemedel
            </Button>
          </Can>
        </div>
      </div>
    )}

    {/* Data: table (≥md) and card list (<md) */}
    {!isLoading && rows.length > 0 && (
      <>
        <MedicationTable items={rows} onRowClick={handleRowClick} className="hidden md:block" />
        <MedicationCardList items={rows} onCardClick={handleRowClick} className="block md:hidden" />
        <PaginationFooter page={page} totalPages={totalPages} onPageChange={applyPage} />
      </>
    )}
  </div>
);
```

**Mirror for `BestallningarPage`** (simpler — no filters, no pagination per UI-SPEC):

1. Title `Beställningar` + an `AddOrderButton` (or inline `<Button>` + FAB pattern from `AddMedicationButton.tsx`) gated by `<Can action="order:create">`.
2. Loading: same `Skeleton` shapes (`h-12` × 5 desktop, `h-24` × 3 mobile per UI-SPEC).
3. Empty state — reuse `<EmptyStateCard icon={ClipboardList} heading="Inga utkast ännu" />` per D-70 / UI-SPEC, **plus** the body string `'Skapa en ny beställning för att komma igång.'` and the CTA `<Button>Ny beställning</Button>`. **Note**: the existing `EmptyStateCard` hardcodes "Den här vyn fylls i nästa fas." (line 28). Either (a) extend `EmptyStateCard` to accept a `body` + `action` prop, OR (b) inline the empty state with the same geometry as the "Inga läkemedel ännu" stack in `LakemedelPage` lines 211-228. The planner picks; UI-SPEC §1 favors option (b) so existing callers don't shift.
4. Data: render `<DraftsTable items={…} className="hidden md:block" />` + `<DraftsCardList items={…} className="block md:hidden" />`. No pagination (UI-SPEC §IA "no pagination in Phase 3").

**Title set + reset effect pattern** (`LakemedelPage.tsx:105-111`):

```typescript
useEffect(() => {
  document.title = 'Läkemedel — MediTrack';
  return () => {
    document.title = 'MediTrack';
  };
}, []);
```

Mirror with `'Beställningar — MediTrack'`.

**"Ny beställning" button handler** (D-50 — POST empty draft then navigate). New pattern, but the closest parallel is `AddMedicationButton.tsx` (FAB + desktop pattern). Use `useNavigate()` from `react-router-dom`, call `useCreateDraftOrder().mutateAsync()` then `navigate('/bestallningar/' + response.id)`. On error: toast (`'Kunde inte spara — försök igen.'`) — the hook's `onError` handles this.

---

### `apps/web/src/routes/bestallningar/DraftsTable.tsx` (NEW)

**Analog:** `apps/web/src/routes/lakemedel/MedicationTable.tsx` (full content above).

**Header + body shape** (`MedicationTable.tsx:45-143`):

```tsx
export function MedicationTable({ items, onRowClick, className }: MedicationTableProps) {
  return (
    <TooltipProvider>
      <div className={`overflow-x-auto ${className ?? ''}`}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[200px]">
                Namn
              </TableHead>
              {/* ... more headers ... */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              return (
                <TableRow
                  key={item.careUnitMedicationId}
                  tabIndex={0}
                  aria-label={`Öppna ${item.name}`}
                  onClick={() => onRowClick(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(item);
                    }
                  }}
                  className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <TableCell className="px-4 py-3 text-sm font-normal">{item.name}</TableCell>
                  {/* ... */}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
```

Mirror for drafts (5 columns per UI-SPEC §2: Skapad / Rader / Total / Skapad av / Öppna — final column visually empty, entire row clickable). Per UI-SPEC §IA, **no status pill column** — Phase 3 list is `?status=utkast` only. Use `useNavigate()` inside the component (or pass `onRowClick={id => navigate('/bestallningar/' + id)}` from the parent — match `LakemedelPage`'s parent-handles-click pattern). aria-label per UI-SPEC §Copywriting: `Öppna utkast skapat {formatRelative(createdAt)}`.

Drop `TooltipProvider` if no tooltip cells. Replace `InlineEditThreshold` cell with a `ChevronRight` lucide icon in the last column per UI-SPEC §2.

---

### `apps/web/src/routes/bestallningar/DraftsCardList.tsx` + `DraftCard.tsx`

**Analog:** `apps/web/src/routes/lakemedel/MedicationCardList.tsx` + `MedicationCard.tsx` (full content above).

**Card list barrel pattern** (`MedicationCardList.tsx:17-29`):

```tsx
export function MedicationCardList({ items, onCardClick, className }: MedicationCardListProps) {
  return (
    <div className={`grid gap-3 ${className ?? ''}`}>
      {items.map((item) => (
        <MedicationCard
          key={item.careUnitMedicationId}
          item={item}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
```

**Single card pattern** (`MedicationCard.tsx:28-66`):

```tsx
<div
  role="button"
  tabIndex={0}
  aria-label={`Öppna ${item.name}`}
  onClick={() => onCardClick(item)}
  onKeyDown={handleKeyDown}
  className="bg-card border border-border rounded-lg p-4 shadow-sm cursor-pointer
             hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-primary focus-visible:ring-offset-1"
>
  {/* Top row: name + optional low-stock badge */}
  <div className="flex items-start justify-between gap-2 mb-1">
    <span className="text-sm font-semibold text-foreground">{item.name}</span>
    {isLow && <LowStockBadge />}
  </div>

  {/* Secondary info */}
  <p className="text-sm text-muted-foreground">
    ATC: {item.atcCode} · Form: {item.form}
  </p>
  {/* ... */}
</div>
```

Mirror for `DraftCard` — three stacked rows per UI-SPEC §3 (DraftsCardList layout):
- Top: `{formatRelative(createdAt)}` + right-edge `ChevronRight`.
- Middle: `Skapad av {User.name}` in `text-xs text-muted-foreground`.
- Bottom: `{N} rader · totalt {sum}` in `text-sm`.
- aria-label: `Öppna utkast skapat {formatRelative(createdAt)}`.

---

### `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` (NEW)

**Analog:** `apps/web/src/routes/lakemedel/LakemedelPage.tsx` (page chrome + branch-on-loading pattern). Specifically the loading skeleton (lines 178-193) and the empty-state vs filled-state branches (lines 196-249).

**Branch on data state pattern** — three states (loading / not-found-404 / loaded). Loaded further branches on `order.status`:

- `utkast` → Mode A: header (back link, title `Nytt utkast`, `<OrderStatusPill status="utkast" />`), `<OrderLineTable />` + `<OrderLineCardList />` for the lines list, `<ComposeStickyFooter />` at bottom, `<MedicationPickerSheet>` overlay, `<DiscardDraftDialog>` overlay.
- `skickad` → Mode B: header (`Beställning · Skickad`, `<OrderStatusPill status="skickad" />`), `<SubmitConfirmationBanner />`, read-only `<OrderLineTable />` / `<OrderLineCardList />`, no sticky footer.

**404 fallback** — use the same `EmptyStateCard` pattern that `LakemedelPage` uses for the "no rows" state — render an inline centered card with `Beställning hittades inte.` heading and a `<Button variant="link"><Link to="/bestallningar">Tillbaka till beställningar</Link></Button>` per UI-SPEC §IA.

**Page title set** per UI-SPEC §Copywriting (analog `LakemedelPage.tsx:105-111`): branch on status — `Nytt utkast — MediTrack` for utkast, `Beställning · Skickad — MediTrack` for skickad.

**State management** — `useParams<{ id: string }>()` for the order id, `useOrderQuery(id)` for the data, `useState` for picker-sheet open / discard-dialog open. **No URL-based filter state** (unlike `LakemedelPage`).

---

### `apps/web/src/routes/bestallningar/OrderLineTable.tsx`

**Analog:** `apps/web/src/routes/lakemedel/MedicationTable.tsx` (full content above).

Mirror the table shell + header pattern (excerpt above). 6 columns per UI-SPEC §5: Namn / ATC-kod / Form / Lager (low-stock cell from MedicationTable lines 105-121 reused verbatim — `LowStockBadge` + `AlertTriangle` + `Tooltip`) / Antal (`<QuantityStepper>`) / Åtgärd (trash button).

**Trash button cell** — `<Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label="Ta bort rad"><Trash2 className="h-4 w-4" aria-hidden /></Button>`. `e.stopPropagation()` on click so the row click (if any wrapping clickable) doesn't fire. Hooked to `useRemoveOrderLine` (pessimistic per D-52).

**Empty state row** per UI-SPEC §5: a single `<TableRow>` with one `<TableCell colSpan={6}>` containing `text-sm text-muted-foreground text-center py-8`: `Lägg till läkemedel för att börja.`

**Mode B locked variant** — pass `isLocked: boolean` prop; when true, replace `<QuantityStepper>` with `<span className="text-sm font-semibold">{line.quantity}</span>` and hide the trash column. (Don't conditionally remove columns — keep the table grid stable. Just hide the trash button per UI-SPEC §5 "no trash buttons" in Mode B.)

---

### `apps/web/src/routes/bestallningar/OrderLineCardList.tsx` + `OrderLineCard.tsx`

**Analog:** `MedicationCardList.tsx` + `MedicationCard.tsx` (above).

Mirror `MedicationCard`'s card chrome:

```tsx
<div
  className="bg-card border border-border rounded-lg p-4 shadow-sm
             focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-primary focus-visible:ring-offset-1"
>
  {/* Top row: name + trash */}
  <div className="flex items-start justify-between gap-2 mb-1">
    <span className="text-sm font-semibold text-foreground truncate max-w-[calc(100%-3rem)]">{line.name}</span>
    {/* trash button h-11 w-11 — UI-SPEC §7 */}
  </div>
  <p className="text-sm text-muted-foreground">ATC: {line.atcCode} · Form: {line.form}</p>
  <p className="text-sm flex items-center gap-1">Lager: {line.currentStock} {isLow && <LowStockBadge />}</p>
  <hr className="my-3 border-border" />
  <QuantityStepper … />
</div>
```

**OrderLineCard is NOT a button** — unlike `MedicationCard`, the card itself is not clickable (the quantity stepper and trash button are the interactives). Drop `role="button"` + `tabIndex={0}` + `onClick`/`onKeyDown` from the analog.

---

### `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx` (NEW — no exact analog)

**No analog.** Closest geometric reference: the `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]` padding trick used in `MedicationSheet.tsx` (`MedicationSheet.tsx:381` + `:533` + `:965`):

```tsx
<SheetFooter className="border-t border-border p-4 flex items-center justify-between gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))]">
```

Apply the same `pb-[calc(…)]` trick on the **outer wrapper** of the sticky footer to clear the bottom tab bar + iOS home indicator (UI-SPEC §Spacing "Sticky compose-view footer (mobile)").

**Mobile (`<md`):** `<footer aria-label="Åtgärder för beställning" className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-[0_-1px_3px_rgba(0,0,0,0.05)] p-4 pb-[calc(1rem+56px+env(safe-area-inset-bottom))] md:hidden">…</footer>` (UI-SPEC §IA layout — Mode A).

**Desktop (`≥md`):** `<footer aria-label="Åtgärder för beställning" className="hidden md:flex items-center justify-between gap-4 sticky bottom-0 bg-background border-t border-border p-4">…</footer>`.

**Inside (both):** `<Button variant="destructive" onClick={() => setDiscardOpen(true)}>Kasta</Button>` left, the summary text middle, `<Button variant="outline" onClick={() => setPickerOpen(true)}>Lägg till läkemedel</Button>` + `<Button variant="default" disabled={lines.length === 0 || lines.some(l => l.quantity <= 0) || isSubmitting} onClick={onSubmit}>{isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Skickar…</> : 'Skicka beställning'}</Button>` right.

**Loader2-spinner-on-pending pattern** — analog `MedicationSheet.tsx:413-421`:

```tsx
<Button type="submit" form="edit-form" disabled={isPending || isDeleting}>
  {isPending ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Sparar…
    </>
  ) : (
    'Spara'
  )}
</Button>
```

Mirror with `Skickar…` for the submit button.

**Disabled-with-tooltip pattern** — wrap submit button with `<Tooltip><TooltipTrigger asChild>…</TooltipTrigger><TooltipContent>Lägg till minst en rad för att skicka.</TooltipContent></Tooltip>` only when the disabled-reason is "no lines". Don't show the tooltip during in-flight submit (the spinner is the signal).

---

### `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx` (NEW)

**Analog:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx` (the create-mode typeahead block, lines 561-803 — full content above).

**Sheet shell + side prop pattern** (`MedicationSheet.tsx:103-114` for `useIsDesktop`, lines 718-731 for the shell):

```tsx
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

// ...

<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent
    side={isDesktop ? 'right' : 'bottom'}
    className={
      isDesktop
        ? 'w-[480px] sm:max-w-xl overflow-y-auto flex flex-col'
        : 'max-h-[90dvh] rounded-t-2xl overflow-y-auto flex flex-col'
    }
  >
    <SheetHeader>
      <SheetTitle>Lägg till läkemedel</SheetTitle>
    </SheetHeader>
    {/* ... */}
  </SheetContent>
</Sheet>
```

Mirror the shell verbatim. SheetTitle: `Lägg till läkemedel` per UI-SPEC §9 / D-70. **Reuse `useIsDesktop` by extracting it to `apps/web/src/lib/useIsDesktop.ts`** (or duplicate inline — pick one in the plan).

**Debounce hook pattern** (`MedicationSheet.tsx:92-99`):

```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

Mirror — 150 ms debounce per UI-SPEC §9 (matches Phase 2 D-44).

**Typeahead query + dropdown render pattern** (`MedicationSheet.tsx:767-803`):

```tsx
{showResults && debouncedQ.length > 0 && !selectedNpl && (
  <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-card border border-border rounded-md shadow-lg max-h-[240px] overflow-y-auto">
    {searchQuery.isLoading && (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Söker…
      </div>
    )}
    {!searchQuery.isLoading && results.length === 0 && (
      <div className="p-3 text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
        Inget läkemedel matchade.
        {/* "Skapa nytt läkemedel" button — DROP for Phase 3 picker (D-58, D-70) */}
      </div>
    )}
    {results.map((r) => (
      <button
        key={r.id}
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
        onClick={() => handleSelectNpl(r)}
      >
        {r.name} — {r.atcCode} — {r.form}
        {r.strength ? ` — ${r.strength}` : ''}
      </button>
    ))}
  </div>
)}
```

**Phase 3 differences** (D-58 — "pick-only" variant):

1. **No `Skapa nytt`** — drop the "Skapa nytt läkemedel" button from the empty state. Just render `Inget läkemedel matchade.` (D-70).
2. **No NPL selected screen / Lager + Tröskel form** — picking a row immediately fires `useAddOrderLine.mutateAsync({ orderId, careUnitMedicationId: row.careUnitMedicationId, quantity: 1 })` and closes the Sheet optimistically (D-52 "pessimistic" but the Sheet closes optimistically per UI-SPEC §9 "Optimistically close the Sheet (instant feedback)"). On error → re-open Sheet + toast.
3. **No "Skapa nytt" `showCreateForm` state.**
4. **Row format** per UI-SPEC §9 + D-61: `{name}` (text-sm font-semibold) on row 1; `{atcCode} · {form} · Lager: {currentStock}` (text-xs text-muted-foreground) on row 2; `<LowStockBadge />` on the right when `currentStock < lowStockThreshold`. Use `min-h-[56px]` per UI-SPEC §A11y. Row as a `<button>`.
5. **Inline list (not absolute dropdown)** — UI-SPEC §9 renders results as a scrollable list inside the Sheet body, NOT as an absolute-positioned dropdown over an input. Drop the `absolute …` positioning classes; use `<div className="overflow-y-auto flex-1">`.
6. **Picker close button** per UI-SPEC §9: `<SheetFooter className="border-t border-border p-4"><Button variant="ghost" onClick={() => onOpenChange(false)}>Stäng</Button></SheetFooter>`.
7. **Autofocus the search input on open** — mirror `autoFocus={true}` on the `<Input>` from `MedicationSheet.tsx:742`. UI-SPEC §9 confirms.

---

### `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx` (NEW)

**Analog:** `apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx` (full content above):

```tsx
export function DeleteMedicationDialog({
  open,
  onOpenChange,
  medicationName,
  careUnitName,
  onConfirm,
  isDeleting,
}: DeleteMedicationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Ta bort ${medicationName} från ${careUnitName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Läkemedlet finns kvar i NPL-registret och kan läggas till igen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className={cn(
              'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              isDeleting && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tar bort…
              </>
            ) : (
              'Ta bort'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Mirror exactly with Phase 3 copy (D-70 / UI-SPEC §Copywriting): Title `Kasta detta utkast?`, Description `Utkastet tas bort permanent.`, Cancel `Avbryt`, Action `Kasta`. Cancel before Action (shadcn default focus on Cancel — safer for destructive). `e.preventDefault()` on Action so the dialog doesn't auto-close before mutation completes. **Critical**: `AlertDialogAction` does NOT accept `variant="destructive"` — use the `className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90', …)}` pattern verbatim (the analog comment explicitly calls this out).

`isDeleting` spinner copy: `Kastar…`. Action label (idle): `Kasta`.

Props don't need `medicationName` / `careUnitName` — just `{ open, onOpenChange, onConfirm, isDeleting }`.

---

### `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` (NEW)

**Analog:** none in the existing component set. Closest geometric reference: `LowStockBadge.tsx` (badge shape) is destructive-tinted; UI-SPEC inverts to accent-tinted. The closest "banner" component is also new in Phase 3.

Inline implementation per UI-SPEC §12:

```tsx
import { CheckCircle2 } from 'lucide-react';

export function SubmitConfirmationBanner() {
  return (
    <div
      role="status"
      className="mt-4 mx-4 sm:mx-0 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3
                 text-sm text-primary flex items-center gap-2"
    >
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      Beställningen är skickad till apotekare.
    </div>
  );
}
```

No props. `role="status"` for non-interrupting announce. Re-renders on every Mode B mount (UI-SPEC §12).

---

### `apps/web/src/components/OrderStatusPill.tsx` (NEW)

**Analog:** `apps/web/src/components/RoleBadge.tsx` (full content above):

```tsx
import type { Role } from '@meditrack/shared';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<Role, string> = {
  apotekare: 'Apotekare',
  sjukskoterska: 'Sjuksköterska',
  admin: 'Admin',
};

const ROLE_CLASS: Record<Role, string> = {
  apotekare: 'bg-blue-100 text-blue-800',
  sjukskoterska: 'bg-teal-100 text-teal-700',
  admin: 'bg-amber-100 text-amber-800',
};

export interface RoleBadgeProps {
  role: Role;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
        ROLE_CLASS[role],
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
```

Mirror as `OrderStatusPill`. Label map: `ORDER_STATUS_LABELS` imported from `@meditrack/shared` (already exists — `packages/shared/src/constants/orderStatus.ts`). Status-class map per UI-SPEC §4 color contract:

```typescript
const STATUS_CLASS: Record<OrderStatus, string> = {
  utkast: 'bg-slate-100 text-slate-700',
  skickad: 'bg-blue-100 text-blue-800',
  bekraftad: 'bg-amber-100 text-amber-800',
  levererad: 'bg-emerald-100 text-emerald-800',
};
```

**Difference from `RoleBadge`:** `px-3` (not `px-2`) per UI-SPEC §4 because `Bekräftad` / `Levererad` are longer than role labels and would crowd at `px-2`. **No icon.** Text + color is sufficient. Comment per `RoleBadge.tsx:11-14`: "DO NOT reuse or extend `RoleBadge`. The two badges share visual lineage but have different semantics; coupling them would require a refactor when Phase 4 widens." Use the same comment for `OrderStatusPill` referring back to `RoleBadge`.

---

### `apps/web/src/components/QuantityStepper.tsx` (NEW)

**Analog:** `apps/web/src/components/InlineEditThreshold.tsx` (full content above).

**Optimistic mutation + commit-on-action pattern** (`InlineEditThreshold.tsx:39-99`):

```typescript
const canUpdate = useCan('medication:update');
const [editing, setEditing] = useState(false);
const [localValue, setLocalValue] = useState(value);
const mutation = useUpdateThresholdOptimistic();
const inputRef = useRef<HTMLInputElement>(null);

// Re-sync localValue when the parent receives a new server-authoritative value.
useEffect(() => {
  setLocalValue(value);
}, [value]);

async function commit() {
  if (localValue === value) {
    setEditing(false);
    return;
  }
  if (!isFinite(localValue) || localValue < 1) {
    setLocalValue(value);
    setEditing(false);
    return;
  }
  try {
    await mutation.mutateAsync({ careUnitMedicationId, lowStockThreshold: localValue });
    setEditing(false);
  } catch {
    // Stay in editing state so the user can retry or Esc-cancel.
  }
}
```

**Mirror for `QuantityStepper`:** local `value` state, `useEffect` to re-sync from prop, `useUpdateOrderLineQuantity` (the new optimistic hook). On commit (debounced 250 ms or on blur per D-51 / D-60), call `mutation.mutateAsync({ orderId, lineId, quantity })`.

**Differences from `InlineEditThreshold`** (no analog for these):

1. **`−` / `<input>` / `+` layout** per UI-SPEC §6. Three controls sharing a single visual outline. Class snippets from UI-SPEC verbatim — see §6 of `03-UI-SPEC.md`.
2. **44 × 44 px buttons** (UI-SPEC §Spacing — overrides default `Button size="icon"` 36 × 36). `h-11 w-11`.
3. **Long-press auto-repeat** (D-60, UI-SPEC §6): `onPointerDown` starts a `setTimeout(..., 250)` then `setInterval(..., 100)`. `onPointerUp` / `onPointerCancel` / `onPointerLeave` clears both. Use refs for the timer ids; cleanup on unmount.
4. **Debounced PATCH** (D-51 / D-60, UI-SPEC §6): inside `QuantityStepper`, after every value change (stepper click or input change), `setTimeout(() => commit(), 250)` clearing any prior timeout. **Also** commit on `blur` if a debounce is in flight.
5. **`isLocked` prop** (UI-SPEC §6): when true, render a single `<span className="text-sm font-semibold">{value}</span>` with the same width as the active stepper to avoid layout shift. Match the `aria-label` from `InlineEditThreshold.tsx:107` style (`aria-label="Antal"`).
6. **`e.stopPropagation()` on every event handler** — verbatim from `InlineEditThreshold.tsx:69-99`. Comment in `InlineEditThreshold.tsx:29-31` explains why: prevents parent row/card click from also firing.

---

## Shared Patterns

### Authentication / Authorization (every BE route)

**Source:** `apps/api/src/routes/medications/list.ts` lines 21-37 (preHandler chain) + `apps/api/src/auth/requireSession.ts` (decorates `req.user`).

**Pattern**: every route file (every Phase 3 BE file in `apps/api/src/routes/orders/`):

```typescript
r.get('/api/...', {
  preHandler: [requireSession, requirePermission('order:read')],  // D-15: NEVER reorder
  schema: { /* zod */ },
}, async (req) => {
  return serviceCall(req.user!.careUnitId, /* args */);  // D-16: careUnitId is FIRST
});
```

The two preHandlers are imported via:

```typescript
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
```

Apply to all Phase 3 routes verbatim (D-15 / D-64 mapping per route).

---

### Cross-tenant 404 (existence-probe protection)

**Source:** `apps/api/src/services/medication.service.ts` lines 412-421 (and again at 497-507).

**Apply to:** every service function in `order.service.ts` that takes `orderId` as an argument — `getOrderForUnit`, `addLineToOrder`, `updateOrderLine`, `removeOrderLine`, `submitOrder`, `softDeleteOrder`.

Pattern (mirror verbatim):

```typescript
const row = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
if (!row || row.deletedAt !== null || row.careUnitId !== careUnitId) {
  throw new NotFoundError('Beställningen hittades inte.');
}
```

D-19 / D-73: cross-careUnit access **must** return 404, not 403, so attackers cannot probe order-id existence. Same envelope shape for truly-missing rows, soft-deleted rows, and cross-tenant rows.

---

### Canonical error envelope (`{ error: { code, message, details? } }`)

**Source:** `packages/shared/src/contracts/error.ts` (defined) + `apps/api/src/plugins/errorHandler.ts` lines 69-99 (sender) + lines 130-145 (mappings).

**Apply to:** every error in Phase 3. The new `OrderLockedError` class lands in `errorHandler.ts` next to `NotFoundError`. The new 422 path (D-56) uses a free-form `details` payload via the existing `envelope(code, message, details)` helper (`errorHandler.ts:69-77`):

```typescript
function envelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  return {
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
```

FE side (`apps/web/src/lib/api.ts:20-30`):

```typescript
export class ApiError extends Error {
  readonly status: number;
  readonly envelope: ErrorEnvelope;
  // ...
}
```

All FE 409 handling uses `err.envelope.error.code === 'order_locked'` — never branch on `err.status` or `err.message` (Phase 1 D-19 explicit rule).

---

### TanStack Query cache hydration on mutation response

**Source:** `apps/web/src/features/medications/useMedicationMutations.ts` lines 44-48, 77-81 (post-mutation invalidation).

**Phase 3 widens to `setQueryData` hydration** per D-57 / D-69. The line-op endpoints return the **full updated Order** in their response, so instead of just invalidating, set the cache directly:

```typescript
onSuccess: (response, vars) => {
  // Phase 3 D-57: response is the full updated Order — hydrate the cache.
  queryClient.setQueryData(['order', vars.orderId], response);
  // Phase 3 D-69: also invalidate the drafts list for submit + discard.
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
},
```

The `['order', id]` key pattern matches `useMedicationsQuery`'s `['medications', filters]` key pattern (`useMedicationsQuery.ts:32`).

---

### Defense-in-depth RBAC gating (FE `<Can>` + BE `requirePermission`)

**Source:** `apps/web/src/auth/Can.tsx` (FE component) + `apps/api/src/auth/requirePermission.ts` (BE preHandler).

**Apply to:** every Phase 3 mutation surface.

- "Ny beställning" button + FAB → `<Can action="order:create">`.
- Compose-view interactives (Skicka, Kasta, Lägg till läkemedel, line trash, QuantityStepper) → `<Can action="order:update">` (or `'order:submit'` / `'order:delete'` for the respective endpoints).
- BE: every route preHandler is `[requireSession, requirePermission('order:...')]`.

FE hides, BE enforces. Per `Can.tsx:14-17`:

> SECURITY BOUNDARY: This is defense in depth, NEVER the security boundary. The BE `requirePermission(action)` preHandler always enforces the same rule.

---

## No Analog Found

Files where the codebase has no close match — planner should rely on UI-SPEC + RESEARCH-style reasoning rather than a paste-and-adapt template:

| File | Role | Reason |
|------|------|--------|
| `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx` | Sticky footer | First sticky-footer pattern in the codebase. UI-SPEC §8 specifies geometry exhaustively (mobile fixed `z-40`, desktop `sticky bottom-0` inside scroll container, `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]` padding trick). The closest existing reference is `MedicationSheet.tsx:381`'s `SheetFooter` padding — match that style verbatim. |
| `QuantityStepper` long-press auto-repeat behavior | New behavior | No existing component has pointer-event auto-repeat. UI-SPEC §6 documents the contract (250 ms initial delay, 100 ms repeat, cleared on pointerup/cancel/leave). Pure new code — write from spec. |
| `OrderLockedError` / `ValidationFailedError` (with `details.reason`) classes | New error types | Existing error classes have no `details` payload. Mirror the constructor signature from `NotFoundError` (`errorHandler.ts:45-51`) but accept and stash an optional `details` arg, then read it in the `setErrorHandler` envelope call (`errorHandler.ts:69-77`). |

---

## Metadata

**Analog search scope:**
- `apps/api/src/services/` (1 file)
- `apps/api/src/routes/medications/` (6 files — all read)
- `apps/api/src/routes/` (barrels + auth + me + admin)
- `apps/api/src/auth/` (4 files)
- `apps/api/src/plugins/` (2 files — errorHandler, cookies)
- `apps/api/prisma/` (schema + 3 migration dirs)
- `apps/api/test/` (auth.flow.smoke.test.ts + helpers/buildTestApp.ts)
- `apps/web/src/auth/` (5 files)
- `apps/web/src/components/` (5 files + ui subdir)
- `apps/web/src/features/medications/` (2 hook files)
- `apps/web/src/routes/lakemedel/` (10 files)
- `apps/web/src/lib/` (api.ts, queryClient.ts, utils.ts)
- `apps/web/src/router.tsx`, `main.tsx`
- `packages/shared/src/` (all contracts + constants)

**Files scanned:** ~48 source files read in full or sampled.

**Pattern extraction date:** 2026-05-21

---

## PATTERN MAPPING COMPLETE

**Phase:** 3 - Draft Orders
**Files classified:** 24 (19 new + 5 modified)
**Analogs found:** 22 / 24

### Coverage

- Files with exact analog: 18
- Files with role-match analog: 4
- Files with no analog: 2 (`ComposeStickyFooter.tsx`, `QuantityStepper` long-press; partial for `OrderLockedError` details payload)

### Key Patterns Identified

- **careUnitId-first service layer** with cross-tenant 404 + soft-delete + `$transaction` precedent fully covered by `medication.service.ts`. `order.service.ts` mirrors structure exactly; the only new pattern is the atomic-UPDATE-with-status-precondition (Phase 4 will reuse this for confirm/deliver).
- **Fastify route triple** (`preHandler: [requireSession, requirePermission]` + Zod `withTypeProvider` + careUnitId-first service call) is a verbatim mirror across all 7 new order route files.
- **Zod-as-contract** in `packages/shared/src/contracts/medication.ts` is the exact template for `order.ts` — top-of-file block comment, `// ---` section dividers, schema-then-`z.infer` type, `.strict()` + `.refine()` for stringent bodies.
- **FE table/card mirror** at every breakpoint — `MedicationTable` + `MedicationCard` patterns transcribed line-for-line to `DraftsTable` / `OrderLineTable` and their card counterparts.
- **MedicationSheet's typeahead + Sheet shell** is the picker's bedrock — strip the create form, drop the absolute dropdown for an inline list, and the rest is verbatim.
- **AlertDialog with `e.preventDefault()` + Cancel-first focus** is the locked pattern for `DiscardDraftDialog` (`DeleteMedicationDialog.tsx` carries the explanatory comments verbatim — including the "AlertDialogAction does NOT accept `variant`" gotcha).
- **Optimistic mutation cache snapshot/rollback** in `useUpdateThresholdOptimistic` is the exact template for `useUpdateOrderLineQuantity`.
- **Defense-in-depth `<Can>` + `requirePermission`** pair is already wired; Phase 3 just adds new `ActionKey` literals.

### File Created

`C:/Projekt/MediTrack/.planning/phases/03-draft-orders/03-PATTERNS.md`

### Ready for Planning

Pattern mapping complete. Planner can reference analog file paths + concrete excerpts in PLAN.md files.
