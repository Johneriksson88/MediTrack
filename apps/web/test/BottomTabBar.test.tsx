import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { BottomTabBar } from '@/routes/shell/BottomTabBar';

/**
 * AUTH-06 — BottomTabBar admin filter (apps/web/src/routes/shell/BottomTabBar.tsx)
 *
 * Behavioral requirements (UI-SPEC §Nav, §Bottom Tab Bar):
 * - Admin user: 5 NavLinks rendered, including one with label "Admin".
 * - Non-admin user: 4 NavLinks rendered, none with label "Admin".
 *
 * Same filter logic as Sidebar — both consume visibleNav(role) from nav.ts.
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

describe('BottomTabBar admin nav filter', () => {
  describe('when user is admin', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('admin'),
        isLoading: false,
        can: (a) => a === 'admin:ping',
      });
    });

    it('renders 5 nav links (all items including Admin)', () => {
      renderWithProviders(<BottomTabBar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(5);
    });

    it('includes the "Admin" tab', () => {
      renderWithProviders(<BottomTabBar />);
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
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
      renderWithProviders(<BottomTabBar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });

    it('does NOT include the "Admin" tab', () => {
      renderWithProviders(<BottomTabBar />);
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    });

    it('shows all four non-admin tabs with correct Swedish labels', () => {
      renderWithProviders(<BottomTabBar />);
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

    it('renders 4 nav links — Admin filtered out for apotekare', () => {
      renderWithProviders(<BottomTabBar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });

    it('does NOT include "Admin" tab for apotekare', () => {
      renderWithProviders(<BottomTabBar />);
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

    it('renders 4 nav links when user.role is undefined (adminOnly filtered)', () => {
      renderWithProviders(<BottomTabBar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });
  });
});
