import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  MedicationListItem,
  MedicationCreateRequest,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 2 D-30 / D-31 / UI-SPEC §Toast Feedback — medication mutation hooks.
 *
 * `useCreateMedication`: POST /api/medications. On success invalidates
 * ['medications'] and ['medication-search'] queries. On 409
 * (conflict_duplicate_medication) suppresses the toast — the Sheet handles
 * this inline ("Läkemedlet är redan inlagt på din vårdenhet."). All other
 * errors surface a toast.
 *
 * `useUpdateMedication` and `useDeleteMedication` are implemented in Plans 03
 * and 04 respectively. They are NOT exported here — no stub exports that
 * would break compilation.
 *
 * Pattern: mirrors useLogin.ts (useMutation shape with onSuccess invalidation).
 */

export function useCreateMedication() {
  const queryClient = useQueryClient();

  return useMutation<MedicationListItem, ApiError, MedicationCreateRequest>({
    mutationFn: (body) =>
      fetchJson<MedicationListItem>('/api/medications', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
      toast.success('Sparat');
    },
    onError: (err) => {
      // 409 conflict_duplicate_medication — Sheet handles inline; no toast.
      if (err.envelope.error.code === 'conflict_duplicate_medication') return;
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

// TODO: Implemented in Plan 03 (update)
// export function useUpdateMedication() { ... }

// TODO: Implemented in Plan 04 (delete)
// export function useDeleteMedication() { ... }
