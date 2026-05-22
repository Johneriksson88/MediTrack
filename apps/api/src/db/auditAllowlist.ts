import type { AuditEntityType } from '@meditrack/shared';

/**
 * Phase 5 D-97 + T-05-03 — per-model allowlist of auditable columns +
 * entity-type mapping + entityId resolver.
 *
 * # WHY ALLOWLIST (NOT BLACKLIST)
 *
 * D-97 / `<decisions>` line 76: whitelist-by-default is the defensive
 * posture for a forensics tool. Adding a new sensitive column to any
 * audited model (a future MFA secret, a stored API key, etc.) DEFAULTS
 * to "not audited" until someone explicitly adds it to the allowlist —
 * a deliberate friction point that forces a security review.
 *
 * # CRITICAL EXCLUSIONS
 *
 * - User.passwordHash — argon2id digest of the user's password. Even
 *   a hash leak through an audit row is a non-starter; the digest is
 *   targetable offline.
 * - Session.id — IS the raw signed session token. If we naively wrote
 *   row.id for Session writes, every auth.login / auth.logout audit row
 *   would carry a valid session token in its entityId AND in its after
 *   JSON, surfaced through /api/audit/events (admin-readable) AND
 *   through any direct table read. resolveEntityId() below closes the
 *   entityId leak; this allowlist closes the after-JSON leak. BOTH
 *   layers MUST hold (T-05-03).
 *
 * # GREP-DISCOVERABILITY
 *
 * The inline `// excluded:` comments make grep for "passwordHash" /
 * "session.id excluded" find the right place; Plan 03 redaction tests
 * import this module to verify the exclusions structurally.
 */

export const AUDITED_MODELS = [
  'Medication',
  'CareUnitMedication',
  'Order',
  'OrderLine',
  'User',
  'Session',
] as const;
export type AuditedModel = (typeof AUDITED_MODELS)[number];

/**
 * Per-model column allowlist. Only fields listed here are copied into
 * the `before` and `after` JSON snapshots.
 *
 * Adding a field: append it to the relevant array. Keep the inline
 * `// excluded:` comments — they document the deliberate omissions
 * for grep discovery.
 */
export const AUDIT_ALLOWLIST: Record<AuditedModel, readonly string[]> = {
  Medication: [
    'id',
    'nplId',
    'name',
    'atcCode',
    'form',
    'strength',
    'source',
    'createdAt',
  ],
  CareUnitMedication: [
    'id',
    'careUnitId',
    'medicationId',
    'currentStock',
    'lowStockThreshold',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  Order: [
    'id',
    'careUnitId',
    'createdByUserId',
    'status',
    'submittedAt',
    'submittedByUserId',
    'confirmedAt',
    'confirmedByUserId',
    'deliveredAt',
    'deliveredByUserId',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  OrderLine: [
    'id',
    'orderId',
    'careUnitMedicationId',
    'quantity',
    'createdAt',
    'updatedAt',
  ],
  User: [
    'id',
    'email',
    'name',
    'role',
    'careUnitId',
    'createdAt',
    'updatedAt',
    // excluded: passwordHash (D-97) — argon2id digest must NEVER appear
    // in audit rows.
  ],
  Session: [
    // excluded: id (D-97 — id IS the raw signed session token; never
    // persist to audit. entityId for Session rows is set via
    // resolveEntityId() below to the actor User.id, not the token.)
    'userId',
    'careUnitId',
    'createdAt',
    'expiresAt',
    'lastSeenAt',
  ],
};

/**
 * Map Prisma model name → shared AuditEntityType string. This is the
 * single point where the schema's PascalCase model names cross into
 * the snake_case audit vocabulary that the FE label maps use.
 */
export function mapPrismaModelToEntityType(
  model: AuditedModel,
): AuditEntityType {
  switch (model) {
    case 'Medication':
      return 'medication';
    case 'CareUnitMedication':
      return 'care_unit_medication';
    case 'Order':
      return 'order';
    case 'OrderLine':
      return 'order_line';
    case 'User':
      return 'user';
    case 'Session':
      return 'session';
  }
}

/**
 * Phase 5 D-97 + T-05-03 — entityId resolution per model.
 *
 * SECURITY: Session.id IS the raw signed session token. If we naively
 * wrote row.id for Session writes, every auth.login / auth.logout
 * audit row would carry a valid session token in its entityId column —
 * surfaced through /api/audit/events to admins (and to anyone reading
 * audit_events directly).
 *
 * For Session we record the actor User.id (which the row's `userId`
 * foreign key already carries). Compare to the after-JSON allowlist:
 * the allowlist closes the `after` column leak; resolveEntityId
 * closes the `entityId` column leak. Both layers MUST hold for D-97
 * to be satisfied.
 *
 * Centralizing this branching in ONE function with ONE citation
 * (D-97 + T-05-03) keeps the security rationale grep-discoverable
 * and gives Plan 03 Task 2's redaction test a single import target.
 */
export function resolveEntityId(
  model: AuditedModel,
  row: Record<string, unknown>,
): string {
  if (model === 'Session') {
    const userId = row.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new Error(
        'resolveEntityId: Session row missing userId — audit-write would leak session token',
      );
    }
    return userId;
  }
  // User and all other audited models: row.id is a CUID, safe to expose.
  const id = row.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`resolveEntityId: ${model} row missing id`);
  }
  return id;
}

/**
 * Filter a Prisma row through the per-model allowlist. Returns a NEW
 * object containing only allowlisted keys — sensitive fields are
 * structurally absent, not just nulled. Tests can assert
 * `expect(filterAllowlist('User', row)).not.toHaveProperty('passwordHash')`.
 */
export function filterAllowlist(
  model: AuditedModel,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const keys = AUDIT_ALLOWLIST[model];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in row) {
      out[k] = row[k];
    }
  }
  return out;
}
