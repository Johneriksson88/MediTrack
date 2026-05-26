import { z } from 'zod';
import { therapeuticClassEnum } from '../constants/therapeuticClass.js';

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
  // Phase 6 D-115 — nullable until the user (or AI suggest path in Plan 03)
  // sets a value. Closed enum via therapeuticClassEnum (D-113 / D-114).
  therapeuticClass: therapeuticClassEnum.nullable(),
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
  // Phase 6 AI-03 / D-116 — optional single-letter ATC level-1 class filter
  // (URL param `?class=N` is normalized to this key on the FE).
  therapeuticClass: therapeuticClassEnum.optional(),
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
 * `q` is required and must be ≥ 1 char — empty values reject at the API
 * boundary with 400 validation_failed.
 * `limit` defaults to 20, max 20.
 *
 * CR-03 fix: previously `q: z.string()` accepted '' as valid, which the
 * service used in `name: { contains: '', mode: 'insensitive' }` — Prisma
 * compiled this to `ILIKE '%%'` and scanned all ~43k Medication rows on
 * every empty-string call. The FE already gates on `debouncedQ.length > 0`
 * (UI-SPEC §6a typeahead), so single-char queries are intentional UX and
 * we keep `.min(1)` rather than `.min(2)` — the goal is to close the
 * empty-string hole for direct API callers, not to tighten FE UX.
 */
export const medicationSearchQuery = z.object({
  q: z.string().min(1),
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

/**
 * Response envelope for GET /api/medications/search.
 *
 * D-139 (Phase 8 CAT-10): `globalCatalogMatchCount` is the pre-D-45-exclusion
 * count of NPL Medication rows matching `q`. It lets the FE distinguish two
 * empty-state causes:
 *   - `globalCatalogMatchCount === 0` → NPL truly has no match for the query
 *     (Variant A: "Inget i NPL matchade »{q}«.")
 *   - `globalCatalogMatchCount > 0` AND `results.length === 0` → every NPL
 *     match is already stocked at this vårdenhet and was excluded by D-45
 *     (Variant B: "Alla träffar finns redan i din vårdenhet.")
 *
 * The count query deliberately omits the careUnitMedications exclusion so it
 * reflects the raw NPL catalog match count before D-45 filtering.
 */
export const medicationSearchResponse = z.object({
  results: z.array(medicationSearchResult),
  globalCatalogMatchCount: z.number().int().nonnegative(),
});
export type MedicationSearchResponse = z.infer<typeof medicationSearchResponse>;

// ---------------------------------------------------------------------------
// ATC Codes — global distinct list from Medication catalog (Phase 8 D-132)
// ---------------------------------------------------------------------------

/**
 * Response envelope for GET /api/medications/atc-codes (Phase 8 D-132).
 *
 * D-132: Returns the DISTINCT full ATC code list from the global Medication
 *   catalog, sorted ascending. ~3,000 unique 7-char codes in the seeded NPL
 *   data. Used by AtcCodeCombobox (D-134) in both LakemedelFilter and the
 *   MedicationSheet user-create form.
 *
 * D-133: Cache policy — `staleTime: Infinity` with explicit invalidation in
 *   `useCreateMedication.onSuccess` so a freshly-created user medication's
 *   new ATC code is immediately available in the combobox.
 *
 * Route: apps/api/src/routes/medications/atcCodes.ts
 * Service: apps/api/src/services/medication.service.ts#listGlobalAtcCodes
 * Consumer: apps/web/src/features/medications/useAtcCodesQuery.ts
 */
export const atcCodesResponse = z.object({ codes: z.array(z.string()) });
export type AtcCodesResponse = z.infer<typeof atcCodesResponse>;

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
  // Phase 6 D-115 + D-32 carve-out: therapeuticClass is editable on NPL meds
  // (classification is metadata, not pharmaceutical identity). Optional/
  // nullable because the create-from-NPL path can run without choosing a
  // class — the Sheet's AI-suggest flow (Plan 03) populates this later.
  therapeuticClass: therapeuticClassEnum.nullable().optional(),
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
  // Phase 6 D-115 — therapeuticClass is optional on the user-create path
  // (the Sheet's "Hämta AI-förslag" affordance lands in Plan 03; user-created
  // meds start without a class until they Apply a suggestion or pick one).
  therapeuticClass: therapeuticClassEnum.nullable().optional(),
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
// ---------------------------------------------------------------------------
// Bulk catalog management — Sortiment page (admin + apotekare)
// ---------------------------------------------------------------------------

/**
 * Hard upper bound on a single bulk operation. Picked so that even at
 * "all of class N" (the largest WHO ATC level-1 group in the seeded NPL data)
 * the admin is forced to narrow the filter — keeps transactions tight and
 * audit-row floods bounded.
 */
export const BULK_MEDICATION_LIMIT = 2000;

/**
 * GET /api/medications/bulk-add-candidates — paginated list of global
 * Medication rows NOT currently active in the caller's vårdenhet sortiment.
 *
 * Same exclusion logic as /search (D-45) — already-active CareUnitMedication
 * rows are filtered out — but with proper pagination, larger page size, and
 * full filter set (q/atc-prefix/form/therapeuticClass) so the FE can resolve
 * "add all in class X" → concrete medicationId list.
 */
export const bulkAddCandidatesQuery = z.object({
  q: z.string().optional(),
  atc: z.string().optional(),
  form: z.string().optional(),
  therapeuticClass: therapeuticClassEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type BulkAddCandidatesQuery = z.infer<typeof bulkAddCandidatesQuery>;

export const bulkAddCandidate = z.object({
  medicationId: z.string(),
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  source: z.enum(['npl', 'user']),
  therapeuticClass: therapeuticClassEnum.nullable(),
});
export type BulkAddCandidate = z.infer<typeof bulkAddCandidate>;

export const bulkAddCandidatesResponse = z.object({
  rows: z.array(bulkAddCandidate),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type BulkAddCandidatesResponse = z.infer<typeof bulkAddCandidatesResponse>;

/**
 * POST /api/medications/bulk — add a batch of medications to the caller's
 * sortiment. Each item carries its own threshold so the FE can apply a single
 * default and let the admin override per-row before commit.
 *
 * Restore semantics: when a (careUnitId, medicationId) pair exists soft-deleted,
 * the bulk path PRESERVES the row's existing currentStock (unlike the single
 * create-from-NPL path which overwrites it). The threshold from the request
 * is always applied. Brand-new rows start at stock=0.
 *
 * Active duplicates are silently skipped (idempotent — no 409). The response
 * counts let the FE message "X tillagda, Y återställda, Z fanns redan".
 */
export const bulkAddMedicationsRequest = z
  .object({
    items: z
      .array(
        z.object({
          medicationId: z.string().min(1),
          lowStockThreshold: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(BULK_MEDICATION_LIMIT),
  })
  .strict();
export type BulkAddMedicationsRequest = z.infer<typeof bulkAddMedicationsRequest>;

export const bulkAddMedicationsResponse = z.object({
  added: z.number().int().nonnegative(),
  restored: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type BulkAddMedicationsResponse = z.infer<typeof bulkAddMedicationsResponse>;

/**
 * DELETE /api/medications/bulk — soft-delete a batch of CareUnitMedication
 * rows. Already-deleted / cross-tenant / missing IDs are silently skipped
 * (idempotent; existence-probing is collapsed per D-19 / T-02-17). The
 * response `deleted` count reflects rows actually transitioned.
 */
export const bulkRemoveMedicationsRequest = z
  .object({
    careUnitMedicationIds: z
      .array(z.string().min(1))
      .min(1)
      .max(BULK_MEDICATION_LIMIT),
  })
  .strict();
export type BulkRemoveMedicationsRequest = z.infer<typeof bulkRemoveMedicationsRequest>;

export const bulkRemoveMedicationsResponse = z.object({
  deleted: z.number().int().nonnegative(),
});
export type BulkRemoveMedicationsResponse = z.infer<typeof bulkRemoveMedicationsResponse>;

/**
 * POST /api/medications/bulk-remove-preview — pre-flight check for the
 * confirm dialog: counts in-flight orders (status ≠ levererad/utkast that
 * own a soft-delete-by-association?). Implementation counts non-levererad,
 * non-soft-deleted Order rows that reference any of the selected CUMs via
 * OrderLine, so the admin sees "N läkemedel har pågående beställningar"
 * before committing.
 *
 * `withStockUnits` is the total currentStock across the selection — drives
 * the "lagersaldot bevaras" warning copy without a second round-trip.
 */
export const bulkRemovePreviewRequest = bulkRemoveMedicationsRequest;
export type BulkRemovePreviewRequest = z.infer<typeof bulkRemovePreviewRequest>;

export const bulkRemovePreviewResponse = z.object({
  inFlightOrderCount: z.number().int().nonnegative(),
  withStockCount: z.number().int().nonnegative(),
  withStockUnits: z.number().int().nonnegative(),
});
export type BulkRemovePreviewResponse = z.infer<typeof bulkRemovePreviewResponse>;

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
    // Phase 6 D-115 + D-32 carve-out: therapeuticClass IS editable on NPL
    // meds (classification is metadata, not pharmaceutical identity).
    // updateCareUnitMedication writes this unconditionally — NOT inside the
    // `source === 'user'` branch where name/atcCode/form/strength are gated.
    therapeuticClass: therapeuticClassEnum.nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Minst ett fält måste anges.',
  });
export type MedicationUpdateRequest = z.infer<typeof medicationUpdateRequest>;
