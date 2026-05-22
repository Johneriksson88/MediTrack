import { z } from 'zod';

/**
 * Phase 5 D-08 / D-97 / D-103 / D-104 / D-105 — Audit log contracts.
 *
 * D-08: Zod schemas in this file are the FE↔BE contract for the audit
 *   log read API. Both sides import from '@meditrack/shared'; inferred
 *   TS types are the canonical shape.
 *
 * D-97: The `before` and `after` JSON snapshots are allowlist-filtered
 *   server-side (User.passwordHash and Session.id excluded). The
 *   contract uses `z.unknown().nullable()` so the FE diff panel can
 *   render arbitrary key sets at read time — it does NOT re-validate
 *   inner shape, by design (D-95 — diff is computed at read time).
 *
 * D-103 / D-105: Cursor pagination. `nextCursor` is a base64-encoded
 *   {createdAt, id} pair. Query params use `.optional()` (not
 *   `.nullable()`) because Fastify query parsing treats absent params
 *   as `undefined`, matching the orderListQuery convention.
 *
 * D-104: `action` and `entityType` are OPEN strings on the API
 *   boundary (not enums). The shared constants AUDIT_ACTIONS /
 *   AUDIT_ENTITY_TYPES are FE label-map sources of truth; new audit
 *   actions can be added without a schema migration or contract bump.
 *
 * Pattern: mirrors packages/shared/src/contracts/order.ts.
 * All schemas are followed by `export type X = z.infer<typeof x>`.
 */

// ---------------------------------------------------------------------------
// Response shape — one audit event row
// ---------------------------------------------------------------------------

/**
 * Single audit event as returned by GET /api/audit/events. Includes a
 * denormalized `actor: { id, name, email } | null` so the admin table
 * can render the actor name without an N+1 join client-side. The
 * actor is null when actorUserId is null (auth.login_failed before
 * the user is identified).
 *
 * `before` and `after` are typed as unknown — they're allowlist-filtered
 * JSON objects whose shape varies per entityType. The diff panel renders
 * keys present in either object at read time (D-95).
 */
export const auditEventResponse = z.object({
  id: z.string(),
  actorUserId: z.string().nullable(),
  careUnitId: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string().datetime(),
  // Denormalized at read time (Plan 02 audit.service.ts JOIN on User).
  actor: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .nullable(),
});
export type AuditEventResponse = z.infer<typeof auditEventResponse>;

// ---------------------------------------------------------------------------
// List query + response — cursor pagination (D-105)
// ---------------------------------------------------------------------------

/**
 * Query parameters for GET /api/audit/events (Plan 02 endpoint).
 *
 * D-103: combobox filters — actorUserId / entityType / action — all
 *   `.optional()` so the route accepts ?actor=...&entity=...&action=...
 *   in any combination. A fourth `requestId` filter is reachable via
 *   the requestId-group chip (D-104) but never user-typed.
 *
 * D-105: cursor + limit. The cursor is base64-encoded {createdAt, id};
 *   the route decodes it. limit defaults to 50, max 100.
 *
 * `.optional()` not `.nullable()`: Fastify query parsing convention —
 * missing params arrive as `undefined`, never as the string "null".
 */
export const auditEventListQuery = z.object({
  actorUserId: z.string().cuid().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  requestId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditEventListQuery = z.infer<typeof auditEventListQuery>;

/**
 * Response envelope for GET /api/audit/events (D-105). `nextCursor`
 * is null when the current page is the last one; the FE's
 * useAuditEventsQuery uses this to terminate `useInfiniteQuery`.
 */
export const auditEventListResponse = z.object({
  events: z.array(auditEventResponse),
  nextCursor: z.string().nullable(),
});
export type AuditEventListResponse = z.infer<typeof auditEventListResponse>;

// ---------------------------------------------------------------------------
// Filter source — combobox options (D-103)
// ---------------------------------------------------------------------------

/**
 * Response envelope for GET /api/audit/filters (Plan 02 endpoint).
 *
 * D-103: feeds the three combobox dropdowns above the audit log
 *   table — Användare / Entitetstyp / Åtgärd. The route caches the
 *   result for ~60s (the source set changes slowly).
 *
 * Entity types and actions are returned as plain strings — they
 * round-trip via the AUDIT_ENTITY_TYPE_LABELS / AUDIT_ACTION_LABELS
 * Swedish maps on the FE.
 */
export const auditFiltersResponse = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
  ),
  entityTypes: z.array(z.string()),
  actions: z.array(z.string()),
});
export type AuditFiltersResponse = z.infer<typeof auditFiltersResponse>;
