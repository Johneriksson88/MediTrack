import { prisma } from '../db/client.js';
import type {
  LowStockListResponse,
  TherapeuticClass,
  DashboardOrdersResponse,
  DashboardOrderRow,
  Role,
} from '@meditrack/shared';

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

// ---------------------------------------------------------------------------
// Phase 9 D-16 / D-141 / D-142 / D-143 / D-144 — Dashboard "Beställningar" service
// ---------------------------------------------------------------------------

/**
 * Phase 9 D-16 / D-141 / D-142 / D-143 / D-144 — listDashboardOrdersForUser.
 *
 * D-16: `careUnitId` is the FIRST argument; `userId` and `role` follow.
 *   Every `prisma.order.findMany` and `prisma.order.count` in this
 *   function includes `where: { careUnitId, ... }` so a code change
 *   cannot accidentally leak across tenants (T-09-04 carry-over of
 *   T-06-01 / T-02-01). The route hands in `req.user!.careUnitId` from
 *   the authenticated session.
 *
 * D-141: dedicated endpoint with its own cache key `['dashboard', 'orders']`.
 *   Decouples dashboard refresh from `/bestallningar`'s `['orders', filters]`
 *   cache. Service returns one of two role-discriminated shapes — no
 *   pagination, top-5 rows per section, `count` carries the total.
 *
 * D-142: role-aware payload. The service branches on `role`; the Fastify
 *   response schema is `dashboardOrdersResponse` (Zod discriminated union
 *   on `role`). A service bug returning the wrong shape fails serialization
 *   at the route layer — the integration test asserts this mechanically.
 *
 * D-143: nurse `recentHistory` is vårdenhet-wide (any author) and excludes
 *   utkast (drafts live in their own egnaUtkast section above).
 *
 * D-144: top-5 rows per section, sorted DESC by createdAt; `count` is the
 *   total matching rows (separate `prisma.order.count` per section).
 *
 * Soft-delete: every query filters `deletedAt: null` to match the
 *   listOrdersForUnit convention (D-62 / D-33) — discarded drafts never
 *   surface on the dashboard.
 */

/**
 * Shared include shape for the dashboard row mapper. The two fields
 * mirror the OrderListItem subset — `createdBy.{id,name}` for the row
 * subtitle and `lines.{id,quantity}` for `lineCount` + `totalQuantity`.
 */
const dashboardOrderInclude = {
  createdBy: { select: { id: true, name: true } },
  lines: { select: { id: true, quantity: true } },
} as const;

/**
 * Row cap per section (D-144). Counts may exceed this — the `count`
 * field on each section carries the total.
 */
const DASHBOARD_ROW_LIMIT = 5;

/**
 * Map a loaded Prisma Order row (with `createdBy` + lean `lines`) to the
 * shared DashboardOrderRow contract. Mirrors the subset of OrderListItem
 * the dashboard card renders.
 */
function toDashboardOrderRow(order: {
  id: string;
  status: DashboardOrderRow['status'];
  createdAt: Date;
  createdBy: { id: string; name: string };
  lines: Array<{ id: string; quantity: number }>;
}): DashboardOrderRow {
  return {
    id: order.id,
    status: order.status,
    lineCount: order.lines.length,
    totalQuantity: order.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: { id: order.createdBy.id, name: order.createdBy.name },
    createdAt: order.createdAt.toISOString(),
  };
}

/**
 * Returns the dashboard "Beställningar" payload for the given user.
 *
 * Nurses (`'sjukskoterska'`) get `{egnaUtkast: {count, rows},
 * recentHistory}` — their own utkast drafts plus the 5 most recent
 * non-utkast orders for the vårdenhet (D-143).
 *
 * Pharmacists / admins (`'apotekare' | 'admin'`) get `{skickad: {count,
 * rows}, bekraftad: {count, rows}}` — orders waiting to be confirmed and
 * orders waiting to be delivered, in their care unit.
 *
 * All branches are top-5 DESC by createdAt; counts carry the total
 * matching rows (may exceed 5). Soft-deleted orders are excluded.
 */
export async function listDashboardOrdersForUser(
  careUnitId: string,
  userId: string,
  role: Role,
): Promise<DashboardOrdersResponse> {
  if (role === 'sjukskoterska') {
    const [egnaUtkastRows, egnaUtkastCount, recentHistoryRows] =
      await Promise.all([
        prisma.order.findMany({
          where: {
            careUnitId,
            status: 'utkast',
            createdByUserId: userId,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: DASHBOARD_ROW_LIMIT,
          include: dashboardOrderInclude,
        }),
        prisma.order.count({
          where: {
            careUnitId,
            status: 'utkast',
            createdByUserId: userId,
            deletedAt: null,
          },
        }),
        // D-143 — vårdenhet-wide, excludes utkast, any author.
        prisma.order.findMany({
          where: {
            careUnitId,
            status: { not: 'utkast' },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: DASHBOARD_ROW_LIMIT,
          include: dashboardOrderInclude,
        }),
      ]);

    return {
      role: 'sjukskoterska',
      egnaUtkast: {
        count: egnaUtkastCount,
        rows: egnaUtkastRows.map(toDashboardOrderRow),
      },
      recentHistory: recentHistoryRows.map(toDashboardOrderRow),
    };
  }

  // role === 'apotekare' || role === 'admin' — Zod enum on the wire side
  // permits both literals; the service returns whichever role the caller is.
  const [skickadRows, skickadCount, bekraftadRows, bekraftadCount] =
    await Promise.all([
      prisma.order.findMany({
        where: { careUnitId, status: 'skickad', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: DASHBOARD_ROW_LIMIT,
        include: dashboardOrderInclude,
      }),
      prisma.order.count({
        where: { careUnitId, status: 'skickad', deletedAt: null },
      }),
      prisma.order.findMany({
        where: { careUnitId, status: 'bekraftad', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: DASHBOARD_ROW_LIMIT,
        include: dashboardOrderInclude,
      }),
      prisma.order.count({
        where: { careUnitId, status: 'bekraftad', deletedAt: null },
      }),
    ]);

  return {
    role,
    skickad: {
      count: skickadCount,
      rows: skickadRows.map(toDashboardOrderRow),
    },
    bekraftad: {
      count: bekraftadCount,
      rows: bekraftadRows.map(toDashboardOrderRow),
    },
  };
}
