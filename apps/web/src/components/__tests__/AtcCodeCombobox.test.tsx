/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AtcCodesResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../test/helpers/renderWithProviders';

/**
 * Phase 8 Plan 01 Task 2 — AtcCodeCombobox component tests.
 *
 * Six scenarios covering D-132 + D-133 + D-134:
 *
 *   Test 1 (render idle + click opens dropdown): value=''; assert placeholder
 *     text is visible; click trigger; assert ComboContent renders either loading
 *     text or the loaded code list.
 *   Test 2 (pick a list code): click N02BE01 row; assert onChange called with
 *     'N02BE01'; popover closes.
 *   Test 3 (free-text fallback appears for unknown query): type 'XYZ'; assert
 *     '(fri sökning)' text appears in the dropdown.
 *   Test 4 (free-text uppercased on select): type 'abc'; click the 'ABC (fri sökning)'
 *     row; assert onChange called with 'ABC'.
 *   Test 5 (clear button fires onChange('')): render with value='N02BE01'; click
 *     the clear × (aria-label="Rensa ATC-kod"); assert onChange('') called and
 *     popover did NOT open (stopPropagation worked).
 *   Test 6 (cache contract): assert ATC_CODES_QUERY_OPTIONS.staleTime === Infinity
 *     and refetchOnWindowFocus === false (D-133 contract assertion).
 *
 * Pattern: mirrors DashboardLowStockCard.test.tsx — mock the feature hook to
 * control query state; use renderWithProviders for QueryClient + MemoryRouter.
 */

vi.mock('@/features/medications/useAtcCodesQuery', async () => {
  // Preserve ATC_CODES_QUERY_OPTIONS (asserted in Test 6) while stubbing the hook.
  const actual = await vi.importActual<
    typeof import('@/features/medications/useAtcCodesQuery')
  >('@/features/medications/useAtcCodesQuery');
  return {
    ...actual,
    useAtcCodesQuery: vi.fn(),
  };
});

import {
  useAtcCodesQuery,
  ATC_CODES_QUERY_OPTIONS,
} from '@/features/medications/useAtcCodesQuery';
import { AtcCodeCombobox } from '../AtcCodeCombobox';

const mockUseAtcCodesQuery = vi.mocked(useAtcCodesQuery);

const TEST_CODES = ['A01AA01', 'N02BE01', 'R03AC02'];

function mockQueryLoaded(codes = TEST_CODES) {
  mockUseAtcCodesQuery.mockReturnValue({
    data: { codes },
    isLoading: false,
    isError: false,
  } as UseQueryResult<AtcCodesResponse, ApiError>);
}

function mockQueryLoading() {
  mockUseAtcCodesQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as UseQueryResult<AtcCodesResponse, ApiError>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AtcCodeCombobox', () => {
  it('Test 1 (render idle + click opens dropdown): placeholder visible; click trigger opens dropdown', async () => {
    mockQueryLoaded();

    const onChange = vi.fn();
    renderWithProviders(
      <AtcCodeCombobox value="" onChange={onChange} placeholder="ATC-kod ▾" />,
    );

    // Placeholder is visible when value is empty.
    expect(screen.getByText('ATC-kod ▾')).toBeInTheDocument();

    // Click the trigger to open the popover.
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    // The loaded codes should be visible.
    await waitFor(() => {
      expect(screen.getByText('N02BE01')).toBeInTheDocument();
    });
    expect(screen.getByText('A01AA01')).toBeInTheDocument();
    expect(screen.getByText('R03AC02')).toBeInTheDocument();
  });

  it('Test 1b (loading state): shows loading spinner text when codes are loading', async () => {
    mockQueryLoading();

    const onChange = vi.fn();
    renderWithProviders(
      <AtcCodeCombobox value="" onChange={onChange} />,
    );

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('Laddar ATC-koder…')).toBeInTheDocument();
    });
  });

  it('Test 2 (pick a list code): clicking a row calls onChange with the code', async () => {
    mockQueryLoaded();

    const onChange = vi.fn();
    renderWithProviders(
      <AtcCodeCombobox value="" onChange={onChange} />,
    );

    // Open the dropdown.
    await userEvent.click(screen.getByRole('combobox'));

    // Click the N02BE01 row.
    await waitFor(() => {
      expect(screen.getByText('N02BE01')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('N02BE01'));

    expect(onChange).toHaveBeenCalledWith('N02BE01');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Test 3 (free-text fallback appears for unknown query): typing XYZ shows (fri sökning)', async () => {
    mockQueryLoaded();

    const onChange = vi.fn();
    renderWithProviders(
      <AtcCodeCombobox value="" onChange={onChange} />,
    );

    // Open the dropdown.
    await userEvent.click(screen.getByRole('combobox'));

    // Type a value not in the codes list.
    const input = screen.getByPlaceholderText('Sök ATC-kod…');
    await userEvent.type(input, 'XYZ');

    // The (fri sökning) fallback row must appear.
    await waitFor(() => {
      expect(screen.getByText('(fri sökning)')).toBeInTheDocument();
    });
    // The uppercased typed value appears next to (fri sökning).
    expect(screen.getByText('XYZ')).toBeInTheDocument();
  });

  it('Test 4 (free-text uppercased on select): typing abc and selecting fires onChange with ABC', async () => {
    mockQueryLoaded();

    const onChange = vi.fn();
    renderWithProviders(
      <AtcCodeCombobox value="" onChange={onChange} />,
    );

    // Open the dropdown.
    await userEvent.click(screen.getByRole('combobox'));

    // Type a lowercase value not in the codes list.
    const input = screen.getByPlaceholderText('Sök ATC-kod…');
    await userEvent.type(input, 'abc');

    // Wait for the free-text row to appear.
    await waitFor(() => {
      expect(screen.getByText('(fri sökning)')).toBeInTheDocument();
    });

    // Click the free-text row (the uppercased value text).
    await userEvent.click(screen.getByText('ABC'));

    // onChange must be called with the uppercase version.
    expect(onChange).toHaveBeenCalledWith('ABC');
  });

  it('Test 5 (clear button fires onChange("")): clicking × calls onChange("") without opening popover', async () => {
    mockQueryLoaded();

    const onChange = vi.fn();
    renderWithProviders(
      <AtcCodeCombobox value="N02BE01" onChange={onChange} clearable />,
    );

    // The selected value should be visible in the trigger.
    expect(screen.getByText('N02BE01')).toBeInTheDocument();

    // Click the clear × button.
    const clearButton = screen.getByRole('button', { name: 'Rensa ATC-kod' });
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalledWith('');
    expect(onChange).toHaveBeenCalledTimes(1);

    // The popover should NOT have opened (the codes would be visible).
    expect(screen.queryByPlaceholderText('Sök ATC-kod…')).not.toBeInTheDocument();
  });

  it('Test 6 (cache contract): ATC_CODES_QUERY_OPTIONS exposes staleTime=Infinity and refetchOnWindowFocus=false', () => {
    // Assert the D-133 cache policy contract directly against the named export.
    // A refactor that drops staleTime or refetchOnWindowFocus must also remove
    // the named export, which this assertion catches.
    expect(ATC_CODES_QUERY_OPTIONS.staleTime).toBe(Infinity);
    expect(ATC_CODES_QUERY_OPTIONS.refetchOnWindowFocus).toBe(false);
    // queryKey shape is also part of the D-133 contract.
    expect(ATC_CODES_QUERY_OPTIONS.queryKey).toEqual(['atc-codes']);
  });
});
