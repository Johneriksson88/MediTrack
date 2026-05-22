# Phase 4: Confirm, Deliver & Stock - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 19 new/modified
**Analogs found:** 19 / 19 (100% — every new file extends an existing peer)

Every file in this phase has a verbatim analog in the Phase 1/2/3 codebase. The single genuinely new pattern is the **CUM batch lock** (`SELECT … FROM "CareUnitMedication" WHERE id = ANY($1) ORDER BY id FOR UPDATE`) inside `deliverOrder`'s transaction (D-79). The closest existing reference for it is the Order-row `$queryRaw … FOR UPDATE` lock in `submitOrder` step 0, which the deliver path also reuses verbatim for the Order-row lock half.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/schema.prisma` (4 cols + 2 relations on `Order`, 2 inverse fields on `User`) | prisma-schema | DDL | existing `submittedAt/By` pair on `Order` (line 187-194) | exact |
| `apps/api/prisma/migrations/0006_order_confirm_deliver/migration.sql` | prisma-migration | DDL | `20260521203032_0004_order_flow_drafts/migration.sql` | exact |
| `apps/api/src/plugins/errorHandler.ts` (add `OrderTransitionError` class + 409 branch; widen `ValidationFailedError.details.reason`) | error-class | request-response | `OrderLockedError` (lines 77-85) + 409 branch (line 144-146) | exact |
| `packages/shared/src/contracts/order.ts` (widen `orderResponse`, `orderListItem`, `orderListQuery`; add `confirmOrderRequest`, `deliverOrderRequest`) | shared-contract | request-response | existing `orderResponse` / `orderListItem` / `createOrderRequest` shapes | exact |
| `packages/shared/src/contracts/permissions.ts` (append `'order:confirm'`, `'order:deliver'` to `ACTION_KEYS`) | shared-contract | RBAC | existing `'order:submit'` / `'order:delete'` entries (lines 33-35) | exact |
| `apps/api/src/auth/permissions.ts` (append two entries to `PERMISSIONS`) | rbac-map | RBAC | existing `'order:submit'` entry (line 35) | exact |
| `apps/api/src/services/order.service.ts` (add `confirmOrder`, `deliverOrder`; widen `listOrdersForUnit`) | service | mutation+lock | existing `submitOrder` (lines 359-446) | exact |
| `apps/api/src/routes/orders/confirm.ts` | api-route | request-response | `apps/api/src/routes/orders/submit.ts` | exact |
| `apps/api/src/routes/orders/deliver.ts` | api-route | request-response | `apps/api/src/routes/orders/submit.ts` | exact |
| `apps/api/src/routes/orders/index.ts` (register two new routes) | api-route-barrel | DI/wiring | existing barrel (lines 27-35) | exact |
| `apps/api/src/routes/orders/list.ts` (widen query → comma-list status) | api-route | read-list | existing `list.ts` | exact |
| `apps/api/prisma/seed.ts` (`seedDraftOrder` → `seedDemoOrders` 4-status fan-out) | seed | batch | existing `seedDraftOrder` (lines 340-423) | exact |
| `apps/api/test/orders.deliver.integration.test.ts` | integration-test | request-response + mutation+lock | `apps/api/test/orders.integration.test.ts` (Slice 4 scenarios) | exact |
| `apps/web/src/components/ui/tabs.tsx` (NEW shadcn install) | ui-primitive | status-driven render | `apps/web/src/components/ui/alert-dialog.tsx` (precedent for shadcn install pattern) | role-match |
| `apps/web/src/routes/bestallningar/BestallningarPage.tsx` (add tabs, status query) | route-page | status-driven render | existing `BestallningarPage` drafts-list shape | exact |
| `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` (add Mode C/D/E branches) | route-page | status-driven render | existing Mode A/B `isUtkast` branches | exact |
| `apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx` (NEW; mirrors discard) | feature-component | event-driven | `DiscardDraftDialog.tsx` | exact |
| `apps/web/src/features/orders/useOrderMutations.ts` (add `useConfirmOrder`, `useDeliverOrder`) | tanstack-hook | mutation | existing `useSubmitOrder` (lines 238-263) | exact |
| `apps/web/src/features/orders/useOrderQueries.ts` (add `useOrdersByStatusQuery` OR widen `useDraftsQuery`) | tanstack-hook | read-list | existing `useDraftsQuery` (lines 29-35) | exact |

---

## Pattern Assignments

### `apps/api/src/services/order.service.ts` — `confirmOrder` and `deliverOrder` (service, mutation+lock)

**Analog:** `submitOrder` in `apps/api/src/services/order.service.ts` (lines 359-446)

**Imports pattern** (already in file, no changes needed):
```typescript
import { prisma } from '../db/client.js';
import {
  NotFoundError,
  OrderLockedError,
  ValidationFailedError,
} from '../plugins/errorHandler.js';
```
Plus a new import for the Phase 4 error class:
```typescript
import { OrderTransitionError } from '../plugins/errorHandler.js';
```

**Mutating-function signature pattern (D-16: careUnitId first, actor last)** — from `submitOrder` (lines 359-363):
```typescript
export async function submitOrder(
  careUnitId: string,
  orderId: string,
  actorUserId: string,
): Promise<OrderResponse> {
```
Verbatim shape for the two new functions:
```typescript
export async function confirmOrder(careUnitId: string, orderId: string, actorUserId: string): Promise<OrderResponse>
export async function deliverOrder(careUnitId: string, orderId: string, actorUserId: string): Promise<OrderResponse>
```

**Transaction template (D-54 / D-79 step 5)** — `submitOrder` lines 364-446 is the literal template for `confirmOrder`. Copy the entire `$transaction` block; change only:
- step 0 `$queryRaw FOR UPDATE` stays unchanged
- step 3 status pre-check: `'utkast'` → `'skickad'`
- step 4 D-56 line validation: KEEP for `confirmOrder` (defense-in-depth — confirmed orders also shouldn't have zero lines; the lines were validated at submit, but the lock window means a fresh re-read is cheap insurance) OR drop with a comment that submit already validated. Recommend KEEP for symmetry.
- step 5 `updateMany` data: `submittedAt/By` → `confirmedAt/By`; `'utkast' → 'skickad'` becomes `'skickad' → 'bekraftad'`
- step 5 `count === 0` throw: `OrderLockedError({ status: 'skickad' })` → `OrderTransitionError({ from: order.status, to: 'bekraftad', expected: 'skickad' })`

**Order-row lock excerpt** (lines 365-378, reuse verbatim in BOTH confirmOrder and deliverOrder):
```typescript
const result = await prisma.$transaction(async (tx) => {
  // Step 0 — CR-02: lock the Order row FOR UPDATE so concurrent line
  // mutations (which call assertOrderEditable() inside their own tx) wait
  // until this submit commits. Without this, another tx in READ COMMITTED
  // isolation could observe status='utkast' AFTER this tx already read
  // the lines but BEFORE the UPDATE in step 5, attaching a line that
  // bypassed step 4 validation to a freshly-Skickad order. The schema
  // comment on Order (line 119, "Phase 4 adds SELECT … FOR UPDATE")
  // promised this; CR-02 implements it ahead of Phase 4's stock-lock
  // (STK-02), since the same race already affects Phase 3 submits.
  //
  // $queryRaw with a tagged template parameterises ${orderId} safely.
  // If the row doesn't exist the SELECT returns 0 rows — step 2 below
  // catches it and throws NotFoundError.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
```

**Atomic UPDATE-with-precondition excerpt** (lines 413-426) — for confirmOrder, change `'utkast' → 'skickad'` to `'skickad' → 'bekraftad'`:
```typescript
// Step 5 — Atomic UPDATE with status precondition (D-54).
const updated = await tx.order.updateMany({
  where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null },
  data: {
    status: 'skickad',
    submittedAt: new Date(),
    submittedByUserId: actorUserId,
  },
});

// count === 0 means a race condition — another request submitted first.
if (updated.count === 0) {
  throw new OrderLockedError({ status: 'skickad' });
}
```

**Final reload + return excerpt** (lines 428-445) — verbatim for both confirm/deliver:
```typescript
// Step 6 — Return the full updated order.
const final = await tx.order.findUnique({
  where: { id: orderId },
  include: {
    lines: {
      include: {
        careUnitMedication: { include: { medication: true } },
      },
    },
    createdBy: { select: { id: true, name: true } },
    submittedBy: { select: { id: true, name: true } },
  },
});

return final!;
});

return toOrderResponse(result);
```
**Important:** Phase 4 must widen the `include` to add `confirmedBy: { select: { id: true, name: true } }` and `deliveredBy: { select: { id: true, name: true } }` (mirrors the existing `submittedBy` include), AND `toOrderResponse` (lines 66-82) must be widened with `confirmedAt/By/By-name` and `deliveredAt/By/By-name` fields.

---

### `deliverOrder` — CUM-batch lock (D-79) — NEW PATTERN, no in-repo analog yet

**Reference for the Order-row-lock half:** `submitOrder` step 0 (the `$queryRaw … FOR UPDATE` block above) is reused verbatim.

**Reference for the CUM-batch lock:** No analog. This is the novel pattern this phase introduces. CONTEXT.md D-79 prescribes the exact shape:

```typescript
// Pseudo-template — implement inside deliverOrder's $transaction:

// Step A — Order-row lock (verbatim from submitOrder step 0)
await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

// Step B — Load order with lines + nested CUMs (need CUM deletedAt for D-81)
const order = await tx.order.findUnique({
  where: { id: orderId },
  include: {
    lines: { include: { careUnitMedication: true } },
  },
});

// Step C — Existence + scope check (D-73, mirrors submitOrder step 2)
if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
  throw new NotFoundError('Beställningen hittades inte.');
}

// Step D — Status precondition (D-76 — must be 'bekraftad')
if (order.status !== 'bekraftad') {
  throw new OrderTransitionError({
    from: order.status,
    to: 'levererad',
    expected: 'bekraftad',
  });
}

// Step E — D-81: 422 medication_removed if any CUM soft-deleted
for (const line of order.lines) {
  if (line.careUnitMedication.deletedAt !== null) {
    throw new ValidationFailedError(
      'Läkemedlet har tagits bort.',
      { reason: 'medication_removed', medicationName: line.careUnitMedication.medication.name },
    );
  }
}

// Step F — D-79: aggregate same-CUM lines, lock once
const byCum = new Map<string, number>();
for (const line of order.lines) {
  byCum.set(
    line.careUnitMedicationId,
    (byCum.get(line.careUnitMedicationId) ?? 0) + line.quantity,
  );
}
const sortedCumIds = [...byCum.keys()].sort();  // sorted-id ordering = deadlock prevention

// Step G — D-79: SELECT … FOR UPDATE on the batch in sorted order.
// Prisma $queryRaw with ANY() — Postgres-native, parameter-safe.
await tx.$queryRaw`
  SELECT id FROM "CareUnitMedication"
  WHERE id = ANY(${sortedCumIds}::text[])
  ORDER BY id
  FOR UPDATE
`;

// Step H — One Prisma update per CUM (still inside the tx).
for (const [cumId, qty] of byCum) {
  await tx.careUnitMedication.update({
    where: { id: cumId },
    data: { currentStock: { increment: qty } },
  });
}

// Step I — Atomic Order UPDATE with status precondition (mirrors submitOrder step 5).
const updated = await tx.order.updateMany({
  where: { id: orderId, careUnitId, status: 'bekraftad', deletedAt: null },
  data: {
    status: 'levererad',
    deliveredAt: new Date(),
    deliveredByUserId: actorUserId,
  },
});

if (updated.count === 0) {
  // Race: another deliver landed between our load and our UPDATE.
  throw new OrderTransitionError({
    from: 'levererad',  // best-effort — reload if accuracy matters
    to: 'levererad',
    expected: 'bekraftad',
  });
}

// Step J — Reload + return (verbatim from submitOrder step 6, with widened include).
```

**Why `{ increment: qty }`:** Prisma's atomic-increment operator generates `SET "currentStock" = "currentStock" + $1` SQL. Combined with the `FOR UPDATE` lock on the same row, this is the textbook "lock-then-update" pattern. D-78 prescribes ADDITION (replenishment), not subtraction.

**Why `$queryRaw` with `::text[]` for the batch lock:** `prisma.careUnitMedication.findMany({ where: { id: { in: [...] } } })` does NOT acquire row locks in Prisma; only raw `FOR UPDATE` does. The `::text[]` cast is needed because `${sortedCumIds}` interpolates as `text[]` not `String[]`.

---

### `apps/api/src/services/order.service.ts` — `listOrdersForUnit` widening (service, read-list)

**Analog:** existing `listOrdersForUnit` (lines 181-202).

**Current shape** (line 188):
```typescript
where: {
  careUnitId,
  status: filters.status,
  deletedAt: null,
},
```

**Widened shape (Phase 4)** — accept single status OR array:
```typescript
where: {
  careUnitId,
  status: Array.isArray(filters.status) ? { in: filters.status } : filters.status,
  deletedAt: null,
},
```
The shared contract `orderListQuery.status` is widened to `z.union([orderStatusEnum, z.array(orderStatusEnum)])` with a route-level `?status=skickad,bekraftad` comma-list pre-parser (split + `orderStatusEnum.parse` per token).

**`include` widening for the actor columns** — current include (line 192-194):
```typescript
include: {
  lines: { select: { id: true, quantity: true } },
  createdBy: { select: { id: true, name: true } },
},
```
**Widened** — add `submittedBy`, `confirmedBy`, `deliveredBy` so `OrderListItem` can render the right actor for the right tab:
```typescript
include: {
  lines: { select: { id: true, quantity: true } },
  createdBy: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  deliveredBy: { select: { id: true, name: true } },
},
```
`toOrderListItem` (lines 112-121) widens with the three optional fields.

---

### `apps/api/src/routes/orders/confirm.ts` (api-route, request-response)

**Analog:** `apps/api/src/routes/orders/submit.ts` (entire file).

**Verbatim template** — copy `submit.ts` and change four tokens:

```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { submitOrder } from '../../services/order.service.js';

/**
 * POST /api/orders/:id/submit — submit a draft order (Utkast → Skickad).
 * [docblock referencing D-54, D-56, D-49, D-57]
 */
export async function submitOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/orders/:id/submit',
    {
      preHandler: [requireSession, requirePermission('order:submit')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return submitOrder(req.user!.careUnitId, req.params.id, req.user!.id);
    },
  );
}
```

**Token map for `confirm.ts`:**
- `submitOrder` → `confirmOrder`
- `/api/orders/:id/submit` → `/api/orders/:id/confirm`
- `'order:submit'` → `'order:confirm'`
- `submitOrderRoute` → `confirmOrderRoute`
- Update docblock to reference D-74/D-75/D-84.

**Token map for `deliver.ts`:** same, with `confirm` → `deliver`, `order:confirm` → `order:deliver`, and docblock references D-78/D-79/D-81.

**preHandler ordering rule (D-15):** `[requireSession, requirePermission(...)]` — NEVER reorder. requireSession decorates `req.user`; requirePermission reads `req.user.role`.

---

### `apps/api/src/routes/orders/index.ts` — register new routes (api-route-barrel)

**Analog:** existing barrel (lines 27-35).

**Current**:
```typescript
export async function orderRoutes(app: FastifyInstance) {
  await app.register(pickerOptionsRoute);
  await app.register(createOrderRoute);
  await app.register(listOrdersRoute);
  await app.register(getOrderRoute);
  await app.register(linesRoute);
  await app.register(submitOrderRoute);
  await app.register(deleteOrderRoute);
}
```

**Add (after submit):**
```typescript
  await app.register(confirmOrderRoute);
  await app.register(deliverOrderRoute);
```
**Ordering note from barrel comment:** `pickerOptions` must stay first to avoid `:id` greedy capture. Confirm/deliver are `/:id/confirm` and `/:id/deliver` — non-conflicting with `/:id/submit`. Register after `submitOrderRoute` for symmetry.

---

### `apps/api/src/plugins/errorHandler.ts` — `OrderTransitionError` class + 409 branch (error-class)

**Analog:** `OrderLockedError` (lines 77-85) + its 409 branch (lines 144-146).

**Class template** — clone `OrderLockedError`:
```typescript
export class OrderLockedError extends Error {
  readonly code = 'order_locked' as const;
  readonly details?: { status?: OrderStatus };
  constructor(details?: { status?: OrderStatus }) {
    super('Beställningen kan inte ändras efter att den skickats.');
    this.name = 'OrderLockedError';
    this.details = details;
  }
}
```

**New class (D-74 contract):**
```typescript
export class OrderTransitionError extends Error {
  readonly code = 'order_transition_invalid' as const;
  readonly details: { from: OrderStatus; to: OrderStatus; expected: OrderStatus };
  constructor(details: { from: OrderStatus; to: OrderStatus; expected: OrderStatus }) {
    super(`Beställningen kan inte gå från ${details.from} till ${details.to}.`);
    this.name = 'OrderTransitionError';
    this.details = details;
  }
}
```
Note: D-74 specifies the Swedish-labeled message rendered on the FE using `ORDER_STATUS_LABELS`. The BE default message can carry raw enum tokens (FE re-renders from `details.from/to`); the FE branch on `code` produces the user-facing copy. Alternatively, import `ORDER_STATUS_LABELS` from `@meditrack/shared` and label here. Recommend importing labels in the class for consistency with `OrderLockedError`'s already-localized message.

**setErrorHandler branch placement (D-56 precedent at line 144-146):**
```typescript
// Phase 3 D-56 — OrderLockedError (409) and ValidationFailedError (422) MUST
// be checked BEFORE the Zod branch so they are not swallowed by the generic
// 400 validation_failed fallthrough. D-56 explicitly maps ValidationFailedError
// to 422, overriding the Zod 400 for the submit path.
if (err instanceof OrderLockedError) {
  return send(reply, 409, envelope('order_locked', err.message, err.details));
}

if (err instanceof ValidationFailedError) {
  return send(reply, 422, envelope('validation_failed', err.message, err.details));
}
```

**Phase 4 addition — insert BEFORE the Zod branch, alongside the other two:**
```typescript
if (err instanceof OrderTransitionError) {
  return send(reply, 409, envelope('order_transition_invalid', err.message, err.details));
}
```

**`ValidationFailedError.details.reason` widening (D-81)** — current union (line 99):
```typescript
public readonly details?: { reason: 'empty_order' | 'invalid_quantity'; lineId?: string },
```
**Widened:**
```typescript
public readonly details?: {
  reason: 'empty_order' | 'invalid_quantity' | 'medication_removed';
  lineId?: string;
  medicationName?: string;  // populated when reason === 'medication_removed' (UI toast uses this)
},
```

---

### `packages/shared/src/contracts/order.ts` — widen response/list/query (shared-contract)

**Analog:** existing `orderResponse` (lines 68-81), `orderListItem` (lines 92-100), `orderListQuery` (lines 107-112), `createOrderRequest` (line 132).

**`orderResponse` widening (D-84)** — add four nullable trios:
```typescript
export const orderResponse = z.object({
  id: z.string(),
  careUnitId: z.string(),
  createdByUserId: z.string(),
  status: orderStatusEnum,
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
  // Phase 4 D-84 — new actor trios:
  confirmedAt: z.string().datetime().nullable(),
  confirmedByUserId: z.string().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  deliveredByUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineResponse),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  submittedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  // Phase 4 D-84 — denormalized actor names for the trail:
  confirmedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  deliveredBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
```

**`orderListItem` widening** — add three nullable actor refs for the per-tab columns:
```typescript
export const orderListItem = z.object({
  id: z.string(),
  status: orderStatusEnum,
  createdAt: z.string().datetime(),
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  // Phase 4 — actor + timestamp for the relevant transition's column (tab-dependent).
  submittedAt: z.string().datetime().nullable().optional(),
  submittedBy: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  confirmedAt: z.string().datetime().nullable().optional(),
  confirmedBy: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  deliveredAt: z.string().datetime().nullable().optional(),
  deliveredBy: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});
```

**`orderListQuery` widening** — accept single OR comma-list:
```typescript
export const orderListQuery = z.object({
  // Phase 4 — accept single status, comma-list ('skickad,bekraftad'), or array.
  // The route parses ?status=skickad,bekraftad into ['skickad','bekraftad'] before validation.
  status: z.union([orderStatusEnum, z.array(orderStatusEnum)]).default('utkast'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
```
**Route-level pre-parser** (in `list.ts`): before passing to the service, split `req.query.status` on comma if it's a string with `,`, then validate each token against `orderStatusEnum`. Fastify/Zod won't auto-split comma-lists — must be explicit.

**New request schemas (D-75)** — empty-body, mirrors `createOrderRequest`:
```typescript
export const confirmOrderRequest = z.object({}).strict();
export type ConfirmOrderRequest = z.infer<typeof confirmOrderRequest>;

export const deliverOrderRequest = z.object({}).strict();
export type DeliverOrderRequest = z.infer<typeof deliverOrderRequest>;
```

---

### `packages/shared/src/contracts/permissions.ts` + `apps/api/src/auth/permissions.ts` — RBAC widening (rbac-map)

**Analog:** existing `'order:submit'` / `'order:delete'` entries.

**shared `ACTION_KEYS` append** (after line 35):
```typescript
export const ACTION_KEYS = [
  // … existing keys …
  'order:read',
  'order:create',
  'order:update',
  'order:submit',
  'order:delete',
  // Phase 4 D-15 — confirm/deliver restricted to apotekare+admin.
  'order:confirm',
  'order:deliver',
] as const;
```

**BE `PERMISSIONS` append** (after line 36 — TS compile-time-enforced via `Record<ActionKey, Role[]>`):
```typescript
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  // … existing entries …
  'order:submit': ['apotekare', 'sjukskoterska', 'admin'],
  'order:delete': ['apotekare', 'sjukskoterska', 'admin'],
  // Phase 4 D-15 — apotekare workflow transitions; sjuksköterska is read-only on these.
  'order:confirm': ['apotekare', 'admin'],
  'order:deliver': ['apotekare', 'admin'],
};
```
**Why drift-prevention works (D-15):** TypeScript's `Record<ActionKey, Role[]>` requires every `ActionKey` to be a key in `PERMISSIONS`. Adding `'order:confirm'` to `ACTION_KEYS` without adding it here is a compile error. This is the core of D-15.

---

### `apps/api/prisma/schema.prisma` — add 4 columns + 2 relations on `Order` + 2 inverse fields on `User`

**Analog:** existing `submittedAt/By` pair (lines 187-194) and `User.submittedOrders` inverse (line 76).

**Existing `Order` columns to mirror** (lines 187-194):
```prisma
  /// D-49 — stamped by the submit transition; null while in utkast.
  submittedAt DateTime?

  /// D-49 — FK to the user who submitted; Restrict prevents deleting a user
  /// with historical Skickad orders. Named relation required by Prisma to
  /// disambiguate from createdBy (two FKs to User on the same model).
  submittedByUserId String?
  submittedBy       User?  @relation(name: "OrderSubmittedBy", fields: [submittedByUserId], references: [id], onDelete: Restrict)
```

**Phase 4 addition (D-84) — verbatim shape:**
```prisma
  /// Phase 4 D-84 — stamped by the confirm transition; null while in utkast/skickad.
  confirmedAt DateTime?

  /// Phase 4 D-84 — FK to the user who confirmed; Restrict preserves history.
  /// Named relation disambiguates from createdBy/submittedBy/deliveredBy.
  confirmedByUserId String?
  confirmedBy       User?  @relation(name: "OrderConfirmedBy", fields: [confirmedByUserId], references: [id], onDelete: Restrict)

  /// Phase 4 D-84 — stamped by the deliver transition; null until levererad.
  deliveredAt DateTime?

  /// Phase 4 D-84 — FK to the user who delivered; Restrict preserves history.
  deliveredByUserId String?
  deliveredBy       User?  @relation(name: "OrderDeliveredBy", fields: [deliveredByUserId], references: [id], onDelete: Restrict)
```

**`User` inverse fields** — current (line 76):
```prisma
  createdOrders   Order[] @relation("OrderCreatedBy")
  submittedOrders Order[] @relation("OrderSubmittedBy")
```
**Phase 4 addition:**
```prisma
  confirmedOrders Order[] @relation("OrderConfirmedBy")
  deliveredOrders Order[] @relation("OrderDeliveredBy")
```

**No new indexes** (D-13 boundary): `@@index([careUnitId, createdAt])` already covers history sort for all status tabs.

---

### `apps/api/prisma/migrations/0006_order_confirm_deliver/migration.sql`

**Analog:** `20260521203032_0004_order_flow_drafts/migration.sql` (especially the `CREATE TABLE "Order"` + `AddForeignKey` blocks for `submittedByUserId`).

**Reference FK block** (lines 66-67 of 0004 migration):
```sql
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Phase 4 migration body** (Prisma will auto-generate via `prisma migrate dev --name 0006_order_confirm_deliver`; the generated DDL will look like):
```sql
-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedByUserId" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "deliveredByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_confirmedByUserId_fkey"
  FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveredByUserId_fkey"
  FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```
Migration is additive; all four columns default to NULL on existing rows. No backfill needed (Phase 3 orders are utkast/skickad — these columns are correctly NULL for them).

**Migration timestamp directory name:** Prisma auto-prefixes with timestamp; D-13 recommends `0006_order_confirm_deliver` as the suffix for sortable ordering after 0004/0005. The full dirname will be `<timestamp>_0006_order_confirm_deliver`.

---

### `apps/api/prisma/seed.ts` — `seedDraftOrder` → `seedDemoOrders` (seed)

**Analog:** existing `seedDraftOrder` (lines 340-423).

**Idempotency-check pattern (D-85)** — current (lines 351-365):
```typescript
const existing = await prisma.order.findFirst({
  where: {
    careUnitId: sjukskoterska.careUnitId,
    createdByUserId: sjukskoterska.id,
    status: 'utkast',
    deletedAt: null,
  },
});

if (existing) {
  console.log('[seed] Draft order already exists — skipping (idempotent).');
  return;
}
```

**Phase 4 fan-out** — call `findFirst` keyed on `(careUnitId, createdByUserId, status, deletedAt: null)` once per status. Create function `seedDemoOrders(prisma)` that iterates `['utkast', 'skickad', 'bekraftad', 'levererad']`, building each order with the appropriate stamped columns:

- **Utkast** — `status: 'utkast'` (no stamps). Existing behavior.
- **Skickad** — `status: 'skickad', submittedAt: new Date(), submittedByUserId: sjukskoterska.id`.
- **Bekraftad** — submitted + `confirmedAt + confirmedByUserId: apotekare.id`. Apotekare lookup mirrors sjukskoterska lookup at line 341-343.
- **Levererad** — submitted + confirmed + `deliveredAt + deliveredByUserId: apotekare.id`. PLUS a post-step `UPDATE` on the three CUMs to add the line quantities to `currentStock` (mirrors the deliverOrder service's stock increment) — Claude's discretion per D-85 (alternative: bake into PRNG, but post-step is more transparent).

**Low-stock CUM selection** — reuse the existing 3-line low-stock picker (lines 367-403) for all four orders. The same 3 meds appear in each so the demo path stays predictable.

**Idempotency-skip console message** — match existing log format (line 363):
```typescript
console.log(`[seed] ${statusLabel} order already exists — skipping (idempotent).`);
```

---

### `apps/api/test/orders.deliver.integration.test.ts` (integration-test, request-response + mutation+lock)

**Analog:** `apps/api/test/orders.integration.test.ts` (entire file — Slice 4's `describe('Draft orders integration', () => …)` block at lines 592-937 is the literal template).

**Test harness imports (verbatim, lines 1-9):**
```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  ensureAllRolesSeeded,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';
```
Phase 4 also imports `TEST_APOTEKARE` (already exported from buildTestApp.ts line 144-150) for the confirm + deliver roles.

**Lifecycle hooks (verbatim, lines 33-47):**
```typescript
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

**Helpers (verbatim, lines 49-91):**
- `captureSessionCookie(setCookie)` — copy as-is.
- `loginAs({ email, password })` — copy as-is.
- `createEmptyOrder(cookie)` — copy as-is.
- `findTestCareUnitMedication()` — copy as-is.

**New helper `progressOrderToBekraftad(cookie, orderId, lineCount)` (D-87)** — composes existing helpers:
```typescript
async function progressOrderToBekraftad(
  cookie: string,
  apotekareCookie: string,
  orderId: string,
  cumId: string,
): Promise<void> {
  // Add line as sjukskoterska
  await app.inject({
    method: 'POST',
    url: `/api/orders/${orderId}/lines`,
    headers: { cookie },
    payload: { careUnitMedicationId: cumId, quantity: 2 },
  });
  // Submit as sjukskoterska
  await app.inject({ method: 'POST', url: `/api/orders/${orderId}/submit`, headers: { cookie } });
  // Confirm as apotekare
  await app.inject({ method: 'POST', url: `/api/orders/${orderId}/confirm`, headers: { cookie: apotekareCookie } });
}
```

**Test block 1 — full pipeline (mirrors lines 596-663 happy-path pattern):**
```typescript
it('happy path: create → submit → confirm → deliver, stock incremented + actor trail populated', async () => {
  const nurseCookie = await loginAs(TEST_SJUKSKOTERSKA);
  const apotekareCookie = await loginAs(TEST_APOTEKARE);
  const cum = await findTestCareUnitMedication();

  // Snapshot starting stock for verification
  const before = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });

  // POST /api/orders → 201
  const order = await createEmptyOrder(nurseCookie);
  // POST /api/orders/:id/lines → 200 with qty 2
  // POST /api/orders/:id/submit → 200 (status skickad)
  // POST /api/orders/:id/confirm → 200 (status bekraftad)
  // POST /api/orders/:id/deliver → 200 (status levererad)
  // … assertions: final status, every actor stamp populated, stock incremented by exact line totals

  const after = await prisma.careUnitMedication.findUnique({ where: { id: cum.id } });
  expect(after!.currentStock).toBe(before!.currentStock + 2);
});
```

**Test block 2 — concurrency (D-88 two-phase barrier with pg_locks proof):**
Imports the `deliverOrder` service function directly (bypassing `app.inject` per D-86):
```typescript
import { deliverOrder } from '../src/services/order.service.js';

it('two concurrent deliveries on same Bekraftad order: one commits, other gets 409, stock incremented exactly once', async () => {
  // Seed Bekraftad order via progressOrderToBekraftad
  // Acquire a gate (Promise + resolver)
  // Tx-A: prisma.$transaction(async tx => { await tx.$queryRaw…FOR UPDATE; await gate; … })
  // Tx-B: setTimeout 50ms, then call deliverOrder() directly
  // Poll pg_locks: SELECT 1 FROM pg_locks WHERE pid IN (…) AND granted = false
  // Resolve gate → tx-A commits
  // Await tx-B → expect OrderTransitionError with code 'order_transition_invalid'
  // Reload CUM stock → assert incremented exactly once (not twice)
});
```
**pg_locks polling reference query:**
```sql
SELECT mode, granted FROM pg_locks
JOIN pg_stat_activity USING (pid)
WHERE relation = (SELECT oid FROM pg_class WHERE relname = 'Order')
  AND mode = 'RowExclusiveLock'
```

**Toast/error assertion pattern (mirrors line 700-704):**
```typescript
expect(res.statusCode).toBe(409);
const body = res.json() as { error: { code: string; details: { from: string; to: string; expected: string } } };
expect(body.error.code).toBe('order_transition_invalid');
expect(body.error.details.expected).toBe('bekraftad');
```

---

### `apps/web/src/features/orders/useOrderMutations.ts` — `useConfirmOrder`, `useDeliverOrder` (tanstack-hook, mutation)

**Analog:** `useSubmitOrder` (lines 238-263).

**Verbatim template** (entire `useSubmitOrder` body) — clone twice, change the method/URL/onSuccess invalidation set:

```typescript
export function useSubmitOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, ApiError, { orderId: string }>({
    mutationFn: ({ orderId }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/submit`, {
        method: 'POST',
      }),
    onSuccess: (response, vars) => {
      // D-57: cache hydration — response is the full updated skickad Order.
      queryClient.setQueryData(['order', vars.orderId], response);
      // Invalidate drafts list so the just-submitted order disappears (D-57).
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'utkast' }] });
    },
    onError: (err, vars) => {
      // D-55: 409 order_locked carve-out.
      if (err.envelope.error.code === 'order_locked') {
        toast.error('Beställningen kan inte ändras efter att den skickats.');
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      // 422 validation_failed (belt-and-suspenders — the disabled predicate normally catches this).
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}
```

**Phase 4 `useConfirmOrder`** — token changes:
- URL: `/api/orders/${orderId}/submit` → `/api/orders/${orderId}/confirm`
- `onSuccess` invalidate set: invalidate `['orders', { status: 'skickad' }]` AND `['orders', { status: 'bekraftad' }]` (the source tab loses a row, the destination gains one)
- `onError` carve-out: branch on `'order_transition_invalid'` instead of `'order_locked'`; toast uses `ORDER_STATUS_LABELS[err.envelope.error.details.from]` per D-74 (e.g., `Beställningen har redan ${ORDER_STATUS_LABELS[details.from]}.`)
- Success toast: `toast.success('Bekräftad')` (D-Specifics)

**Phase 4 `useDeliverOrder`** — same template with:
- URL: `/api/orders/${orderId}/deliver`
- `onSuccess` invalidate set: invalidate `['orders', { status: 'bekraftad' }]` AND `['orders', { status: 'levererad' }]` AND **`['medications']`** (Phase 6 NTF-01 dependency — D-83). The medications invalidation is the Phase 4 → Phase 6 hand-off.
- `onError`: branch on `'order_transition_invalid'` AND `'validation_failed'` (D-81 medication_removed → `toast.error('${err.envelope.error.details.medicationName} har tagits bort — återställ läkemedlet i registret innan leverans.')`)
- Success toast: `toast.success('Levererad — lagret uppdaterat')`

**Why no optimistic update:** D-42 / D-52 / CONTEXT.md "Established Patterns" — transitions are pessimistic. Stock changes are too important to lie about. No `onMutate` snapshot/rollback machinery.

---

### `apps/web/src/features/orders/useOrderQueries.ts` — add status-aware list query (tanstack-hook, read-list)

**Analog:** `useDraftsQuery` (lines 29-35).

**Verbatim template:**
```typescript
export function useDraftsQuery() {
  return useQuery<OrderListResponse, ApiError>({
    queryKey: ['orders', { status: 'utkast' }],
    queryFn: () => fetchJson<OrderListResponse>('/api/orders?status=utkast'),
    placeholderData: keepPreviousData,
  });
}
```

**Phase 4 approach — parameterize OR add parallel hook (Claude's discretion):**

Option A — parallel hook (recommended for clarity):
```typescript
export function useOrdersByStatusQuery(status: OrderStatus | OrderStatus[]) {
  const statusKey = Array.isArray(status) ? status.join(',') : status;
  return useQuery<OrderListResponse, ApiError>({
    queryKey: ['orders', { status: statusKey }],
    queryFn: () => fetchJson<OrderListResponse>(`/api/orders?status=${statusKey}`),
    placeholderData: keepPreviousData,
  });
}
```
`useDraftsQuery` stays as-is (back-compat for the Utkast tab; under the hood it shares the cache key `['orders', { status: 'utkast' }]`).

Option B — widen `useDraftsQuery` signature — rejected; mixing draft semantics with history-list semantics in one hook name is confusing.

**Query key invariant (D-69):** `['orders', { status }]` is the structural key. `useDeliverOrder.onSuccess` invalidates `['orders', …]` (broad key — matches all tabs) so every tab refetches; this is fine for v1.

---

### `apps/web/src/routes/bestallningar/BestallningarPage.tsx` — status-tab refactor (route-page)

**Analog:** existing `BestallningarPage.tsx` (the full current shape lines 32-132).

**Current** — single drafts-list query:
```typescript
const { data, isLoading } = useDraftsQuery();
```

**Phase 4 widening (D-82):**
1. Read URL search-param `status` via `useSearchParams()` (react-router-dom v7 already in scope per Phase 1 D-12). Default `?status=skickad` if missing (or `?status=utkast` — Claude's discretion; recommend `?status=skickad` for apotekare-first demo since the demo path opens on this tab).
2. Render shadcn `<Tabs value={status} onValueChange={...}>` above the existing table/card split. Tab values map to: `utkast | skickad | bekraftad | levererad | alla` (with `alla` → comma-list of all four to the API).
3. Branch the query:
   - `status === 'utkast'` → keep `useDraftsQuery()` (cache reuse)
   - else → `useOrdersByStatusQuery(status === 'alla' ? ORDER_STATUSES : status as OrderStatus)`
4. Pass the rows to `DraftsTable` / `DraftsCardList` (parameterize with column-config per tab — extra "Skickad av" / "Skickad" columns appear only on the non-utkast tabs). Claude's discretion per CONTEXT.md to parameterize vs fork.

**Tabs binding pattern (recommended shape):**
```typescript
const [searchParams, setSearchParams] = useSearchParams();
const status = searchParams.get('status') ?? 'utkast';

<Tabs value={status} onValueChange={(v) => setSearchParams({ status: v })}>
  <TabsList>
    <TabsTrigger value="utkast">Utkast</TabsTrigger>
    <TabsTrigger value="skickad">Skickade</TabsTrigger>
    <TabsTrigger value="bekraftad">Bekräftade</TabsTrigger>
    <TabsTrigger value="levererad">Levererade</TabsTrigger>
    <TabsTrigger value="alla">Alla</TabsTrigger>
  </TabsList>
</Tabs>
```

**Mobile: tabs collapse to scrollable strip on `<sm`** per CONTEXT.md `<specifics>`. Tailwind `overflow-x-auto` on `TabsList` + `whitespace-nowrap` on triggers.

**Empty states per tab (D-Specifics)** — branch on `status` for the heading copy:
- `skickad` empty: `Inga skickade beställningar.`
- `bekraftad` empty: `Inga bekräftade beställningar.`
- `levererad` empty: `Inga levererade beställningar ännu.`
- `alla` empty: same as utkast.

---

### `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — Mode C/D/E branches (route-page)

**Analog:** existing `isUtkast` / `isLocked` branches (lines 134-193) and the Mode A/Mode B layout.

**Current branch shape (lines 134-138):**
```typescript
const isUtkast = order.status === 'utkast';
const isLocked = !isUtkast;
// … Mode B if isLocked, else Mode A
```

**Phase 4 — switch on `order.status` instead:**
```typescript
const isUtkast = order.status === 'utkast';
const isSkickad = order.status === 'skickad';
const isBekraftad = order.status === 'bekraftad';
const isLevererad = order.status === 'levererad';
```

**Mode C (Skickad, apotekare action surface)** — extends current Mode B (already read-only). Add a `Bekräfta beställning` button:
```tsx
{isSkickad && (
  <Can action="order:confirm">
    <Button onClick={() => confirmMutation.mutateAsync({ orderId: order.id })}>
      Bekräfta beställning
    </Button>
  </Can>
)}
```
Button placement mirrors the Phase 3 sticky-footer pattern — `<ComposeStickyFooter>`'s shape but with confirm button instead of submit. On `<md` the button lands in the sticky footer (D-71 extension); on `≥md` it's right-aligned in the desktop header. Recommend creating `<ConfirmActionFooter>` parallel to `<ComposeStickyFooter>` rather than overloading the existing footer (which is tightly coupled to Utkast semantics — lines/summary/Kasta).

**Mode D (Bekräftad, apotekare action surface)** — add `Markera som levererad` button gated by `<Can action="order:deliver">`. Click opens `<DeliverConfirmDialog>` (new component, mirrors `<DiscardDraftDialog>`). On dialog confirm, fire `useDeliverOrder.mutateAsync`. On success, cache hydration flips the page to Mode E.

**Mode E (Levererad)** — read-only final view + banner `Beställningen är levererad — lagret uppdaterat.` + actor trail.

**Banner branch widening (current SubmitConfirmationBanner)** — `SubmitConfirmationBanner.tsx` (file at `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx`) already branches on status. Widen its logic OR create parallel banner components per status. Recommend widening — the comment at line 17 already says "Phase 4 will introduce parallel banners for bekraftad and levererad; branching on status here (rather than blindly rendering for !utkast) keeps each transition's copy distinct."

**Heading copy per mode (D-Specifics):**
- Utkast → `Nytt utkast` (existing)
- Skickad → `Beställning · Skickad` (existing)
- Bekräftad → `Beställning · Bekräftad` (new)
- Levererad → `Beställning · Levererad` (new)

**Actor trail (D-Specifics)** — Mode D/E footer line:
```
Skapad av {createdBy.name} · Skickad av {submittedBy.name} {time} · Bekräftad av {confirmedBy.name} {time} · Levererad av {deliveredBy.name} {time}
```
Render via conditional `&&` on each populated trio so utkast/skickad/bekraftad orders show partial trails.

---

### `apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx` (NEW feature-component, event-driven)

**Analog:** `DiscardDraftDialog.tsx` (entire file).

**Verbatim template** — clone `DiscardDraftDialog.tsx` and change four tokens:

Current (lines 46-92):
```tsx
export function DiscardDraftDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DiscardDraftDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kasta detta utkast?</AlertDialogTitle>
          <AlertDialogDescription>Utkastet tas bort permanent.</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/* Cancel FIRST so shadcn's default focus management lands here */}
          <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>

          {/* AlertDialogAction: destructive styling via className (NOT variant prop). */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Kastar…
              </>
            ) : (
              'Kasta'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**Token map for `DeliverConfirmDialog`:**
- Title: `Kasta detta utkast?` → `Markera som levererad?` (D-Specifics)
- Description: `Utkastet tas bort permanent.` → `Stocken uppdateras direkt. Detta kan inte ångras.` (D-Specifics)
- Action label: `Kasta` / `Kastar…` → `Markera levererad` / `Levererar…`
- Cancel label: `Avbryt` (unchanged)
- Prop `isDeleting` → `isDelivering`
- Whether the action stays destructive-styled is open — D-83 doesn't lock the color. Recommend keeping destructive styling since stock changes are irreversible (mirrors the discard semantics). Claude's discretion.

---

### `apps/web/src/components/ui/tabs.tsx` (NEW ui-primitive)

**Analog precedent for shadcn install:** `apps/web/src/components/ui/alert-dialog.tsx` already in tree.

**Install command:** `pnpm dlx shadcn add tabs` (NOT yet installed; verified by listing `apps/web/src/components/ui/` — no `tabs.tsx` present).

**Recommended styling per CONTEXT.md Claude's Discretion:** underlined tabs (matches existing list/filter aesthetic from Phase 2). No icons.

---

## Shared Patterns

### Authentication & RBAC (applies to confirm/deliver routes)
**Source:** `apps/api/src/routes/orders/submit.ts` lines 23-29.
**Apply to:** `apps/api/src/routes/orders/confirm.ts`, `apps/api/src/routes/orders/deliver.ts`.
**Excerpt:**
```typescript
preHandler: [requireSession, requirePermission('order:submit')],
schema: {
  params: z.object({ id: z.string().min(1) }),
  response: { 200: orderResponse },
},
```
Change `'order:submit'` to `'order:confirm'` / `'order:deliver'`. Order of preHandlers is invariant: requireSession decorates `req.user`, requirePermission reads `req.user.role`.

### Service signature (D-16 careUnitId-first)
**Source:** `apps/api/src/services/order.service.ts` line 359-363.
**Apply to:** all new service functions.
```typescript
export async function submitOrder(
  careUnitId: string,
  orderId: string,
  actorUserId: string,
): Promise<OrderResponse> {
```

### Order-row pessimistic lock (CR-02 / D-79 step A)
**Source:** `apps/api/src/services/order.service.ts` line 378 (inside `submitOrder`).
**Apply to:** `confirmOrder` (start of $transaction) AND `deliverOrder` (start of $transaction).
```typescript
await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
```

### Atomic UPDATE-with-precondition (D-54)
**Source:** `apps/api/src/services/order.service.ts` lines 413-426.
**Apply to:** `confirmOrder` (precondition `status: 'skickad'`), `deliverOrder` step I (precondition `status: 'bekraftad'`).
**On `count === 0`, throw `OrderTransitionError` (Phase 4 replacement for OrderLockedError on transitions).**

### Error envelope branch ordering (D-56 precedent)
**Source:** `apps/api/src/plugins/errorHandler.ts` lines 139-150.
**Apply to:** `OrderTransitionError` 409 branch — insert BEFORE the Zod `isZod` branch (line 155+), alongside `OrderLockedError` and `ValidationFailedError`.

### Full-Order response on mutation (D-57)
**Source:** `apps/api/src/services/order.service.ts` `toOrderResponse` (lines 66-82) + `submitOrder` step 6 (lines 428-445).
**Apply to:** `confirmOrder` AND `deliverOrder` return the full `OrderResponse` (widened with confirm/deliver actor trios per D-84).
**FE consequence:** `useConfirmOrder.onSuccess` / `useDeliverOrder.onSuccess` calls `setQueryData(['order', id], response)` — cache hydrates atomically.

### 404-not-403 on cross-careUnit (D-73)
**Source:** `apps/api/src/services/order.service.ts` lines 234-237, 386-389.
**Apply to:** confirm + deliver — verbatim:
```typescript
if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
  throw new NotFoundError('Beställningen hittades inte.');
}
```

### Mutation hook template (TanStack)
**Source:** `apps/web/src/features/orders/useOrderMutations.ts` `useSubmitOrder` (lines 238-263).
**Apply to:** `useConfirmOrder`, `useDeliverOrder`.
**Pattern: pessimistic; onSuccess hydrates `['order', id]` + invalidates relevant `['orders', { status: … }]` keys + (deliver only) `['medications']`.**

### AlertDialog confirm pattern (D-83)
**Source:** `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx`.
**Apply to:** `DeliverConfirmDialog.tsx` (mode D deliver-confirm).
**Key rules:** Cancel rendered FIRST (focus management). `e.preventDefault()` on Action to prevent auto-dismiss before mutation resolves. `disabled={isPending}` during mutation. Destructive className styling on Action (NOT `variant` prop).

### `<Can>` UI gating (D-17 / D-83)
**Source:** `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx` lines 85-114 (existing `<Can action="order:delete">`, `<Can action="order:update">`, `<Can action="order:submit">`).
**Apply to:** Mode C button → `<Can action="order:confirm">`. Mode D button → `<Can action="order:deliver">`. Defense in depth — BE preHandler is the security boundary, FE `<Can>` is the UX gate.

### Integration test harness (D-87)
**Source:** `apps/api/test/orders.integration.test.ts` lines 1-91 (harness imports, lifecycle hooks, helpers).
**Apply to:** `orders.deliver.integration.test.ts` — copy verbatim, add `TEST_APOTEKARE` import + `progressOrderToBekraftad` composite helper.

### Document title pattern
**Source:** `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` lines 71-77.
**Apply to:** Mode C/D/E heading text in `useDocumentTitle()`:
```typescript
const titleForOrder =
  order?.status === 'utkast'   ? 'Nytt utkast — MediTrack' :
  order?.status === 'skickad'  ? 'Beställning · Skickad — MediTrack' :
  order?.status === 'bekraftad'? 'Beställning · Bekräftad — MediTrack' :
  order?.status === 'levererad'? 'Beställning · Levererad — MediTrack' :
  'Beställning — MediTrack';
useDocumentTitle(titleForOrder);
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `deliverOrder` CUM-batch lock (`SELECT … FROM "CareUnitMedication" WHERE id = ANY(...) ORDER BY id FOR UPDATE`) inside `apps/api/src/services/order.service.ts` | service | mutation+lock | No existing code locks multiple rows in sorted-id order. The closest reference is `submitOrder`'s single-row Order lock (step 0). D-79 is the spec; CONTEXT.md `<canonical_refs>` Phase 1 PROJECT.md Key Decisions row says "Stock decrement uses Postgres transaction + SELECT … FOR UPDATE on medication row" — Phase 4 is the implementation. Test block 2 (D-88 pg_locks proof) validates correctness against real Postgres. |
| `apps/api/test/orders.deliver.integration.test.ts` test block 2 (two-phase barrier with `pg_locks` polling) | integration-test | mutation+lock concurrency | No existing test uses `pg_locks` or two parallel `prisma.$transaction` calls. D-86 / D-88 are the spec. The harness (`buildTestApp`, `prisma`) is verbatim from Phase 3; only the assertion shape is new. |

---

## Metadata

**Analog search scope:** `apps/api/src/`, `apps/api/prisma/`, `apps/api/test/`, `apps/web/src/`, `packages/shared/src/`.

**Files scanned for analogs:** ~25 (8 order routes, 1 order service, 1 error handler, 4 shared contracts, 2 permission maps, 1 schema, 2 migrations, 1 seed, 1 integration test, 3 FE feature hooks, 5 FE bestallningar route components, 1 OrderStatusPill, 1 SubmitConfirmationBanner, 1 DiscardDraftDialog).

**Pattern extraction date:** 2026-05-22.

**Special notes for planner:**
- `shadcn add tabs` is the only new dependency. `alert-dialog` is already installed.
- The single hardest implementation detail is the `deliverOrder` CUM-batch lock. The plan should call out D-79's six numbered steps as a literal task checklist.
- The concurrency test (D-88) is the most complex test in the phase — the planner should budget extra time and split it into its own task with `pg_locks` polling as an explicit subtask.
- `toOrderResponse` widening (line 66-82 in `order.service.ts`) is upstream of every confirm/deliver response — should be a Slice-1 prerequisite task before any route work.
- The `Order.confirmedBy / deliveredBy` Prisma `include` widening must propagate to BOTH the new `confirmOrder/deliverOrder` reload and the existing `submitOrder` reload (lines 429-440) so the response shape is consistent across all four mutations. Same for `getOrderForUnit` (lines 221-232) and `createDraftOrder` (lines 142-157) and `listOrdersForUnit` (lines 185-196). Easy to miss — every place that builds an `OrderWithRelations` needs the four-relation include.
