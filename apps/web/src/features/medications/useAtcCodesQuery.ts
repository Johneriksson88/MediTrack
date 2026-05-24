import { useQuery } from '@tanstack/react-query';
import type { AtcCodesResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 8 D-132 / D-133 / D-134 — Global ATC code list query hook.
 *
 * D-132: Reads from the dedicated GET /api/medications/atc-codes endpoint
 *   which returns the DISTINCT, sorted list of ATC codes from the global
 *   Medication catalog (~3,000 unique 7-char codes from the seeded NPL data).
 *   Used internally by AtcCodeCombobox (D-134).
 *
 * D-133: Cache policy — staleTime: Infinity + refetchOnWindowFocus: false +
 *   refetchOnMount: false because ATC codes are essentially static. New entries
 *   only appear when an admin user-creates a medication with a brand-new code,
 *   which is rare. Explicit invalidation via useCreateMedication.onSuccess in
 *   apps/web/src/features/medications/useMedicationMutations.ts ensures a
 *   freshly-created code is instantly available without a full reload.
 *
 * Pattern: mirrors useLowStockQuery.ts (Phase 6 D-119/D-120) — named const
 *   exported so component tests can assert the cache-policy contract WITHOUT
 *   mounting a real QueryClient (see DashboardLowStockCard.test.tsx Test 5
 *   for the precedent). A refactor that drops staleTime or refetchOnWindowFocus
 *   must also remove the named export, which the test catches.
 *
 * Consumer: apps/web/src/components/AtcCodeCombobox.tsx
 * Query key: ['atc-codes']
 */

/**
 * Named const for the D-133 cache policy.
 * Exported so AtcCodeCombobox.test.tsx can assert the contract directly.
 */
export const ATC_CODES_QUERY_OPTIONS = {
  queryKey: ['atc-codes'] as const,
  staleTime: Infinity,
  refetchOnWindowFocus: false as const,
  refetchOnMount: false as const,
} as const;

export function useAtcCodesQuery() {
  return useQuery<AtcCodesResponse, ApiError>({
    queryKey: ATC_CODES_QUERY_OPTIONS.queryKey,
    queryFn: () => fetchJson<AtcCodesResponse>('/api/medications/atc-codes'),
    staleTime: ATC_CODES_QUERY_OPTIONS.staleTime,
    refetchOnWindowFocus: ATC_CODES_QUERY_OPTIONS.refetchOnWindowFocus,
    refetchOnMount: ATC_CODES_QUERY_OPTIONS.refetchOnMount,
  });
}
