import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { Sidebar } from '@/routes/shell/Sidebar';

/**
 * AUTH-06 — Sidebar role-based nav filter (apps/web/src/routes/shell/Sidebar.tsx)
 *
 * NAV array (7 items): Dashboard, Läkemedel, Beställningar, Sortiment, Konto,
 * Användare, Granskning. Sortiment is gated to ['apotekare', 'admin'];
 * Användare + Granskning are gated to ['admin'].
 *
 * Expected counts:
 *   - admin:           7 (sees Sortiment + both admin items)
 *   - apotekare:       5 (sees Sortiment, no admin items)
 *   - sjukskoterska:   4 (none of the gated items)
 *   - loading (null):  4 (gated items hidden until role resolves)
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

    it('renders 7 nav links (all items including Sortiment + admin entries)', () => {
      renderWithProviders(<Sidebar />);
      // Sidebar uses aria-label on each NavLink matching item.label
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(7);
    });

    it('includes "Sortiment", "Användare" and "Granskning"', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('link', { name: 'Sortiment' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Användare' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Granskning' })).toBeInTheDocument();
    });

    it('includes all four open nav items', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Läkemedel' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Beställningar' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Konto' })).toBeInTheDocument();
    });
  });

  describe('when user is sjukskoterska (no gated items)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('sjukskoterska'),
        isLoading: false,
        can: (_a) => false,
      });
    });

    it('renders 4 nav links (Sortiment + admin entries filtered out)', () => {
      renderWithProviders(<Sidebar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });

    it('does NOT include "Sortiment", "Användare" or "Granskning"', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.queryByRole('link', { name: 'Sortiment' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Användare' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Granskning' })).not.toBeInTheDocument();
    });

    it('includes all four open nav items', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Läkemedel' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Beställningar' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Konto' })).toBeInTheDocument();
    });
  });

  describe('when user is apotekare (Sortiment only)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: makeUser('apotekare'),
        isLoading: false,
        can: (_a) => false,
      });
    });

    it('renders 5 nav links — sees Sortiment, no admin items', () => {
      renderWithProviders(<Sidebar />);
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(5);
    });

    it('includes "Sortiment" but neither admin item', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('link', { name: 'Sortiment' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Användare' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Granskning' })).not.toBeInTheDocument();
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

    it('renders 4 nav links when user is null (gated items filtered)', () => {
      renderWithProviders(<Sidebar />);
      // visibleNav(null) filters out items with a `roles` list → 4 items
      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(4);
    });
  });
});
