import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { KontoPage } from '@/routes/konto/KontoPage';

/**
 * AUTH-06 — KontoPage admin gate (apps/web/src/routes/konto/KontoPage.tsx)
 *
 * Behavioral requirements:
 * - Admin user: "Admin ping" button IS visible; gate note IS NOT visible.
 * - Non-admin (sjukskoterska): button IS NOT visible; gate note IS visible verbatim.
 * - Non-admin (apotekare): button IS NOT visible; gate note IS visible verbatim.
 * - "Logga ut" button always visible regardless of role.
 *
 * Swedish verbatim strings from UI-SPEC §Copy:
 *   - Gate note: "Ändringar kan endast göras av administratör."
 *   - Logout: "Logga ut"
 *   - Admin button: "Admin ping"
 */

// Mock useAuth — KontoPage reads user + can() from this hook.
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

// Mock useLogout — we only need it not to throw; logout flow tested elsewhere.
vi.mock('@/features/auth/useLogout', () => ({
  useLogout: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// Mock fetchJson — KontoPage calls it on admin ping; not relevant to gate tests.
vi.mock('@/lib/api', () => ({
  fetchJson: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public envelope: unknown) {
      super('mocked');
    }
  },
  isUnauthenticated: vi.fn(() => false),
}));

import { useAuth } from '@/auth/useAuth';

const mockUseAuth = vi.mocked(useAuth);

function makeUser(role: MeResponse['role']): MeResponse {
  return {
    id: `u-${role}`,
    email: `${role}@example.test`,
    name: `${role} user`,
    role,
    careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
    permissions: role === 'admin' ? ['admin:ping'] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KontoPage admin gate', () => {
  describe('when user is admin', () => {
    beforeEach(() => {
      const user = makeUser('admin');
      mockUseAuth.mockReturnValue({
        user,
        isLoading: false,
        can: (action) => action === 'admin:ping',
      });
    });

    it('renders the "Admin ping" button', () => {
      renderWithProviders(<KontoPage />);
      expect(screen.getByRole('button', { name: /Admin ping/i })).toBeInTheDocument();
    });

    it('does NOT render the gate note "Ändringar kan endast göras av administratör."', () => {
      renderWithProviders(<KontoPage />);
      expect(
        screen.queryByText('Ändringar kan endast göras av administratör.'),
      ).not.toBeInTheDocument();
    });

    it('renders the "Logga ut" button', () => {
      renderWithProviders(<KontoPage />);
      expect(screen.getByRole('button', { name: /Logga ut/i })).toBeInTheDocument();
    });
  });

  describe('when user is sjukskoterska (non-admin)', () => {
    beforeEach(() => {
      const user = makeUser('sjukskoterska');
      mockUseAuth.mockReturnValue({
        user,
        isLoading: false,
        can: (_action) => false,
      });
    });

    it('does NOT render the "Admin ping" button', () => {
      renderWithProviders(<KontoPage />);
      expect(screen.queryByRole('button', { name: /Admin ping/i })).not.toBeInTheDocument();
    });

    it('renders the verbatim gate note "Ändringar kan endast göras av administratör."', () => {
      renderWithProviders(<KontoPage />);
      // Verbatim string from ROADMAP §"Phase 11" SC#2 — must match exactly.
      expect(
        screen.getByText('Ändringar kan endast göras av administratör.'),
      ).toBeInTheDocument();
    });

    it('renders the "Logga ut" button', () => {
      renderWithProviders(<KontoPage />);
      expect(screen.getByRole('button', { name: /Logga ut/i })).toBeInTheDocument();
    });
  });

  describe('when user is apotekare (non-admin)', () => {
    beforeEach(() => {
      const user = makeUser('apotekare');
      mockUseAuth.mockReturnValue({
        user,
        isLoading: false,
        can: (_action) => false,
      });
    });

    it('does NOT render the "Admin ping" button', () => {
      renderWithProviders(<KontoPage />);
      expect(screen.queryByRole('button', { name: /Admin ping/i })).not.toBeInTheDocument();
    });

    it('renders the verbatim gate note for apotekare too', () => {
      renderWithProviders(<KontoPage />);
      expect(
        screen.getByText('Ändringar kan endast göras av administratör.'),
      ).toBeInTheDocument();
    });

    it('renders the "Logga ut" button for apotekare', () => {
      renderWithProviders(<KontoPage />);
      expect(screen.getByRole('button', { name: /Logga ut/i })).toBeInTheDocument();
    });
  });
});
