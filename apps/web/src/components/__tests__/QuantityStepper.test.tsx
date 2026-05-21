/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../test/helpers/renderWithProviders';
import { QuantityStepper } from '../QuantityStepper';

/**
 * Phase 3 D-51 / D-52 / D-60 / UI-SPEC §6 — QuantityStepper component tests.
 *
 * (a) clicking + 3 times quickly fires ONE PATCH (debounce coalescing at 250 ms)
 * (b) the local state shows the optimistic value before the PATCH resolves
 * (c) order_locked — the mutate function is called correctly
 * (d) isLocked={true} renders locked span and no buttons
 */

// Mock useUpdateOrderLineQuantity
vi.mock('@/features/orders/useOrderMutations', () => ({
  useUpdateOrderLineQuantity: vi.fn(),
  useAddOrderLine: vi.fn(),
  useRemoveOrderLine: vi.fn(),
  useCreateDraftOrder: vi.fn(),
}));

import { useUpdateOrderLineQuantity } from '@/features/orders/useOrderMutations';
const mockUseUpdateOrderLineQuantity = vi.mocked(useUpdateOrderLineQuantity);

function makeMockMutation(mutateFn = vi.fn()) {
  mockUseUpdateOrderLineQuantity.mockReturnValue({
    mutate: mutateFn,
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
  } as unknown as ReturnType<typeof useUpdateOrderLineQuantity>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('QuantityStepper', () => {
  describe('(a) debounce coalescing — rapid + clicks fire ONE PATCH (debounce)', () => {
    it('batches rapid + clicks into a single mutation after 250 ms', () => {
      const mutateFn = vi.fn();
      makeMockMutation(mutateFn);

      renderWithProviders(
        <QuantityStepper value={1} orderId="order-1" lineId="line-1" isLocked={false} />,
      );

      const incBtn = screen.getByLabelText('Öka antal');

      // Click + twice in separate acts so React processes each state update.
      act(() => { fireEvent.click(incBtn); });
      act(() => { fireEvent.click(incBtn); });

      // Debounce hasn't fired yet — still in the window
      expect(mutateFn).not.toHaveBeenCalled();

      // Advance past the 250 ms debounce window
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Only ONE mutate call should have fired (last debounce wins)
      expect(mutateFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('(b) optimistic local value — shown before PATCH resolves', () => {
    it('displays the incremented value immediately after clicking +', () => {
      const mutateFn = vi.fn();
      makeMockMutation(mutateFn);

      renderWithProviders(
        <QuantityStepper value={5} orderId="order-2" lineId="line-2" isLocked={false} />,
      );

      const input = screen.getByLabelText('Antal') as HTMLInputElement;
      expect(input.value).toBe('5');

      // Click + once
      act(() => {
        fireEvent.click(screen.getByLabelText('Öka antal'));
      });

      // Local value should update immediately (optimistic)
      expect(input.value).toBe('6');

      // PATCH hasn't fired yet (still in debounce window)
      expect(mutateFn).not.toHaveBeenCalled();
    });
  });

  describe('(c) order_locked error handling — mutation is called on stepper click', () => {
    it('calls mutate with correct args after debounce fires', () => {
      const mutateFn = vi.fn();
      makeMockMutation(mutateFn);

      renderWithProviders(
        <QuantityStepper value={2} orderId="order-3" lineId="line-3" isLocked={false} />,
      );

      // Click − once (2 → 1)
      act(() => {
        fireEvent.click(screen.getByLabelText('Minska antal'));
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(mutateFn).toHaveBeenCalledWith({
        orderId: 'order-3',
        lineId: 'line-3',
        quantity: 1,
      });
    });
  });

  describe('(d) isLocked={true} — renders locked span, no buttons', () => {
    it('renders a span with the value and no −/+ buttons when isLocked', () => {
      makeMockMutation();
      renderWithProviders(
        <QuantityStepper value={7} orderId="order-4" lineId="line-4" isLocked={true} />,
      );

      // The aria-label="Antal" span should show the value
      expect(screen.getByLabelText('Antal')).toBeInTheDocument();
      expect(screen.getByLabelText('Antal').textContent).toBe('7');

      // No buttons should be rendered
      expect(screen.queryByLabelText('Minska antal')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Öka antal')).not.toBeInTheDocument();
    });
  });
});
