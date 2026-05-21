import { z } from 'zod';
import { orderStatusEnum } from '../constants/orderStatus.js';

/**
 * Phase 3 D-08 / D-46 / D-47 / D-48 / D-49 / D-55 / D-65 — Order contracts.
 *
 * D-08: Zod schemas in this file are the FE↔BE contract for the order flow.
 *   Both sides import from '@meditrack/shared'; inferred TS types are the
 *   canonical shape.
 *
 * D-46: status field reuses `orderStatusEnum` from constants/orderStatus.ts —
 *   NOT redeclared here. Single source of truth for the closed status set.
 *
 * D-47: OrderLine carries denormalized read-time fields (name, atcCode,
 *   form, strength, currentStock, lowStockThreshold) joined at request time,
 *   not snapshotted. Phase 4's deliver transition introduces snapshot columns.
 *
 * D-50: createOrderRequest = z.object({}).strict() — empty body, rejects
 *   stray fields that could attempt mass-assignment (T-03-02 mitigation).
 *
 * D-55: orderResponse includes status: orderStatusEnum so the FE can branch
 *   on 'utkast' vs 'skickad' to decide which affordances to show.
 *
 * Pattern: mirrors packages/shared/src/contracts/medication.ts.
 * All schemas are followed by `export type X = z.infer<typeof x>`.
 * Do NOT split by HTTP verb — all shapes in this one file.
 */

// ---------------------------------------------------------------------------
// Lines — denormalized read-time shape for embedded order lines (D-47)
// ---------------------------------------------------------------------------

/**
 * Single order line as returned in GET /api/orders/:id. Denormalized
 * medication fields are joined at read time (D-47); the line FK is
 * careUnitMedicationId so the picker and the line list share a row ID.
 *
 * strength is nullable because NPL medications may omit it (consistent
 * with MedicationListItem.strength behavior from Phase 2).
 */
export const orderLineResponse = z.object({
  id: z.string(),
  careUnitMedicationId: z.string(),
  quantity: z.number().int().positive(),
  // Denormalized from CareUnitMedication × Medication at read time (D-47).
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
});
export type OrderLineResponse = z.infer<typeof orderLineResponse>;

// ---------------------------------------------------------------------------
// Single order — full detail shape (D-48, D-49, D-55, D-62)
// ---------------------------------------------------------------------------

/**
 * Full Order response — returned by GET /api/orders/:id, POST /api/orders,
 * all line-op endpoints, and POST /api/orders/:id/submit (D-57).
 *
 * submittedAt + submittedBy are null while status === 'utkast'; populated
 * atomically by the submit transition (D-49).
 *
 * createdBy.name is denormalized from User at read time (not snapshotted).
 */
export const orderResponse = z.object({
  id: z.string(),
  careUnitId: z.string(),
  createdByUserId: z.string(),
  status: orderStatusEnum,
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineResponse),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  submittedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type OrderResponse = z.infer<typeof orderResponse>;

// ---------------------------------------------------------------------------
// List — lean row shape for the drafts table (D-53, D-72)
// ---------------------------------------------------------------------------

/**
 * One row in the drafts list (GET /api/orders?status=utkast).
 * D-72 columns: created date, line count, total quantity, createdBy.
 * Lean shape — no embedded lines (those come from GET /api/orders/:id).
 */
export const orderListItem = z.object({
  id: z.string(),
  status: orderStatusEnum,
  createdAt: z.string().datetime(),
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
});
export type OrderListItem = z.infer<typeof orderListItem>;

/**
 * Query parameters for GET /api/orders.
 * Defaults status to 'utkast' per D-53 (the primary view is the drafts list).
 * Phase 7 will add richer pagination; stubs included with sensible defaults.
 */
export const orderListQuery = z.object({
  status: orderStatusEnum.default('utkast'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

/**
 * Response envelope for GET /api/orders.
 */
export const orderListResponse = z.object({
  rows: z.array(orderListItem),
  total: z.number().int().nonnegative(),
});
export type OrderListResponse = z.infer<typeof orderListResponse>;

// ---------------------------------------------------------------------------
// Mutation request bodies — strict() prevents mass-assignment (T-03-02)
// ---------------------------------------------------------------------------

/**
 * POST /api/orders body — intentionally empty (D-50). All draft attributes
 * (careUnitId, createdByUserId) come from req.user; the body must be empty.
 * .strict() rejects any stray fields (T-03-02 mass-assignment mitigation).
 */
export const createOrderRequest = z.object({}).strict();
export type CreateOrderRequest = z.infer<typeof createOrderRequest>;

/**
 * POST /api/orders/:id/lines body — adds one line to a draft.
 * quantity must be a positive integer (D-63 Zod-level validation).
 * .strict() rejects stray fields like orderId, careUnitId (T-03-02).
 */
export const addOrderLineRequest = z
  .object({
    careUnitMedicationId: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();
export type AddOrderLineRequest = z.infer<typeof addOrderLineRequest>;

/**
 * PATCH /api/orders/:id/lines/:lineId body — updates quantity only.
 * .strict() mirrors medicationUpdateRequest pattern (medication.ts:191-206).
 */
export const updateOrderLineRequest = z
  .object({
    quantity: z.number().int().positive(),
  })
  .strict();
export type UpdateOrderLineRequest = z.infer<typeof updateOrderLineRequest>;

// ---------------------------------------------------------------------------
// Picker — typeahead for MedicationPickerSheet (D-58, D-59, D-61)
// ---------------------------------------------------------------------------

/**
 * Query parameters for GET /api/orders/picker-options (D-59).
 * Verbatim mirror of medicationSearchQuery (medication.ts:105-109):
 * q is required (≥ 1 char), limit defaults to 20 (max 20).
 */
export const pickerOptionsQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
export type PickerOptionsQuery = z.infer<typeof pickerOptionsQuery>;

/**
 * One picker typeahead result row (D-59 + D-61).
 * Shows { name } · {atcCode} · {form} · Lager: {currentStock} [LowStockBadge?]
 * The FE renders the LowStockBadge when currentStock < lowStockThreshold.
 */
export const pickerOption = z.object({
  careUnitMedicationId: z.string(),
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
});
export type PickerOption = z.infer<typeof pickerOption>;

/**
 * Response envelope for GET /api/orders/picker-options.
 */
export const pickerOptionsResponse = z.object({
  results: z.array(pickerOption),
});
export type PickerOptionsResponse = z.infer<typeof pickerOptionsResponse>;
