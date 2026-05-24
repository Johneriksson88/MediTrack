/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { LowStockListResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';

/**
 * Phase 6 Plan 01 Task 2 — DashboardLowStockCard component tests.
 *
 * Five scenarios across the four render states + the refresh-policy
 * contract:
 *
 *   Test 1 (empty state, total === 0): celebratory copy
 *     "Alla läkemedel är över tröskel." + CheckCircle2 in emerald-600.
 *   Test 2 (non-empty): every row's name + "current / threshold" text
 *     appears AND a LowStockBadge ("Lågt lager") renders per row.
 *   Test 3 (loading): three Skeleton elements render via animate-pulse
 *     and no row text appears.
 *   Test 4 (error): destructive Alert with the Swedish error copy
 *     inside a role="alert" element.
 *   Test 5 (query config, NTF-02 contract): LOW_STOCK_QUERY_OPTIONS
 *     exposes refetchOnWindowFocus=true and refetchInterval=30_000.
 *     This asserts the D-119 three-layer refresh contract without
 *     mounting a QueryClient — a refactor that drops either flag must
 *     also remove the named export, which the test catches.
 *
 * Pattern: mirrors `bestallningar/__tests__/BestallningarPage.test.tsx`
 * (vi.mock the feature hook + renderWithProviders).
 */

vi.mock('@/features/dashboard/useLowStockQuery', async () => {
  // Preserve LOW_STOCK_QUERY_OPTIONS (we assert against the real const
  // in Test 5) while stubbing the hook for Tests 1-4.
  const actual = await vi.importActual<
    typeof import('@/features/dashboard/useLowStockQuery')
  >('@/features/dashboard/useLowStockQuery');
  return {
    ...actual,
    useLowStockQuery: vi.fn(),
  };
});

import {
  useLowStockQuery,
  LOW_STOCK_QUERY_OPTIONS,
} from '@/features/dashboard/useLowStockQuery';
import { DashboardLowStockCard } from '../DashboardLowStockCard';

const mockUseLowStockQuery = vi.mocked(useLowStockQuery);

/** Helper: mock useLowStockQuery with a specific query-state shape. */
function mockQuery(state: Partial<UseQueryResult<LowStockListResponse, ApiError>>) {
  mockUseLowStockQuery.mockReturnValue(
    state as UseQueryResult<LowStockListResponse, ApiError>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardLowStockCard', () => {
  it('Test 1 (empty state): renders celebratory copy + emerald CheckCircle2 when total === 0', () => {
    mockQuery({
      data: { rows: [], total: 0 },
      isLoading: false,
      isError: false,
    });

    const { container } = renderWithProviders(<DashboardLowStockCard />);

    expect(
      screen.getByText('Alla läkemedel är över tröskel.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Alla läkemedel i din vårdenhet är över lagertröskeln.'),
    ).toBeInTheDocument();

    // CheckCircle2 has text-emerald-600 per the celebratory variant.
    const emeraldIcon = container.querySelector('[class*="text-emerald-600"]');
    expect(emeraldIcon).not.toBeNull();

    // role="status" so screen readers announce the empty state.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('Test 2 (non-empty): renders every row + LowStockBadge per row', () => {
    mockQuery({
      data: {
        rows: [
          {
            careUnitMedicationId: 'cum-1',
            medicationId: 'med-1',
            name: 'Amoxicillin',
            atcCode: 'J01CA04',
            form: 'Kapsel',
            strength: '500 mg',
            currentStock: 1,
            lowStockThreshold: 10,
            therapeuticClass: null,
          },
          {
            careUnitMedicationId: 'cum-2',
            medicationId: 'med-2',
            name: 'Paracetamol',
            atcCode: 'N02BE01',
            form: 'Tablett',
            strength: '500 mg',
            currentStock: 3,
            lowStockThreshold: 12,
            therapeuticClass: null,
          },
          {
            careUnitMedicationId: 'cum-3',
            medicationId: 'med-3',
            name: 'Ibuprofen',
            atcCode: 'M01AE01',
            form: 'Tablett',
            strength: null,
            currentStock: 5,
            lowStockThreshold: 8,
            therapeuticClass: null,
          },
        ],
        total: 3,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DashboardLowStockCard />);

    // Card heading + description
    expect(screen.getByText('Läkemedel under tröskel')).toBeInTheDocument();
    expect(screen.getByText('totalt 3 under tröskel')).toBeInTheDocument();

    // Each row's name appears
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.getByText('Ibuprofen')).toBeInTheDocument();

    // Each row's "current / threshold" subtext appears
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    expect(screen.getByText('3 / 12')).toBeInTheDocument();
    expect(screen.getByText('5 / 8')).toBeInTheDocument();

    // One LowStockBadge per row (the badge renders the literal 'Lågt lager').
    expect(screen.getAllByText('Lågt lager')).toHaveLength(3);

    // Container is role="list" with three role="listitem" children.
    const list = screen.getByRole('list', { name: 'Läkemedel under tröskel' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('Test 3 (loading): renders three Skeleton bars + no row text', () => {
    mockQuery({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = renderWithProviders(<DashboardLowStockCard />);

    // Skeleton uses animate-pulse class — count the matching elements.
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);

    // No row content (the rows array is empty during loading anyway).
    expect(screen.queryByText('Läkemedel under tröskel')).not.toBeInTheDocument();
    expect(screen.queryByText('Lågt lager')).not.toBeInTheDocument();
  });

  it('Test 4 (error): renders destructive Alert with the Swedish error copy', () => {
    mockQuery({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom') as unknown as ApiError,
    });

    renderWithProviders(<DashboardLowStockCard />);

    // Alert has role="alert" by default (shadcn alert primitive).
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'Kunde inte hämta lagernivåer — försök igen om en stund.',
    );
  });

  it('Test 5 (query config, NTF-02 contract): LOW_STOCK_QUERY_OPTIONS exposes refetchOnWindowFocus=true and refetchInterval=30_000', () => {
    expect(LOW_STOCK_QUERY_OPTIONS.refetchOnWindowFocus).toBe(true);
    expect(LOW_STOCK_QUERY_OPTIONS.refetchInterval).toBe(30_000);
    // queryKey shape is part of the contract too (D-69).
    expect(LOW_STOCK_QUERY_OPTIONS.queryKey).toEqual(['dashboard', 'low-stock']);
  });
});
