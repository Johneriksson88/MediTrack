import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Can } from '@/auth/Can';

/**
 * AUTH-06 — `<Can action="…">` component (apps/web/src/auth/Can.tsx)
 *
 * Behavioral requirement: the component renders its children iff the
 * current user has the named permission. Non-permitted users see nothing.
 * This is defense-in-depth (never the security boundary).
 */

// Mock useAuth so tests control permission state without a real QueryClient
// fetching from the API.
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

import { useAuth } from '@/auth/useAuth';

const mockUseAuth = vi.mocked(useAuth);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<Can action="admin:ping">', () => {
  it('renders children when the user has the permission', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u1',
        email: 'admin@example.test',
        name: 'Admin Demo',
        role: 'admin',
        careUnit: { id: 'cu1', name: 'Avdelning 4' },
        permissions: ['admin:ping'],
      },
      isLoading: false,
      can: (action) => action === 'admin:ping',
    });

    render(
      <Can action="admin:ping">
        <span data-testid="child">secret content</span>
      </Can>,
      { wrapper },
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });

  it('renders nothing (null) when the user lacks the permission', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u2',
        email: 'nurse@example.test',
        name: 'Nurse',
        role: 'sjukskoterska',
        careUnit: { id: 'cu1', name: 'Avdelning 4' },
        permissions: [],
      },
      isLoading: false,
      can: (_action) => false,
    });

    const { container } = render(
      <Can action="admin:ping">
        <span data-testid="child">secret content</span>
      </Can>,
      { wrapper },
    );

    // Component must return null — no element rendered at all.
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when isLoading is true (no permissions yet)', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      can: (_action) => false,
    });

    const { container } = render(
      <Can action="admin:ping">
        <span data-testid="child">secret content</span>
      </Can>,
      { wrapper },
    );

    expect(container.firstChild).toBeNull();
  });
});
