# Phase 5: Audit Log - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 21 (14 new, 7 modified)
**Analogs found:** 19 / 21 (2 first-of-kind documented explicitly)

> Scope note for the planner: the file `auditAllowlist.ts` is intentionally **not** treated as a separate row in the classification table — D-97 says it co-locates with `auditExtension.ts` and shares its analogs (`constants/orderStatus.ts` for the const-table shape, `permissions.ts` for the `Record<Key, T[]>` exhaustiveness pattern). Same with `seed.ts` — the only Phase 5 change is a header comment per D-92; no pattern transplant.

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/prisma/migrations/0007_audit_events/migration.sql` | migration (DDL) | schema-write | `apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql` | exact (CreateTable + multi-index pattern) |
| `apps/api/prisma/migrations/0008_audit_events_revoke_grants/migration.sql` | migration (security) | schema-write | `apps/api/prisma/migrations/20260522000000_0005_order_line_quantity_check/migration.sql` | role-match (single-purpose ALTER) — no GRANT/REVOKE precedent in repo (first-of-kind) |
| `apps/api/src/db/auditExtension.ts` | infrastructure / ORM extension | event-driven (Prisma hook) | `apps/api/src/db/client.ts` (singleton shape) + `apps/api/src/services/order.service.ts` lines 407-489 (tx + actor-stamp pattern) | role-match (no `$extends` precedent — first-of-kind) |
| `apps/api/src/db/auditAllowlist.ts` | const table | pure data | `packages/shared/src/constants/orderStatus.ts` + `apps/api/src/auth/permissions.ts` (`Record<Key, T[]>` exhaustiveness) | exact |
| `apps/api/src/plugins/requestContext.ts` | Fastify plugin | request-response (onRequest hook) | `apps/api/src/plugins/cookies.ts` (fp shape) + `apps/api/src/auth/requireSession.ts` (req.user read) | role-match (no ALS precedent — first-of-kind) |
| `apps/api/src/services/audit.service.ts` | service | CRUD (read-only) | `apps/api/src/services/order.service.ts` lines 216-242 (`listOrdersForUnit`) — but **without** careUnitId-first (D-16 exception per D-CONTEXT.md) | role-match (deliberate D-16 exception) |
| `apps/api/src/routes/audit/list.ts` | route handler | request-response | `apps/api/src/routes/orders/list.ts` | exact (admin-only `requirePermission`, Zod query, no preValidation) |
| `apps/api/src/routes/audit/filters.ts` | route handler | request-response | `apps/api/src/routes/orders/pickerOptions.ts` + `apps/api/src/routes/adminPing.ts` (admin-only no-body GET) | exact |
| `apps/api/src/routes/audit/index.ts` | route registrar | composition | `apps/api/src/routes/orders/index.ts` | exact |
| `apps/api/test/audit.integration.test.ts` | integration test | end-to-end | `apps/api/test/orders.deliver.integration.test.ts` (8-scenario suite + `progressOrderToBekraftad` helper) | exact |
| `apps/api/prisma/schema.prisma` | schema (modify) | schema-write | existing `Order` model (lines 179-227) and indexes | exact |
| `apps/api/src/db/client.ts` | infrastructure (modify) | wiring | existing singleton (read this file as-is) | exact (one-line `.$extends` wrap) |
| `apps/api/src/app.ts` | composition (modify) | wiring | existing `buildApp` plugin/route block | exact |
| `apps/api/src/auth/permissions.ts` | const map (modify) | pure data | existing `PERMISSIONS` map | exact (one-line append) |
| `apps/api/src/services/auth.service.ts` | service (modify) | request-response (failed-login branch) | existing `login()` function lines 38-73 | exact (single new write inside existing `if (!user)` and `if (!ok)` branches) |
| `apps/api/prisma/seed.ts` | seed (modify) | batch | n/a — only a header-comment edit per D-92 | comment-only |
| `packages/shared/src/contracts/audit.ts` | contract | pure data | `packages/shared/src/contracts/order.ts` (env-shape + nullable timestamps + `.strict()` requests + cursor-shape from list query) | exact |
| `packages/shared/src/constants/auditAction.ts` | const + label map | pure data | `packages/shared/src/constants/orderStatus.ts` | exact |
| `packages/shared/src/contracts/permissions.ts` | const list (modify) | pure data | existing `ACTION_KEYS` const | exact (one-line append) |
| `apps/web/src/routes/admin/AuditPage.tsx` | page component | request-response + URL-as-state | `apps/web/src/routes/bestallningar/BestallningarPage.tsx` (status-tab URL-as-state + responsive switch) + `apps/web/src/routes/lakemedel/LakemedelPage.tsx` (filter URL-as-state) | exact |
| `apps/web/src/routes/admin/AuditFilterBar.tsx` | filter component | request-response | `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` | exact (three comboboxes + clear-all) |
| `apps/web/src/routes/admin/AuditTable.tsx` | table component | request-response | `apps/web/src/routes/bestallningar/OrdersTable.tsx` | exact (md+ table, click-row affordance) |
| `apps/web/src/routes/admin/AuditCardList.tsx` | card list component | request-response | `apps/web/src/routes/bestallningar/OrdersCardList.tsx` | exact (<md responsive card stack) |
| `apps/web/src/routes/admin/AuditDiffPanel.tsx` | detail panel | pure rendering | shadcn `<Table>` (`apps/web/src/components/ui/table.tsx`) — no diff-panel precedent in repo | role-match (first-of-kind diff view) |
| `apps/web/src/features/audit/useAuditEventsQuery.ts` | query hook | request-response | `apps/web/src/features/orders/useOrderQueries.ts` (`useDraftsQuery` / `useOrdersByStatusQuery`) | exact — but `useInfiniteQuery` is a first-of-kind in this repo (D-105) |
| `.eslintrc.cjs` (root) | tooling config | pure data | n/a — repo has **no existing ESLint config** (verified via Glob). First-of-kind. | first-of-kind |

---

## Pattern Assignments

### `apps/api/prisma/migrations/0007_audit_events/migration.sql` (migration, schema-write)

**Analog:** `apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql`

**CreateTable + multi-index shape** (lines 18-58):
```sql
-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'utkast',
    "submittedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_careUnitId_status_idx" ON "Order"("careUnitId", "status");

-- CreateIndex
CREATE INDEX "Order_careUnitId_createdAt_idx" ON "Order"("careUnitId", "createdAt");
```

**Copy this shape verbatim** for `audit_events`. Index list from CONTEXT.md `<domain>` lines 13:
- `@@index([createdAt(sort: Desc), id])` (cursor pagination key)
- `@@index([actorUserId, createdAt(sort: Desc)])` (user filter)
- `@@index([entityType, createdAt(sort: Desc)])` (entity-type filter)
- `@@index([action, createdAt(sort: Desc)])` (action filter)
- `@@index([requestId])` (sibling-event grouping)

No FK from `audit_events.actorUserId` → `User` (D-97 keeps the FK loose so deleting a User doesn't cascade-corrupt the audit log; document this in the SQL header comment, mirroring the inline justification style from migration 0005 below).

---

### `apps/api/prisma/migrations/0008_audit_events_revoke_grants/migration.sql` (migration, security)

**Analog:** `apps/api/prisma/migrations/20260522000000_0005_order_line_quantity_check/migration.sql`

**Single-purpose ALTER with rich header comment** (lines 1-21):
```sql
-- Phase 3 WR-01 fix: DB-level CHECK constraint on OrderLine.quantity.
--
-- The orderLineResponse Zod contract declares quantity: z.number().int().positive().
-- The original migration (0004) deliberately omitted a DB check, deferring the
-- guarantee to the Zod boundary at the submit endpoint. WR-01 shows this is
-- insufficient: any path that writes the OrderLine row directly (...) can put
-- the row into a state where GET /api/orders/:id fails its response serializer
-- with a 500 — because the response schema asserts positive() and the loaded row
-- is 0. Adding the check at the DB makes the contract drift-proof.

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_quantity_positive_check"
  CHECK ("quantity" > 0);
```

**Apply to Phase 5:** identical header-comment style explaining D-98 (two-layer enforcement); use a `DO $$ … EXCEPTION … $$` block per CONTEXT.md `<domain>` line 14 ("idempotent — `REVOKE … IF EXISTS` semantics via a `DO $$ … EXCEPTION` block; safe to re-run"). The role embedded in `DATABASE_URL` is the CURRENT_USER per D-98.

> No GRANT/REVOKE precedent exists anywhere in `apps/api/prisma/migrations/` — this is first-of-kind. The migration is one statement plus the documenting header; no other migration shape in the repo is closer.

---

### `apps/api/src/db/auditExtension.ts` (infrastructure, event-driven)

**Analog A (singleton shape):** `apps/api/src/db/client.ts`

**Imports + global cache pattern** (lines 1-17):
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**Action for Phase 5:** the modified `client.ts` keeps this exact shape but wraps the returned client with `.$extends(auditExtension)`. `auditExtension.ts` exports the extension factory (a function or const) that returns `Prisma.defineExtension({...})`.

**Analog B (tx + actor-stamp pattern):** `apps/api/src/services/order.service.ts` lines 407-489 (`submitOrder`)

**Audit row INSERT inside same tx** (D-91) — copy this pattern verbatim:
```typescript
const result = await prisma.$transaction(async (tx) => {
  // Step 0 — CR-02: lock the Order row FOR UPDATE so concurrent line
  // mutations (which call assertOrderEditable() inside their own tx) wait
  // until this submit commits.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

  // Step 1 — Load the order with lines inside the transaction.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { lines: true },
  });

  // ... (steps 2-4: existence/scope/status/validation checks) ...

  // Step 5 — Atomic UPDATE with status precondition (D-54).
  const updated = await tx.order.updateMany({
    where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null },
    data: {
      status: 'skickad',
      submittedAt: new Date(),
      submittedByUserId: actorUserId,
    },
  });
  // ...
});
```

**Why this is the right pattern for the extension** (D-91):
- Pre-mutation `findUnique`/`findMany` inside the tx captures `before` exactly the way Step 1 captures the order for status validation.
- The mutation runs inside `tx.*` so the audit `INSERT` inside the same tx rolls back if the mutation fails (and vice versa).
- For `updateMany`/`deleteMany`, load matching rows by primary key first (like Step 1's `findUnique`), then run the mutation, then emit N audit rows.

**ALS-store read pattern (new, first-of-kind):**
- Import a singleton `AsyncLocalStorage` from `requestContext.ts`; read with `als.getStore()`.
- If store is `undefined` → skip audit-row write entirely (D-92 seed-suppression).

**Action-name override pattern (D-94):**
- Default: `action` defaults to the Prisma method name (`create`/`update`/etc).
- Override: deliver path passes a richer action via the ALS store (`als.run({ …, actionOverride: 'order.deliver' }, …)`) read by the extension on that one call.

---

### `apps/api/src/db/auditAllowlist.ts` (const, pure data)

**Analog A (const-table shape):** `packages/shared/src/constants/orderStatus.ts`

```typescript
import { z } from 'zod';

export const ORDER_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusEnum = z.enum(ORDER_STATUSES);

/** Swedish display labels — used by status chip primitive in Phase 3+. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  utkast: 'Utkast',
  skickad: 'Skickad',
  bekraftad: 'Bekräftad',
  levererad: 'Levererad',
};
```

**Analog B (`Record<Key, T[]>` exhaustiveness):** `apps/api/src/auth/permissions.ts` (lines 21-40)
```typescript
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
  'medication:read':   ['apotekare', 'sjukskoterska', 'admin'],
  // …
};
```

**For Phase 5 audit allowlist:** mirror both — a literal-keyed `Record<AuditedModel, readonly (keyof Row)[]>` (or `string[]` if not generic), so adding a model is a typed addition and a missing model is a compile error. Per-model entries from D-97:
- `Medication: id, nplId, name, atcCode, form, strength, source, createdAt`
- `CareUnitMedication: id, careUnitId, medicationId, currentStock, lowStockThreshold, deletedAt, createdAt, updatedAt`
- `Order: id, careUnitId, createdByUserId, status, submittedAt, submittedByUserId, confirmedAt, confirmedByUserId, deliveredAt, deliveredByUserId, deletedAt, createdAt, updatedAt`
- `OrderLine: id, orderId, careUnitMedicationId, quantity, createdAt, updatedAt`
- `User: id, email, name, role, careUnitId, createdAt, updatedAt` **— `passwordHash` excluded**
- `Session: userId, careUnitId, createdAt, expiresAt, lastSeenAt` **— `id` excluded**

Document the exclusions inline with `// excluded: passwordHash (D-97)` so the file is grep-discoverable.

---

### `apps/api/src/plugins/requestContext.ts` (Fastify plugin, request-response)

**Analog A (fp plugin shape):** `apps/api/src/plugins/cookies.ts`

```typescript
import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import { env } from '../env.js';

/**
 * Registers `@fastify/cookie` with HMAC signing keyed off `COOKIE_SECRET`
 * (T-01-02 — tampered cookies fail `unsignCookie` and surface as 401 in
 * `requireSession`).
 */
export const cookiesPlugin = fp(async (app) => {
  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    parseOptions: { signed: true },
  });
});
```

**Apply for Phase 5:** export `requestContextPlugin = fp(async (app) => { … })` that:
1. Generates a UUIDv4 `requestId` on `onRequest`.
2. Sets `reply.header('X-Request-Id', requestId)` (CONTEXT.md `<domain>` line 16).
3. Calls `als.run({ actorUserId: req.user?.id ?? null, careUnitId: req.user?.careUnitId ?? null, requestId, requestSource: 'http' }, done)` to thread the rest of the request lifecycle through the ALS scope.

**Analog B (req.user shape to copy from):** `apps/api/src/auth/requireSession.ts` lines 54-62
```typescript
req.user = {
  id: user.id,
  role: user.role,
  careUnitId: session.careUnitId,
  name: user.name,
  email: user.email,
  sessionId,
};
```

**Plugin ordering note:** Per CONTEXT.md `<code_context>` lines 224, register the plugin AFTER `cookiesPlugin` but BEFORE the routes. CONTEXT.md flags an ambiguity: either (a) a single onRequest that seeds requestId + ALS scope, then `requireSession` populates `req.user` and a `preHandler` updates the ALS store with the actor, or (b) a two-hook approach. The plan chooses one (recommend a: single onRequest creates the empty store; `requireSession` updates `als.getStore()!.actorUserId` after auth — keeps the ALS scope alive for the whole request).

---

### `apps/api/src/services/audit.service.ts` (service, read-only CRUD)

**Analog:** `apps/api/src/services/order.service.ts` lines 216-242 (`listOrdersForUnit`)

**Read-only service function** (D-16 exception per CONTEXT.md `<decisions>` D-16 carry-over):
```typescript
export async function listOrdersForUnit(
  careUnitId: string,
  filters: OrderListQuery,
): Promise<OrderListResponse> {
  const rows = await prisma.order.findMany({
    where: {
      careUnitId,
      status: Array.isArray(filters.status) ? { in: filters.status } : filters.status,
      deletedAt: null,
    },
    include: {
      lines: { select: { id: true, quantity: true } },
      createdBy: { select: { id: true, name: true } },
      // Phase 4 D-84 — actor fields for non-utkast tab columns.
      submittedBy: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, name: true } },
      deliveredBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    rows: rows.map(toOrderListItem),
    total: rows.length,
  };
}
```

**Apply to Phase 5 — but DELIBERATELY OMIT `careUnitId` first arg** (D-16 exception per CONTEXT.md `<canonical_refs>` Phase 1 D-16 note + `<code_context>` Established Patterns). Document the exception in the file header verbatim:
```typescript
/**
 * Phase 5 D-16 EXCEPTION — Admin reads cross-tenant; no careUnitId scope.
 *
 * Every other service file in this repo takes careUnitId as the FIRST arg
 * (D-16 / Pattern D). audit.service.ts is the documented exception:
 * `/admin/audit` is an admin-only endpoint that surfaces ALL events from
 * ALL vårdenheter (per <RoleRoute roles={['admin']}/>). Passing careUnitId
 * here would either be ignored (confusing) or restrict the view (wrong).
 * The route uses requirePermission('audit:read') — restricted to 'admin'.
 */
export async function listAuditEvents(
  filters: AuditEventListQuery,
): Promise<AuditEventListResponse> { … }
```

**Cursor pagination shape:** decode the base64 `{createdAt, id}` cursor, use it in the `where` clause as `OR: [{ createdAt: { lt: cursorAt } }, { createdAt: cursorAt, id: { lt: cursorId } }]`, sort `createdAt DESC, id DESC`, `take: limit + 1` to detect `hasMore`, encode the next cursor from the last returned row.

**Filter combobox source (`listAuditFilters`):** three `groupBy` queries (`actorUserId`, `entityType`, `action`) joined to `User` for the actor combobox. CONTEXT.md `<domain>` line 19 specifies cache-for-60s — implement as a module-level memo with TTL (the simplest shape; mirror the picker's `staleTime: 30_000` philosophy from `useOrderQueries.ts`).

---

### `apps/api/src/routes/audit/list.ts` (route, request-response)

**Analog:** `apps/api/src/routes/orders/list.ts`

**Full route shape** (lines 38-86):
```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { orderListQuery, orderListResponse } from '@meditrack/shared';
import { ORDER_STATUSES } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listOrdersForUnit } from '../../services/order.service.js';

export async function listOrdersRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders',
    {
      preHandler: [requireSession, requirePermission('order:read')],
      schema: {
        querystring: orderListQuery,
        response: { 200: orderListResponse },
      },
    },
    async (req) => {
      return listOrdersForUnit(req.user!.careUnitId, req.query);
    },
  );
}
```

**Apply to Phase 5** with substitutions:
- `'order:read'` → `'audit:read'`
- `orderListQuery` → `auditEventListQuery`
- `orderListResponse` → `auditEventListResponse`
- handler does NOT pass `req.user!.careUnitId` (D-16 exception); passes only `req.query`
- preHandler ORDER (`[requireSession, requirePermission(…)]`) is locked — **NEVER reorder** (D-15)

---

### `apps/api/src/routes/audit/filters.ts` (route, request-response)

**Analog:** `apps/api/src/routes/adminPing.ts` (no-body admin-only GET)

```typescript
export async function adminPingRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/admin/ping',
    {
      preHandler: [requireSession, requirePermission('admin:ping')],
      schema: { response: { 200: adminPingResponse } },
    },
    async () => ({
      pong: true as const,
      at: new Date().toISOString(),
    }),
  );
}
```

**Apply for `/api/audit/filters`:** identical scaffold with `'audit:read'`, returns `auditFiltersResponse` from shared, handler calls `listAuditFilters()` service.

---

### `apps/api/src/routes/audit/index.ts` (registrar)

**Analog:** `apps/api/src/routes/orders/index.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { createOrderRoute } from './create.js';
import { listOrdersRoute } from './list.js';
import { getOrderRoute } from './get.js';
// …

export async function orderRoutes(app: FastifyInstance) {
  await app.register(pickerOptionsRoute);
  await app.register(createOrderRoute);
  await app.register(listOrdersRoute);
  // …
}
```

**Apply** with:
```typescript
export async function auditRoutes(app: FastifyInstance) {
  await app.register(listAuditEventsRoute);
  await app.register(auditFiltersRoute);
  // (optional D-105/Claude's discretion) await app.register(getAuditEventRoute);
}
```

Registration order is not param-sensitive (no `:id` ↔ literal collision) so either order works.

---

### `apps/api/test/audit.integration.test.ts` (test, end-to-end)

**Analog:** `apps/api/test/orders.deliver.integration.test.ts`

**Test-suite header + setup pattern** (lines 1-48):
```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
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
```

**`progressOrderToBekraftad` helper to import as-is** (lines 115-145) — Phase 4's exact helper drives the end-to-end coverage test (CONTEXT.md `<domain>` line 23 test #1):
```typescript
async function progressOrderToBekraftad(
  nurseCookie: string,
  apotekareCookie: string,
  orderId: string,
  lineSpecs: Array<{ cumId: string; quantity: number }>,
): Promise<void> {
  for (const spec of lineSpecs) {
    const lineRes = await app.inject({ /* POST /lines */ });
    expect(lineRes.statusCode).toBe(200);
  }
  const submitRes = await app.inject({ /* POST /submit */ });
  expect(submitRes.statusCode).toBe(200);
  const confirmRes = await app.inject({ /* POST /confirm */ });
  expect(confirmRes.statusCode).toBe(200);
}
```

**Action for Phase 5 test #1 (end-to-end coverage):**
- Reuse `loginAs`, `captureSessionCookie`, `createEmptyOrder`, `findTestCareUnitMedication`, `progressOrderToBekraftad` verbatim.
- After `progressOrderToBekraftad` → POST /deliver, then `prisma.auditEvent.findMany({})` and assert the 1+N sibling shape (D-94): one `order.deliver` row + N `stock.increment` rows sharing one `requestId`.

**Action for Phase 5 test #2 (grep test):**
- `execFileSync('git', ['grep', '-nE', 'prisma\\.auditEvent\\.(update|delete|deleteMany|updateMany|upsert)\\b', 'apps', 'packages'])` — assert exit code 1 (no matches) per D-100.

**Action for Phase 5 test #3 (DB-layer test, D-100):**
- `await expect(prisma.$executeRawUnsafe("UPDATE audit_events SET action='hacked' WHERE id=$1", anyId)).rejects.toThrow(/permission denied/)`

**Action for Phase 5 tests #4-5:**
- `auth.login` redaction: log in via existing `loginAs` flow, then `prisma.auditEvent.findFirst({ where: { action: 'auth.login' } })`; assert `passwordHash` is not in the `after` JSON.
- Admin-only access: hit `/api/audit/events` as `sjukskoterska` (403), `apotekare` (403), `admin` (200). The 403 / 200 assertions mirror the `requirePermission` story exercised by `apps/api/test/admin.ping.test.ts`.

---

### `apps/api/prisma/schema.prisma` (modify)

**Analog:** existing `Order` model lines 179-227 + index style + multi-FK named-relation pattern.

**Order model + indexes** (lines 179-227):
```prisma
model Order {
  id String @id @default(cuid())

  careUnitId String
  careUnit   CareUnit @relation(fields: [careUnitId], references: [id])

  createdByUserId String
  createdBy       User   @relation(name: "OrderCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)

  status OrderStatus @default(utkast)

  submittedAt DateTime?
  submittedByUserId String?
  submittedBy       User?  @relation(name: "OrderSubmittedBy", fields: [submittedByUserId], references: [id], onDelete: Restrict)

  // …

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([careUnitId, status])
  @@index([careUnitId, createdAt])
  @@index([createdByUserId])
}
```

**For `AuditEvent`:** mirror the `id @id @default(cuid())` + `createdAt @default(now())` shape; declare 5 indexes from D-CONTEXT.md `<domain>` line 13; **omit FK on `actorUserId`** so deleting a user does NOT cascade-corrupt the audit log (just keep the String field). `before` and `after` are `Json?` (Prisma maps to Postgres `jsonb`).

---

### `apps/api/src/db/client.ts` (modify)

**Analog:** existing file (verbatim, with one new line).

Current shape (lines 9-13):
```typescript
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
```

**Modify to:**
```typescript
import { buildAuditExtension } from './auditExtension.js';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ … }).$extends(buildAuditExtension());
```

The 25+ existing import sites continue to work unchanged — the extended client has the same public surface (the existing services keep their `prisma.order.findUnique(…)` calls; the extension is transparent for reads).

---

### `apps/api/src/app.ts` (modify)

**Analog:** existing `buildApp` lines 29-63 (the plugin/route registration block).

```typescript
await app.register(errorHandlerPlugin);
await app.register(cookiesPlugin);

// Routes.
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(adminPingRoutes);
await app.register(medicationRoutes);
await app.register(orderRoutes);
await app.register(healthzRoutes);
```

**Modify (preserve order, insert two lines):**
- After `cookiesPlugin` register: `await app.register(requestContextPlugin);` (CONTEXT.md `<code_context>` line 224)
- After `orderRoutes`: `await app.register(auditRoutes);`

---

### `apps/api/src/auth/permissions.ts` (modify)

**Analog:** existing file lines 21-40.

```typescript
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
  'medication:read':   ['apotekare', 'sjukskoterska', 'admin'],
  // …
  'order:confirm': ['apotekare', 'admin'],
  'order:deliver': ['apotekare', 'admin'],
};
```

**Modify (one-line append):**
```typescript
  // Phase 5 D-15 — admin-only audit log read.
  'audit:read': ['admin'],
```

TypeScript exhaustiveness over `Record<ActionKey, Role[]>` forces this append the moment `'audit:read'` lands in `ACTION_KEYS` in shared (D-15 drift prevention).

---

### `apps/api/src/services/auth.service.ts` (modify)

**Analog:** existing `login()` function lines 38-73.

```typescript
export async function login(
  email: string,
  password: string,
): Promise<{ response: LoginResponse; sessionId: string }> {
  const user = await prisma.user.findUnique({ … });

  if (!user) {
    // T-01-06: still run a verify against the dummy hash to equalize timing.
    await verifyPassword(DUMMY_HASH_PLACEHOLDER, password);
    throw new InvalidCredentialsError();
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    throw new InvalidCredentialsError();
  }

  const session = await createSession(user.id, user.careUnitId);
  // …
}
```

**Modify (D-96 — two new audit-write call sites BEFORE each `throw new InvalidCredentialsError()`):**
- Inside `if (!user)`: write an `auth.login_failed` audit row with `actorUserId: null`, `entityType: 'session'`, `action: 'auth.login_failed'`, `before: null`, `after: { email }` (NO password).
- Inside `if (!ok)`: same shape, but `actorUserId: user.id` (we know who tried).

These two writes are the documented exceptions to the "Prisma extension does everything" purity per D-96 — they live right beside the `verifyPassword` failure paths, not in a new file.

---

### `apps/api/prisma/seed.ts` (modify)

**No pattern transplant** — only the header comment changes per D-92.

Existing seed file (lines 1-50) is structurally fine. Add to the header block:
```typescript
/**
 * Phase 5 D-92 — Seed runs OUTSIDE the AsyncLocalStorage request context,
 * so the Prisma audit extension naturally skips audit-row creation during
 * seed. The audit log starts empty on a fresh `docker compose up`; rows
 * appear only after the first real HTTP request (login, etc.).
 */
```

---

### `packages/shared/src/contracts/audit.ts` (new)

**Analog:** `packages/shared/src/contracts/order.ts` (full file)

**Per-mutation request body shape** (lines 149, 161, 178-184):
```typescript
export const createOrderRequest = z.object({}).strict();
export const confirmOrderRequest = z.object({}).strict().nullish();
export const addOrderLineRequest = z
  .object({
    careUnitMedicationId: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();
```

**Response envelope with nullable timestamps + nested actor objects** (lines 68-89):
```typescript
export const orderResponse = z.object({
  id: z.string(),
  careUnitId: z.string(),
  createdByUserId: z.string(),
  status: orderStatusEnum,
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
  // …
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineResponse),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  submittedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  // …
});
export type OrderResponse = z.infer<typeof orderResponse>;
```

**List query with default + clamped limit** (lines 122-128):
```typescript
export const orderListQuery = z.object({
  status: z.union([orderStatusEnum, z.array(orderStatusEnum)]).default('utkast'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
```

**Apply for `audit.ts`** — schemas to define (per CONTEXT.md `<domain>` and `<canonical_refs>` D-08 / Phase 1 D-08 mirror):
- `auditEventResponse`: id, actorUserId nullable, careUnitId nullable, entityType (string), entityId, action (string), before (`z.unknown().nullable()`), after (`z.unknown().nullable()`), requestId nullable, createdAt (datetime), plus a denormalized `actor: { id, name, email } | null` for the table render
- `auditEventListResponse`: `{ events: AuditEventResponse[], nextCursor: string | null }` (CONTEXT.md `<domain>` line 18)
- `auditEventListQuery`: actorUserId (cuid, optional), entityType (z.string, optional), action (z.string, optional), cursor (string, optional), limit (int 1-100 default 50)
- `auditFiltersResponse`: `{ users: {id, name, email}[], entityTypes: string[], actions: string[] }`

Mirror the `export type X = z.infer<typeof x>` pattern after every schema.

---

### `packages/shared/src/constants/auditAction.ts` (new)

**Analog:** `packages/shared/src/constants/orderStatus.ts` (full file, lines 1-19)

Identical structure: `as const` array → string-union type → `z.enum(...)` → `Record<X, string>` Swedish label map.

```typescript
import { z } from 'zod';

export const ORDER_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusEnum = z.enum(ORDER_STATUSES);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  utkast: 'Utkast',
  skickad: 'Skickad',
  bekraftad: 'Bekräftad',
  levererad: 'Levererad',
};
```

**Apply to Phase 5** with the action set from D-CONTEXT.md `<specifics>` lines 248 (the chip-label map) — note `action` is an **open** set per D-CONTEXT.md `<decisions>` D-104 footer ("Claude's discretion" → `action` as String not enum), so `z.string()` is the API boundary; the const-list is just for the FE's label-map exhaustiveness:

```typescript
export const AUDIT_ACTIONS = [
  'create', 'update', 'delete',
  'order.submit', 'order.confirm', 'order.deliver', 'order.softDelete',
  'stock.increment',
  'auth.login', 'auth.logout', 'auth.login_failed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Skapad',
  update: 'Uppdaterad',
  delete: 'Borttagen',
  'order.submit': 'Skickad',
  'order.confirm': 'Bekräftad',
  'order.deliver': 'Levererad',
  'order.softDelete': 'Borttagen (utkast)',
  'stock.increment': 'Lager ökat',
  'auth.login': 'Inloggad',
  'auth.logout': 'Utloggad',
  'auth.login_failed': 'Inloggning misslyckades',
};
```

Same file likely also exports `AUDIT_ENTITY_TYPES` + `AUDIT_ENTITY_TYPE_LABELS` for the entity-type chip (`<specifics>` line 247).

---

### `packages/shared/src/contracts/permissions.ts` (modify)

**Analog:** existing file lines 22-39.

Current `ACTION_KEYS` array:
```typescript
export const ACTION_KEYS = [
  'admin:ping',
  'medication:read',
  // …
  'order:confirm',
  'order:deliver',
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];
```

**Modify (one-line append):**
```typescript
  // Phase 5 D-15 — admin-only audit log read.
  'audit:read',
```

The TS exhaustiveness over `Record<ActionKey, Role[]>` in `apps/api/src/auth/permissions.ts` forces the BE-side append to compile.

---

### `apps/web/src/routes/admin/AuditPage.tsx` (REPLACES existing stub)

**Analog A (status-tab URL-as-state):** `apps/web/src/routes/bestallningar/BestallningarPage.tsx` lines 58-95
```typescript
export function BestallningarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawStatus = searchParams.get('status') ?? 'utkast';
  const status: StatusTab = isValidStatus(rawStatus) ? rawStatus : 'utkast';

  const draftsQuery = useDraftsQuery();
  const ordersQuery = useOrdersByStatusQuery(isNonUtkast(status) ? status : 'utkast');
  const activeQuery = status === 'utkast' ? draftsQuery : ordersQuery;

  useDocumentTitle('Beställningar — MediTrack');
  // …

  function handleTabChange(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('status', value);
      return next;
    });
  }
```

**Analog B (filter URL-merge pattern):** `apps/web/src/routes/lakemedel/LakemedelPage.tsx` lines 53-90 (`updateFilters` helper) — copy the merge-preserving `setSearchParams((prev) => { … })` shape to update one filter without clobbering others, mirroring D-CONTEXT.md `<decisions>` D-103 (three combobox values).

**Analog C (responsive table/card switch):** lines 220-250 of `BestallningarPage.tsx`:
```typescript
{!isLoading && rows.length > 0 && status === tabValue && tabValue !== 'utkast' && (
  <>
    <OrdersTable
      rows={rows}
      tab={tabValue}
      className="hidden md:block"
    />
    <OrdersCardList
      rows={rows}
      tab={tabValue}
      className="block md:hidden"
    />
  </>
)}
```

**Apply for Phase 5:**
- URL params: `?actor=…&entity=…&action=…&cursor=…` (D-103)
- Heading: `Granskningslogg` (D-CONTEXT.md `<specifics>`)
- Page calls `useAuditEventsQuery(filters)` (infinite query)
- Renders `<AuditFilterBar>`, then either `<AuditTable className="hidden md:block">` + `<AuditCardList className="block md:hidden">`
- Two empty states: `Inga händelser ännu` (no events at all) using `<EmptyStateCard icon={ShieldCheck} heading="Inga händelser ännu" />` (the existing stub component); `Inga händelser matchade filtren.` (filtered, no matches)
- "Läs in fler" button below the data — disabled when `!hasNextPage` per D-105

---

### `apps/web/src/routes/admin/AuditFilterBar.tsx` (new)

**Analog:** `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` (full file)

**Three-control filter bar w/ combobox** (lines 134-247):
```typescript
return (
  <div className="flex flex-wrap items-center gap-2 py-3">
    {/* A. Search input — 200 ms debounce, UI-SPEC §8a */}
    <Input … />

    {/* B. ATC-kod combobox — shadcn Popover + Command, UI-SPEC §8b */}
    <div className="flex items-center gap-1">
      <Popover open={atcOpen} onOpenChange={setAtcOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[140px] justify-between" …>
            {atc || 'ATC-kod ▾'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Skriv ATC-prefix…" … />
            <CommandList>
              <CommandEmpty>Inget matchade.</CommandEmpty>
              <CommandGroup>
                {filteredSuggestions.map((prefix) => (
                  <CommandItem … onSelect={() => { onChange({ atc: prefix, page: 1 }); … }}>
                    {prefix}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
    {/* C. Form select — shadcn Select, UI-SPEC §8c */}
    <Select value={formSelectValue} onValueChange={handleFormChange}> … </Select>
    {/* D. Below-threshold chip … */}
  </div>
);
```

**Apply to Phase 5:**
- Three `Popover` + `Command` comboboxes left-to-right: `Användare`, `Entitetstyp`, `Åtgärd` (D-CONTEXT.md `<specifics>` line 238 vocab)
- Combobox source: `useAuditFiltersQuery()` (mirror `usePickerOptionsQuery` shape from `useOrderQueries.ts`)
- Clear-all button labelled `Rensa filter` (D-CONTEXT.md `<specifics>`)
- Drop the debounced search input (CONTEXT.md `<decisions>` D-103 — no free-text omnibox in v1)
- onChange emits a flat patch object the page merges into the URL via `setSearchParams((prev) => …)` (LakemedelFilter's pattern)

---

### `apps/web/src/routes/admin/AuditTable.tsx` (new)

**Analog:** `apps/web/src/routes/bestallningar/OrdersTable.tsx`

**Header style + row click affordance** (lines 100-167):
```typescript
return (
  <div className={`overflow-x-auto ${className ?? ''}`}>
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {timeHeader}
          </TableHead>
          {/* … */}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.id}
            tabIndex={0}
            aria-label={`Öppna beställning från ${formatRelative(relevantAt)}`}
            onClick={() => navigate(`/bestallningar/${row.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/bestallningar/${row.id}`);
              }
            }}
            className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <TableCell className="px-4 py-3 text-sm font-normal">
              {formatRelative(relevantAt)}
            </TableCell>
            {/* … */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
```

**Apply to Phase 5:**
- Columns from D-CONTEXT.md `<decisions>` D-102: `Tid` (relative + tooltip), `Användare` (actor.name + RoleBadge), `Entitet` (entity-type chip + entityId.slice(0,8)), `Åtgärd` (action chip), `Diff` (brief summary)
- **Difference from OrdersTable:** `onClick` toggles row-expand state (not navigation). The page owns the `expandedId` state; the table calls `onRowClick(row)` so the page can update state and conditionally render `<AuditDiffPanel>` immediately below the expanded `<TableRow>`.
- Keyboard a11y: Enter / Space toggles expand (mirrors OrdersTable's Enter / Space → navigate)
- A11y label: `Visa detaljer` (D-CONTEXT.md `<decisions>` line 110 / `<specifics>`)
- Tooltip on time cell — wrap `formatRelative(createdAt)` in shadcn `<Tooltip>` showing ISO timestamp on hover

---

### `apps/web/src/routes/admin/AuditCardList.tsx` (new)

**Analog:** `apps/web/src/routes/bestallningar/OrdersCardList.tsx`

**Card anatomy + button-as-row** (lines 77-119):
```typescript
return (
  <div className={`grid gap-3 ${className ?? ''}`}>
    {rows.map((row) => (
      <button
        key={row.id}
        type="button"
        aria-label={`Öppna beställning från ${formatRelative(relevantAt)}`}
        onClick={() => navigate(`/bestallningar/${row.id}`)}
        className="w-full text-left bg-card border border-border rounded-lg p-4 shadow-sm
                   cursor-pointer hover:bg-muted/30 focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      >
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
        <p className="text-xs text-muted-foreground mb-1">
          {actorLabel} {actorName}
        </p>
        {/* … */}
      </button>
    ))}
  </div>
);
```

**Apply to Phase 5:**
- Card top: relative time + actor RoleBadge + chevron (rotated 90° when expanded; copy the chevron-rotate idiom from BestallningarPage's expand affordance or use a `ChevronDown`/`ChevronUp` toggle)
- Card middle: entity-type chip + entityId.slice(0,8) + action chip
- Tap-to-expand reveals `<AuditDiffPanel>` inline (mobile-equivalent of the desktop row-expand)
- Same a11y story as `OrdersCardList.tsx` (full card is a `<button>`)

---

### `apps/web/src/routes/admin/AuditDiffPanel.tsx` (new, first-of-kind)

**Analog:** shadcn `<Table>` from `apps/web/src/components/ui/table.tsx` — there's no diff-panel precedent in the repo.

**Inputs:** `before: unknown`, `after: unknown` JSON objects (allowlist-filtered server-side).

**Algorithm** (D-CONTEXT.md `<decisions>` D-104 / `<domain>` line 20):
1. If `before === null && after !== null` (CREATE) → render only `Efter` column with every key.
2. If `before !== null && after === null` (DELETE) → render only `Före` column with every key.
3. Otherwise (UPDATE) → compute `changedKeys = keys.filter(k => !deepEqual(before[k], after[k]))`; render only those keys with both `Före` and `Efter`.

**Table shape** (use the same `<Table>` / `<TableHeader>` / `<TableBody>` / `<TableRow>` / `<TableCell>` primitives the `OrdersTable.tsx` analog uses):
- Column headers: `Fält | Före | Efter` (D-CONTEXT.md `<specifics>`)
- Header row gets the same `text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50` styling as OrdersTable's header
- Value cells render JSON values as monospace text via `<code>` or `<pre>` for clarity
- If the audit event has a `requestId`, render a header chip above the diff table:
  `<span className="...">Del av begäran {requestId.slice(-8)} · {count} händelser</span>`
  linking to `/admin/audit?requestId={requestId}` (D-CONTEXT.md `<specifics>` line 244)

> No copy-able diff component exists in the repo. The visual style is borrowed from the existing OrdersTable / OrdersCardList primitives; the diff algorithm is new and tested at the integration-test level (test #4 redaction).

---

### `apps/web/src/features/audit/useAuditEventsQuery.ts` (new)

**Analog:** `apps/web/src/features/orders/useOrderQueries.ts` (full file)

**Query key conventions + fetchJson + keepPreviousData** (lines 30-36, 54-62):
```typescript
export function useDraftsQuery() {
  return useQuery<OrderListResponse, ApiError>({
    queryKey: ['orders', { status: 'utkast' }],
    queryFn: () => fetchJson<OrderListResponse>('/api/orders?status=utkast'),
    placeholderData: keepPreviousData,
  });
}

export function useOrdersByStatusQuery(status: OrderStatus | OrderStatus[] | 'alla') {
  const statusKey = Array.isArray(status) ? status.join(',') : status;
  return useQuery<OrderListResponse, ApiError>({
    queryKey: ['orders', { status: statusKey }],
    queryFn: () =>
      fetchJson<OrderListResponse>(`/api/orders?status=${encodeURIComponent(statusKey)}`),
    placeholderData: keepPreviousData,
  });
}
```

**Differences for Phase 5 (D-CONTEXT.md `<decisions>` D-105):**
- Use `useInfiniteQuery` not `useQuery` — first use of `useInfiniteQuery` in this repo. Pattern:
  ```typescript
  return useInfiniteQuery<AuditEventListResponse, ApiError>({
    queryKey: ['audit', 'events', filters],
    queryFn: ({ pageParam }) => fetchJson<AuditEventListResponse>(
      `/api/audit/events?${buildQuery(filters, pageParam)}`,
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  ```
- Sibling hook `useAuditFiltersQuery()` is a plain `useQuery` with `staleTime: 60_000` (mirror `usePickerOptionsQuery` from `useOrderQueries.ts` line 103 — staleTime is the established API for "cache for X ms")
- Query key convention from `<canonical_refs>` Phase 3 D-69: `['audit', 'events', filters]` for the infinite query; `['audit', 'filters']` for the combobox source

---

### `.eslintrc.cjs` (new, first-of-kind for the repo)

**No analog** — this repository has no existing ESLint config (verified via `Glob` — only `node_modules` matches exist). Phase 5 introduces the first lint config in the project.

**Action for the plan (D-99):**
1. Create a root `.eslintrc.cjs` (or `eslint.config.js` flat config — D-99 says "or wherever the workspace ESLint config lives", so Claude picks; recommend `.eslintrc.cjs` because the rule pattern in the decision uses the classic config string and CONTEXT.md `<canonical_refs>` line 174 calls out `.eslintrc.cjs`).
2. Configure parser for TS (`@typescript-eslint/parser`) — add the dev dependency on the apps/api and apps/web `devDependencies` blocks.
3. Add the rule from D-99 verbatim:
   ```js
   'no-restricted-syntax': ['error',
     {
       selector: "MemberExpression[object.property.name='auditEvent'][property.name=/^(update|updateMany|delete|deleteMany|upsert)$/]",
       message: 'audit_events is append-only — see Phase 5 D-98. Use prisma.auditEvent.create only.',
     },
     // …also banning destructured access per D-99
   ],
   ```
4. Add `"lint": "eslint ."` to root `package.json` `scripts` (currently has only `dev`/`build`/`test`/`db:migrate`/`db:seed` per the package.json read).
5. CI gate: the integration test #2 (grep) is the runtime equivalent; ESLint is the dev-loop equivalent.

> Tooling churn note: creating an ESLint config without the corresponding parser + plugin dev-deps would break `pnpm lint`. The plan must batch `pnpm add -D -W eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin` (or equivalent) into the same slice.

---

## Shared Patterns

### Permission map drift prevention (D-15)
**Source:** `packages/shared/src/contracts/permissions.ts` lines 22-39 + `apps/api/src/auth/permissions.ts` lines 21-40
**Apply to:** every new permission key (Phase 5 adds exactly one: `'audit:read'`)

```typescript
// shared:
export const ACTION_KEYS = [
  'admin:ping', 'medication:read', /* … */ 'order:deliver',
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

// BE:
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
  // …
};
```

The TS exhaustiveness over `Record<ActionKey, Role[]>` is the compile-time guarantee — appending to `ACTION_KEYS` without updating `PERMISSIONS` breaks the build.

### Route preHandler ordering (D-15, locked)
**Source:** every Phase 1-4 route — e.g. `apps/api/src/routes/orders/list.ts` line 76, `apps/api/src/routes/orders/confirm.ts` line 28, `apps/api/src/routes/medications/list.ts` line 27.
**Apply to:** every new route in Phase 5

```typescript
preHandler: [requireSession, requirePermission('audit:read')],
```

**NEVER reorder.** `requireSession` decorates `req.user`; `requirePermission` reads `req.user.role`. Reorder = security bug.

### Zod type provider + schema-driven validation/serialization (Pattern B + F)
**Source:** every Phase 1-4 route file
**Apply to:** `audit/list.ts`, `audit/filters.ts`

```typescript
const r = app.withTypeProvider<ZodTypeProvider>();
r.get('/api/audit/events', {
  preHandler: [requireSession, requirePermission('audit:read')],
  schema: {
    querystring: auditEventListQuery,
    response: { 200: auditEventListResponse },
  },
}, async (req) => { … });
```

### Canonical error envelope reuse (D-19)
**Source:** `apps/api/src/plugins/errorHandler.ts` lines 22-67 (existing error classes), 160-231 (handler chain)
**Apply to:** Phase 5 introduces **NO new error codes** (per CONTEXT.md `<canonical_refs>` D-19). Reuse:
- `UnauthenticatedError` (401) — from `requireSession`
- 403 forbidden envelope — sent directly by `requirePermission`
- Zod 400 `validation_failed` — automatic via `setValidatorCompiler(validatorCompiler)`

### Service-layer Prisma access with `careUnitId` first (D-16)
**Source:** every service in `apps/api/src/services/*.ts` (except `auth.service.ts` — its `login` doesn't take careUnitId because no user is resolved yet)
**Apply to:** **EXCEPTION** — `audit.service.ts` deliberately does NOT take `careUnitId` first (admin is cross-tenant); document the exception in the file header. Mirror the existing `auth.service.ts` documented-exception style at the top of `audit.service.ts` (`auth.service.ts` lines 9-26).

### URL-as-state for filters (D-39, D-42, D-82)
**Source:** `apps/web/src/routes/lakemedel/LakemedelPage.tsx` lines 53-90 + `apps/web/src/routes/bestallningar/BestallningarPage.tsx` lines 86-95
**Apply to:** `AuditPage.tsx` — three filter combobox values (actor, entity, action) + cursor live in the URL; `useSearchParams` is the source of truth.

### Responsive switch (md+ table / <md cards) (D-10, D-82)
**Source:** `BestallningarPage.tsx` lines 220-250 (`hidden md:block` / `block md:hidden` on the table/card pair)
**Apply to:** `AuditPage.tsx` renders `<AuditTable className="hidden md:block">` + `<AuditCardList className="block md:hidden">`. Same Tailwind responsive idiom.

### TanStack Query key conventions (D-69)
**Source:** `apps/web/src/features/orders/useOrderQueries.ts` lines 30-115
**Apply to:** Phase 5 query keys per D-CONTEXT.md `<canonical_refs>` D-69:
- `['audit', 'events', filters]` — infinite query
- `['audit', 'filters']` — combobox source

### Integration-test harness (Pattern O)
**Source:** `apps/api/test/helpers/buildTestApp.ts` + `apps/api/test/orders.deliver.integration.test.ts` lines 1-145
**Apply to:** `audit.integration.test.ts` — reuse `buildTestApp`, `ensureAllRolesSeeded`, `resetSessions`, `TEST_SJUKSKOTERSKA`, `TEST_APOTEKARE`, `TEST_ADMIN`, `loginAs`, `captureSessionCookie`, `createEmptyOrder`, `findTestCareUnitMedication`, `progressOrderToBekraftad` verbatim (they are exported / imported across the existing integration tests already).

### `EmptyStateCard` reuse for stub states
**Source:** `apps/web/src/components/EmptyStateCard.tsx`
**Apply to:** `AuditPage.tsx` empty-list state — `<EmptyStateCard icon={ShieldCheck} heading="Inga händelser ännu" />` (existing component, but the body text says `Den här vyn fylls i nästa fas.` — Phase 5 likely needs a variant accepting a body prop, or the page renders its own card with the bespoke `<specifics>` copy `Händelser visas här när någon ändrar något i systemet.`). Note for the planner: either widen `EmptyStateCard` (one optional `body` prop) OR render an inline equivalent card; both are acceptable.

---

## No Analog Found

Files / patterns with no direct precedent in Phase 1-4. Planner uses RESEARCH.md / CONTEXT.md decisions directly:

| File / pattern | Reason |
|---|---|
| `0008_audit_events_revoke_grants/migration.sql` (GRANT/REVOKE) | No GRANT/REVOKE migration exists in the repo; D-98 is first-of-kind. |
| `auditExtension.ts` (Prisma `$extends` middleware) | No existing `$extends` use; first-of-kind ORM extension. |
| `requestContext.ts` (AsyncLocalStorage onRequest hook) | No ALS use in the codebase; first-of-kind plugin. |
| `AuditDiffPanel.tsx` (key/before/after diff table) | No diff-panel precedent; new component built atop the existing `<Table>` primitive. |
| `useInfiniteQuery` (TanStack) | All existing TanStack hooks use `useQuery`/`useMutation`; first use of `useInfiniteQuery` (CONTEXT.md `<code_context>` line 203 confirms this explicitly). |
| `.eslintrc.cjs` | No ESLint config exists; first-of-kind tooling addition. |

---

## Metadata

**Analog search scope:**
- `apps/api/prisma/migrations/**`
- `apps/api/src/{db,plugins,auth,routes,services}/**`
- `apps/api/test/**`
- `apps/web/src/{components,features,routes}/**`
- `packages/shared/src/{contracts,constants}/**`

**Pattern extraction date:** 2026-05-22
**Phase config:** `.planning/config.json` (per-phase research disabled — pattern map is the only inter-discuss/plan artifact for Phase 5)
