import type { Order, OrderLine, CareUnitMedication, Medication, User } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  NotFoundError,
  OrderLockedError,
  OrderTransitionError,
  ValidationFailedError,
} from '../plugins/errorHandler.js';
import { withActionOverride } from '../plugins/requestContext.js';
import type {
  OrderResponse,
  OrderListItem,
  OrderListQuery,
  OrderListResponse,
  OrderLineResponse,
  PickerOption,
  PickerSuggestion,
  PickerSuggestionsResponse,
  RestockPreviewResponse,
  RestockLowStockRequest,
} from '@meditrack/shared';
import { formatOrderNumber } from '@meditrack/shared';
import { listLowStockForUnit } from './dashboard.service.js';

/**
 * Phase 3 D-16 / D-66 — careUnitId-first service layer for Order CRUD.
 *
 * D-16: `careUnitId` is the FIRST argument on every service function.
 * The session has a `careUnitId` snapshot that the auth preHandler
 * decorates onto `req.user`; we pass it here and include it in every
 * Prisma `where` so a future code change cannot accidentally leak
 * across tenants (T-03-01).
 *
 * D-54: Every mutating service function uses the atomic UPDATE-with-
 * precondition pattern. After the status-check UPDATE, `count === 0`
 * means either the row does not exist (404) or the status has changed
 * (409 OrderLockedError). We disambiguate with a reload.
 *
 * D-66: `assertOrderEditable(careUnitId, orderId)` is the shared
 * precondition helper for line mutations. It reloads the order and
 * throws the correct error class based on what it finds.
 *
 * Security: every function asserts returned/modified rows belong to
 * the provided careUnitId (last line of defense per D-16).
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type OrderWithRelations = Order & {
  lines: (OrderLine & {
    careUnitMedication: CareUnitMedication & {
      medication: Medication;
    };
  })[];
  createdBy: Pick<User, 'id' | 'name'>;
  submittedBy: Pick<User, 'id' | 'name'> | null;
  // Phase 4 D-84 — actor fields for confirm/deliver transitions.
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  deliveredBy: Pick<User, 'id' | 'name'> | null;
};

type OrderForList = Order & {
  lines: Pick<OrderLine, 'id' | 'quantity'>[];
  createdBy: Pick<User, 'id' | 'name'>;
  // Phase 4 — actor fields for non-utkast tabs.
  submittedBy: Pick<User, 'id' | 'name'> | null;
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  deliveredBy: Pick<User, 'id' | 'name'> | null;
};

// ---------------------------------------------------------------------------
// Mapper helpers (exported so routes can reuse without re-importing prisma)
// ---------------------------------------------------------------------------

/**
 * Maps a full Prisma Order row (with embedded lines + createdBy + submittedBy)
 * to the shared OrderResponse contract shape.
 */
export function toOrderResponse(row: OrderWithRelations): OrderResponse {
  return {
    id: row.id,
    careUnitId: row.careUnitId,
    createdByUserId: row.createdByUserId,
    status: row.status as OrderResponse['status'],
    // Phase 10 D-165 — structured columns + derived display string.
    // formatOrderNumber is the single source of truth for ORD-YYYY-####.
    orderNumberCounter: row.orderNumberCounter,
    orderNumberYear: row.orderNumberYear,
    orderNumber: formatOrderNumber({
      year: row.orderNumberYear,
      counter: row.orderNumberCounter,
    }),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    submittedByUserId: row.submittedByUserId,
    // Phase 4 D-84 — confirm/deliver actor trios.
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    confirmedByUserId: row.confirmedByUserId ?? null,
    confirmedBy: row.confirmedBy
      ? { id: row.confirmedBy.id, name: row.confirmedBy.name }
      : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    deliveredByUserId: row.deliveredByUserId ?? null,
    deliveredBy: row.deliveredBy
      ? { id: row.deliveredBy.id, name: row.deliveredBy.name }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map(toOrderLineResponse),
    createdBy: { id: row.createdBy.id, name: row.createdBy.name },
    submittedBy: row.submittedBy
      ? { id: row.submittedBy.id, name: row.submittedBy.name }
      : null,
  };
}

/**
 * Maps a Prisma OrderLine (with nested CareUnitMedication × Medication join)
 * to the shared OrderLineResponse contract shape (D-47 denormalized fields).
 */
export function toOrderLineResponse(
  line: OrderLine & {
    careUnitMedication: CareUnitMedication & { medication: Medication };
  },
): OrderLineResponse {
  const med = line.careUnitMedication.medication;
  return {
    id: line.id,
    careUnitMedicationId: line.careUnitMedicationId,
    quantity: line.quantity,
    // Denormalized from CareUnitMedication × Medication at read time (D-47).
    name: med.name,
    atcCode: med.atcCode,
    form: med.form,
    strength: med.strength,
    currentStock: line.careUnitMedication.currentStock,
    lowStockThreshold: line.careUnitMedication.lowStockThreshold,
  };
}

/**
 * Maps a lean Prisma Order row (with aggregated line data and createdBy)
 * to the shared OrderListItem contract shape (D-72 drafts-list columns).
 */
export function toOrderListItem(row: OrderForList): OrderListItem {
  return {
    id: row.id,
    status: row.status as OrderListItem['status'],
    // Phase 10 D-165 — lean list shape carries only the formatted display
    // string; counter + year stay on the full orderResponse envelope.
    orderNumber: formatOrderNumber({
      year: row.orderNumberYear,
      counter: row.orderNumberCounter,
    }),
    createdAt: row.createdAt.toISOString(),
    lineCount: row.lines.length,
    totalQuantity: row.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: { id: row.createdBy.id, name: row.createdBy.name },
    // Phase 4 — actor fields for non-utkast tab columns.
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    submittedBy: row.submittedBy
      ? { id: row.submittedBy.id, name: row.submittedBy.name }
      : null,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    confirmedBy: row.confirmedBy
      ? { id: row.confirmedBy.id, name: row.confirmedBy.name }
      : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    deliveredBy: row.deliveredBy
      ? { id: row.deliveredBy.id, name: row.deliveredBy.name }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Create — POST /api/orders (D-50)
// ---------------------------------------------------------------------------

/**
 * Creates an empty Utkast Order scoped to the given vårdenhet.
 *
 * D-50: POST-empty-on-compose-open pattern — the draft is created the
 * moment the user clicks "Ny beställning", not on Save. The URL is
 * shareable and crash-recoverable from the moment of intent.
 *
 * D-16: careUnitId is the FIRST arg; createdByUserId is the second.
 * Both come from req.user — the request body is intentionally empty
 * (createOrderRequest = z.object({}).strict()) and carries neither.
 */
export async function createDraftOrder(
  careUnitId: string,
  createdByUserId: string,
): Promise<OrderResponse> {
  // Phase 10 D-160 / D-162 — mint the per-(careUnit, year) order number
  // INSIDE the same $transaction as the Order insert. The mint takes a
  // row-level write lock on OrderNumberCounter (same primitive as Phase 4
  // STK-02 on CareUnitMedication — see D-79) so two concurrent draft-
  // create calls against the same vårdenhet serialize cleanly: each gets
  // a distinct sequential counter; neither sees the other's value.
  const order = await prisma.$transaction(async (tx) => {
    const { year, counter } = await mintOrderNumber(tx, careUnitId);
    return tx.order.create({
      data: {
        careUnitId,
        createdByUserId,
        status: 'utkast',
        orderNumberCounter: counter,
        orderNumberYear: year,
      },
      include: {
        lines: {
          include: {
            careUnitMedication: { include: { medication: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        // Phase 4 D-84 — actor include widening.
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });
  });

  return toOrderResponse(order);
}

// ---------------------------------------------------------------------------
// List — GET /api/orders (D-53, D-72)
// ---------------------------------------------------------------------------

/**
 * Returns a list of Orders for the given vårdenhet filtered by status.
 *
 * D-53: Defaults to status=utkast (the drafts list). Phase 4 ORD-07 will
 * expand to a full status-filtered history view; for Phase 3 this powers
 * the /bestallningar drafts list.
 *
 * D-72: Each row includes lineCount, totalQuantity, and createdBy.name.
 * These are computed from the loaded lines (no separate COUNT query).
 *
 * T-03-01: careUnitId is always included in the where-clause. Cross-tenant
 * access is structurally impossible from this service.
 *
 * Pagination is stubbed — Phase 7 will wire pageSize/page properly.
 */
export async function listOrdersForUnit(
  careUnitId: string,
  filters: OrderListQuery,
): Promise<OrderListResponse> {
  const rows = await prisma.order.findMany({
    where: {
      careUnitId,
      // Phase 4 — accept single status OR array (e.g. ['skickad','bekraftad']).
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

// ---------------------------------------------------------------------------
// Get — GET /api/orders/:id (D-47)
// ---------------------------------------------------------------------------

/**
 * Returns a single Order with embedded lines and denormalized medication fields.
 *
 * D-47: OrderLine fields (name, atcCode, form, strength, currentStock, lowStockThreshold)
 * are joined at read time from CareUnitMedication × Medication.
 *
 * D-73 / D-19: Returns 404 (not 403) when the order belongs to another careUnit —
 * prevents existence-probing attacks.
 */
export async function getOrderForUnit(
  careUnitId: string,
  orderId: string,
): Promise<OrderResponse> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lines: {
        include: {
          careUnitMedication: { include: { medication: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      // Phase 4 D-84 — actor include widening.
      confirmedBy: { select: { id: true, name: true } },
      deliveredBy: { select: { id: true, name: true } },
    },
  });

  // D-73 / D-19: 404 on cross-tenant or truly-not-found (never 403).
  if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
    throw new NotFoundError('Beställningen hittades inte.');
  }

  return toOrderResponse(order);
}

// ---------------------------------------------------------------------------
// Lines — add / update / remove (D-51, D-52, D-54)
// ---------------------------------------------------------------------------

/**
 * Adds a medication line to a draft order.
 *
 * D-54: Uses atomic UPDATE-with-precondition to prevent adding lines to
 * locked (non-utkast) orders. If count === 0, reloads to distinguish
 * NotFoundError from OrderLockedError.
 *
 * CR-01 / T-03-01: Validates that the requested CareUnitMedication belongs
 * to the caller's careUnit before insert. The FK constraint alone is
 * insufficient — it accepts any CareUnitMedication id, including rows owned
 * by other vårdenheter, which would (a) leak cross-tenant medication metadata
 * via the denormalized GET response and (b) break Phase 4's stock-decrement
 * by pointing the line at the wrong stock row. D-73: returns 404 (not 403)
 * to avoid existence-probing across tenants.
 *
 * Returns the full updated Order (D-57 pattern — FE cache hydrates atomically).
 */
export async function addLineToOrder(
  careUnitId: string,
  orderId: string,
  lineData: { careUnitMedicationId: string; quantity: number },
): Promise<OrderResponse> {
  await assertOrderEditable(careUnitId, orderId);

  // CR-01: scope-check the CareUnitMedication before insert. The FK accepts
  // any existing CUM id; we must enforce careUnitId equality at the service
  // boundary (D-16 last-line-of-defense pattern). D-73: 404 on cross-tenant
  // (and on soft-deleted / missing) so we don't leak existence.
  const cum = await prisma.careUnitMedication.findUnique({
    where: { id: lineData.careUnitMedicationId },
    select: { careUnitId: true, deletedAt: true },
  });
  if (!cum || cum.deletedAt !== null || cum.careUnitId !== careUnitId) {
    throw new NotFoundError('Läkemedlet hittades inte i din vårdenhets register.');
  }

  await prisma.orderLine.create({
    data: {
      orderId,
      careUnitMedicationId: lineData.careUnitMedicationId,
      quantity: lineData.quantity,
    },
  });

  return getOrderForUnit(careUnitId, orderId);
}

/**
 * Updates the quantity of an existing order line.
 *
 * D-52: Quantity edit is the "optimistic" surface. The FE updates the cache
 * immediately and debounces the PATCH at 250ms. This function is the server
 * authority; on conflict, the FE rolls back.
 *
 * D-54: Asserts order is still editable before mutating the line.
 */
export async function updateOrderLine(
  careUnitId: string,
  orderId: string,
  lineId: string,
  quantity: number,
): Promise<OrderResponse> {
  await assertOrderEditable(careUnitId, orderId);

  const line = await prisma.orderLine.findUnique({ where: { id: lineId } });
  if (!line || line.orderId !== orderId) {
    throw new NotFoundError('Orderraden hittades inte.');
  }

  await prisma.orderLine.update({
    where: { id: lineId },
    data: { quantity },
  });

  return getOrderForUnit(careUnitId, orderId);
}

/**
 * Removes a line from a draft order.
 *
 * D-54: Asserts order is still editable. Returns the full updated Order
 * (D-57 pattern).
 */
export async function removeOrderLine(
  careUnitId: string,
  orderId: string,
  lineId: string,
): Promise<OrderResponse> {
  await assertOrderEditable(careUnitId, orderId);

  const line = await prisma.orderLine.findUnique({ where: { id: lineId } });
  if (!line || line.orderId !== orderId) {
    throw new NotFoundError('Orderraden hittades inte.');
  }

  await prisma.orderLine.delete({ where: { id: lineId } });

  return getOrderForUnit(careUnitId, orderId);
}

// ---------------------------------------------------------------------------
// Submit — POST /api/orders/:id/submit (D-54, D-56, D-57)
// ---------------------------------------------------------------------------

/**
 * Submits a draft order atomically — flips status from 'utkast' to 'skickad'.
 *
 * D-56: Validates non-empty lines and positive quantities BEFORE the UPDATE.
 * D-54: Atomic UPDATE with WHERE status = 'utkast' precondition — race-free
 * even under concurrent submit+edit from two tabs.
 * D-57: Returns the full updated Order so the FE cache hydrates atomically.
 * D-49: Stamps submittedAt + submittedByUserId.
 */
export async function submitOrder(
  careUnitId: string,
  orderId: string,
  actorUserId: string,
): Promise<OrderResponse> {
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

    // Step 1 — Load the order with lines inside the transaction.
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });

    // Step 2 — Existence + scope check.
    if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
      throw new NotFoundError('Beställningen hittades inte.');
    }

    // Step 3 — Status pre-check (must be utkast to submit).
    if (order.status !== 'utkast') {
      throw new OrderLockedError({ status: order.status as 'skickad' | 'bekraftad' | 'levererad' });
    }

    // Step 4 — D-56: validate non-empty lines and positive quantities.
    if (order.lines.length === 0) {
      throw new ValidationFailedError(
        'Beställningen måste ha minst en rad.',
        { reason: 'empty_order' },
      );
    }

    for (const line of order.lines) {
      if (line.quantity <= 0) {
        throw new ValidationFailedError(
          'Alla rader måste ha ett positivt antal.',
          { reason: 'invalid_quantity', lineId: line.id },
        );
      }
    }

    // Step 5 — Atomic UPDATE with status precondition (D-54).
    // Phase 5 D-94 — wrap the underlying Order update so the audit row
    // records action = 'order.submit' rather than the generic 'update'.
    const updated = await withActionOverride('order.submit', () =>
      tx.order.updateMany({
        where: { id: orderId, careUnitId, status: 'utkast', deletedAt: null },
        data: {
          status: 'skickad',
          submittedAt: new Date(),
          submittedByUserId: actorUserId,
        },
      }),
    );

    // count === 0 means a race condition — another request submitted first.
    if (updated.count === 0) {
      throw new OrderLockedError({ status: 'skickad' });
    }

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
        // Phase 4 D-84 — actor include widening.
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });

    return final!;
  });

  return toOrderResponse(result);
}

// ---------------------------------------------------------------------------
// Confirm — POST /api/orders/:id/confirm (D-74, D-75, D-84)
// ---------------------------------------------------------------------------

/**
 * Confirms a Skickad order atomically — flips status from 'skickad' to 'bekraftad'.
 *
 * D-74: Returns 409 order_transition_invalid (not 409 order_locked) when the
 *       source status is wrong (enables FE to produce localized error toast).
 * D-75: Narrow single-action endpoint — no body accepted; all context from session.
 * D-84: Stamps confirmedAt + confirmedByUserId.
 * D-54: Atomic UPDATE with WHERE status = 'skickad' precondition — race-free.
 * D-73: 404 (not 403) on cross-careUnit to hide order existence.
 */
export async function confirmOrder(
  careUnitId: string,
  orderId: string,
  actorUserId: string,
): Promise<OrderResponse> {
  const result = await prisma.$transaction(async (tx) => {
    // Step 0 — CR-02: lock the Order row FOR UPDATE (same pattern as submitOrder).
    // Serializes concurrent confirms on the same order.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

    // Step 1 — Load the order with all relation includes.
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        lines: {
          include: {
            careUnitMedication: { include: { medication: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });

    // Step 2 — Existence + scope check (D-73).
    if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
      throw new NotFoundError('Beställningen hittades inte.');
    }

    // Step 3 — Status precondition: must be 'skickad' to confirm.
    if (order.status !== 'skickad') {
      throw new OrderTransitionError({
        from: order.status,
        to: 'bekraftad',
        expected: 'skickad',
      });
    }

    // Step 4 — Sanity check: non-empty lines. submitOrder already enforces
    // this at submission time and lines are immutable after Skickad
    // (assertOrderEditable rejects non-utkast), so reaching this branch with
    // zero lines implies the lines were deleted out-of-band (manual DB edit).
    // The Order FOR UPDATE lock above does NOT cover OrderLine rows, so this
    // is not a true race guard — it's a tripwire for invariant violations.
    if (order.lines.length === 0) {
      throw new ValidationFailedError(
        'Beställningen måste ha minst en rad.',
        { reason: 'empty_order' },
      );
    }

    // Step 5 — Atomic UPDATE with status precondition (D-54).
    // Phase 5 D-94 — wrap the underlying Order update so the audit row
    // records action = 'order.confirm' rather than the generic 'update'.
    const updated = await withActionOverride('order.confirm', () =>
      tx.order.updateMany({
        where: { id: orderId, careUnitId, status: 'skickad', deletedAt: null },
        data: {
          status: 'bekraftad',
          confirmedAt: new Date(),
          confirmedByUserId: actorUserId,
        },
      }),
    );

    // count === 0 means a race condition — another request confirmed first.
    // Reload the row to report the actual losing status (could be 'bekraftad',
    // 'levererad', or even reverted to 'utkast'). Falling back to 'bekraftad'
    // preserves the previous behavior only if the row vanished mid-tx.
    if (updated.count === 0) {
      const actual = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      throw new OrderTransitionError({
        from: actual?.status ?? 'bekraftad',
        to: 'bekraftad',
        expected: 'skickad',
      });
    }

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
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });

    return final!;
  });

  return toOrderResponse(result);
}

// ---------------------------------------------------------------------------
// Deliver — POST /api/orders/:id/deliver (D-78, D-79, D-81, D-84)
// ---------------------------------------------------------------------------

/**
 * Delivers a Bekräftad order atomically — flips status from 'bekraftad' to 'levererad'
 * and increments stock for each affected CareUnitMedication.
 *
 * D-78: Delivery is replenishment — line quantities are ADDED to currentStock.
 * D-79: CUM batch lock with sorted-id ordering (deadlock prevention).
 *       Steps: (1) Order-row FOR UPDATE, (2) load order+lines+CUMs,
 *              (3) existence+scope check, (4) status precondition,
 *              (5) D-81 soft-deleted CUM check, (6) aggregate by CUM,
 *              (7) sorted CUM ids FOR UPDATE batch lock, (8) per-CUM increment,
 *              (9) atomic Order UPDATE with status precondition, (10) reload+return.
 * D-81: Soft-deleted CUM at deliver time → 422 validation_failed reason='medication_removed'.
 *       Checked BEFORE any UPDATE — entire tx rolls back on failure.
 * D-84: Stamps deliveredAt + deliveredByUserId.
 * D-73: 404 (not 403) on cross-careUnit to hide order existence.
 * D-54: Atomic updateMany with WHERE status = 'bekraftad' precondition.
 * D-57: Returns full updated OrderResponse; FE cache hydrates atomically.
 * OPS-03/D-88: The concurrency test in orders.deliver.integration.test.ts
 *              proves two concurrent deliverOrder calls serialize on this lock.
 */
export async function deliverOrder(
  careUnitId: string,
  orderId: string,
  actorUserId: string,
): Promise<OrderResponse> {
  const result = await prisma.$transaction(async (tx) => {
    // Step 1 — CR-02: lock the Order row FOR UPDATE (same pattern as submitOrder + confirmOrder).
    // Serializes concurrent delivers on the same order (OPS-03 / D-88).
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

    // Step 2 — Load order with lines + nested CUMs (need CUM deletedAt for D-81 and medication.name for toast).
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        lines: {
          include: {
            careUnitMedication: { include: { medication: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });

    // Step 3 — Existence + scope check (D-73).
    if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
      throw new NotFoundError('Beställningen hittades inte.');
    }

    // Step 4 — Status precondition: must be 'bekraftad' to deliver.
    if (order.status !== 'bekraftad') {
      throw new OrderTransitionError({
        from: order.status,
        to: 'levererad',
        expected: 'bekraftad',
      });
    }

    // Step 5 — D-81: 422 medication_removed if any CUM is soft-deleted.
    // MUST happen BEFORE any UPDATE so the entire tx rolls back on failure.
    for (const line of order.lines) {
      if (line.careUnitMedication.deletedAt !== null) {
        throw new ValidationFailedError(
          'Läkemedlet har tagits bort.',
          {
            reason: 'medication_removed',
            medicationName: line.careUnitMedication.medication.name,
          },
        );
      }
    }

    // Step 6 — D-79: aggregate same-CUM lines into a Map<cumId, totalQty>.
    // keyed on careUnitMedicationId (NOT line.id — that would skip aggregation).
    const byCum = new Map<string, number>();
    for (const line of order.lines) {
      byCum.set(
        line.careUnitMedicationId,
        (byCum.get(line.careUnitMedicationId) ?? 0) + line.quantity,
      );
    }

    // Step 7 — D-79: SELECT FOR UPDATE on ALL affected CUMs in sorted-id order.
    // Sorted-id ordering prevents deadlocks when two concurrent deliveries
    // across different orders share the same CUM rows (D-89 story).
    // The ::text[] cast is REQUIRED because Prisma interpolates as text[], not String[].
    const sortedCumIds = [...byCum.keys()].sort();
    await tx.$queryRaw`
      SELECT id FROM "CareUnitMedication"
      WHERE id = ANY(${sortedCumIds}::text[])
      ORDER BY id
      FOR UPDATE
    `;

    // Step 8 — Per-CUM stock increment (one Prisma update per distinct CUM).
    // Prisma's { increment: N } generates SET "currentStock" = "currentStock" + $1 — atomic.
    // Phase 5 D-94 — wrap each CUM update so the audit row records
    // action = 'stock.increment' (the N sibling events of the 1+N
    // deliver fan-out). All siblings share the request's requestId,
    // which the admin UI uses for the "Del av begäran" group chip.
    for (const [cumId, qty] of byCum) {
      await withActionOverride('stock.increment', () =>
        tx.careUnitMedication.update({
          where: { id: cumId },
          data: { currentStock: { increment: qty } },
        }),
      );
    }

    // Step 9 — Atomic Order UPDATE with status precondition (D-54).
    // count === 0 means a race condition — another deliver landed between our load and our UPDATE.
    // Phase 5 D-94 — wrap the Order status flip so the audit row
    // records action = 'order.deliver'. This is the "1" of the 1+N
    // sibling shape; the N stock.increment rows above complete it.
    const updated = await withActionOverride('order.deliver', () =>
      tx.order.updateMany({
        where: { id: orderId, careUnitId, status: 'bekraftad', deletedAt: null },
        data: {
          status: 'levererad',
          deliveredAt: new Date(),
          deliveredByUserId: actorUserId,
        },
      }),
    );

    if (updated.count === 0) {
      // Race: another transition won. Reload the row to report the actual
      // losing status (typically 'levererad', but defensively could be any
      // post-bekraftad value). Fall back to 'levererad' if the row vanished.
      const actual = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      throw new OrderTransitionError({
        from: actual?.status ?? 'levererad',
        to: 'levererad',
        expected: 'bekraftad',
      });
    }

    // Step 10 — Reload + return the full updated order (D-57: FE cache hydrates atomically).
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
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });

    return final!;
  });

  return toOrderResponse(result);
}

// ---------------------------------------------------------------------------
// Delete — soft-delete (D-33, D-67)
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a draft order by setting deletedAt = now().
 *
 * D-67: Only Utkast orders can be discarded. Throws OrderLockedError if the
 * order is in any other status.
 * D-33: Always soft-delete — mirrors CareUnitMedication soft-delete pattern.
 *
 * CR-03 / D-54: Uses the atomic updateMany-with-precondition pattern
 * (mirrors submitOrder step 5). The previous check-then-act sequence
 * (findUnique → update) had a TOCTOU window: between the read and the
 * write another request could submit the order (utkast → skickad), and
 * the unconditional update with where: { id } only would still succeed
 * and silently soft-delete a Skickad order — violating D-67.
 *
 * Phase 4's STK-02 concurrency test will exercise the true race; for
 * Phase 3 the existing integration test relies on app.inject's sequential
 * single-process semantics, which removes the race entirely. The atomic
 * UPDATE here is the production-correct fix.
 */
export async function softDeleteOrder(
  careUnitId: string,
  orderId: string,
): Promise<void> {
  // CR-03 / D-54: single atomic UPDATE with status precondition. If no row
  // matches (count === 0) we reload to disambiguate not-found from
  // status-changed and throw the correct error.
  // Phase 5 D-94 — wrap so the audit row records action = 'order.softDelete'
  // rather than the generic 'update'. This is the "discard draft" path.
  const result = await withActionOverride('order.softDelete', () =>
    prisma.order.updateMany({
      where: {
        id: orderId,
        careUnitId,
        status: 'utkast',
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    }),
  );

  if (result.count === 0) {
    const reload = await prisma.order.findUnique({ where: { id: orderId } });
    // D-73 / D-19: 404 on cross-tenant, soft-deleted, or truly-not-found.
    if (!reload || reload.deletedAt !== null || reload.careUnitId !== careUnitId) {
      throw new NotFoundError('Beställningen hittades inte.');
    }
    // D-67: row exists in this careUnit but status is no longer utkast → 409.
    throw new OrderLockedError({
      status: reload.status as 'skickad' | 'bekraftad' | 'levererad',
    });
  }
}

// ---------------------------------------------------------------------------
// Picker — GET /api/orders/picker-options (D-59)
// ---------------------------------------------------------------------------

/**
 * Returns up to `limit` CareUnitMedication × Medication rows matching the
 * search query within the caller's vårdenhet.
 *
 * D-59: Scope = per-vårdenhet CareUnitMedications (deletedAt: null only).
 * Reuses the pg_trgm + GIN index Phase 2 added on lower(Medication.name).
 *
 * D-61: Returns currentStock + lowStockThreshold so the FE can render
 * <LowStockBadge> inline in picker rows.
 */
export async function searchPickerOptions(
  careUnitId: string,
  filters: { q: string; limit: number },
): Promise<PickerOption[]> {
  const { q, limit } = filters;

  const results = await prisma.careUnitMedication.findMany({
    where: {
      careUnitId,
      deletedAt: null,
      medication: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { atcCode: { startsWith: q, mode: 'insensitive' } },
        ],
      },
    },
    include: { medication: true },
    take: limit,
    orderBy: { medication: { name: 'asc' } },
  });

  return results.map((r) => ({
    careUnitMedicationId: r.id,
    name: r.medication.name,
    atcCode: r.medication.atcCode,
    form: r.medication.form,
    strength: r.medication.strength,
    currentStock: r.currentStock,
    lowStockThreshold: r.lowStockThreshold,
  }));
}

// ---------------------------------------------------------------------------
// Picker suggestions — GET /api/orders/picker-suggestions (D-135, D-136, D-138, ORD-08)
// ---------------------------------------------------------------------------

/**
 * Returns deduplicated pre-search suggestions for the MedicationPickerSheet.
 *
 * D-16: careUnitId is the FIRST argument (cross-tenant isolation).
 * D-135: Service-layer dedupe — no careUnitMedicationId appears in both
 *   arrays. Lågt lager wins; Mest beställda pulls the 6th-ranked when a
 *   top-5 row collides with the low-stock set.
 * D-136: Most-ordered uses ALL-TIME window (no date filter). LIMIT 6 so the
 *   dedupe pass can pull the 6th-ranked entry when a top-5 collides.
 * D-138: Reuses `listLowStockForUnit` (dashboard.service) for the Lågt lager
 *   half — no duplicate $queryRaw anywhere in the codebase. The dashboard
 *   SELECT was widened (Phase 8) to include atcCode/form/strength so the
 *   returned rows conform to PickerSuggestion shape.
 * T-08-02: (1) requirePermission('order:create') preHandler on the route.
 *   (2) Scope assertion: loads the order and throws NotFoundError if it does
 *   not belong to careUnitId — same disclosure-safe pattern as loadOrder.
 *   (3) Parameterized WHERE cum."careUnitId" = ${careUnitId} on the raw query.
 *   (4) listLowStockForUnit inherits the same parameterized WHERE binding.
 */
export async function listPickerSuggestions(
  careUnitId: string,
  orderId: string,
): Promise<PickerSuggestionsResponse> {
  // T-08-02 scope assertion: the order must belong to the caller's careUnit.
  // NotFoundError (404) rather than 403 — D-73 disclosure-safe pattern.
  const orderRow = await prisma.order.findUnique({
    where: { id: orderId },
    select: { careUnitId: true },
  });
  if (!orderRow || orderRow.careUnitId !== careUnitId) {
    throw new NotFoundError('Beställning hittades inte.');
  }

  // Most-ordered query (D-136): LIMIT 6 so dedupe can pull the 6th-ranked.
  // Parameterized ${careUnitId} — no string concatenation (T-08-02 layer 4).
  const mostOrderedRaw = await prisma.$queryRaw<
    Array<{
      careUnitMedicationId: string;
      medicationId: string;
      name: string;
      atcCode: string;
      form: string;
      strength: string | null;
      currentStock: number;
      lowStockThreshold: number;
      orderCount: bigint;
    }>
  >`
    SELECT cum."id" AS "careUnitMedicationId",
           m."id" AS "medicationId",
           m."name",
           m."atcCode",
           m."form",
           m."strength",
           cum."currentStock",
           cum."lowStockThreshold",
           COUNT(ol."id") AS "orderCount"
    FROM "CareUnitMedication" cum
    JOIN "Medication" m ON cum."medicationId" = m."id"
    LEFT JOIN "OrderLine" ol ON ol."careUnitMedicationId" = cum."id"
    WHERE cum."careUnitId" = ${careUnitId}
      AND cum."deletedAt" IS NULL
    GROUP BY cum."id", m."id", m."name", m."atcCode", m."form", m."strength", cum."currentStock", cum."lowStockThreshold"
    ORDER BY COUNT(ol."id") DESC, LOWER(m."name") ASC
    LIMIT 6
  `;

  // Low-stock half (D-138): reuse listLowStockForUnit verbatim — no second $queryRaw.
  const lowStockResult = await listLowStockForUnit(careUnitId);
  const lowStock: PickerSuggestion[] = lowStockResult.rows.slice(0, 5).map((r) => ({
    careUnitMedicationId: r.careUnitMedicationId,
    medicationId: r.medicationId,
    name: r.name,
    atcCode: r.atcCode,
    form: r.form,
    strength: r.strength,
    currentStock: r.currentStock,
    lowStockThreshold: r.lowStockThreshold,
  }));

  // Dedupe (D-135): build a Set of low-stock careUnitMedicationIds.
  // Filter the LIMIT-6 most-ordered list, then slice to 5.
  const lowStockIds = new Set(lowStock.map((r) => r.careUnitMedicationId));
  const mostOrdered: PickerSuggestion[] = mostOrderedRaw
    .filter((r) => !lowStockIds.has(r.careUnitMedicationId))
    .slice(0, 5)
    .map((r) => ({
      careUnitMedicationId: r.careUnitMedicationId,
      medicationId: r.medicationId,
      name: r.name,
      atcCode: r.atcCode,
      form: r.form,
      strength: r.strength,
      currentStock: Number(r.currentStock),
      lowStockThreshold: Number(r.lowStockThreshold),
    }));

  return { mostOrdered, lowStock };
}

// ---------------------------------------------------------------------------
// Internal helper — mintOrderNumber (Phase 10 D-160 / D-161 / D-164)
// ---------------------------------------------------------------------------

/**
 * Mints the next sequential orderNumber for the (careUnitId, current-year)
 * pair. Returns the structured {year, counter} pair; the formatted display
 * string is derived in toOrderResponse / toOrderListItem via
 * formatOrderNumber from @meditrack/shared (D-165).
 *
 * The two-statement UPDATE-then-INSERT-with-ON-CONFLICT pattern is the
 * row-level write-lock primitive Phase 4 STK-02 uses for stock — same
 * Postgres semantics as the explicit `FOR UPDATE` in submitOrder /
 * deliverOrder. Two concurrent draft-create calls against the same
 * (careUnit, year) serialize on the OrderNumberCounter row; each gets
 * a distinct sequential counter.
 *
 * - Common case (counter row pre-seeded by migration 0013 or a prior
 *   mint this year): the UPDATE matches one row, increments nextValue,
 *   and returns (year, prev-nextValue) as `counter`.
 * - Edge case (first order ever of a brand-new (careUnit, year) pair,
 *   e.g. first order of a new year, or first order at a freshly created
 *   vårdenhet): the UPDATE matches zero rows; the INSERT...ON CONFLICT
 *   materializes the row at nextValue=2 (the next mint sees an UPDATE
 *   path), returning counter=1 if we won the race (xmax=0) or the
 *   incremented value if a concurrent INSERT raced us to the same key.
 *
 * Year is `EXTRACT(YEAR FROM NOW())::int` so the year segment is read
 * from Postgres's clock — single source of truth, no app-vs-DB skew
 * across the year boundary (D-161).
 */
// The tx type comes from the extended-client $transaction callback
// (the project's PrismaClient is wrapped in `.$extends(buildAuditExtension())`).
// Using Prisma.TransactionClient directly fails to match because $extends
// rewrites the model-method signatures. Inferring from the callback param
// keeps mintOrderNumber strictly typed against the actual runtime client.
type ExtendedTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function mintOrderNumber(
  tx: ExtendedTx,
  careUnitId: string,
): Promise<{ year: number; counter: number }> {
  // 1. Try UPDATE first (common case: counter row already exists).
  const updated = await tx.$queryRaw<{ year: number; counter: number }[]>`
    UPDATE "OrderNumberCounter"
    SET "nextValue" = "nextValue" + 1
    WHERE "careUnitId" = ${careUnitId}
      AND "year" = EXTRACT(YEAR FROM NOW())::int
    RETURNING "year", "nextValue" - 1 AS "counter"
  `;
  if (updated.length === 1) return updated[0]!;

  // 2. First order of the (careUnitId, year) pair — UPSERT to materialize
  //    the row, with ON CONFLICT handling for a racing concurrent insert.
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
  return inserted[0]!;
}

// ---------------------------------------------------------------------------
// Restock low-stock — preview + create
// ---------------------------------------------------------------------------

/**
 * Preview for the "Beställ påfyllning" modal: every under-threshold
 * CareUnitMedication in the caller's vårdenhet, enriched with the
 * aggregated quantity already on non-`levererad` orders so the user can
 * spot potential double-orders before confirming. Reuses
 * `listLowStockForUnit` to keep the urgency-sort logic single-sourced
 * (D-138 pattern).
 *
 * The in-flight aggregation is NOT transactional with the subsequent
 * create — see WR-06 in dashboard.service.ts for the same eventually-
 * consistent posture across dashboard reads.
 */
export async function getRestockPreview(
  careUnitId: string,
): Promise<RestockPreviewResponse> {
  const lowStock = await listLowStockForUnit(careUnitId);
  if (lowStock.rows.length === 0) return { rows: [] };

  const lowStockIds = lowStock.rows.map((r) => r.careUnitMedicationId);

  const inFlightLines = await prisma.orderLine.findMany({
    where: {
      careUnitMedicationId: { in: lowStockIds },
      order: {
        careUnitId,
        status: { in: ['utkast', 'skickad', 'bekraftad'] },
        deletedAt: null,
      },
    },
    select: {
      careUnitMedicationId: true,
      quantity: true,
      order: {
        select: {
          id: true,
          status: true,
          orderNumberYear: true,
          orderNumberCounter: true,
        },
      },
    },
  });

  // Group lines by careUnitMedicationId for O(1) row lookup below.
  const byCum = new Map<
    string,
    { totalQuantity: number; orders: RestockPreviewResponse['rows'][number]['inFlightOrders'] }
  >();
  for (const line of inFlightLines) {
    const entry = byCum.get(line.careUnitMedicationId) ?? {
      totalQuantity: 0,
      orders: [],
    };
    entry.totalQuantity += line.quantity;
    entry.orders.push({
      orderId: line.order.id,
      orderNumber: formatOrderNumber({
        year: line.order.orderNumberYear,
        counter: line.order.orderNumberCounter,
      }),
      status: line.order.status as 'utkast' | 'skickad' | 'bekraftad',
      quantity: line.quantity,
    });
    byCum.set(line.careUnitMedicationId, entry);
  }

  const rows = lowStock.rows.map((r) => {
    const inFlight = byCum.get(r.careUnitMedicationId);
    return {
      careUnitMedicationId: r.careUnitMedicationId,
      name: r.name,
      atcCode: r.atcCode,
      form: r.form,
      strength: r.strength,
      currentStock: r.currentStock,
      lowStockThreshold: r.lowStockThreshold,
      inFlightQuantity: inFlight?.totalQuantity ?? 0,
      inFlightOrders: inFlight?.orders ?? [],
    };
  });

  return { rows };
}

/**
 * Creates a draft Order with one line per still-low-stock CareUnitMedication
 * from the request's id list. Per-line quantity is
 * `max(1, lowStockThreshold − currentStock + buffer)` — the floor guards
 * the DB-level positive-int CHECK constraint (WR-01).
 *
 * Items that recovered, were soft-deleted, or belong to a different
 * vårdenhet between preview and confirm are silently dropped (D-81
 * precedent from deliverOrder). If every requested item drops out we
 * throw 422 `no_items_to_restock` instead of creating an empty draft.
 *
 * The whole flow lives in one `prisma.$transaction`. No `FOR UPDATE`
 * lock on CUMs — only `deliverOrder` mutates `currentStock`, so a
 * stock-recovery race between our re-read and the insert is harmless
 * (the worst case is we insert a line for an item that just recovered;
 * the line is still valid because the user explicitly opted into the
 * draft). The `mintOrderNumber` helper provides its own row-level lock
 * on OrderNumberCounter (D-160).
 *
 * Audit: `order.create` audit row comes from the Prisma extension
 * unmodified (default action). Per-line `orderLine.create` audit rows
 * fire for each `tx.orderLine.create` — using `createMany` here would
 * skip those (auditExtension.ts: createMany is NOT intercepted), so we
 * issue one statement per line.
 */
export async function createRestockOrder(
  careUnitId: string,
  createdByUserId: string,
  body: RestockLowStockRequest,
): Promise<OrderResponse> {
  const { buffer, careUnitMedicationIds } = body;

  const order = await prisma.$transaction(async (tx) => {
    // Re-verify each requested CUM is still under-threshold, in this
    // vårdenhet, and not soft-deleted. The cross-column predicate
    // `currentStock < lowStockThreshold` cannot be expressed in Prisma's
    // typed query builder — $queryRaw matches dashboard.service.ts.
    const eligible = await tx.$queryRaw<
      Array<{ id: string; currentStock: number; lowStockThreshold: number }>
    >`
      SELECT cum."id" AS "id",
             cum."currentStock",
             cum."lowStockThreshold"
      FROM "CareUnitMedication" cum
      WHERE cum."id" = ANY(${careUnitMedicationIds}::text[])
        AND cum."careUnitId" = ${careUnitId}
        AND cum."deletedAt" IS NULL
        AND cum."currentStock" < cum."lowStockThreshold"
    `;

    if (eligible.length === 0) {
      throw new ValidationFailedError(
        'Inga läkemedel under tröskel kvar att beställa.',
        { reason: 'no_items_to_restock' },
      );
    }

    const { year, counter } = await mintOrderNumber(tx, careUnitId);

    const draft = await tx.order.create({
      data: {
        careUnitId,
        createdByUserId,
        status: 'utkast',
        orderNumberCounter: counter,
        orderNumberYear: year,
      },
    });

    // One create per line so each row gets its own `orderLine.create`
    // audit entry (createMany is not intercepted by the audit extension).
    for (const cum of eligible) {
      const quantity = Math.max(
        1,
        cum.lowStockThreshold - cum.currentStock + buffer,
      );
      await tx.orderLine.create({
        data: {
          orderId: draft.id,
          careUnitMedicationId: cum.id,
          quantity,
        },
      });
    }

    return tx.order.findUnique({
      where: { id: draft.id },
      include: {
        lines: {
          include: {
            careUnitMedication: { include: { medication: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });
  });

  return toOrderResponse(order!);
}

// ---------------------------------------------------------------------------
// Internal helper — assertOrderEditable (D-66)
// ---------------------------------------------------------------------------

/**
 * Asserts that the order identified by `orderId` belongs to `careUnitId` and
 * has status 'utkast'. Used by all line-mutation service functions (D-54 / D-66).
 *
 * Throws NotFoundError  — row does not exist, is soft-deleted, or belongs to
 *                         a different careUnit (D-73 / D-19: 404, not 403).
 * Throws OrderLockedError — row exists + belongs to careUnit, but status !== utkast.
 */
async function assertOrderEditable(
  careUnitId: string,
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
    throw new NotFoundError('Beställningen hittades inte.');
  }

  if (order.status !== 'utkast') {
    throw new OrderLockedError({ status: order.status as 'skickad' | 'bekraftad' | 'levererad' });
  }
}
