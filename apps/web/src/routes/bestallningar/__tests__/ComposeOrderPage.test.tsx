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
 * (1) Mode A renders: back link, "Nytt utkast", line list, "Lägg till läkemedel",
 *     "Kasta", "Skicka beställning"
 * (2) Empty Mode A renders empty-state copy 'Lägg till läkemedel för att börja.'
 * (3) Submit button disabled when lines.length === 0 (+ tooltip copy)
 * (4) 404 state renders "Beställning hittades inte." + back-link button
 * (5) Trash button click fires useRemoveOrderLine.mutate
 * (6) "Lägg till läkemedel" click opens the picker (setPickerOpen → sheet visible)
 * (7) Mode B placeholder renders when order.status === 'skickad'
 *     and hides sticky footer + trash + picker trigger
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

// Mock order mutations
vi.mock('@/features/orders/useOrderMutations', () => ({
  useCreateDraftOrder: vi.fn(),
  useAddOrderLine: vi.fn(),
  useUpdateOrderLineQuantity: vi.fn(),
  useRemoveOrderLine: vi.fn(),
}));

import { useAuth } from '@/auth/useAuth';
import { useOrderQuery, usePickerOptionsQuery } from '@/features/orders/useOrderQueries';
import { useAddOrderLine, useUpdateOrderLineQuantity, useRemoveOrderLine } from '@/features/orders/useOrderMutations';

const mockUseAuth = vi.mocked(useAuth);
const mockUseOrderQuery = vi.mocked(useOrderQuery);
const mockUsePickerOptionsQuery = vi.mocked(usePickerOptionsQuery);
const mockUseAddOrderLine = vi.mocked(useAddOrderLine);
const mockUseUpdateOrderLineQuantity = vi.mocked(useUpdateOrderLineQuantity);
const mockUseRemoveOrderLine = vi.mocked(useRemoveOrderLine);

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

function setupMutations(removeFn = vi.fn()) {
  mockUseAddOrderLine.mockReturnValue(makeIdleMutation() as unknown as ReturnType<typeof useAddOrderLine>);
  mockUseUpdateOrderLineQuantity.mockReturnValue(makeIdleMutation() as unknown as ReturnType<typeof useUpdateOrderLineQuantity>);
  mockUseRemoveOrderLine.mockReturnValue({
    ...makeIdleMutation(),
    mutate: removeFn,
  } as unknown as ReturnType<typeof useRemoveOrderLine>);
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

/** Render ComposeOrderPage inside a router with the :id param set to 'order-1' */
function renderComposeOrderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/:id" element={<ComposeOrderPage />} />
    </Routes>,
    { initialPath: '/order-1' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupNurseAuth();
  setupMutations();
  setupPickerQuery();
});

describe('ComposeOrderPage', () => {
  describe('(1) Mode A renders correctly with lines', () => {
    it('shows back link, "Nytt utkast", line, "Lägg till läkemedel", footer actions', () => {
      setupOrderQuery(MOCK_ORDER_UTKAST);

      renderComposeOrderPage();

      // Back link
      expect(screen.getByText('Tillbaka till beställningar')).toBeInTheDocument();

      // Heading
      expect(screen.getByRole('heading', { name: /nytt utkast/i })).toBeInTheDocument();

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

  describe('(7) Mode B placeholder when order.status === "skickad"', () => {
    it('renders "Beställningen är skickad" banner and hides sticky footer', () => {
      setupOrderQuery(MOCK_ORDER_SKICKAD);

      renderComposeOrderPage();

      // Mode B banner
      expect(screen.getByText(/beställningen är skickad till apotekare/i)).toBeInTheDocument();

      // Sticky footer should NOT render in Mode B (no "Skicka beställning" button)
      expect(screen.queryByRole('button', { name: /skicka beställning/i })).not.toBeInTheDocument();

      // Picker trigger button should NOT render in Mode B
      // (the inline desktop button is inside <Can> but Mode B returns before rendering it)
      expect(screen.queryByRole('button', { name: /lägg till läkemedel/i })).not.toBeInTheDocument();
    });
  });
});
