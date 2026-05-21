import { z } from 'zod';

/**
 * Phase 2 D-08 / D-44 / D-45 / D-31 — Medication contracts.
 *
 * D-44: `GET /api/medications` response shape with `belowThresholdTotal`
 *   (required, never optional; powers the LowStockBanner count even when
 *   the active filter set yields zero matching rows).
 *
 * D-45: `GET /api/medications/search` — top-20 global Medication results
 *   excluding drugs already actively stocked at the caller's vårdenhet.
 *
 * D-31: Create paths split into two named schemas + a discriminated union
 *   on `source`. 'npl' picks from the global Medication registry;
 *   'user' creates a new Medication{source:'user'} + CareUnitMedication
 *   in one transaction ("Skapa nytt läkemedel" fallback).
 *
 * Pattern: mirrors packages/shared/src/contracts/me.ts + login.ts.
 * All schemas are followed by `export type X = z.infer<typeof x>`.
 * Do NOT split by HTTP verb — all shapes in this one file (Shared anti-pattern).
 */

// ---------------------------------------------------------------------------
// List — paginated CareUnitMedication × Medication join rows (D-44)
// ---------------------------------------------------------------------------

/**
 * One row in the paginated medication list. Carries both the join-table
 * id (`careUnitMedicationId`) and the global medication id (`medicationId`)
 * so the FE can make targeted PATCH/DELETE requests without an extra lookup.
 * The `source` discriminator lets the FE branch NPL-locked vs user-editable
 * fields in the edit Sheet (Plan 03) without a second fetch (D-32).
 */
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

/**
 * Query parameters for GET /api/medications (D-44).
 * All numeric fields use z.coerce.* so Fastify query strings parse cleanly.
 * `belowThreshold` accepts only the literal strings 'true' or 'false';
 * absent is treated as unfiltered. Anything else returns 400 validation_failed.
 *
 * CR-01 fix: `z.coerce.boolean()` is unusable for query strings — it treats
 * any non-empty string (including 'false') as `true` because it's just
 * `Boolean(value)` under the hood. Using an explicit enum + transform makes
 * `?belowThreshold=false` actually mean "do not filter" for direct API
 * callers (the FE's clean-URL policy already omits the param when false).
 */
export const medicationListQuery = z.object({
  q: z.string().optional(),
  atc: z.string().optional(),
  form: z.string().optional(),
  belowThreshold: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type MedicationListQuery = z.infer<typeof medicationListQuery>;

/**
 * Response envelope for GET /api/medications (D-44).
 * `belowThresholdTotal` is required — never optional. The LowStockBanner
 * (D-39) reads this field even when the belowThreshold filter is inactive
 * (it shows the count for the current filter set, not the global count).
 */
export const medicationListResponse = z.object({
  rows: z.array(medicationListItem),
  total: z.number().int().nonnegative(),
  belowThresholdTotal: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type MedicationListResponse = z.infer<typeof medicationListResponse>;

// ---------------------------------------------------------------------------
// Search — typeahead over global Medication (D-45)
// ---------------------------------------------------------------------------

/**
 * Query parameters for GET /api/medications/search (D-45).
 * `q` is required (minimum 1 char enforced FE-side via `enabled` gate).
 * `limit` defaults to 20, max 20.
 */
export const medicationSearchQuery = z.object({
  q: z.string(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
export type MedicationSearchQuery = z.infer<typeof medicationSearchQuery>;

/**
 * One typeahead result — global Medication row shape (D-45).
 * `source` lets the FE render the "Från NPL" badge without a second fetch.
 */
export const medicationSearchResult = z.object({
  id: z.string(),
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  source: z.enum(['npl', 'user']),
});
export type MedicationSearchResult = z.infer<typeof medicationSearchResult>;

/** Response envelope for GET /api/medications/search. */
export const medicationSearchResponse = z.object({
  results: z.array(medicationSearchResult),
});
export type MedicationSearchResponse = z.infer<typeof medicationSearchResponse>;

// ---------------------------------------------------------------------------
// Create — two named paths + discriminated union (D-30, D-31)
// ---------------------------------------------------------------------------

/**
 * Create from NPL typeahead: caller has picked an existing global Medication
 * row by id. BE looks it up, then creates or restores a CareUnitMedication
 * row for the caller's vårdenhet (D-30 transparent restore).
 */
export const medicationCreateFromNplRequest = z.object({
  source: z.literal('npl'),
  medicationId: z.string().min(1),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
});
export type MedicationCreateFromNplRequest = z.infer<typeof medicationCreateFromNplRequest>;

/**
 * Create via "Skapa nytt läkemedel" fallback (D-31): caller provides all
 * fields; BE inserts Medication{source:'user'} + CareUnitMedication in one
 * transaction. nplId is null for user-created drugs.
 */
export const medicationCreateUserRequest = z.object({
  source: z.literal('user'),
  name: z.string().min(1),
  atcCode: z.string().min(1),
  form: z.string().min(1),
  strength: z.string().nullable().optional(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
});
export type MedicationCreateUserRequest = z.infer<typeof medicationCreateUserRequest>;

/**
 * Discriminated union on `source` — server rejects any body whose `source`
 * is not 'npl' or 'user' with 400 validation_failed (Zod handles this).
 * FE narrows with `payload.source === 'npl'` (no need to re-derive the type).
 */
export const medicationCreateRequest = z.discriminatedUnion('source', [
  medicationCreateFromNplRequest,
  medicationCreateUserRequest,
]);
export type MedicationCreateRequest = z.infer<typeof medicationCreateRequest>;

// ---------------------------------------------------------------------------
// Update — partial; service enforces NPL field locks (D-32)
// ---------------------------------------------------------------------------

/**
 * PATCH /api/medications/:id body.
 *
 * D-32: `name`, `atcCode`, `form`, and `strength` are accepted by this schema
 * for user-source meds, but the service (`updateCareUnitMedication`) strips
 * them server-side when the underlying Medication.source === 'npl' — defense
 * in depth; the FE for NPL meds also hides those fields.
 *
 * `.strict()` rejects unknown keys so a tampered body cannot slip extra fields
 * past Zod's boundary. `.refine(...)` requires at least one field to be present
 * so an empty PATCH body returns 400 validation_failed instead of a no-op 200.
 */
export const medicationUpdateRequest = z
  .object({
    currentStock: z.number().int().min(0).optional(),
    lowStockThreshold: z.number().int().min(1).optional(),
    name: z.string().min(1).optional(),
    atcCode: z
      .string()
      .regex(/^[A-V][0-9A-Z]{0,6}$/, 'Ogiltigt ATC-kodformat')
      .optional(),
    form: z.string().min(1).optional(),
    strength: z.string().nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Minst ett fält måste anges.',
  });
export type MedicationUpdateRequest = z.infer<typeof medicationUpdateRequest>;
