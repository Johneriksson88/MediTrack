import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { Sidebar } from '@/routes/shell/Sidebar';

/**
 * AUTH-06 — Sidebar admin filter (apps/web/src/routes/shell/Sidebar.tsx)
 *
 * Behavioral requirements (UI-SPEC §Nav):
 * - Admin user: 5 NavLinks rendered, including one with label "Admin".
 * - Non-admin user: 4 NavLinks rendered, none with label "Admin".
 *
 * The NAV array has 5 items total (Dashboard, Läkemedel, Beställningar, Konto, Admin).
 * The Admin item is filtered out by visibleNav(role) when role !== 'admin'.
 *
 * Verbatim labels from UI-SPEC §Copy:
 *   Dashboard, Läkemedel, Beställningar, Konto, Admin
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

describe('Sidebar admin nav filter', () => {
  describe('when user is admin', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('admin'),
        isLoading: false,
        can: (a) => a === 'admin:ping',
      });
    });

    it('renders 5 nav links (all items including Admin)', () => {
      renderWithProviders(<Sidebar />);
      // Sidebar uses aria-label on each NavLink matching item.label
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(5);
    });

    it('includes the "Admin" nav item', () => {
      renderWithProviders(<Sidebar />);
      // aria-label is set on every NavLink for accessibility
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    });

    it('includes all four non-admin nav items', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Läkemedel' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Beställningar' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Konto' })).toBeInTheDocument();
    });
  });

  describe('when user is sjukskoterska (non-admin)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('sjukskoterska'),
        isLoading: false,
        can: (_a) => false,
      });
    });

    it('renders 4 nav links (Admin filtered out)', () => {
      renderWithProviders(<Sidebar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });

    it('does NOT include the "Admin" nav item', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    });

    it('includes all four non-admin nav items', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Läkemedel' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Beställningar' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Konto' })).toBeInTheDocument();
    });
  });

  describe('when user is apotekare (non-admin)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('apotekare'),
        isLoading: false,
        can: (_a) => false,
      });
    });

    it('renders 4 nav links — Admin filtered out for apotekare too', () => {
      renderWithProviders(<Sidebar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });

    it('does NOT include the "Admin" nav item for apotekare', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    });
  });

  describe('when user is null (loading)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        can: (_a) => false,
      });
    });

    it('renders 4 nav links when user is null (adminOnly items filtered)', () => {
      renderWithProviders(<Sidebar />);
      // visibleNav(null) filters out adminOnly items → 4 items
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });
  });
});
