import { useQuery } from '@tanstack/react-query';
import type { AiStatusResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 6 D-107 / D-108 / D-69 — drives the FE conditional render of the
 * AI affordance ("Hämta AI-förslag" button in MedicationSheet).
 *
 * Mirrors `useAuth()` shape — `useQuery<AiStatusResponse>` against
 * `GET /api/ai/status`. All three roles can read the status so the FE
 * check is uniform across roles. The 5-minute staleTime reflects that
 * availability rarely flips at runtime (env.ANTHROPIC_API_KEY is set at
 * api container startup); the FE refetches on window focus + manual
 * invalidation otherwise.
 *
 * Query key `['ai', 'status']` per D-69 TanStack key conventions.
 * Distinct from `['ai', 'suggest']` (the mutation key — but mutations
 * use mutationKey not queryKey so collision is impossible).
 */
export function useAiAvailability() {
  return useQuery<AiStatusResponse, ApiError>({
    queryKey: ['ai', 'status'],
    queryFn: () => fetchJson<AiStatusResponse>('/api/ai/status'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
