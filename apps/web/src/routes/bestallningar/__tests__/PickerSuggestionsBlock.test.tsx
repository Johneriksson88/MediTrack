/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PickerSuggestionsResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';

/**
 * Phase 8 Plan 03 Task 3 — PickerSuggestionsBlock component tests.
 *
 * Seven scenarios:
 *
 *   Test 1 (both sections populated): section headers + row names visible;
 *     Amoxicillin row carries LowStockBadge (below threshold).
 *   Test 2 (click fires onRowClick): clicking Paracetamol row calls onClick
 *     with the correct careUnitMedicationId.
 *   Test 3 (only mostOrdered): Mest beställda visible; Lågt lager absent.
 *   Test 4 (only lowStock): Lågt lager visible; Mest beställda absent.
 *   Test 5 (both empty — picker empty surface): "Sök på namn…" visible;
 *     neither section header renders.
 *   Test 6 (error state): "Kunde inte hämta förslag — sök i listan ovan." visible.
 *   Test 7 (cache contract): PICKER_SUGGESTIONS_QUERY_OPTIONS('O1') returns
 *     staleTime === 30_000 AND refetchOnWindowFocus === false.
 */

vi.mock('@/features/orders/usePickerSuggestionsQuery', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/orders/usePickerSuggestionsQuery')
  >('@/features/orders/usePickerSuggestionsQuery');
  return {
    ...actual,
    usePickerSuggestionsQuery: vi.fn(),
  };
});

import {
  usePickerSuggestionsQuery,
  PICKER_SUGGESTIONS_QUERY_OPTIONS,
} from '@/features/orders/usePickerSuggestionsQuery';
import { PickerSuggestionsBlock } from '../PickerSuggestionsBlock';

const mockUsePickerSuggestionsQuery = vi.mocked(usePickerSuggestionsQuery);

// Mock data fixtures
const paracetamolRow = {
  careUnitMedicationId: 'cum1',
  medicationId: 'm1',
  name: 'Paracetamol',
  atcCode: 'N02BE01',
  form: 'Tablett',
  strength: '500 mg',
  currentStock: 20,
  lowStockThreshold: 10,
} as const;

const amoxicillinRow = {
  careUnitMedicationId: 'cum2',
  medicationId: 'm2',
  name: 'Amoxicillin',
  atcCode: 'J01CA04',
  form: 'Kapsel',
  strength: '500 mg',
  currentStock: 2,          // below threshold (2 < 10)
  lowStockThreshold: 10,
} as const;

function mockQuery(state: Partial<UseQueryResult<PickerSuggestionsResponse, ApiError>>) {
  mockUsePickerSuggestionsQuery.mockReturnValue(
    state as UseQueryResult<PickerSuggestionsResponse, ApiError>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PickerSuggestionsBlock', () => {
  it('Test 1 (loaded — both sections populated): section headers + rows visible, LowStockBadge on below-threshold row', () => {
    mockQuery({
      data: {
        mostOrdered: [paracetamolRow],
        lowStock: [amoxicillinRow],
      },
      isLoading: false,
      isError: false,
    });

    const onClick = vi.fn();
    renderWithProviders(
      <PickerSuggestionsBlock orderId="O1" onRowClick={onClick} />,
    );

    // Section headers — 'Lågt lager' appears as a section header (text)
    expect(screen.getByText('Mest beställda')).toBeInTheDocument();
    expect(screen.getByText('Lågt lager')).toBeInTheDocument();

    // Row names
    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();

    // Amoxicillin is below threshold → LowStockBadge renders (icon-only, aria-label).
    expect(screen.getByRole('img', { name: 'Lågt lager' })).toBeInTheDocument();
  });

  it('Test 2 (click fires onRowClick): clicking a suggestion row calls onRowClick with its careUnitMedicationId', () => {
    mockQuery({
      data: {
        mostOrdered: [paracetamolRow],
        lowStock: [amoxicillinRow],
      },
      isLoading: false,
      isError: false,
    });

    const onClick = vi.fn();
    renderWithProviders(
      <PickerSuggestionsBlock orderId="O1" onRowClick={onClick} />,
    );

    // Find and click the Paracetamol button
    const paracetamolButton = screen.getByText('Paracetamol').closest('button');
    expect(paracetamolButton).not.toBeNull();
    fireEvent.click(paracetamolButton!);

    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith('cum1');
  });

  it('Test 3 (only mostOrdered): Mest beställda visible; Lågt lager section absent', () => {
    mockQuery({
      data: {
        mostOrdered: [paracetamolRow],
        lowStock: [],
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <PickerSuggestionsBlock orderId="O1" onRowClick={vi.fn()} />,
    );

    expect(screen.getByText('Mest beställda')).toBeInTheDocument();
    expect(screen.getByText('Paracetamol')).toBeInTheDocument();

    // Lågt lager section header must not render (UI-SPEC §3 "Empty section render rule")
    // Note: there is no badge since Paracetamol is above threshold, so "Lågt lager"
    // should not appear at all.
    expect(screen.queryByText('Lågt lager')).toBeNull();
  });

  it('Test 4 (only lowStock): Lågt lager visible; Mest beställda section absent', () => {
    mockQuery({
      data: {
        mostOrdered: [],
        lowStock: [amoxicillinRow],
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <PickerSuggestionsBlock orderId="O1" onRowClick={vi.fn()} />,
    );

    // The section header "Lågt lager" and possibly the badge both say "Lågt lager"
    // Using getAllByText since both the header and the badge may render
    const lagertexts = screen.getAllByText('Lågt lager');
    expect(lagertexts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();

    // Mest beställda section header must not render
    expect(screen.queryByText('Mest beställda')).toBeNull();
  });

  it('Test 5 (both empty — picker empty surface): fallback message visible, no section headers', () => {
    mockQuery({
      data: {
        mostOrdered: [],
        lowStock: [],
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <PickerSuggestionsBlock orderId="O1" onRowClick={vi.fn()} />,
    );

    // UI-SPEC §4 — Picker Empty Surface
    expect(
      screen.getByText('Sök på namn för att lägga till ett läkemedel.'),
    ).toBeInTheDocument();

    // Neither section header should render
    expect(screen.queryByText('Mest beställda')).toBeNull();
    expect(screen.queryByText('Lågt lager')).toBeNull();
  });

  it('Test 6 (error state): inline error message visible', () => {
    mockQuery({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithProviders(
      <PickerSuggestionsBlock orderId="O1" onRowClick={vi.fn()} />,
    );

    expect(
      screen.getByText('Kunde inte hämta förslag — sök i listan ovan.'),
    ).toBeInTheDocument();
  });

  it('Test 7 (cache contract): PICKER_SUGGESTIONS_QUERY_OPTIONS returns correct staleTime and refetchOnWindowFocus', () => {
    const options = PICKER_SUGGESTIONS_QUERY_OPTIONS('O1');
    expect(options.staleTime).toBe(30_000);
    expect(options.refetchOnWindowFocus).toBe(false);
  });
});
