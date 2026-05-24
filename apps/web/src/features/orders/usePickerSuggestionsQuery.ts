import { useQuery } from '@tanstack/react-query';
import type { PickerSuggestionsResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 8 D-137 / D-138 / ORD-08 — Pre-search picker suggestions query hook.
 *
 * D-137: Cache reuse matters — the hide-on-keystroke gate means a user who
 *   clears the search within 30s gets an instant re-render from cache, no
 *   skeleton flash. staleTime: 30_000 (NOT Infinity) because suggestions can
 *   shift after add-line mutations (a med that was the 5th most-ordered may
 *   climb if the nurse adds it again).
 *
 * D-138: Dedicated cache key ['order-picker-suggestions', orderId] decoupled
 *   from the typeahead ['order-picker', q] key. Invalidated by
 *   useAddOrderLine.onSuccess for cache freshness after line additions.
 *
 * Pattern: mirrors useAtcCodesQuery.ts (Phase 8 Plan 01) — named const export
 *   (PICKER_SUGGESTIONS_QUERY_OPTIONS) so component tests can assert the cache
 *   policy contract without mounting a real QueryClient.
 */

/**
 * Named const for the D-137/D-138 cache policy.
 * Factory: takes orderId and returns the query options object.
 * Exported so PickerSuggestionsBlock.test.tsx can assert the contract directly.
 */
export function PICKER_SUGGESTIONS_QUERY_OPTIONS(orderId: string) {
  return {
    queryKey: ['order-picker-suggestions', orderId] as const,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: orderId.length > 0,
  };
}

/**
 * TanStack Query hook for the pre-search picker suggestions block (ORD-08).
 *
 * Fetches GET /api/orders/picker-suggestions?orderId={orderId} and returns
 * { mostOrdered: PickerSuggestion[], lowStock: PickerSuggestion[] }.
 * Server-side dedupe guarantees zero careUnitMedicationId overlap (D-135).
 *
 * @param orderId - The order id. Hook is no-op when empty string (defensive guard).
 */
export function usePickerSuggestionsQuery(orderId: string) {
  const options = PICKER_SUGGESTIONS_QUERY_OPTIONS(orderId);
  return useQuery<PickerSuggestionsResponse, ApiError>({
    queryKey: options.queryKey,
    queryFn: () =>
      fetchJson<PickerSuggestionsResponse>(
        `/api/orders/picker-suggestions?orderId=${encodeURIComponent(orderId)}`,
      ),
    staleTime: options.staleTime,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    enabled: options.enabled,
  });
}
