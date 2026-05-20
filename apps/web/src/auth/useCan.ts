import type { ActionKey } from '@meditrack/shared';
import { useAuth } from './useAuth';

/**
 * Pattern L / D-17 — convenience wrapper around `useAuth().can(action)`.
 *
 * Use cases:
 *   - Inline boolean for `disabled={!useCan('order:confirm')}`.
 *   - Conditional rendering when `<Can>` doesn't fit (e.g. needing
 *     access to the boolean in a hook dependency array).
 *
 * For straightforward "render iff permitted," prefer `<Can action="…">`.
 */
export function useCan(action: ActionKey): boolean {
  return useAuth().can(action);
}
