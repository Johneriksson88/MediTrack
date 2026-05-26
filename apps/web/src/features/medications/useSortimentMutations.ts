import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  BulkAddCandidatesQuery,
  BulkAddCandidatesResponse,
  BulkAddMedicationsRequest,
  BulkAddMedicationsResponse,
  BulkRemoveMedicationsRequest,
  BulkRemoveMedicationsResponse,
  BulkRemovePreviewRequest,
  BulkRemovePreviewResponse,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Sortiment — query + mutation hooks for the bulk catalog management page.
 *
 * `useBulkAddCandidatesQuery`: paginated /bulk-add-candidates. Same shape
 *   as useMedicationsQuery — passes filters as URL params, keepPreviousData
 *   for smooth pagination during filter changes.
 *
 * `useBulkAddMedications`: POST /api/medications/bulk. On success invalidates
 *   ['medications'] (Läkemedel list now includes the new rows), the bulk-add
 *   candidates query (the added rows must drop from "Lägg till" view), the
 *   atc-codes cache (user-source meds — unlikely via this path but cheap),
 *   and the dashboard low-stock query (a freshly-added row with threshold > 0
 *   and stock 0 is under-threshold).
 *
 * `useBulkRemoveMedications`: DELETE /api/medications/bulk. Same invalidations
 *   as useBulkAddMedications since the same cache surfaces are affected.
 *
 * `useBulkRemovePreview`: POST /api/medications/bulk-remove-preview as a
 *   mutation (not a query) — the request body changes with every selection,
 *   and we only want to fire it on confirm-dialog open, not as a live query.
 */

export function useBulkAddCandidatesQuery(filters: BulkAddCandidatesQuery, enabled = true) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return useQuery<BulkAddCandidatesResponse, ApiError>({
    queryKey: ['sortiment', 'bulk-add-candidates', filters],
    queryFn: () =>
      fetchJson<BulkAddCandidatesResponse>(
        `/api/medications/bulk-add-candidates?${params.toString()}`,
      ),
    enabled,
  });
}

export function useBulkAddMedications() {
  const queryClient = useQueryClient();

  return useMutation<BulkAddMedicationsResponse, ApiError, BulkAddMedicationsRequest>({
    mutationFn: (body) =>
      fetchJson<BulkAddMedicationsResponse>('/api/medications/bulk', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['sortiment'] });
      void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });
      const total = data.added + data.restored;
      if (total === 0 && data.skipped > 0) {
        toast.info(`${data.skipped} läkemedel fanns redan i sortimentet.`);
      } else if (data.restored > 0 && data.added > 0) {
        toast.success(
          `${data.added} läkemedel tillagda, ${data.restored} återställda.`,
        );
      } else if (data.restored > 0) {
        toast.success(`${data.restored} läkemedel återställda.`);
      } else {
        toast.success(`${data.added} läkemedel tillagda i sortimentet.`);
      }
    },
    onError: () => {
      toast.error('Kunde inte lägga till — försök igen.');
    },
  });
}

export function useBulkRemoveMedications() {
  const queryClient = useQueryClient();

  return useMutation<BulkRemoveMedicationsResponse, ApiError, BulkRemoveMedicationsRequest>({
    mutationFn: (body) =>
      fetchJson<BulkRemoveMedicationsResponse>('/api/medications/bulk', {
        method: 'DELETE',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['sortiment'] });
      void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });
      toast.success(`${data.deleted} läkemedel borttagna från sortimentet.`);
    },
    onError: () => {
      toast.error('Kunde inte ta bort — försök igen.');
    },
  });
}

export function useBulkRemovePreview() {
  return useMutation<BulkRemovePreviewResponse, ApiError, BulkRemovePreviewRequest>({
    mutationFn: (body) =>
      fetchJson<BulkRemovePreviewResponse>('/api/medications/bulk-remove-preview', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
