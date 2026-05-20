import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AuthGate } from '@/auth/AuthGate';
import { LoginPage } from '@/routes/login/LoginPage';
import { DashboardPage } from '@/routes/dashboard/DashboardPage';

/**
 * Pattern K / D-12 — router-only routing.
 *
 * Plan 02 ships the minimum viable route map:
 *   - /login         public (no AuthGate)
 *   - /              redirects to /dashboard (gated)
 *   - /dashboard     gated stub (`useAuth` cache fed by AuthGate)
 *   - * (catch-all)  redirects to /dashboard so unknown URLs land in
 *                    the authenticated zone; AuthGate redirects to
 *                    /login if no session.
 *
 * Plan 04 expands this with the full shell + /lakemedel / /bestallningar /
 * /konto / /admin/audit routes.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <AuthGate>
        <Navigate to="/dashboard" replace />
      </AuthGate>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <AuthGate>
        <DashboardPage />
      </AuthGate>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
