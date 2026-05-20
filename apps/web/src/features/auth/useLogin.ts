import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, LoginResponse } from '@meditrack/shared';

import { fetchJson, ApiError } from '@/lib/api';

/**
 * Pattern M — `useLogin` mutation.
 *
 * On success: invalidate `['me']` so the `AuthGate` query refetches and
 * `/dashboard` can render the user's data without a full reload.
 *
 * The caller (`LoginForm`) handles navigation post-success and the
 * `invalid_credentials` server response on failure (no toast — UI-SPEC §Copy).
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (body) =>
      fetchJson<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      // Seed the `me` query with the user shape from the login response so
      // the dashboard render after navigate() has data immediately.
      queryClient.setQueryData(['me'], {
        ...data.user,
        permissions: [],
      });
      // Still invalidate so the next request refreshes from the server
      // (gets the actual `permissions` array Plan 03 will populate).
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
