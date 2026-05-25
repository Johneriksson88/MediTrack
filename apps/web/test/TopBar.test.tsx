import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { TopBar } from '@/routes/shell/TopBar';

/**
 * UX-02 — TopBar logout reachability at every breakpoint
 * (apps/web/src/routes/shell/TopBar.tsx)
 *
 * Behavioral requirements (Phase 11 D-170 / D-171 / D-174):
 * - Mobile (<md): icon-only <LogOut/> button, 44×44, aria-label="Logga ut".
 * - Desktop (>=md): icon+label "Logga ut" button next to static UserPill.
 * - Both wire to useLogout().mutate() — same hook, single source of truth.
 * - UserPill renders as a non-interactive <div> (no role="button"). D-171.
 * - Logo Link to /dashboard unchanged.
 */

// Mock useLogout — lift mockMutate to module scope so click assertions can verify.
const mockMutate = vi.fn();
vi.mock('@/features/auth/useLogout', () => ({
  useLogout: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));

// Mock useAuth — TopBar reads it indirectly through UserPill.
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
    careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
    permissions: role === 'admin' ? ['admin:ping'] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutate.mockClear();
});

describe('TopBar', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: makeUser('sjukskoterska'),
      isLoading: false,
      can: (_a) => false,
    });
  });

  it('renders the mobile-only icon-button (aria-label "Logga ut", md:hidden class)', () => {
    renderWithProviders(<TopBar />);
    // Both buttons have accessible-name "Logga ut" (mobile via aria-label, desktop via inline text).
    const allLogoutButtons = screen.getAllByRole('button', { name: /Logga ut/i });
    expect(allLogoutButtons.length).toBe(2);
    // Mobile button carries md:hidden; desktop button carries hidden md:flex on its parent.
    const mobileButton = allLogoutButtons.find((btn) =>
      btn.className.includes('md:hidden'),
    );
    expect(mobileButton).toBeInTheDocument();
  });

  it('renders the desktop-only logout button (icon+label inside hidden md:flex cluster)', () => {
    renderWithProviders(<TopBar />);
    const allLogoutButtons = screen.getAllByRole('button', { name: /Logga ut/i });
    expect(allLogoutButtons.length).toBe(2);
    // Desktop button's parent div carries hidden md:flex.
    const desktopButton = allLogoutButtons.find((btn) =>
      !btn.className.includes('md:hidden'),
    );
    expect(desktopButton).toBeInTheDocument();
    expect(desktopButton?.closest('div')?.className).toMatch(/hidden md:flex/);
  });

  it('clicking the mobile logout button invokes useLogout().mutate()', async () => {
    const userEvent = (await import('@testing-library/user-event')).default.setup();
    renderWithProviders(<TopBar />);
    const allLogoutButtons = screen.getAllByRole('button', { name: /Logga ut/i });
    const mobileButton = allLogoutButtons.find((btn) =>
      btn.className.includes('md:hidden'),
    );
    await userEvent.click(mobileButton!);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('clicking the desktop logout button invokes useLogout().mutate()', async () => {
    const userEvent = (await import('@testing-library/user-event')).default.setup();
    renderWithProviders(<TopBar />);
    const allLogoutButtons = screen.getAllByRole('button', { name: /Logga ut/i });
    const desktopButton = allLogoutButtons.find((btn) =>
      !btn.className.includes('md:hidden'),
    );
    await userEvent.click(desktopButton!);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('renders the static UserPill (identity display is NOT a button)', () => {
    renderWithProviders(<TopBar />);
    // The pill shows the user's name as plain text inside a <div>, not a <button>.
    // Per D-171: the pill is a non-interactive div.
    expect(screen.getByText('sjukskoterska user')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'sjukskoterska user' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the existing logo Link to /dashboard', () => {
    renderWithProviders(<TopBar />);
    const logoLink = screen.getByRole('link', { name: /MediTrack/i });
    expect(logoLink).toHaveAttribute('href', '/dashboard');
  });
});
