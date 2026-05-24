import { prisma } from '../db/client.js';
import type { LowStockListResponse, TherapeuticClass } from '@meditrack/shared';

/**
 * Phase 6 D-16 / D-117 / D-120 / NTF-01 — Dashboard low-stock service.
 *
 * D-16: `careUnitId` is the FIRST argument (and the only argument).
 *   The session has a `careUnitId` snapshot that `requireSession`
 *   decorates onto `req.user`; the route passes `req.user!.careUnitId`
 *   here. The `$queryRaw` WHERE clause uses parameterised
 *   `${careUnitId}` so a code change cannot accidentally leak across
 *   tenants (T-06-01 carried over from T-02-01).
 *
 * D-117: full enumeration of every CareUnitMedication in the user's
 *   vårdenhet whose `currentStock < lowStockThreshold`, sorted by
 *   urgency ratio (most urgent first), ties broken by name. The sort
 *   is server-side so the FE renders rows in received order without a
 *   second sort pass.
 *
 * D-120: returns `{ rows, total }` only — no pagination, no
 *   `belowThresholdTotal`. The dashboard banner enumerates every row
 *   and the count is `rows.length` by definition.
 *
 * NTF-01: this is the read side of the Phase 6 low-stock notification
 *   feature. NTF-02 (auto-refresh on stock-changing mutation) is wired
 *   on the FE via TanStack `invalidateQueries(['dashboard', 'low-stock'])`
 *   in useDeliverOrder + useMedicationMutations (Plan 01 Task 2).
 *
 * Implementation: the cross-column predicate `currentStock <
 *   lowStockThreshold` cannot be expressed in Prisma's typed query
 *   builder; `$queryRaw` is the only path. The pattern is the same as
 *   medication.service.ts:listMedicationsForUnit's belowThresholdTotal
 *   block (lines 170-177) — parameterised SQL with no string
 *   concatenation. `therapeuticClass` is selected as `NULL::text`
 *   because Plan 02's migration has not landed yet; Plan 02 swaps
 *   that to `m."therapeuticClass"`.
 *
 * Phase 8 D-138 — SELECT widened with `atcCode` / `form` / `strength` so
 *   `order.service.listPickerSuggestions` consumes this function verbatim for
 *   its Lågt lager half. Single source of truth for the urgency-sorted
 *   low-stock query — no duplicate `$queryRaw` exists anywhere in the codebase.
 *   The existing dashboard banner ignores the new fields; the order picker
 *   renders them in its row subtitle.
 */

/**
 * List every under-threshold CareUnitMedication for the given vårdenhet.
 *
 * Sort: `(currentStock / lowStockThreshold) ASC, name ASC` — the most
 * urgent rows surface first. Ties are broken by name ascending for a
 * stable, deterministic order across refetches.
 *
 * Empty result is fine — the FE renders the celebratory empty state
 * (`Alla läkemedel är över tröskel.`) when `total === 0`.
 */
export async function listLowStockForUnit(
  careUnitId: string,
): Promise<LowStockListResponse> {
  const rows = await prisma.$queryRaw<
    Array<{
      careUnitMedicationId: string;
      medicationId: string;
      name: string;
      atcCode: string;
      form: string;
      strength: string | null;
      currentStock: number;
      lowStockThreshold: number;
      therapeuticClass: TherapeuticClass | null;
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
           -- Phase 6 Plan 02: column is now present on Medication (migration
           -- 0012). The select returns the closed-enum string ('A'..'V') or
           -- NULL; the row type above narrows it to TherapeuticClass | null.
           m."therapeuticClass"
    FROM "CareUnitMedication" cum
    JOIN "Medication" m ON cum."medicationId" = m."id"
    WHERE cum."careUnitId" = ${careUnitId}
      AND cum."deletedAt" IS NULL
      AND cum."currentStock" < cum."lowStockThreshold"
    ORDER BY (cum."currentStock"::float / cum."lowStockThreshold"::float) ASC,
             LOWER(m."name") ASC
  `;

  return {
    rows,
    total: rows.length,
  };
}
