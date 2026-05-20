import type { PropsWithChildren } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import type { MeResponse } from '@meditrack/shared';

import { fetchJson, isUnauthenticated } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Pattern K / D-13 — guards every authenticated route.
 *
 * Source of truth for the `useAuth()` hook (added in Plan 03) is the
 * `['me']` query this component owns. Behavior:
 *
 *   - isLoading           → render skeleton (placeholder until Plan 04
 *                           ships the full AuthSkeleton chrome)
 *   - 401 (unauthenticated) → <Navigate to="/login"> with `state.from`
 *                             so the LoginForm can redirect back
 *   - any other error     → re-throw (router error boundary handles)
 *   - authed              → render children
 */
export function AuthGate({ children }: PropsWithChildren) {
  const location = useLocation();
  const { data, isLoading, isError, error } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => fetchJson<MeResponse>('/api/me'),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (isError) {
    if (isUnauthenticated(error)) {
      return (
        <Navigate
          to="/login"
          state={{ from: location.pathname }}
          replace
        />
      );
    }
    throw error;
  }

  if (!data) {
    // Defensive: shouldn't happen — query is settled with no data and no error.
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return <>{children}</>;
}
