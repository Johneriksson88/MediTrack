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
  // Phase 10 D-165 — formatted display string ('ORD-YYYY-####') is the
  // single value FE renders; counter + year are the structured columns
  // (kept on the full response shape for audit / debug / future search).
  // All three are REQUIRED post-migration — the DB columns are NOT NULL.
  orderNumber: z.string(),
  orderNumberCounter: z.number().int().positive(),
  orderNumberYear: z.number().int().positive(),
  submittedAt: z.string().datetime().nullable(),
  submittedByUserId: z.string().nullable(),
  // Phase 4 D-84 — confirm/deliver actor trios; null until the respective transition.
  confirmedAt: z.string().datetime().nullable(),
  confirmedByUserId: z.string().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  deliveredByUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineResponse),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  submittedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  // Phase 4 D-84 — denormalized actor names for the audit trail.
  confirmedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  deliveredBy: z.object({ id: z.string(), name: z.string() }).nullable(),
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
  // Phase 10 D-165 — formatted display string only; counter + year stay
  // off the lean list shape (per CONTEXT.md Claude's discretion line 297).
  orderNumber: z.string(),
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
export type OrderListItem = z.infer<typeof orderListItem>;

/**
 * Query parameters for GET /api/orders.
 * Defaults status to 'utkast' per D-53 (the primary view is the drafts list).
 * Phase 7 will add richer pagination; stubs included with sensible defaults.
 */
export const orderListQuery = z.object({
  // Phase 4 — accept single status, comma-list ('skickad,bekraftad'), or array.
  // The route parses ?status=skickad,bekraftad into ['skickad','bekraftad'] before validation.
  status: z.union([orderStatusEnum, z.array(orderStatusEnum)]).default('utkast'),
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
 * POST /api/orders/:id/confirm body — intentionally empty (D-75). All context
 * (careUnitId, actorUserId) comes from req.user; the body must be empty.
 * .strict() rejects stray fields (T-04-02 mass-assignment mitigation).
 * .nullish() so callers may omit the body entirely — Fastify passes the body
 * as `null` when no payload is sent and as `undefined` in some test paths;
 * both should be accepted because the mitigation only concerns stray FIELDS,
 * not absence.
 */
export const confirmOrderRequest = z.object({}).strict().nullish();
export type ConfirmOrderRequest = z.infer<typeof confirmOrderRequest>;

/**
 * POST /api/orders/:id/deliver body — intentionally empty (D-75). All context
 * (careUnitId, actorUserId) comes from req.user; the body must be empty.
 * .strict() rejects stray fields (T-04-02 mass-assignment mitigation).
 * .nullish() so callers may omit the body entirely — see confirmOrderRequest.
 */
export const deliverOrderRequest = z.object({}).strict().nullish();
export type DeliverOrderRequest = z.infer<typeof deliverOrderRequest>;

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
 * q is required (≥ 1 char AFTER trim), limit defaults to 20 (max 20).
 *
 * WR-07: q is .trim()ed before .min(1) so a whitespace-only query (e.g.,
 * a stray IME composition or a paste with leading spaces) fails fast at
 * the boundary instead of firing a useless DB ILIKE for ' '. The FE
 * (usePickerOptionsQuery) also trims before calling, so the two layers
 * agree on what counts as a "non-empty" query.
 */
export const pickerOptionsQuery = z.object({
  q: z.string().trim().min(1),
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

/**
 * Phase 8 D-138 — picker-suggestions row.
 * Mirrors pickerOption + `medicationId` (the global Medication id, surfaced
 * for free from the listLowStockForUnit join — keeps the two arrays homogeneous).
 */
export const pickerSuggestion = pickerOption.extend({ medicationId: z.string() });
export type PickerSuggestion = z.infer<typeof pickerSuggestion>;

/**
 * Phase 8 D-135 + D-138 — GET /api/orders/picker-suggestions response.
 * Service-layer dedupe guarantees no careUnitMedicationId appears in both
 * arrays (Lågt lager wins; Mest beställda pulls the 6th-ranked).
 */
export const pickerSuggestionsResponse = z.object({
  mostOrdered: z.array(pickerSuggestion),
  lowStock: z.array(pickerSuggestion),
});
export type PickerSuggestionsResponse = z.infer<typeof pickerSuggestionsResponse>;

// ---------------------------------------------------------------------------
// Restock low-stock — preview + create
// ---------------------------------------------------------------------------

/**
 * One non-`levererad` order that already references a given low-stock
 * CareUnitMedication. Surfaced in the preview modal as a warning chip so
 * the user can avoid double-ordering items that are already in flight.
 */
export const restockPreviewInFlightOrder = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: orderStatusEnum, // service filters to utkast|skickad|bekraftad
  quantity: z.number().int().positive(),
});
export type RestockPreviewInFlightOrder = z.infer<typeof restockPreviewInFlightOrder>;

/**
 * One row in the restock-preview list. Mirrors LowStockItem's medication
 * fields plus aggregated in-flight quantity across all non-`levererad`
 * orders in the caller's vårdenhet.
 */
export const restockPreviewRow = z.object({
  careUnitMedicationId: z.string(),
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
  inFlightQuantity: z.number().int().nonnegative(),
  inFlightOrders: z.array(restockPreviewInFlightOrder),
});
export type RestockPreviewRow = z.infer<typeof restockPreviewRow>;

/**
 * Response envelope for GET /api/orders/restock-preview. Rows are sorted
 * by urgency ratio (same order as listLowStockForUnit).
 */
export const restockPreviewResponse = z.object({
  rows: z.array(restockPreviewRow),
});
export type RestockPreviewResponse = z.infer<typeof restockPreviewResponse>;

/**
 * POST /api/orders/restock-low-stock body.
 *
 * `buffer` is the number of units to order *above* each item's threshold
 * (quantity = max(1, lowStockThreshold − currentStock + buffer) per line).
 * `careUnitMedicationIds` lists the items the user selected after seeing
 * the in-flight warnings — the server re-checks each one is still
 * low-stock and silently drops those that have recovered.
 *
 * .strict() mirrors createOrderRequest (T-03-02 mass-assignment mitigation).
 */
export const restockLowStockRequest = z
  .object({
    buffer: z.number().int().min(0).max(10000),
    careUnitMedicationIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type RestockLowStockRequest = z.infer<typeof restockLowStockRequest>;
