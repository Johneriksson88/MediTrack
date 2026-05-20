import type { ReactNode } from 'react';
import type { ActionKey } from '@meditrack/shared';
import { useCan } from './useCan';

/**
 * Pattern L / D-17 / UI-SPEC §403-Gate — defense-in-depth UI gate.
 *
 * `<Can action="admin:ping">…</Can>` renders its children only when the
 * current user has the action. Non-permitted users see nothing — there
 * is intentionally no `fallback` prop. The UI-SPEC §403 / `<Can>` Gate
 * Pattern handles the "muted note for non-admin" pattern OUTSIDE of
 * `<Can>` (Plan 04 Konto page), keeping this primitive a pure pass-through.
 *
 * SECURITY BOUNDARY: This is defense in depth, NEVER the security
 * boundary. The BE `requirePermission(action)` preHandler always
 * enforces the same rule (AUTH-06 / T-03-02). Hiding the button doesn't
 * stop a determined attacker — the 403 from the API does.
 *
 * TypeScript narrows `action` to `ActionKey`, so misspellings are caught
 * at compile time (Shared #4 single source of truth).
 */
export interface CanProps {
  action: ActionKey;
  children: ReactNode;
}

export function Can({ action, children }: CanProps) {
  return useCan(action) ? <>{children}</> : null;
}
