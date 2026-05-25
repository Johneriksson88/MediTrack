import { z } from 'zod';

/**
 * Phase 5 D-94 / D-96 / D-104 — locked audit action vocabulary.
 *
 * The set is OPEN on the API boundary (auditEventResponse declares
 * `action: z.string()` per D-104 footer) — the AUDIT_ACTIONS list +
 * `auditActionEnum` here exist for the FE label-map exhaustiveness.
 *
 * Adding a new action: append the literal here, add the Swedish label to
 * AUDIT_ACTION_LABELS, optionally surface it in the admin filter combobox.
 *
 * Order grouped by semantic meaning, not alphabetical, so the palette
 * tells a story when the admin scrolls (mirrors UI-SPEC §Action Chip
 * Color Map ordering).
 */
export const AUDIT_ACTIONS = [
  // Generic Prisma method names — the default actions written by the
  // $extends middleware when no actionOverride is set in the ALS store.
  'create',
  'update',
  'delete',
  // Phase 3 / 4 status-machine overrides (D-94 — set via
  // withActionOverride() in order.service.ts).
  'order.submit',
  'order.confirm',
  'order.deliver',
  'order.softDelete',
  // Mirrors the order.softDelete pattern for the medication CRUD path
  // (D-94 — withActionOverride wrap in medication.service.ts). Belongs in
  // the same status-machine-overrides group because it shares the same
  // withActionOverride mechanism even though the surface area (CRUD) differs.
  'medication.softDelete',
  // Phase 4 — fired N times during deliver, one per CareUnitMedication
  // (D-79 + D-94 sibling fan-out).
  'stock.increment',
  // Phase 1 — Session create/delete intercepts via the $extends middleware.
  'auth.login',
  'auth.logout',
  // D-96 — explicit write from auth.service.ts inside the
  // InvalidCredentialsError branches; the failed-login case has no Session
  // row, so the $extends path can't observe it.
  'auth.login_failed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Zod enum is exported but NOT used on the API boundary (D-104 footer —
 * action is open). FE label-map exhaustiveness uses the type alias above;
 * this enum is available for downstream consumers that want stricter
 * runtime validation locally (e.g. internal jobs).
 */
export const auditActionEnum = z.enum(AUDIT_ACTIONS);

/**
 * Swedish display labels for the action chip primitive
 * (apps/web/src/components/AuditActionChip.tsx) and for the action
 * combobox option labels (apps/web/src/routes/admin/AuditFilterBar.tsx).
 * Verbatim from 05-CONTEXT.md `<specifics>` line 248.
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Skapad',
  update: 'Uppdaterad',
  delete: 'Borttagen',
  'order.submit': 'Skickad',
  'order.confirm': 'Bekräftad',
  'order.deliver': 'Levererad',
  'order.softDelete': 'Borttagen (utkast)',
  'medication.softDelete': 'Borttagen',
  'stock.increment': 'Lager ökat',
  'auth.login': 'Inloggad',
  'auth.logout': 'Utloggad',
  'auth.login_failed': 'Inloggning misslyckades',
};
