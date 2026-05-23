import { z } from 'zod';

/**
 * Phase 6 D-08 / D-120 / NTF-01 — Dashboard low-stock contract.
 *
 * D-08: Zod schemas in this file are the FE↔BE contract for the
 *   dashboard low-stock endpoint. Both sides import from
 *   '@meditrack/shared'; inferred TS types are the canonical shape.
 *
 * D-120: Dedicated `GET /api/dashboard/low-stock` endpoint owning its
 *   own cache key `['dashboard', 'low-stock']`. Decoupled from
 *   `/lakemedel`'s `['medications', filters]` cache so filter changes
 *   on the catalog page do NOT invalidate the dashboard banner, and
 *   the dashboard payload stays narrow (no pagination, no
 *   `belowThresholdTotal`). Reusing `GET /api/medications?belowThreshold=true`
 *   was rejected because the cache-key collision would couple the two
 *   surfaces and the payload would carry page metadata the banner
 *   does not need.
 *
 * NTF-01: full enumeration of every CareUnitMedication in the user's
 *   vårdenhet whose `currentStock < lowStockThreshold`. Sorted
 *   server-side by urgency ratio (D-117).
 *
 * Pattern: narrower variant of medication.ts:medicationListResponse —
 *   only the rows + total the banner needs. All schemas are followed
 *   by `export type X = z.infer<typeof x>`.
 */

// ---------------------------------------------------------------------------
// List item — one low-stock row (D-117)
// ---------------------------------------------------------------------------

/**
 * One row in the dashboard low-stock list. Mirrors the relevant subset
 * of medicationListItem; drops fields the banner does not show
 * (atcCode, form, strength, source) and adds `therapeuticClass` for
 * Phase 6 Plan 02's filter integration (currently a free-string nullable
 * placeholder; see TODO below).
 *
 * `therapeuticClass` is included now (Plan 01) so the wire shape is
 * stable across the phase — Plan 03's AI suggestion flow will populate
 * the column for selected meds and the dashboard row will surface it
 * without a second contract bump.
 */
export const lowStockItem = z.object({
  careUnitMedicationId: z.string(),
  medicationId: z.string(),
  name: z.string(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
  // TODO Phase 6 Plan 02: replace z.string().nullable() with
  // therapeuticClassEnum.nullable() once constants/therapeuticClass.ts lands.
  // Plan 01 ships first (D-120 dashboard banner) and must compile WITHOUT
  // depending on Plan 02's migration / enum constant.
  therapeuticClass: z.string().nullable(),
});
export type LowStockItem = z.infer<typeof lowStockItem>;

// ---------------------------------------------------------------------------
// List response (D-120 — narrower than medicationListResponse)
// ---------------------------------------------------------------------------

/**
 * Response envelope for GET /api/dashboard/low-stock (D-120).
 * No pagination, no `belowThresholdTotal` — the banner enumerates
 * every row and the count is `rows.length` by definition.
 */
export const lowStockListResponse = z.object({
  rows: z.array(lowStockItem),
  total: z.number().int().nonnegative(),
});
export type LowStockListResponse = z.infer<typeof lowStockListResponse>;
