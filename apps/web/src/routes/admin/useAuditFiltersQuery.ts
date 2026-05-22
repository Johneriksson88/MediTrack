import { useQuery } from '@tanstack/react-query';
import type { AuditFiltersResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 5 D-69 / D-103 / T-05-10 — combobox source query hook.
 *
 * GET /api/audit/filters returns `{users, entityTypes, actions}`.
 *
 * staleTime: 60_000 — pairs with the BE's 60-second module-scope memo
 * so even an admin spamming the page can't exceed ~1 DB hit / minute.
 * Mirrors `usePickerOptionsQuery`'s staleTime philosophy (30_000 there;
 * 60_000 here per CONTEXT.md domain).
 *
 * Query key: `['audit', 'filters']` (D-69 convention).
 */
export function useAuditFiltersQuery() {
  return useQuery<AuditFiltersResponse, ApiError>({
    queryKey: ['audit', 'filters'],
    queryFn: () => fetchJson<AuditFiltersResponse>('/api/audit/filters'),
    staleTime: 60_000,
  });
}
