import { useQuery } from '@tanstack/react-query';
import type { LowStockListResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 6 D-69 / D-119 / D-120 / NTF-01 / NTF-02 — dashboard low-stock query.
 *
 * Reads from the dedicated `GET /api/dashboard/low-stock` endpoint
 * (D-120) and owns the `['dashboard', 'low-stock']` cache key (D-69).
 * The key is intentionally separate from `['medications', filters]`
 * so the dashboard's refresh model is independent of the /lakemedel
 * page's filter state — see D-120 for why we did not reuse the
 * medication list endpoint.
 *
 * Three-layer auto-refresh (D-119, NTF-02):
 *   1. `refetchOnWindowFocus: true` — Alt-tabbing back to the dashboard
 *      after another tab/session mutated stock catches the change
 *      immediately. Directly answers the §6 "two nurses ordering
 *      simultaneously" question for this surface.
 *   2. `refetchInterval: 30_000` — background poll. Costs ~one GET per
 *      30 s when the tab is foreground; zero when backgrounded
 *      (TanStack pauses interval polling on hidden tabs by default).
 *   3. Sibling `invalidateQueries(['dashboard', 'low-stock'])` from
 *      `useDeliverOrder` (delivery flips stock) and
 *      `useMedicationMutations` create/update/delete + threshold-edit
 *      (any stock or threshold change can flip the under-threshold
 *      predicate). Lives in those mutation files, not here — the
 *      query side only declares its own refresh policy.
 *
 * Pattern: mirrors `useMedicationsQuery` (lines 23-37 of
 * `useMedicationsQuery.ts`) but with no URLSearchParams since the
 * endpoint takes no query params.
 */

/**
 * Query options exported as a named const so component tests can assert
 * the refresh-policy contract WITHOUT mounting a real QueryClient + the
 * hook. Test 5 in DashboardLowStockCard.test.tsx reads from this
 * constant directly.
 *
 * Keeping the options here (as a `const` outside the hook body) means
 * `refetchOnWindowFocus` and `refetchInterval` are part of the module's
 * public surface — a refactor that drops them must also delete the
 * named export, which the test catches.
 */
export const LOW_STOCK_QUERY_OPTIONS = {
  queryKey: ['dashboard', 'low-stock'] as const,
  refetchOnWindowFocus: true as const,
  refetchInterval: 30_000 as const,
};

export function useLowStockQuery() {
  return useQuery<LowStockListResponse, ApiError>({
    queryKey: LOW_STOCK_QUERY_OPTIONS.queryKey,
    queryFn: () => fetchJson<LowStockListResponse>('/api/dashboard/low-stock'),
    refetchOnWindowFocus: LOW_STOCK_QUERY_OPTIONS.refetchOnWindowFocus,
    refetchInterval: LOW_STOCK_QUERY_OPTIONS.refetchInterval,
  });
}
