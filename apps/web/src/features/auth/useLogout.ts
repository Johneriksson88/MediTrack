import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { fetchJson } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

/**
 * AUTH-03 / Pattern M — logout mutation.
 *
 * DELETE /api/auth/session is idempotent (Plan 02 key decision): it
 * returns 204 with or without a valid session cookie, so the FE never
 * needs to retry. `fetchJson` already handles 204 by returning `undefined`
 * without crashing on JSON parse.
 *
 * On success:
 *   - `removeQueries({ queryKey: ['me'] })` evicts the cached user so
 *     `AuthGate` re-runs `useQuery(['me'])` cleanly on the next render
 *     (rather than briefly showing stale data).
 *   - `navigate('/login', { replace: true })` so the back button doesn't
 *     return the user to an authenticated route while they're logged out.
 */
export function useLogout() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () =>
      fetchJson<void>('/api/auth/session', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['me'] });
      navigate('/login', { replace: true });
    },
  });
}
