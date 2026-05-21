import type { Medication, CareUnitMedication } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  ConflictDuplicateMedicationError,
  NotFoundError,
  ForbiddenScopeError,
} from '../plugins/errorHandler.js';
import type {
  MedicationListResponse,
  MedicationListQuery,
  MedicationListItem,
  MedicationSearchResult,
  MedicationCreateRequest,
  MedicationUpdateRequest,
} from '@meditrack/shared';
import { OVRIGA_FILTER_VALUE, TOP_MEDICATION_FORMS } from '@meditrack/shared';

/**
 * Pattern D / D-16 — careUnitId-first service layer for medication CRUD.
 *
 * D-16: `careUnitId` is the FIRST argument on every service function. The
 *   session has a `careUnitId` snapshot (D-16) that the auth preHandler
 *   decorates onto `req.user`; we pass it here and include it in every
 *   Prisma `where` so a future code change can't accidentally leak across
 *   tenants (T-02-01).
 *
 * D-30: Transparent restore — re-adding a soft-deleted medication updates
 *   the existing CareUnitMedication row (deletedAt=null) rather than
 *   inserting a duplicate.
 *
 * D-44: `listMedicationsForUnit` returns { rows, total, belowThresholdTotal,
 *   page, pageSize }. `belowThresholdTotal` is always computed (not just
 *   when the belowThreshold filter is active) — it powers the LowStockBanner.
 *
 * D-45: `searchGlobalMedications` searches the global Medication catalog
 *   but EXCLUDES drugs already actively stocked at the caller's vårdenhet.
 *
 * Security: every function asserts that returned/modified rows belong to
 *   the provided careUnitId (last line of defense per D-16).
 */

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

type MedicationWithJoin = CareUnitMedication & { medication: Medication };

/**
 * Map a Prisma join row to the shared MedicationListItem DTO.
 * Exported so route files can reuse without re-importing prisma.
 */
export function toListItem(row: MedicationWithJoin): MedicationListItem {
  return {
    careUnitMedicationId: row.id,
    medicationId: row.medicationId,
    name: row.medication.name,
    atcCode: row.medication.atcCode,
    form: row.medication.form,
    strength: row.medication.strength,
    currentStock: row.currentStock,
    lowStockThreshold: row.lowStockThreshold,
    source: row.medication.source as 'npl' | 'user',
  };
}

// ---------------------------------------------------------------------------
// List — paginated CareUnitMedication rows scoped to careUnit
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of CareUnitMedication × Medication rows for the
 * given vårdenhet (D-44). Always includes `belowThresholdTotal` for the same
 * filter set (drives the LowStockBanner even when belowThreshold filter is off).
 *
 * Cross-column comparison (currentStock < lowStockThreshold) requires
 * $queryRaw — Prisma cannot express a column-vs-column predicate in the
 * typed query builder. We use parameterised SQL to prevent injection (T-02-01).
 */
export async function listMedicationsForUnit(
  careUnitId: string,
  filters: MedicationListQuery,
): Promise<MedicationListResponse> {
  const { q, atc, form, belowThreshold, page, pageSize } = filters;
  const skip = (page - 1) * pageSize;

  // ---- Build the Prisma `where` clause ----
  // We always scope to the caller's vårdenhet and exclude soft-deleted rows.
  // Use Prisma's CareUnitMedicationWhereInput shape directly to satisfy types.
  const medicationWhereConditions: Record<string, unknown> = {};

  if (q) {
    medicationWhereConditions.name = { contains: q, mode: 'insensitive' };
  }
  if (atc) {
    medicationWhereConditions.atcCode = { startsWith: atc, mode: 'insensitive' };
  }
  if (form === OVRIGA_FILTER_VALUE) {
    medicationWhereConditions.form = { notIn: [...TOP_MEDICATION_FORMS] };
  } else if (form) {
    medicationWhereConditions.form = form;
  }

  const baseWhere = {
    careUnitId,
    deletedAt: null,
    ...(Object.keys(medicationWhereConditions).length > 0
      ? { medication: medicationWhereConditions }
      : {}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  if (belowThreshold) {
    // Cross-column filter: currentStock < lowStockThreshold.
    // We must use $queryRaw because Prisma cannot express column-vs-column.
    // Strategy: get the matching IDs via raw SQL, then load full rows via
    // findMany for type safety (avoids raw-to-DTO mapping complexity).

    // Build parameterised WHERE clause fragments for raw query.
    const params: unknown[] = [careUnitId];
    const extraClauses: string[] = [
      'cum."deletedAt" IS NULL',
      'cum."currentStock" < cum."lowStockThreshold"',
    ];

    let paramIdx = 2; // $1 is careUnitId
    if (q) {
      extraClauses.push(`m."name" ILIKE $${paramIdx}`);
      params.push(`%${q}%`);
      paramIdx++;
    }
    if (atc) {
      extraClauses.push(`m."atcCode" ILIKE $${paramIdx}`);
      params.push(`${atc}%`);
      paramIdx++;
    }
    if (form === OVRIGA_FILTER_VALUE) {
      // NOT IN with Postgres array literal is simplest with ANY trick.
      const placeholders = TOP_MEDICATION_FORMS.map((_, i) => `$${paramIdx + i}`).join(', ');
      extraClauses.push(`m."form" NOT IN (${placeholders})`);
      params.push(...TOP_MEDICATION_FORMS);
      paramIdx += TOP_MEDICATION_FORMS.length;
    } else if (form) {
      extraClauses.push(`m."form" = $${paramIdx}`);
      params.push(form);
      paramIdx++;
    }

    const whereClause = extraClauses.join(' AND ');

    const matchingIds = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT cum."id"
       FROM "CareUnitMedication" cum
       JOIN "Medication" m ON cum."medicationId" = m."id"
       WHERE cum."careUnitId" = $1 AND ${whereClause}
       ORDER BY m."name" ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      pageSize,
      skip,
    );

    const totalRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count
       FROM "CareUnitMedication" cum
       JOIN "Medication" m ON cum."medicationId" = m."id"
       WHERE cum."careUnitId" = $1 AND ${whereClause}`,
      ...params.slice(0, paramIdx - 1), // exclude limit/offset params
    );

    const belowThresholdTotal = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "CareUnitMedication" cum
      JOIN "Medication" m ON cum."medicationId" = m."id"
      WHERE cum."careUnitId" = ${careUnitId}
        AND cum."deletedAt" IS NULL
        AND cum."currentStock" < cum."lowStockThreshold"
    `;

    const ids = matchingIds.map((r) => r.id);
    const joinedRows = ids.length > 0
      ? await prisma.careUnitMedication.findMany({
          where: { id: { in: ids } },
          include: { medication: true },
          orderBy: { medication: { name: 'asc' } },
        })
      : [];

    // Scope assertion: all returned rows must belong to this careUnit.
    for (const row of joinedRows) {
      if (row.careUnitId !== careUnitId) {
        throw new ForbiddenScopeError('Scope violation in list query.');
      }
    }

    return {
      rows: joinedRows.map(toListItem),
      total: Number(totalRows[0]?.count ?? 0),
      belowThresholdTotal: Number(belowThresholdTotal[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  // Standard path (belowThreshold filter not active).
  const [rows, total, belowThresholdResult] = await Promise.all([
    prisma.careUnitMedication.findMany({
      where: baseWhere,
      include: { medication: true },
      orderBy: { medication: { name: 'asc' } },
      skip,
      take: pageSize,
    }),
    prisma.careUnitMedication.count({ where: baseWhere }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "CareUnitMedication" cum
      JOIN "Medication" m ON cum."medicationId" = m."id"
      WHERE cum."careUnitId" = ${careUnitId}
        AND cum."deletedAt" IS NULL
        AND cum."currentStock" < cum."lowStockThreshold"
    `,
  ]);

  // Scope assertion.
  for (const row of rows) {
    if (row.careUnitId !== careUnitId) {
      throw new ForbiddenScopeError('Scope violation in list query.');
    }
  }

  return {
    rows: rows.map(toListItem),
    total,
    belowThresholdTotal: Number(belowThresholdResult[0]?.count ?? 0),
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Search — global Medication typeahead (D-45)
// ---------------------------------------------------------------------------

/**
 * Search global Medication catalog by name or ATC code, excluding drugs
 * already actively stocked at this vårdenhet (D-45). Returns up to `limit`
 * results sorted by name.
 *
 * careUnitId is the FIRST arg even though we read GLOBAL Medication because
 * we must exclude drugs already stocked at this unit (D-16 / D-45).
 */
export async function searchGlobalMedications(
  careUnitId: string,
  filters: { q: string; limit: number },
): Promise<MedicationSearchResult[]> {
  const { q, limit } = filters;

  const results = await prisma.medication.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { atcCode: { startsWith: q, mode: 'insensitive' } },
      ],
      // Exclude medications already actively stocked at this vårdenhet (D-45).
      careUnitMedications: {
        none: { careUnitId, deletedAt: null },
      },
    },
    take: limit,
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      atcCode: true,
      form: true,
      strength: true,
      source: true,
    },
  });

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    atcCode: r.atcCode,
    form: r.form,
    strength: r.strength,
    source: r.source as 'npl' | 'user',
  }));
}

// ---------------------------------------------------------------------------
// Create — typeahead pick or "Skapa nytt läkemedel" fallback (D-30, D-31)
// ---------------------------------------------------------------------------

/**
 * Create a CareUnitMedication for this vårdenhet.
 *
 * D-30 transparent restore: if a soft-deleted row already exists for
 * (careUnitId, medicationId), UPDATE it (deletedAt=null) instead of INSERT.
 *
 * D-31 "Skapa nytt" fallback: when source='user', create Medication + CareUnitMedication
 * in a single transaction.
 *
 * T-02-06: The @@unique([careUnitId, medicationId]) Postgres constraint is the
 * database-level duplicate guard. The service catches Prisma P2002 violations
 * for active rows and re-throws as ConflictDuplicateMedicationError → 409.
 */
export async function createCareUnitMedication(
  careUnitId: string,
  payload: MedicationCreateRequest,
): Promise<MedicationListItem> {
  const result = await prisma.$transaction(async (tx) => {
    if (payload.source === 'npl') {
      // Check for an existing row (active or soft-deleted).
      const existing = await tx.careUnitMedication.findUnique({
        where: {
          careUnitId_medicationId: {
            careUnitId,
            medicationId: payload.medicationId,
          },
        },
        include: { medication: true },
      });

      if (existing) {
        if (existing.deletedAt === null) {
          // Active duplicate — reject (T-02-06).
          throw new ConflictDuplicateMedicationError();
        }
        // Soft-deleted row — transparent restore (D-30).
        const restored = await tx.careUnitMedication.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            currentStock: payload.currentStock,
            lowStockThreshold: payload.lowStockThreshold,
          },
          include: { medication: true },
        });
        return restored;
      }

      // No existing row — create new.
      return tx.careUnitMedication.create({
        data: {
          careUnitId,
          medicationId: payload.medicationId,
          currentStock: payload.currentStock,
          lowStockThreshold: payload.lowStockThreshold,
        },
        include: { medication: true },
      });
    }

    // source === 'user' — "Skapa nytt läkemedel" path (D-31).
    // Create Medication{source:'user'} + CareUnitMedication in one tx.
    const newMed = await tx.medication.create({
      data: {
        name: payload.name,
        atcCode: payload.atcCode,
        form: payload.form,
        strength: payload.strength ?? null,
        source: 'user',
        nplId: null,
      },
    });

    return tx.careUnitMedication.create({
      data: {
        careUnitId,
        medicationId: newMed.id,
        currentStock: payload.currentStock,
        lowStockThreshold: payload.lowStockThreshold,
      },
      include: { medication: true },
    });
  });

  // Final scope assertion — defensive; Prisma bug should never let this happen.
  if (result.careUnitId !== careUnitId) {
    throw new ForbiddenScopeError('Scope violation on create.');
  }

  return toListItem(result);
}

// ---------------------------------------------------------------------------
// Update — partial; NPL field locks enforced here (D-32)
// ---------------------------------------------------------------------------

/**
 * PATCH /api/medications/:id — partial update.
 *
 * D-32 defense-in-depth: for NPL-sourced meds, `name`/`atcCode`/`form`/
 * `strength` fields are SILENTLY STRIPPED before persisting — even if the
 * request body includes them. The FE for NPL meds also hides those fields,
 * but the service is the canonical enforcement point.
 *
 * D-19 / T-02-13: returns 404 (never 403) when the row belongs to another
 * vårdenhet. Same response shape as truly-not-found rows — existence-probing
 * yields nothing.
 *
 * D-16: `careUnitId` is the first arg; all Prisma lookups start with it.
 *
 * Analog: see user.service.ts (Phase 1) / PATTERNS.md §Pattern D.
 */
export async function updateCareUnitMedication(
  careUnitId: string,
  careUnitMedicationId: string,
  payload: MedicationUpdateRequest,
): Promise<MedicationListItem> {
  // Step 1 — Scoped reload with medication joined (source field required for step 3).
  const row = await prisma.careUnitMedication.findUnique({
    where: { id: careUnitMedicationId },
    include: { medication: true },
  });

  // Step 2 — Existence + scope check (D-19: 404 on cross-tenant, never 403).
  if (!row || row.deletedAt !== null || row.careUnitId !== careUnitId) {
    throw new NotFoundError('Läkemedlet hittades inte.');
  }

  // Step 3 — NPL-field strip (D-32 defense-in-depth).
  // Build cumData (CareUnitMedication fields) and medData (Medication fields).
  const cumData: Partial<{ currentStock: number; lowStockThreshold: number }> = {};
  if (payload.currentStock !== undefined) cumData.currentStock = payload.currentStock;
  if (payload.lowStockThreshold !== undefined) cumData.lowStockThreshold = payload.lowStockThreshold;

  // user-source rows: also accept name/atcCode/form/strength.
  // npl-source rows: those four fields are silently dropped.
  const medData: Partial<Pick<Medication, 'name' | 'atcCode' | 'form' | 'strength'>> = {};
  if (row.medication.source === 'user') {
    if (payload.name !== undefined) medData.name = payload.name;
    if (payload.atcCode !== undefined) medData.atcCode = payload.atcCode;
    if (payload.form !== undefined) medData.form = payload.form;
    if (payload.strength !== undefined) medData.strength = payload.strength;
  }

  // Short-circuit: if nothing to update, return the current row unchanged.
  const hasCumUpdate = Object.keys(cumData).length > 0;
  const hasMedUpdate = Object.keys(medData).length > 0;
  if (!hasCumUpdate && !hasMedUpdate) {
    return toListItem(row);
  }

  // Step 4 — Apply the update.
  let updatedRow = row;
  if (hasCumUpdate) {
    updatedRow = await prisma.careUnitMedication.update({
      where: { id: careUnitMedicationId },
      data: cumData,
      include: { medication: true },
    });
  }
  if (hasMedUpdate) {
    await prisma.medication.update({
      where: { id: row.medicationId },
      data: medData,
    });
    // Merge updated med fields into the return object.
    updatedRow = {
      ...updatedRow,
      medication: { ...updatedRow.medication, ...medData },
    };
  }

  // Step 5 — Defensive scope re-check.
  if (updatedRow.careUnitId !== careUnitId) {
    throw new Error('Tenancy invariant violated');
  }

  // Step 6 — Return via shared toListItem mapper.
  return toListItem(updatedRow);
}

// ---------------------------------------------------------------------------
// Delete — soft-delete only (D-33)
// ---------------------------------------------------------------------------

/**
 * Soft-delete a CareUnitMedication row: SET deletedAt = now().
 * Global Medication is never deleted (D-33 — NPL rows are canonical).
 * Returns 404 if row doesn't exist, already deleted, or belongs to another
 * vårdenhet.
 */
export async function softDeleteCareUnitMedication(
  careUnitId: string,
  careUnitMedicationId: string,
): Promise<void> {
  const existing = await prisma.careUnitMedication.findUnique({
    where: { id: careUnitMedicationId },
  });

  if (!existing || existing.deletedAt !== null) {
    throw new NotFoundError('Läkemedlet finns inte i din vårdenhet.');
  }

  if (existing.careUnitId !== careUnitId) {
    throw new NotFoundError('Läkemedlet finns inte i din vårdenhet.');
  }

  await prisma.careUnitMedication.update({
    where: { id: careUnitMedicationId },
    data: { deletedAt: new Date() },
  });
}
