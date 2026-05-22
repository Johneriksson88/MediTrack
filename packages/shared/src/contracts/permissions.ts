import { z } from 'zod';

/**
 * D-15 / D-17 / Pattern J / Shared #4 — `ActionKey` permission strings shared FE+BE.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the action key string set.
 * Both the FE (`useAuth` / `useCan` / `<Can>`) and the BE (`PERMISSIONS`
 * map in `apps/api/src/auth/permissions.ts`) import `ActionKey` from here.
 *
 * Adding a new action key:
 *   1. Append the literal to `ACTION_KEYS` below.
 *   2. The BE `PERMISSIONS: Record<ActionKey, Role[]>` map will fail to
 *      compile until you add an entry — this is the drift-prevention
 *      mechanism (TS exhaustiveness over `Record<ActionKey, …>`).
 *   3. The FE will autocomplete the new key in `<Can action="…">`.
 *
 * Phase 1 begins with a single demo action (`admin:ping`) so the type
 * isn't `never` and `<Can action="...">` autocompletes from day one.
 * Phase 2+ widens this union with `'medication:create'`,
 * `'order:confirm'`, `'order:deliver'`, `'audit:read'`, etc.
 */
export const ACTION_KEYS = [
  'admin:ping',
  'medication:read',
  'medication:create',
  'medication:update',
  'medication:delete',
  // Phase 3 D-64 — order permissions; all 3 roles per REQUIREMENTS.md ORD-01..03
  // (no role restriction on Phase 3 operations). Phase 4 adds 'order:confirm' /
  // 'order:deliver' restricted to apotekare+admin for the delivery transition.
  'order:read',
  'order:create',
  'order:update',
  'order:submit',
  'order:delete',
  // Phase 4 D-15 — confirm/deliver restricted to apotekare+admin.
  'order:confirm',
  'order:deliver',
  // Phase 5 D-15 — admin-only audit log read.
  'audit:read',
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const actionKey = z.enum(ACTION_KEYS);
