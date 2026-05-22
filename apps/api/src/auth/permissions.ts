import type { ActionKey, Role } from '@meditrack/shared';

/**
 * D-15 / Pattern J / Shared #4 — server-side permission map.
 *
 * The action keys themselves live in `@meditrack/shared` (single source of
 * truth across FE+BE). This map binds each action key to the roles allowed
 * to perform it.
 *
 * Type-completeness: `Record<ActionKey, Role[]>` forces this map to cover
 * every action key. Adding a new key in shared without an entry here is a
 * compile error — the canonical drift prevention (Shared #4).
 *
 * Phase 1 ships a single demo action. Phase 2+ extends this map (see
 * planning/REQUIREMENTS.md AUTH-04..06 for the role/action matrix):
 *   - 'medication:create': ['apotekare', 'admin']
 *   - 'order:confirm':     ['apotekare', 'admin']
 *   - 'order:deliver':     ['apotekare', 'sjukskoterska', 'admin']
 *   - 'audit:read':        ['admin']
 */
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
  // Phase 2 D-43 — medication permission matrix.
  // All three roles can read (view catalog); only apotekare+admin can mutate.
  'medication:read':   ['apotekare', 'sjukskoterska', 'admin'],
  'medication:create': ['apotekare', 'admin'],
  'medication:update': ['apotekare', 'admin'],
  'medication:delete': ['apotekare', 'admin'],
  // Phase 3 D-64 — order permissions; all three roles per REQUIREMENTS.md
  // ORD-01..03 (no role restriction). Phase 4 adds 'order:confirm' /
  // 'order:deliver' restricted to apotekare+admin for the delivery transition.
  'order:read':   ['apotekare', 'sjukskoterska', 'admin'],
  'order:create': ['apotekare', 'sjukskoterska', 'admin'],
  'order:update': ['apotekare', 'sjukskoterska', 'admin'],
  'order:submit': ['apotekare', 'sjukskoterska', 'admin'],
  'order:delete': ['apotekare', 'sjukskoterska', 'admin'],
  // Phase 4 D-15 / D-75 — apotekare workflow transitions; sjuksköterska is read-only on these.
  'order:confirm': ['apotekare', 'admin'],
  'order:deliver': ['apotekare', 'admin'],
};

/**
 * Pure / order-stable — iterates `Object.entries(PERMISSIONS)` in declaration
 * order so `/me` returns the same `permissions` array shape for clients to
 * compare on. Filters to the actions the given role is allowed to perform.
 *
 * Used by `userService.getMeForSession` (D-18) to populate the `/me`
 * response without a second round-trip.
 */
export function actionsForRole(role: Role): ActionKey[] {
  return (Object.entries(PERMISSIONS) as [ActionKey, Role[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([key]) => key);
}
