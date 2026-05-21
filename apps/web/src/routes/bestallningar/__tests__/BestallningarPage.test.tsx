/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';
import type { OrderListResponse, OrderResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';
import { BestallningarPage } from '../BestallningarPage';

/**
 * Phase 3 D-70 / D-72 / UI-SPEC §1 — BestallningarPage component tests.
 *
 * (a) renders empty state with the three D-70 strings when useDraftsQuery returns []
 * (b) renders DraftsTable + DraftsCardList when useDraftsQuery returns ≥1 row
 * (c) clicking "Ny beställning" calls mutateAsync and on resolved response navigates
 *     to /bestallningar/<id>
 */

// Mock useAuth — BestallningarPage reads can() via <Can action="order:create">
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

// Mock order queries so tests control data without real API calls
vi.mock('@/features/orders/useOrderQueries', () => ({
  useDraftsQuery: vi.fn(),
}));

// Mock order mutations
vi.mock('@/features/orders/useOrderMutations', () => ({
  useCreateDraftOrder: vi.fn(),
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useAuth } from '@/auth/useAuth';
import { useDraftsQuery } from '@/features/orders/useOrderQueries';
import { useCreateDraftOrder } from '@/features/orders/useOrderMutations';

const mockUseAuth = vi.mocked(useAuth);
const mockUseDraftsQuery = vi.mocked(useDraftsQuery);
const mockUseCreateDraftOrder = vi.mocked(useCreateDraftOrder);

/** Nurse with order:create permission — typical BestallningarPage user */
function setupNurseAuth() {
  mockUseAuth.mockReturnValue({
    user: {
      id: 'u-nurse',
      email: 'sjukskoterska@example.test',
      name: 'Sara Sjuksköterska',
      role: 'sjukskoterska',
      careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
      permissions: ['order:read', 'order:create'],
    },
    isLoading: false,
    can: (action) => ['order:read', 'order:create'].includes(action),
  });
}

/** A single draft list item */
const DRAFT_ROW = {
  id: 'order-abc123',
  status: 'utkast' as const,
  createdAt: new Date().toISOString(),
  lineCount: 3,
  totalQuantity: 12,
  createdBy: { id: 'u-nurse', name: 'Sara Sjuksköterska' },
};

/** Helper to mock useDraftsQuery with a specific rows array */
function mockDraftsQuery(rows: typeof DRAFT_ROW[], loading = false) {
  mockUseDraftsQuery.mockReturnValue({
    data: loading ? undefined : { rows, total: rows.length },
    isLoading: loading,
  } as unknown as UseQueryResult<OrderListResponse, ApiError>);
}

/** Helper to mock useCreateDraftOrder with an optional mutateAsync implementation */
function mockCreateMutation(mutateAsync = vi.fn()) {
  mockUseCreateDraftOrder.mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateDraftOrder>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockReset();
  setupNurseAuth();
});

describe('BestallningarPage', () => {
  describe('(a) empty state — useDraftsQuery returns []', () => {
    beforeEach(() => {
      mockDraftsQuery([]);
      mockCreateMutation();
    });

    it('renders the D-70 heading "Inga utkast ännu"', () => {
      renderWithProviders(<BestallningarPage />);
      expect(screen.getByText('Inga utkast ännu')).toBeInTheDocument();
    });

    it('renders the D-70 body "Skapa en ny beställning för att komma igång."', () => {
      renderWithProviders(<BestallningarPage />);
      expect(
        screen.getByText('Skapa en ny beställning för att komma igång.'),
      ).toBeInTheDocument();
    });

    it('renders the D-70 CTA "Ny beställning" (at least one — header + empty state)', () => {
      renderWithProviders(<BestallningarPage />);
      const buttons = screen.getAllByRole('button', { name: /Ny beställning/i });
      // At least the empty-state CTA must exist (header button may also be present)
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT render DraftsTable column headers', () => {
      renderWithProviders(<BestallningarPage />);
      // Table headers would be present if DraftsTable rendered
      expect(screen.queryByText('Skapad av')).not.toBeInTheDocument();
    });
  });

  describe('(b) filled state — useDraftsQuery returns ≥1 row', () => {
    beforeEach(() => {
      mockDraftsQuery([DRAFT_ROW]);
      mockCreateMutation();
    });

    it('renders DraftsTable column header "Skapad av"', () => {
      renderWithProviders(<BestallningarPage />);
      // DraftsTable column header exists in the DOM (CSS hides it at <md but it renders)
      expect(screen.getByText('Skapad av')).toBeInTheDocument();
    });

    it('renders DraftCard with createdBy.name', () => {
      renderWithProviders(<BestallningarPage />);
      // DraftCard renders 'Skapad av Sara Sjuksköterska' for the mobile view
      expect(screen.getAllByText(/Skapad av Sara Sjuksköterska/).length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT render the empty state heading "Inga utkast ännu"', () => {
      renderWithProviders(<BestallningarPage />);
      expect(screen.queryByText('Inga utkast ännu')).not.toBeInTheDocument();
    });
  });

  describe('(c) "Ny beställning" click → mutateAsync → navigate', () => {
    it('calls mutateAsync and navigates to /bestallningar/<id> on success', async () => {
      const user = userEvent.setup();
      const newOrder = { id: 'new-order-id-789' } as unknown as OrderResponse;
      const mockMutateAsync = vi.fn().mockResolvedValue(newOrder);

      mockDraftsQuery([]);
      mockCreateMutation(mockMutateAsync);

      renderWithProviders(<BestallningarPage />);

      // Click the empty-state CTA (first 'Ny beställning' button)
      const buttons = screen.getAllByRole('button', { name: /Ny beställning/i });
      await user.click(buttons[0]!);

      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/bestallningar/new-order-id-789');
    });
  });
});
