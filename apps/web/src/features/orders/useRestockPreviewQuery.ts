import { useQuery } from '@tanstack/react-query';
import type { RestockPreviewResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Preview query for the "Beställ påfyllning" modal. Fetched on modal
 * open (caller passes `enabled`) so it always reflects fresh in-flight
 * quantities — the value of the warning chip depends on that.
 *
 * Cache key is its own bucket — does not share with `['dashboard',
 * 'low-stock']` because the dashboard banner has no permission gate and
 * does not carry in-flight order references.
 */
export function useRestockPreviewQuery(enabled: boolean) {
  return useQuery<RestockPreviewResponse, ApiError>({
    queryKey: ['orders', 'restock-preview'],
    queryFn: () =>
      fetchJson<RestockPreviewResponse>('/api/orders/restock-preview'),
    enabled,
    staleTime: 0,
  });
}
