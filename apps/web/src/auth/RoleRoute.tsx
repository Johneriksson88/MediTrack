import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '@meditrack/shared';

import { useAuth } from '@/auth/useAuth';

/**
 * D-12 / AUTH-06 — role-based route gate.
 *
 * Renders `children` (or `<Outlet/>` when used as a layout route) iff the
 * current `useAuth().user.role` is in the `roles` allow-list. Falls back
 * to `<Navigate to="/dashboard" replace/>` for unauthorized roles by
 * default; callers may override with a custom `fallback` (e.g. an inline
 * 403 message).
 *
 * Composition assumption: `<RoleRoute>` always runs INSIDE `<AuthGate>`,
 * so by the time it renders, `useAuth().isLoading` is already false and
 * `user` is non-null (`AuthGate` redirected to /login if not). The
 * defensive `isLoading` guard below is belt-and-braces only.
 *
 * SECURITY BOUNDARY: This is defense in depth (UI gate). The real
 * enforcement is the BE `requirePermission(...)` preHandler chain.
 * Phase 5's `/api/audit/*` will enforce the same role check server-side.
 */
export interface RoleRouteProps {
  roles: Role[];
  children?: ReactNode;
  fallback?: ReactNode;
}

export function RoleRoute({ roles, children, fallback }: RoleRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // Defensive — AuthGate should have already resolved by the time we render.
    return null;
  }

  if (user && roles.includes(user.role)) {
    return <>{children ?? <Outlet />}</>;
  }

  return <>{fallback ?? <Navigate to="/dashboard" replace />}</>;
}
