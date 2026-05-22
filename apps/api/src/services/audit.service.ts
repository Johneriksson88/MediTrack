import type { AuditEventListQuery, AuditEventListResponse, AuditFiltersResponse, AuditEventResponse } from '@meditrack/shared';
import { prisma } from '../db/client.js';
import { ValidationFailedError } from '../plugins/errorHandler.js';

/**
 * Phase 5 D-16 EXCEPTION — Admin reads cross-tenant; no careUnitId scope.
 *
 * Every other service file in this repo takes careUnitId as the FIRST arg
 * (D-16 / Pattern D). audit.service.ts is the DOCUMENTED EXCEPTION:
 * `/admin/audit` is an admin-only endpoint that surfaces ALL events from
 * ALL vårdenheter (per `<RoleRoute roles={['admin']}/>`). Passing
 * careUnitId here would either be ignored (confusing) or restrict the
 * view (wrong, against AUD-02 verbatim).
 *
 * The route guards this with `requirePermission('audit:read')` — admin only.
 *
 * # CURSOR PAGINATION (D-105)
 *
 * The list endpoint returns `{ events, nextCursor }` where nextCursor is
 * a base64-encoded `{createdAt, id}` pair. Sort is
 * `createdAt DESC, id DESC` for deterministic tiebreaks on sibling
 * events written in the same millisecond (1+N deliver fan-out).
 *
 * # READ-ONLY (D-98)
 *
 * This service contains ONLY findMany / groupBy calls. NO writes — Plan
 * 01's BEFORE-trigger + REVOKE migration enforces this at the DB layer
 * too. The audit table is append-only by architecture AND by Postgres
 * role privilege.
 *
 * # FILTERS SOURCE CACHING (D-103 / T-05-10)
 *
 * `listAuditFilters()` is memoized at module scope with a 60-second
 * TTL. The FE's `useAuditFiltersQuery` also uses staleTime: 60_000,
 * so even with admin credentials an attacker can't exceed ~1 DB hit
 * per minute per app instance (T-05-10 DoS mitigation).
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FILTERS_CACHE_MS = 60_000;

interface CursorPayload {
  createdAt: string;
  id: string;
}

/**
 * Encode a `(createdAt, id)` pair into the opaque base64 cursor string
 * surfaced in `nextCursor`.
 */
function encodeCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = {
    createdAt: createdAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Decode the opaque cursor back into `{createdAt, id}`. Throws
 * ValidationFailedError on any decode failure — a malformed cursor
 * surfaces as the canonical 422 envelope (D-19 catalog reuse).
 */
function decodeCursor(raw: string): CursorPayload {
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
      typeof (parsed as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('cursor payload shape invalid');
    }
    const { createdAt, id } = parsed as CursorPayload;
    // Validate the ISO timestamp parses to a real Date — Date.parse
    // returning NaN for garbage input is the standard guard.
    if (Number.isNaN(Date.parse(createdAt))) {
      throw new Error('cursor.createdAt is not a valid ISO timestamp');
    }
    return { createdAt, id };
  } catch {
    throw new ValidationFailedError('Ogiltig cursor.', {
      reason: 'invalid_quantity',
    });
  }
}

/**
 * GET /api/audit/events — admin-only cursor-paginated audit log read.
 *
 * D-16 EXCEPTION: no careUnitId arg — cross-tenant by design.
 * D-105: cursor pagination with `createdAt DESC, id DESC` tiebreak.
 *
 * The actor is JOINed via a single follow-up findMany on User after the
 * page is loaded — avoids the N+1 problem and keeps the where-clause
 * narrow. Actors are denormalized into `event.actor` for the table render.
 */
export async function listAuditEvents(
  filters: AuditEventListQuery,
): Promise<AuditEventListResponse> {
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  // Build the cursor where-clause if a cursor was supplied. The OR-pair
  // ((createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt
  // AND id < cursor.id)) is the deterministic tiebreak D-105 specifies.
  const cursorWhere = filters.cursor
    ? (() => {
        const c = decodeCursor(filters.cursor!);
        return {
          OR: [
            { createdAt: { lt: new Date(c.createdAt) } },
            {
              AND: [
                { createdAt: new Date(c.createdAt) },
                { id: { lt: c.id } },
              ],
            },
          ],
        };
      })()
    : undefined;

  const whereAndConditions: Record<string, unknown>[] = [];
  if (filters.actorUserId) whereAndConditions.push({ actorUserId: filters.actorUserId });
  if (filters.entityType) whereAndConditions.push({ entityType: filters.entityType });
  if (filters.action) whereAndConditions.push({ action: filters.action });
  if (filters.requestId) whereAndConditions.push({ requestId: filters.requestId });
  if (cursorWhere) whereAndConditions.push(cursorWhere);

  const where = whereAndConditions.length > 0 ? { AND: whereAndConditions } : {};

  // take: limit + 1 — fetch one extra row so we can detect hasMore
  // without a separate COUNT(*) query.
  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Single batched actor lookup for the page — collect distinct
  // actorUserIds, fetch them in ONE findMany, build a Map for O(1)
  // attach. Skips null actorUserIds (auth.login_failed without user).
  const actorIds = Array.from(
    new Set(
      pageRows
        .map((r) => r.actorUserId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const events: AuditEventResponse[] = pageRows.map((row) => ({
    id: row.id,
    actorUserId: row.actorUserId,
    careUnitId: row.careUnitId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    // `before` and `after` are Prisma `Json?` columns — they round-trip
    // as `unknown | null`. The contract types these as `z.unknown().nullable()`
    // so the diff panel renders arbitrary key sets at read time (D-95).
    before: (row.before ?? null) as unknown,
    after: (row.after ?? null) as unknown,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    actor: row.actorUserId ? actorMap.get(row.actorUserId) ?? null : null,
  }));

  const nextCursor =
    hasMore && pageRows.length > 0
      ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt, pageRows[pageRows.length - 1]!.id)
      : null;

  return { events, nextCursor };
}

// ---------------------------------------------------------------------------
// Filter source — 60s memoized (D-103 / T-05-10)
// ---------------------------------------------------------------------------

interface FiltersCacheEntry {
  data: AuditFiltersResponse;
  expiresAt: number;
}

let filtersCache: FiltersCacheEntry | null = null;

/**
 * Test-only helper — clears the in-memory filters cache so integration
 * tests can observe a fresh DB state without waiting 60s. Exported for
 * Plan 03 integration tests; production code does NOT call this.
 */
export function _resetAuditFiltersCache(): void {
  filtersCache = null;
}

/**
 * GET /api/audit/filters — populates the three combobox dropdowns
 * (Användare / Entitetstyp / Åtgärd) on /admin/audit.
 *
 * Three parallel groupBy queries; the actor list is joined to User to
 * surface name + email in the combobox row. 60-second module-scope memo
 * matches the FE staleTime so both layers cooperate on the DoS
 * mitigation (T-05-10).
 */
export async function listAuditFilters(): Promise<AuditFiltersResponse> {
  const now = Date.now();
  if (filtersCache && filtersCache.expiresAt > now) {
    return filtersCache.data;
  }

  const [actorGroups, entityGroups, actionGroups] = await Promise.all([
    prisma.auditEvent.groupBy({
      by: ['actorUserId'],
      where: { actorUserId: { not: null } },
    }),
    prisma.auditEvent.groupBy({ by: ['entityType'] }),
    prisma.auditEvent.groupBy({ by: ['action'] }),
  ]);

  const actorIds = actorGroups
    .map((g) => g.actorUserId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const users = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      })
    : [];

  const entityTypes = entityGroups
    .map((g) => g.entityType)
    .sort((a, b) => a.localeCompare(b, 'sv'));

  const actions = actionGroups
    .map((g) => g.action)
    .sort((a, b) => a.localeCompare(b, 'sv'));

  const data: AuditFiltersResponse = { users, entityTypes, actions };
  filtersCache = { data, expiresAt: now + FILTERS_CACHE_MS };
  return data;
}
