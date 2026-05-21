import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type {
  MedicationListQuery,
  MedicationListResponse,
  MedicationSearchResponse,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 2 D-44 / UI-SPEC §1 — paginated medication list query.
 *
 * Query key: ['medications', filters] — TanStack Query structurally compares
 * the filters object so any filter change triggers a fresh fetch.
 *
 * `placeholderData: keepPreviousData` delivers smooth pagination — the
 * table shows the previous page while the next page loads (Phase 2 nicety).
 *
 * Pattern: mirrors useAuth.ts (useQuery shape). Search and list have
 * DIFFERENT query keys because they hit different endpoints with different
 * scopes (search = global Medication; list = CareUnitMedication × Medication
 * scoped to careUnit).
 */
export function useMedicationsQuery(filters: MedicationListQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') {
      params.set(k, String(v));
    }
  }

  return useQuery<MedicationListResponse, ApiError>({
    queryKey: ['medications', filters],
    queryFn: () =>
      fetchJson<MedicationListResponse>(`/api/medications?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * Phase 2 D-45 / UI-SPEC §6a — medication search typeahead query.
 *
 * Query key: ['medication-search', q] — separate from list to avoid
 * invalidating the list on every keystroke in the Sheet's typeahead.
 *
 * `enabled` gate: caller passes `debouncedQ.length > 0` to avoid firing
 * on empty input (debounce: 150 ms per UI-SPEC §6a — hotter than main search).
 *
 * `retry: false` — typeahead should fail fast on error; the Sheet shows
 * 'Inget läkemedel matchade.' and lets the user try the 'Skapa nytt' path.
 */
export function useMedicationSearchQuery(q: string, enabled: boolean) {
  return useQuery<MedicationSearchResponse, ApiError>({
    queryKey: ['medication-search', q],
    queryFn: () =>
      fetchJson<MedicationSearchResponse>(
        `/api/medications/search?q=${encodeURIComponent(q)}&limit=20`,
      ),
    enabled,
    retry: false,
  });
}
