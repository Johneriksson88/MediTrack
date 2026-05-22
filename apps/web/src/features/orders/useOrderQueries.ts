import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type {
  OrderListResponse,
  OrderResponse,
  OrderStatus,
  PickerOptionsResponse,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 3 D-69 — Order query hooks.
 *
 * Query keys per D-69:
 *   ['orders', { status: 'utkast' }] — drafts list
 *   ['order', id]                    — single-order detail
 *   ['order-picker', q]              — typeahead picker options
 *
 * Pattern mirrors useMedicationsQuery.ts exactly.
 */

/**
 * Fetches the drafts list for the current user's careUnit.
 *
 * D-53: GET /api/orders?status=utkast — sorted createdAt DESC.
 * D-72: Each row includes lineCount, totalQuantity, createdBy.name.
 *
 * placeholderData: keepPreviousData delivers smooth transitions when
 * navigating back from ComposeOrderPage.
 */
export function useDraftsQuery() {
  return useQuery<OrderListResponse, ApiError>({
    queryKey: ['orders', { status: 'utkast' }],
    queryFn: () => fetchJson<OrderListResponse>('/api/orders?status=utkast'),
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetches orders for the current user's careUnit by status.
 *
 * Phase 4 ORD-07 — status-tab history surface.
 *
 * Accepts:
 *   - single OrderStatus (e.g. 'skickad')
 *   - OrderStatus[] (e.g. ['skickad', 'bekraftad'])
 *   - 'alla' literal (server-side pre-parser expands to all four statuses)
 *
 * Query key uses the joined comma-string so array queries cache distinctly
 * from single-status queries. The 'alla' literal is sent verbatim to the API.
 *
 * placeholderData: keepPreviousData delivers smooth transitions when switching
 * tabs — the previous tab's rows remain visible during the fetch.
 */
export function useOrdersByStatusQuery(status: OrderStatus | OrderStatus[] | 'alla') {
  const statusKey = Array.isArray(status) ? status.join(',') : status;
  return useQuery<OrderListResponse, ApiError>({
    queryKey: ['orders', { status: statusKey }],
    queryFn: () =>
      fetchJson<OrderListResponse>(`/api/orders?status=${encodeURIComponent(statusKey)}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetches a single Order with embedded lines (GET /api/orders/:id).
 *
 * D-47: Lines include denormalized medication fields joined at read time.
 * D-69: Query key ['order', id].
 *
 * enabled: !!id — don't fire until we have an id.
 * retry: false — 404s (including cross-careUnit 404s, D-73) surface immediately
 * instead of retrying. ComposeOrderPage uses this to redirect on stale URLs.
 *
 * NOTE: Slice 3 wires this fully in ComposeOrderPage. Exported here so the
 * placeholder ComposeOrderPage stub can import it without breaking the build.
 */
export function useOrderQuery(id: string | undefined) {
  return useQuery<OrderResponse, ApiError>({
    queryKey: ['order', id],
    queryFn: () => fetchJson<OrderResponse>(`/api/orders/${id}`),
    enabled: !!id,
    retry: false,
  });
}

/**
 * Typeahead query for MedicationPickerSheet (D-58, D-59).
 *
 * GET /api/orders/picker-options?q=…&limit=20
 * Returns up to 20 CareUnitMedication rows matching q within the caller's
 * careUnit. Each row includes currentStock + lowStockThreshold for LowStockBadge.
 *
 * WR-07: q is trimmed before keying the cache + firing the fetch, mirroring
 * the server-side z.string().trim().min(1). enabled becomes effectively
 * (trimmed.length > 0 && enabled) so a whitespace-only input doesn't burn
 * a request. staleTime: 30_000 means revisits within 30 s reuse the cached
 * result instead of re-fetching (typeahead is heavy on the careUnit's CUM
 * index — repeated keystrokes with the same prefix were hitting Postgres
 * every time the Sheet reopened).
 *
 * retry: false — picker should fail fast on error.
 */
export function usePickerOptionsQuery(q: string, enabled: boolean) {
  const trimmed = q.trim();
  return useQuery<PickerOptionsResponse, ApiError>({
    queryKey: ['order-picker', trimmed],
    queryFn: () =>
      fetchJson<PickerOptionsResponse>(
        `/api/orders/picker-options?q=${encodeURIComponent(trimmed)}&limit=20`,
      ),
    enabled: enabled && trimmed.length > 0,
    retry: false,
    staleTime: 30_000,
  });
}
