import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ActionKey, MeResponse } from '@meditrack/shared';
import { fetchJson } from '@/lib/api';

/**
 * Pattern L / D-17 / Shared #4 — defense-in-depth RBAC primitive.
 *
 * `useAuth()` is the in-app reader for user identity + role permissions.
 * It shares the SAME `useQuery(['me'])` key as `AuthGate`, so the cache
 * is one source of truth across the app — login (Plan 02 `useLogin`)
 * already invalidates `['me']` on success; Plan 04 logout will call
 * `queryClient.removeQueries({ queryKey: ['me'] })` to clear it.
 *
 * The `can(action)` callback reads `permissions: ActionKey[]` populated
 * by the BE from the centralized PERMISSIONS map (D-18). The FE gate is
 * defense in depth ONLY — the BE is the security boundary (AUTH-06).
 *
 * NOTE: `AuthGate` (the route-level redirect to `/login` on 401) is
 * separate from `useAuth` (the in-app reader). Both use the same query
 * key so they share cache; Plan 04 may consolidate `fetchMe` into a
 * shared module, but that's a wiring concern — the contract stays the
 * same.
 */
export function fetchMe(): Promise<MeResponse> {
  return fetchJson<MeResponse>('/api/me');
}

export function useAuth() {
  const { data, isLoading } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  });

  const can = useCallback(
    (action: ActionKey) => data?.permissions.includes(action) ?? false,
    [data],
  );

  return {
    user: data ?? null,
    isLoading,
    can,
  };
}
