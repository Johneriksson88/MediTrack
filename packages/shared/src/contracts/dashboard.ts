import { z } from 'zod';
import { therapeuticClassEnum } from '../constants/therapeuticClass.js';
import { orderStatusEnum } from '../constants/orderStatus.js';

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
 * of medicationListItem.
 *
 * Phase 8 D-138 — widened with `atcCode` / `form` / `strength` so
 * `listLowStockForUnit` callers (dashboard banner + order picker suggestions)
 * consume the same row shape. The banner ignores the new fields; the order
 * picker renders them in its second-line subtitle. Single source of truth
 * for the urgency-sorted low-stock query — no duplicate query logic anywhere
 * in the codebase.
 *
 * `therapeuticClass` is included (Plan 01) so the wire shape is
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
  // Phase 8 D-138 — widened so listLowStockForUnit callers (dashboard banner +
  // order picker suggestions) consume the same row shape. atcCode and form are
  // NOT NULL in the Medication table (required by NPL); strength is nullable.
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  // Phase 6 Plan 02 — upgraded from the Plan-01 placeholder
  // (z.string().nullable()) now that constants/therapeuticClass.ts ships
  // the closed enum. Wire shape is unchanged (still `<nullable string>`);
  // type now narrows to the 14-letter union (D-113 / D-114).
  therapeuticClass: therapeuticClassEnum.nullable(),
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

// ---------------------------------------------------------------------------
// Phase 9 D-141 / D-142 / D-143 / D-144 — Dashboard "Beställningar" card (ORD-09)
// ---------------------------------------------------------------------------

/**
 * Phase 9 D-141 / D-142 / D-143 / D-144 — Dashboard orders contract.
 *
 * D-141: Dedicated `GET /api/dashboard/orders` endpoint with its own
 *   cache key `['dashboard', 'orders']`. Mirrors the Phase 6 D-120
 *   dedicated-endpoint precedent: decouples dashboard refresh from
 *   `/bestallningar`'s `['orders', filters]` cache so a count update
 *   on the dashboard does not perturb a user's open list-page filter
 *   state and vice versa. Reusing `GET /api/orders?status=…` with
 *   2–3 round-trips per dashboard load was rejected (wasteful + couples
 *   caches); extending the existing low-stock endpoint into a unified
 *   payload was rejected (breaks dedicated-endpoint pattern, fattens
 *   an unrelated cache).
 *
 * D-142: Role-aware payload as a Zod discriminated union on `role`.
 *   The BE service inspects `req.user!.role` and returns one of two
 *   shapes — `'sjukskoterska'` gets `{egnaUtkast, recentHistory}`;
 *   `'apotekare' | 'admin'` gets `{skickad, bekraftad}`. FE discriminates
 *   on `data.role`. Smaller payload + less FE branching than a
 *   uniform-superset shape. The Fastify response schema is this union,
 *   so a service bug returning the wrong shape fails serialization at
 *   the route layer — Tests 1 and 2 assert the discriminator matches
 *   the session's role.
 *
 * D-143: Nurse `recentHistory` is vårdenhet-wide, not own-only. Surfaces
 *   "what's happening in my unit" rather than the narrower "what I
 *   personally created". Excludes utkast (drafts live in their own
 *   Egna utkast section). Matches the existing /bestallningar tab
 *   semantics — there is no nurse-vs-pharmacist split today.
 *
 * D-144: Top-5 rows per section, sorted DESC by createdAt. The `count`
 *   field carries the total matching rows (may exceed 5) — counts are
 *   the actionable signal, rows give context without forcing a tab
 *   navigation. Each row carries `id`, `status`, `lineCount`,
 *   `totalQuantity`, `createdBy.{id,name}`, `createdAt` — drilldown via
 *   `/bestallningar/:id` provides line details.
 *
 * Pattern: discriminated union on a literal `role` field — Zod narrows
 *   TS perfectly when the FE branches on `data.role`. Each `z.object`
 *   schema is followed by `export type X = z.infer<typeof x>` per the
 *   schema-then-type pairing established by lowStockItem above.
 */

/**
 * One row in either dashboard subview. Subset of OrderListItem (D-72) —
 * only the fields the dashboard card renders. Drilldown via
 * `/bestallningar/:id` provides line details (D-144).
 */
export const dashboardOrderRow = z.object({
  id: z.string(),
  status: orderStatusEnum, // 'utkast' | 'skickad' | 'bekraftad' | 'levererad'
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  // WR-01 (Phase 9 review) — tightened from `z.string()` to
  // `z.string().datetime()` so the wire shape enforces what the service
  // already emits (`order.createdAt.toISOString()`). Matches the sibling
  // `orderListItem.createdAt` (packages/shared/src/contracts/order.ts).
  // A future BE change that accidentally emits a non-ISO value (e.g.
  // dropped `Z`, epoch ms) now fails Zod parse on both sides instead of
  // silently breaking `formatRelative(row.createdAt)` in the FE.
  createdAt: z.string().datetime(),
});
export type DashboardOrderRow = z.infer<typeof dashboardOrderRow>;

/**
 * Nurse subview: own drafts + vårdenhet-wide recent history (D-143).
 * Module-private — only the union below is exported.
 */
const nurseSubview = z.object({
  role: z.literal('sjukskoterska'),
  egnaUtkast: z.object({
    count: z.number().int().nonnegative(),
    rows: z.array(dashboardOrderRow).max(5),
  }),
  recentHistory: z.array(dashboardOrderRow).max(5),
});

/**
 * Pharmacist / admin subview: skickad (att bekräfta) + bekraftad
 * (att leverera). Module-private — only the union below is exported.
 */
const pharmacistSubview = z.object({
  role: z.enum(['apotekare', 'admin']),
  skickad: z.object({
    count: z.number().int().nonnegative(),
    rows: z.array(dashboardOrderRow).max(5),
  }),
  bekraftad: z.object({
    count: z.number().int().nonnegative(),
    rows: z.array(dashboardOrderRow).max(5),
  }),
});

/**
 * Response envelope for GET /api/dashboard/orders (D-141 / D-142).
 * Discriminated on `role` so the FE narrows the subview shape via
 * `if (data.role === 'sjukskoterska') { … }`.
 */
export const dashboardOrdersResponse = z.discriminatedUnion('role', [
  nurseSubview,
  pharmacistSubview,
]);
export type DashboardOrdersResponse = z.infer<typeof dashboardOrdersResponse>;
