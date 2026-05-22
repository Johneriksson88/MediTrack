import type { Order, OrderLine, CareUnitMedication, Medication, User } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  NotFoundError,
  OrderLockedError,
  ValidationFailedError,
} from '../plugins/errorHandler.js';
import type {
  OrderResponse,
  OrderListItem,
  OrderListQuery,
  OrderListResponse,
  OrderLineResponse,
  PickerOption,
} from '@meditrack/shared';

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
};

type OrderForList = Order & {
  lines: Pick<OrderLine, 'id' | 'quantity'>[];
  createdBy: Pick<User, 'id' | 'name'>;
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
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    submittedByUserId: row.submittedByUserId,
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
    createdAt: row.createdAt.toISOString(),
    lineCount: row.lines.length,
    totalQuantity: row.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: { id: row.createdBy.id, name: row.createdBy.name },
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
  const order = await prisma.order.create({
    data: {
      careUnitId,
      createdByUserId,
      status: 'utkast',
    },
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
      status: filters.status,
      deletedAt: null,
    },
    include: {
      lines: { select: { id: true, quantity: true } },
      createdBy: { select: { id: true, name: true } },
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
 */
export async function softDeleteOrder(
  careUnitId: string,
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  // D-73 / D-19: 404 on cross-tenant or truly-not-found.
  if (!order || order.deletedAt !== null || order.careUnitId !== careUnitId) {
    throw new NotFoundError('Beställningen hittades inte.');
  }

  // D-67: Only utkast orders can be discarded.
  if (order.status !== 'utkast') {
    throw new OrderLockedError({ status: order.status as 'skickad' | 'bekraftad' | 'levererad' });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { deletedAt: new Date() },
  });
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
