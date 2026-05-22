import { z } from 'zod';

/**
 * Phase 5 D-97 / D-104 — locked audit entity-type vocabulary.
 *
 * The set covers every audited Prisma model: Medication,
 * CareUnitMedication, Order, OrderLine, User, Session. Values are
 * snake_case to match the Phase 5 schema convention; the Swedish display
 * labels are domain nouns (lower-cased deliberately — they read as
 * inline chip labels next to action chips).
 *
 * Like AUDIT_ACTIONS, the set is OPEN on the API boundary
 * (auditEventResponse declares `entityType: z.string()`). The const-list
 * and enum exist for FE label-map exhaustiveness.
 *
 * Plan 05 added `'auth_attempt'` as the entityType for unknown-email
 * failed-login rows (WR-07 fix) — semantically distinct from `'session'`
 * (a persisted post-login object) because no Session row exists for an
 * unknown-email attempt.
 */
export const AUDIT_ENTITY_TYPES = [
  'medication',
  'care_unit_medication',
  'order',
  'order_line',
  'user',
  'session',
  'auth_attempt',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const auditEntityTypeEnum = z.enum(AUDIT_ENTITY_TYPES);

/**
 * Swedish display labels for the entity-type chip primitive
 * (apps/web/src/components/AuditEntityTypeChip.tsx). Verbatim from
 * 05-CONTEXT.md `<specifics>` line 247. Lowercased — these are domain
 * nouns, not titles.
 */
export const AUDIT_ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  medication: 'läkemedel',
  care_unit_medication: 'lagersaldo',
  order: 'beställning',
  order_line: 'beställningsrad',
  user: 'användare',
  session: 'session',
  auth_attempt: 'inloggningsförsök',
};
