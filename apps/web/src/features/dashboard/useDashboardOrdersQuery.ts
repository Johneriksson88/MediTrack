import { useQuery } from '@tanstack/react-query';
import type { DashboardOrdersResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 9 D-141 / D-142 / D-148 — dashboard orders query.
 *
 * Reads from the dedicated `GET /api/dashboard/orders` endpoint
 * (D-141, mirrors Phase 6 D-120) and owns the `['dashboard', 'orders']`
 * cache key. The key is intentionally separate from
 * `['orders', filters]` (the BestallningarPage list cache) so a count
 * update on the dashboard does not perturb a user's open list-page
 * filter state, and vice versa.
 *
 * The server returns a Zod discriminated union on `role` (D-142):
 *   - sjukskoterska → { egnaUtkast, recentHistory }
 *   - apotekare/admin → { skickad, bekraftad }
 * The FE narrows via `if (data.role === 'sjukskoterska')`.
 *
 * Three-layer auto-refresh (D-148, mirrors Phase 6 D-119):
 *   1. `refetchOnWindowFocus: true` — Alt-tabbing back to the dashboard
 *      after another tab/session mutated an order surfaces the change
 *      immediately. Directly answers the §6 "two nurses ordering
 *      simultaneously" question for this surface.
 *   2. `refetchInterval: 30_000` — background poll. Costs ~one GET per
 *      30 s when the tab is foreground; zero when backgrounded
 *      (TanStack pauses interval polling on hidden tabs by default).
 *   3. Sibling `invalidateQueries(['dashboard', 'orders'])` from the
 *      five order mutations:
 *        - useCreateDraftOrder  (new draft → Egna utkast bumps for nurse)
 *        - useSubmitOrder       (draft leaves Utkast → joins Skickad-att-bekräfta)
 *        - useConfirmOrder      (Skickad → Bekräftad — pharmacist sections shift)
 *        - useDeliverOrder      (Bekräftad leaves — pharmacist Bekräftad count drops)
 *        - useDiscardOrder      (draft disappears from Egna utkast)
 *      Lives in `useOrderMutations.ts` next to the existing
 *      `['dashboard', 'low-stock']` invalidation, not here — the query
 *      side only declares its own refresh policy.
 *
 * Pattern: line-for-line mirror of `useLowStockQuery` (see lines 35-58
 * of `useLowStockQuery.ts`). The endpoint takes no query params.
 */

/**
 * Query options exported as a named const so component tests can assert
 * the refresh-policy contract WITHOUT mounting a real QueryClient + the
 * hook. The DashboardOrdersCard test asserts these literals directly.
 *
 * The `as const` keeps the literal types narrow so the test asserts
 * the literal `true` / `30_000` / `['dashboard', 'orders']` rather than
 * `boolean` / `number` / `string[]`. A refactor that drops either flag
 * must also delete the named export, which the test catches.
 */
export const DASHBOARD_ORDERS_QUERY_OPTIONS = {
  queryKey: ['dashboard', 'orders'] as const,
  refetchOnWindowFocus: true as const,
  refetchInterval: 30_000 as const,
};

export function useDashboardOrdersQuery() {
  return useQuery<DashboardOrdersResponse, ApiError>({
    queryKey: DASHBOARD_ORDERS_QUERY_OPTIONS.queryKey,
    queryFn: () => fetchJson<DashboardOrdersResponse>('/api/dashboard/orders'),
    refetchOnWindowFocus: DASHBOARD_ORDERS_QUERY_OPTIONS.refetchOnWindowFocus,
    refetchInterval: DASHBOARD_ORDERS_QUERY_OPTIONS.refetchInterval,
  });
}
