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
  useOrdersByStatusQuery: vi.fn(),
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
import { useDraftsQuery, useOrdersByStatusQuery } from '@/features/orders/useOrderQueries';
import { useCreateDraftOrder } from '@/features/orders/useOrderMutations';

const mockUseAuth = vi.mocked(useAuth);
const mockUseDraftsQuery = vi.mocked(useDraftsQuery);
const mockUseOrdersByStatusQuery = vi.mocked(useOrdersByStatusQuery);
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

/** Helper to mock useDraftsQuery (and useOrdersByStatusQuery stub) with a specific rows array */
function mockDraftsQuery(rows: typeof DRAFT_ROW[], loading = false) {
  const result = {
    data: loading ? undefined : { rows, total: rows.length },
    isLoading: loading,
  } as unknown as UseQueryResult<OrderListResponse, ApiError>;
  mockUseDraftsQuery.mockReturnValue(result);
  // useOrdersByStatusQuery is called unconditionally (React Hook rules); return an empty
  // result stub for non-utkast statuses so tests focused on the utkast tab work correctly.
  mockUseOrdersByStatusQuery.mockReturnValue({
    data: { rows: [], total: 0 },
    isLoading: false,
  } as unknown as UseQueryResult<OrderListResponse, ApiError>);
}

/**
 * Phase 9 ORD-10 — helper for the non-Utkast tabs (Skickade / Bekräftade /
 * Levererade / Alla). Mirrors mockDraftsQuery's shape: drafts are emptied
 * and useOrdersByStatusQuery returns the provided rows so OrdersTable /
 * OrdersCardList render. The `status` argument is documentation-only; the
 * caller controls which tab is active via `initialPath` on the wrapper.
 */
function mockOrdersByStatusQuery(rows: Array<Record<string, unknown>>) {
  mockUseDraftsQuery.mockReturnValue({
    data: { rows: [], total: 0 },
    isLoading: false,
  } as unknown as UseQueryResult<OrderListResponse, ApiError>);
  mockUseOrdersByStatusQuery.mockReturnValue({
    data: { rows, total: rows.length },
    isLoading: false,
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
    it('calls mutateAsync and navigates to /bestallningar/<id>?from=utkast on success', async () => {
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
      // Phase 9 D-150 #3 + <discretion> rule — a new draft always lives in Utkast.
      expect(mockNavigate).toHaveBeenCalledWith('/bestallningar/new-order-id-789?from=utkast');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 9 ORD-10 / D-150 — ?from= propagation on row clicks
  // ---------------------------------------------------------------------------

  describe('(d) Phase 9 — Utkast tab row click navigates with ?from=utkast', () => {
    it('appends ?from=utkast when a draft row is clicked', async () => {
      const user = userEvent.setup();
      mockDraftsQuery([DRAFT_ROW]);
      mockCreateMutation();

      renderWithProviders(<BestallningarPage />);

      // DraftsCardList renders mobile cards as buttons with aria-label "Öppna beställning från …"
      // The DraftsTable rows on desktop are clickable TableRows. Click whichever exists.
      const candidates = screen.getAllByLabelText(/öppna beställning/i);
      expect(candidates.length).toBeGreaterThan(0);

      await user.click(candidates[0]!);

      // Phase 9 D-150 #1 — drafts only render on the Utkast tab.
      expect(mockNavigate).toHaveBeenCalledWith(`/bestallningar/${DRAFT_ROW.id}?from=utkast`);
    });
  });

  describe('(e) Phase 9 — Skickade tab row click navigates with ?from=skickad', () => {
    it('appends ?from=skickad when an OrdersTable row is clicked on the Skickade tab', async () => {
      const user = userEvent.setup();
      const SKICKAD_ROW = {
        ...DRAFT_ROW,
        id: 'order-skickad-1',
        status: 'skickad' as const,
        submittedAt: new Date().toISOString(),
        submittedBy: { id: 'u-nurse', name: 'Sara Sjuksköterska' },
      };
      mockOrdersByStatusQuery([SKICKAD_ROW]);
      mockCreateMutation();

      renderWithProviders(<BestallningarPage />, { initialPath: '/?status=skickad' });

      const candidates = screen.getAllByLabelText(/öppna beställning/i);
      expect(candidates.length).toBeGreaterThan(0);

      await user.click(candidates[0]!);

      // Phase 9 D-150 #2 — tab value flows verbatim into ?from=.
      expect(mockNavigate).toHaveBeenCalledWith(`/bestallningar/${SKICKAD_ROW.id}?from=skickad`);
    });
  });

  describe('(f) Phase 9 — Alla tab row click navigates with ?from=alla (not row.status)', () => {
    it('uses the active TAB value, not the row status, in ?from=', async () => {
      const user = userEvent.setup();
      // Row status is 'levererad' but the tab is 'alla' — ?from= must carry 'alla'.
      const ALLA_ROW = {
        ...DRAFT_ROW,
        id: 'order-alla-1',
        status: 'levererad' as const,
        deliveredAt: new Date().toISOString(),
        deliveredBy: { id: 'u-nurse', name: 'Sara Sjuksköterska' },
      };
      mockOrdersByStatusQuery([ALLA_ROW]);
      mockCreateMutation();

      renderWithProviders(<BestallningarPage />, { initialPath: '/?status=alla' });

      const candidates = screen.getAllByLabelText(/öppna beställning/i);
      expect(candidates.length).toBeGreaterThan(0);

      await user.click(candidates[0]!);

      // Phase 9 <discretion> "alla" case — the `tab` prop value is what flows into ?from=.
      expect(mockNavigate).toHaveBeenCalledWith(`/bestallningar/${ALLA_ROW.id}?from=alla`);
    });
  });
});
