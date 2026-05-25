/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { OrderResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';
import { ComposeOrderPage } from '../ComposeOrderPage';

/**
 * Phase 3 D-67 / D-68 / D-71 / UI-SPEC §4 — ComposeOrderPage component tests.
 *
 * Slice 3 (1–7):
 * (1) Mode A renders: back link, "Nytt utkast", line list, "Lägg till läkemedel",
 *     "Kasta", "Skicka beställning"
 * (2) Empty Mode A renders empty-state copy 'Lägg till läkemedel för att börja.'
 * (3) Submit button disabled when lines.length === 0 (+ tooltip copy)
 * (4) 404 state renders "Beställning hittades inte." + back-link button
 * (5) Trash button click fires useRemoveOrderLine.mutate
 * (6) "Lägg till läkemedel" click opens the picker (setPickerOpen → sheet visible)
 * (7) Mode B placeholder renders when order.status === 'skickad'
 *     and hides sticky footer + trash + picker trigger
 *
 * Slice 4 (8–12):
 * (8) Mode B renders with <SubmitConfirmationBanner> + OrderStatusPill="Skickad" + no footer
 * (9) Submit click flow: clicking Submit fires submitMutation.mutateAsync
 * (10) Submit-disabled persists: empty lines → disabled + tooltip
 * (11) Discard flow: Kasta → AlertDialog opens → confirm fires discardMutation → navigate
 * (12) Discard cancel: clicking Avbryt closes dialog without firing mutation
 */

// Mock useParams is not needed — we render inside Routes so useParams works.
// Mock useAuth for <Can> gates
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

// Mock order queries
vi.mock('@/features/orders/useOrderQueries', () => ({
  useDraftsQuery: vi.fn(),
  useOrderQuery: vi.fn(),
  usePickerOptionsQuery: vi.fn(),
}));

// Mock react-router-dom (extend to include useNavigate)
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

// Mock order mutations
vi.mock('@/features/orders/useOrderMutations', () => ({
  useCreateDraftOrder: vi.fn(),
  useAddOrderLine: vi.fn(),
  useUpdateOrderLineQuantity: vi.fn(),
  useRemoveOrderLine: vi.fn(),
  useSubmitOrder: vi.fn(),
  useDiscardOrder: vi.fn(),
  useConfirmOrder: vi.fn(),
  useDeliverOrder: vi.fn(),
}));

import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useOrderQuery, usePickerOptionsQuery } from '@/features/orders/useOrderQueries';
import { useAddOrderLine, useUpdateOrderLineQuantity, useRemoveOrderLine, useSubmitOrder, useDiscardOrder, useConfirmOrder, useDeliverOrder } from '@/features/orders/useOrderMutations';

const mockUseNavigate = vi.mocked(useNavigate);
const mockUseAuth = vi.mocked(useAuth);
const mockUseOrderQuery = vi.mocked(useOrderQuery);
const mockUsePickerOptionsQuery = vi.mocked(usePickerOptionsQuery);
const mockUseAddOrderLine = vi.mocked(useAddOrderLine);
const mockUseUpdateOrderLineQuantity = vi.mocked(useUpdateOrderLineQuantity);
const mockUseRemoveOrderLine = vi.mocked(useRemoveOrderLine);
const mockUseSubmitOrder = vi.mocked(useSubmitOrder);
const mockUseDiscardOrder = vi.mocked(useDiscardOrder);
const mockUseConfirmOrder = vi.mocked(useConfirmOrder);
const mockUseDeliverOrder = vi.mocked(useDeliverOrder);

/** Nurse with all order:* permissions */
function setupNurseAuth() {
  const ALL_PERMS = [
    'order:read',
    'order:create',
    'order:update',
    'order:submit',
    'order:delete',
  ];
  mockUseAuth.mockReturnValue({
    user: {
      id: 'u-nurse',
      email: 'sjukskoterska@example.test',
      name: 'Sara Sjuksköterska',
      role: 'sjukskoterska',
      careUnit: { id: 'cu-1', name: 'Avdelning 1' },
      permissions: ALL_PERMS,
    },
    isLoading: false,
    can: (action: string) => ALL_PERMS.includes(action),
  } as unknown as ReturnType<typeof useAuth>);
}

const MOCK_LINE = {
  id: 'line-1',
  careUnitMedicationId: 'cum-1',
  name: 'Paracetamol 500 mg',
  atcCode: 'N02BE01',
  form: 'Tablett',
  strength: '500 mg',
  quantity: 2,
  currentStock: 10,
  lowStockThreshold: 20,
};

const MOCK_ORDER_UTKAST: OrderResponse = {
  id: 'order-1',
  status: 'utkast',
  careUnitId: 'cu-1',
  // Phase 10 D-165 / D-167 — orderNumber + counter + year live on every
  // order envelope post-Plan-01; the H1 reads 'Beställning ${orderNumber}'.
  orderNumber: 'ORD-2026-0042',
  orderNumberCounter: 42,
  orderNumberYear: 2026,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  submittedAt: null,
  createdBy: { id: 'u-nurse', name: 'Sara Sjuksköterska' },
  submittedBy: null,
  lines: [MOCK_LINE],
} as unknown as OrderResponse;

const MOCK_ORDER_UTKAST_EMPTY: OrderResponse = {
  ...MOCK_ORDER_UTKAST,
  lines: [],
} as unknown as OrderResponse;

const MOCK_ORDER_SKICKAD: OrderResponse = {
  ...MOCK_ORDER_UTKAST,
  status: 'skickad',
} as unknown as OrderResponse;

/** Phase 9 ORD-10 — non-utkast mock used by back-link fallback tests (D-153). */
const MOCK_ORDER_BEKRAFTAD: OrderResponse = {
  ...MOCK_ORDER_UTKAST,
  status: 'bekraftad',
  submittedAt: new Date().toISOString(),
  submittedBy: { id: 'u-nurse', name: 'Sara Sjuksköterska' },
  confirmedAt: new Date().toISOString(),
  confirmedBy: { id: 'u-apotekare', name: 'Anna Apotekare' },
} as unknown as OrderResponse;

function makeIdleMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    reset: vi.fn(),
    status: 'idle',
    error: null,
    data: undefined,
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    isPaused: false,
  };
}

function setupMutations(
  removeFn = vi.fn(),
  submitFn = vi.fn(),
  discardFn = vi.fn(),
  submitIsSuccess = false,
) {
  mockUseAddOrderLine.mockReturnValue(makeIdleMutation() as unknown as ReturnType<typeof useAddOrderLine>);
  mockUseUpdateOrderLineQuantity.mockReturnValue(makeIdleMutation() as unknown as ReturnType<typeof useUpdateOrderLineQuantity>);
  mockUseRemoveOrderLine.mockReturnValue({
    ...makeIdleMutation(),
    mutate: removeFn,
  } as unknown as ReturnType<typeof useRemoveOrderLine>);
  // WR-08: submit mutation's isSuccess flag drives SubmitConfirmationBanner
  // visibility. Tests that simulate "user just submitted" pass submitIsSuccess=true.
  mockUseSubmitOrder.mockReturnValue({
    ...makeIdleMutation(),
    mutateAsync: submitFn,
    isSuccess: submitIsSuccess,
    isIdle: !submitIsSuccess,
    status: submitIsSuccess ? 'success' : 'idle',
  } as unknown as ReturnType<typeof useSubmitOrder>);
  mockUseDiscardOrder.mockReturnValue({
    ...makeIdleMutation(),
    mutateAsync: discardFn,
  } as unknown as ReturnType<typeof useDiscardOrder>);
  mockUseConfirmOrder.mockReturnValue(makeIdleMutation() as unknown as ReturnType<typeof useConfirmOrder>);
  mockUseDeliverOrder.mockReturnValue(makeIdleMutation() as unknown as ReturnType<typeof useDeliverOrder>);
}

function setupPickerQuery() {
  mockUsePickerOptionsQuery.mockReturnValue({
    data: { results: [] },
    isLoading: false,
  } as unknown as UseQueryResult<import('@meditrack/shared').PickerOptionsResponse, ApiError>);
}

function setupOrderQuery(data: OrderResponse | null, error?: Partial<ApiError>) {
  mockUseOrderQuery.mockReturnValue({
    data: data ?? undefined,
    isLoading: false,
    isError: !!error,
    error: error ?? null,
  } as unknown as UseQueryResult<OrderResponse, ApiError>);
}

/** Phase 9 ORD-10 — for back-link tests that exercise the loading state path. */
function setupOrderQueryLoading() {
  mockUseOrderQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
  } as unknown as UseQueryResult<OrderResponse, ApiError>);
}

/** Render ComposeOrderPage inside a router with the :id param set to 'order-1'.
 *  Phase 9 ORD-10: accepts an explicit initialPath so back-nav tests can mount
 *  with `?from=<status>` query strings (defaults to '/order-1' for back-compat). */
function renderComposeOrderPage(initialPath: string = '/order-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/:id" element={<ComposeOrderPage />} />
    </Routes>,
    { initialPath },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupNurseAuth();
  setupMutations();
  setupPickerQuery();
  // Default navigate mock
  mockUseNavigate.mockReturnValue(vi.fn());
});

describe('ComposeOrderPage', () => {
  describe('(1) Mode A renders correctly with lines', () => {
    it('shows back link, identity-first H1, line, "Lägg till läkemedel", footer actions', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Back link
      expect(screen.getByText('Tillbaka till beställningar')).toBeInTheDocument();

      // Phase 10 D-167 — H1 is the order's identity: 'Beställning ORD-…'.
      // The OrderStatusPill carries status (rendered separately); the H1
      // does NOT include 'Nytt utkast' / 'Beställning · Skickad' anymore.
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Beställning ORD-2026-0042');

      // Line name in table (desktop-visible column)
      expect(screen.getAllByText('Paracetamol 500 mg').length).toBeGreaterThan(0);

      // "Skicka beställning" button in sticky footer
      expect(screen.getAllByRole('button', { name: /skicka beställning/i }).length).toBeGreaterThan(0);

      // "Kasta" button in sticky footer
      expect(screen.getAllByRole('button', { name: /kasta/i }).length).toBeGreaterThan(0);
    });
  });

  describe('(2) Empty Mode A renders empty-state copy', () => {
    it('shows "Lägg till läkemedel för att börja." when lines.length === 0', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST_EMPTY);

      renderComposeOrderPage();

      expect(screen.getAllByText('Lägg till läkemedel för att börja.').length).toBeGreaterThan(0);
    });
  });

  describe('(3) Submit button disabled when lines.length === 0', () => {
    it('renders Submit as disabled when order has no lines', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST_EMPTY);

      renderComposeOrderPage();

      const submitButtons = screen.getAllByRole('button', { name: /skicka beställning/i });
      // At least one Submit button should be disabled
      expect(submitButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
    });
  });

  describe('(4) 404 state renders error card', () => {
    it('shows "Beställning hittades inte." and back link when query returns 404', () => {
      setupOrderQuery(null, {
        envelope: { error: { code: 'not_found', message: 'Beställningen hittades inte.' } },
      } as unknown as Partial<ApiError>);

      renderComposeOrderPage();

      expect(screen.getByText('Beställning hittades inte.')).toBeInTheDocument();
      // Multiple "Tillbaka" links may render (header + card) — at least one is enough
      const backLinks = screen.getAllByRole('link', { name: /tillbaka till beställningar/i });
      expect(backLinks.length).toBeGreaterThan(0);
    });
  });

  describe('(5) Trash button click fires useRemoveOrderLine.mutate', () => {
    it('calls removeMutation.mutate with orderId + lineId when trash clicked', () => {
      const removeFn = vi.fn();
      setupMutations(removeFn);
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Find trash button (aria-label="Ta bort rad")
      const trashBtns = screen.getAllByLabelText('Ta bort rad');
      expect(trashBtns.length).toBeGreaterThan(0);

      act(() => {
        fireEvent.click(trashBtns[0]!);
      });

      expect(removeFn).toHaveBeenCalledTimes(1);
      expect(removeFn).toHaveBeenCalledWith({
        orderId: 'order-1',
        lineId: 'line-1',
      });
    });
  });

  describe('(6) "Lägg till läkemedel" opens the picker sheet', () => {
    it('renders MedicationPickerSheet (SheetTitle) after clicking the desktop add button', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Desktop "Lägg till läkemedel" button (outside footer, hidden md:block in JSDOM = visible)
      // Find the button that is NOT inside the sticky footer — both are present in DOM
      const addBtns = screen.getAllByRole('button', { name: /lägg till läkemedel/i });
      expect(addBtns.length).toBeGreaterThan(0);

      act(() => {
        fireEvent.click(addBtns[0]!);
      });

      // After click, MedicationPickerSheet is open — the search input becomes visible
      // (Sheet renders inline in jsdom; search input with autoFocus is the key signal)
      expect(screen.getByPlaceholderText('Sök läkemedel…')).toBeInTheDocument();
    });
  });

  describe('(7) Mode B placeholder when order.status === "skickad" (post-submit)', () => {
    it('renders Phase 10 D-169 banner copy + hides sticky footer when submit just succeeded', () => {
      // WR-08: pass submitIsSuccess=true so SubmitConfirmationBanner renders.
      setupMutations(vi.fn(), vi.fn(), vi.fn(), /* submitIsSuccess */ true);
      setupOrderQuery(MOCK_ORDER_SKICKAD);

      renderComposeOrderPage();

      // Phase 10 D-169 — Mode B banner copy: 'Beställning ORD-… är skickad.'
      // (replaces the Phase 3 'Beställningen är skickad till apotekare.').
      expect(
        screen.getByText('Beställning ORD-2026-0042 är skickad.'),
      ).toBeInTheDocument();

      // Sticky footer should NOT render in Mode B (no "Skicka beställning" button)
      expect(screen.queryByRole('button', { name: /skicka beställning/i })).not.toBeInTheDocument();

      // Picker trigger button should NOT render in Mode B
      // (the inline desktop button is inside <Can> but Mode B returns before rendering it)
      expect(screen.queryByRole('button', { name: /lägg till läkemedel/i })).not.toBeInTheDocument();
    });
  });

  describe('(7b) WR-08 — deep-link to a Skickad order does NOT show the role=status banner', () => {
    it('omits SubmitConfirmationBanner when submitMutation.isSuccess is false (page load case)', () => {
      // Default setupMutations passes submitIsSuccess=false — the page-load case.
      setupOrderQuery(MOCK_ORDER_SKICKAD);

      renderComposeOrderPage();

      // The banner role="status" must NOT be in the DOM — otherwise ATs that
      // skip role=status on initial render would silently drop the announcement.
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Beställning ORD-.* är skickad\./),
      ).not.toBeInTheDocument();

      // Status pill should still appear (Mode B layout otherwise unchanged).
      expect(screen.getByText('Skickad')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Slice 4 tests
  // ---------------------------------------------------------------------------

  describe('(8) Mode B renders with SubmitConfirmationBanner + OrderStatusPill + no footer (post-submit)', () => {
    it('shows banner, "Skickad" pill, read-only lines, and hides sticky footer', () => {
      setupMutations(vi.fn(), vi.fn(), vi.fn(), /* submitIsSuccess */ true);
      setupOrderQuery(MOCK_ORDER_SKICKAD);

      renderComposeOrderPage();

      // SubmitConfirmationBanner (role="status") — Phase 10 D-169 copy.
      const banner = screen.getByRole('status');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Beställning ORD-2026-0042 är skickad.');

      // OrderStatusPill with "Skickad" label
      expect(screen.getByText('Skickad')).toBeInTheDocument();

      // No sticky footer in Mode B
      expect(screen.queryByRole('button', { name: /skicka beställning/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^kasta$/i })).not.toBeInTheDocument();
    });
  });

  describe('(9) Submit click flow: fires submitMutation.mutateAsync', () => {
    it('calls submitMutation.mutateAsync with orderId when Submit clicked', async () => {
      const submitFn = vi.fn().mockResolvedValue(MOCK_ORDER_SKICKAD);
      setupMutations(vi.fn(), submitFn, vi.fn());
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Find the Submit button (not disabled since there are lines)
      const submitBtns = screen.getAllByRole('button', { name: /skicka beställning/i });
      const enabledBtn = submitBtns.find((b) => !(b as HTMLButtonElement).disabled);
      expect(enabledBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(enabledBtn!);
      });

      expect(submitFn).toHaveBeenCalledTimes(1);
      expect(submitFn).toHaveBeenCalledWith({ orderId: 'order-1' });
    });
  });

  describe('(10) Submit-disabled persists: empty lines → disabled', () => {
    it('Submit button is disabled when order has no lines', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST_EMPTY);

      renderComposeOrderPage();

      const submitBtns = screen.getAllByRole('button', { name: /skicka beställning/i });
      expect(submitBtns.every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
    });
  });

  describe('(11) Discard flow: Kasta → AlertDialog → confirm fires discardMutation + navigate', () => {
    it('opens dialog on Kasta click; confirming fires discardMutation.mutateAsync then navigate', async () => {
      const navigateFn = vi.fn();
      mockUseNavigate.mockReturnValue(navigateFn);
      const discardFn = vi.fn().mockResolvedValue(undefined);
      setupMutations(vi.fn(), vi.fn(), discardFn);
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Click "Kasta" to open the dialog
      const kastaBtns = screen.getAllByRole('button', { name: /^kasta$/i });
      await act(async () => {
        fireEvent.click(kastaBtns[0]!);
      });

      // Dialog should be open with title
      expect(screen.getByText('Kasta detta utkast?')).toBeInTheDocument();

      // Click the action "Kasta" inside the dialog
      const dialogActionBtn = screen.getByRole('button', { name: /^kasta$/i });
      await act(async () => {
        fireEvent.click(dialogActionBtn);
      });

      // discardMutation.mutateAsync should have been called with orderId
      expect(discardFn).toHaveBeenCalledWith({ orderId: 'order-1' });

      // Phase 9 D-152/D-153 — post-discard navigate goes to backLink.to.
      // With no ?from= and MOCK_ORDER_UTKAST (status: 'utkast'), the fallback
      // resolves to '/bestallningar?status=utkast'.
      expect(navigateFn).toHaveBeenCalledWith('/bestallningar?status=utkast');
    });
  });

  describe('(12) Discard cancel: clicking Avbryt closes dialog without firing mutation', () => {
    it('closes the dialog when Avbryt is clicked', async () => {
      const discardFn = vi.fn();
      setupMutations(vi.fn(), vi.fn(), discardFn);
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Open dialog
      const kastaBtns = screen.getAllByRole('button', { name: /^kasta$/i });
      await act(async () => {
        fireEvent.click(kastaBtns[0]!);
      });

      expect(screen.getByText('Kasta detta utkast?')).toBeInTheDocument();

      // Click Avbryt
      const cancelBtn = screen.getByRole('button', { name: /avbryt/i });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // Dialog should be closed — title disappears
      expect(screen.queryByText('Kasta detta utkast?')).not.toBeInTheDocument();

      // Discard mutation should NOT have been called
      expect(discardFn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 9 ORD-10 / D-149..D-156 — back-link sites consume useBestallningarBackLink
  // ---------------------------------------------------------------------------

  describe('(13) Phase 9 — Loading state honors ?from=', () => {
    it('back-link in loading state has href ending ?status=skickad when ?from=skickad', () => {
      setupOrderQueryLoading();

      renderComposeOrderPage('/order-1?from=skickad');

      const backLinks = screen.getAllByRole('link', { name: /tillbaka till beställningar/i });
      expect(backLinks.length).toBeGreaterThan(0);
      // D-155 — loading state passes fallbackStatus: undefined; ?from= still honored.
      expect(backLinks[0]!.getAttribute('href')).toBe('/bestallningar?status=skickad');
    });
  });

  describe('(14) Phase 9 — 404 state honors ?from= on BOTH back-links', () => {
    it('both back-link anchors have href ending ?status=bekraftad when ?from=bekraftad', () => {
      setupOrderQuery(null, {
        envelope: { error: { code: 'not_found', message: 'Beställningen hittades inte.' } },
      } as unknown as Partial<ApiError>);

      renderComposeOrderPage('/order-1?from=bekraftad');

      // 404 state renders the inline back link AND the Button-wrapped Link
      // (sites 2 and 3 in ComposeOrderPage). Both must honor ?from=.
      const backLinks = screen.getAllByRole('link', { name: /tillbaka till beställningar/i });
      expect(backLinks.length).toBeGreaterThanOrEqual(2);
      for (const link of backLinks) {
        expect(link.getAttribute('href')).toBe('/bestallningar?status=bekraftad');
      }
    });
  });

  describe('(15) Phase 9 — Header back-link uses order.status fallback when ?from= absent (D-153)', () => {
    it('href ends with ?status=bekraftad when MOCK_ORDER_BEKRAFTAD and no ?from=', () => {
      setupOrderQuery(MOCK_ORDER_BEKRAFTAD);

      renderComposeOrderPage('/order-1');

      const backLinks = screen.getAllByRole('link', { name: /tillbaka till beställningar/i });
      expect(backLinks.length).toBeGreaterThan(0);
      expect(backLinks[0]!.getAttribute('href')).toBe('/bestallningar?status=bekraftad');
    });
  });

  describe('(16) Phase 9 — ?from= wins over order.status (D-153 priority)', () => {
    it('href ends with ?status=alla when ?from=alla even though order.status is bekraftad', () => {
      setupOrderQuery(MOCK_ORDER_BEKRAFTAD);

      renderComposeOrderPage('/order-1?from=alla');

      const backLinks = screen.getAllByRole('link', { name: /tillbaka till beställningar/i });
      expect(backLinks.length).toBeGreaterThan(0);
      // D-153 resolution priority — valid ?from= wins over the caller's
      // fallbackStatus, regardless of order.status.
      expect(backLinks[0]!.getAttribute('href')).toBe('/bestallningar?status=alla');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 10 D-167 / D-169 — orderNumber is the identity affordance
  // ---------------------------------------------------------------------------

  describe('(P10-1) Phase 10 D-167 — H1 reads "Beställning ORD-YYYY-####" regardless of status', () => {
    it('utkast: H1 is identity-first (NOT status-derived) and OrderStatusPill carries status separately', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Beställning ORD-2026-0042');
      // OrderStatusPill renders the lifecycle stage separately.
      expect(screen.getByText('Utkast')).toBeInTheDocument();
    });

    it('bekraftad: H1 still reads the SAME order number — identity is stable across transitions', () => {
      setupOrderQuery(MOCK_ORDER_BEKRAFTAD);

      renderComposeOrderPage();

      const h1 = screen.getByRole('heading', { level: 1 });
      // MOCK_ORDER_BEKRAFTAD spreads from MOCK_ORDER_UTKAST so orderNumber
      // carries over verbatim — confirms D-162 (orderNumber stable across
      // status transitions) at the FE rendering layer.
      expect(h1).toHaveTextContent('Beställning ORD-2026-0042');
      expect(screen.getByText('Bekräftad')).toBeInTheDocument();
    });
  });

  describe('(17) Phase 9 — Post-discard navigates to backLink.to (preserves ?from=)', () => {
    it('navigate called with /bestallningar?status=skickad after Kasta → confirm with ?from=skickad', async () => {
      const navigateFn = vi.fn();
      mockUseNavigate.mockReturnValue(navigateFn);
      const discardFn = vi.fn().mockResolvedValue(undefined);
      setupMutations(vi.fn(), vi.fn(), discardFn);
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage('/order-1?from=skickad');

      // Open dialog
      const kastaBtns = screen.getAllByRole('button', { name: /^kasta$/i });
      await act(async () => {
        fireEvent.click(kastaBtns[0]!);
      });

      expect(screen.getByText('Kasta detta utkast?')).toBeInTheDocument();

      // Confirm
      const dialogActionBtn = screen.getByRole('button', { name: /^kasta$/i });
      await act(async () => {
        fireEvent.click(dialogActionBtn);
      });

      expect(discardFn).toHaveBeenCalledWith({ orderId: 'order-1' });
      // D-152 — post-discard navigate preserves the original tab via backLink.to.
      expect(navigateFn).toHaveBeenCalledWith('/bestallningar?status=skickad');
    });
  });
});
