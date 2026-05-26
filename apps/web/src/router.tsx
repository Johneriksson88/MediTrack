import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AuthGate } from '@/auth/AuthGate';
import { RoleRoute } from '@/auth/RoleRoute';
import { AuditPage } from '@/routes/admin/AuditPage';
import { BestallningarPage } from '@/routes/bestallningar/BestallningarPage';
import { ComposeOrderPage } from '@/routes/bestallningar/ComposeOrderPage';
import { DashboardPage } from '@/routes/dashboard/DashboardPage';
import { KontoPage } from '@/routes/konto/KontoPage';
import { LakemedelPage } from '@/routes/lakemedel/LakemedelPage';
import { LoginPage } from '@/routes/login/LoginPage';
import { AppShell } from '@/routes/shell/AppShell';
import { SortimentPage } from '@/routes/sortiment/SortimentPage';

/**
 * D-12 / D-13 / Pattern K — full Phase 1 route map.
 *
 * Structure:
 *   - /login                              public (no AuthGate)
 *   - everything else                     wrapped in <AuthGate><AppShell/></AuthGate>
 *     - index ('/') -> /dashboard
 *     - /dashboard, /lakemedel, /bestallningar, /konto
 *     - /admin/audit                      RoleRoute(['admin'])
 *   - * (catch-all)                       -> /dashboard (which then runs AuthGate)
 *
 * AppShell provides the <Outlet/> for child routes. AuthGate's loading
 * state is <AuthSkeleton/>, which mirrors the shell chrome so there is
 * no layout shift when /me resolves (UI-SPEC §Auth Gate Loading Skeleton).
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/lakemedel', element: <LakemedelPage /> },
      { path: '/bestallningar', element: <BestallningarPage /> },
      { path: '/bestallningar/:id', element: <ComposeOrderPage /> },
      { path: '/konto', element: <KontoPage /> },
      {
        // Sortiment is open to apotekare + admin (catalog management is a
        // pharmacist responsibility; sjuksköterska is read-only on the
        // Läkemedel page and has no business here). BE enforces the same
        // role set via medication:bulk_manage on every mutating route.
        element: <RoleRoute roles={['apotekare', 'admin']} />,
        children: [{ path: '/sortiment', element: <SortimentPage /> }],
      },
      {
        element: <RoleRoute roles={['admin']} />,
        children: [{ path: '/admin/audit', element: <AuditPage /> }],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
