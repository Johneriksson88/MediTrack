import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { RoleRoute } from '@/auth/RoleRoute';

/**
 * AUTH-06 — RoleRoute gate (apps/web/src/auth/RoleRoute.tsx)
 *
 * Behavioral requirements:
 * - Admin user accessing a protected route: Outlet/child renders.
 * - Non-admin user: redirected to /dashboard (Navigate replace).
 * - isLoading=true: renders null (defensive — AuthGate resolves first in prod).
 *
 * Test approach: wrap RoleRoute in a MemoryRouter with routes so that
 * Navigate behavior (redirect location) can be asserted.
 */

vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

import { useAuth } from '@/auth/useAuth';

const mockUseAuth = vi.mocked(useAuth);

function makeUser(role: MeResponse['role']): MeResponse {
  return {
    id: `u-${role}`,
    email: `${role}@example.test`,
    name: `${role} user`,
    role,
    careUnit: { id: 'cu1', name: 'Avdelning 4' },
    permissions: role === 'admin' ? ['admin:ping'] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RoleRoute', () => {
  describe('admin user accessing admin-only route', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('admin'),
        isLoading: false,
        can: (a) => a === 'admin:ping',
      });
    });

    it('renders the protected child when role is allowed', () => {
      renderWithProviders(
        <Routes>
          <Route element={<RoleRoute roles={['admin']} />}>
            <Route path="/admin/audit" element={<div data-testid="audit-page">Audit</div>} />
          </Route>
          <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>,
        { initialPath: '/admin/audit' },
      );

      expect(screen.getByTestId('audit-page')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    });
  });

  describe('non-admin user (sjukskoterska) accessing admin-only route', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('sjukskoterska'),
        isLoading: false,
        can: (_a) => false,
      });
    });

    it('redirects to /dashboard instead of rendering the protected page', () => {
      renderWithProviders(
        <Routes>
          <Route element={<RoleRoute roles={['admin']} />}>
            <Route path="/admin/audit" element={<div data-testid="audit-page">Audit</div>} />
          </Route>
          <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>,
        { initialPath: '/admin/audit' },
      );

      // Non-admin must NOT see the audit page.
      expect(screen.queryByTestId('audit-page')).not.toBeInTheDocument();
      // Must be redirected to /dashboard.
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  describe('non-admin user (apotekare) accessing admin-only route', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('apotekare'),
        isLoading: false,
        can: (_a) => false,
      });
    });

    it('redirects apotekare to /dashboard', () => {
      renderWithProviders(
        <Routes>
          <Route element={<RoleRoute roles={['admin']} />}>
            <Route path="/admin/audit" element={<div data-testid="audit-page">Audit</div>} />
          </Route>
          <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>,
        { initialPath: '/admin/audit' },
      );

      expect(screen.queryByTestId('audit-page')).not.toBeInTheDocument();
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  describe('loading state (isLoading: true)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        can: (_a) => false,
      });
    });

    it('renders null during loading', () => {
      const { container } = renderWithProviders(
        <Routes>
          <Route element={<RoleRoute roles={['admin']} />}>
            <Route path="/admin/audit" element={<div data-testid="audit-page">Audit</div>} />
          </Route>
          <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>,
        { initialPath: '/admin/audit' },
      );

      // During loading, RoleRoute returns null — nothing from the protected route renders.
      expect(screen.queryByTestId('audit-page')).not.toBeInTheDocument();
      // And since isLoading=true, fallback Navigate is NOT triggered either (null is returned).
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    });
  });
});
