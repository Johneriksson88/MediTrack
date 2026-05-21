import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  MedicationListItem,
  MedicationCreateRequest,
  MedicationUpdateRequest,
  MedicationListResponse,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 2 D-30 / D-31 / D-33 / D-37 / D-42 / UI-SPEC §Toast Feedback — medication mutation hooks.
 *
 * `useCreateMedication`: POST /api/medications. On success invalidates
 * ['medications'] and ['medication-search'] queries. On 409
 * (conflict_duplicate_medication) suppresses the toast — the Sheet handles
 * this inline ("Läkemedlet är redan inlagt på din vårdenhet."). All other
 * errors surface a toast.
 *
 * `useUpdateMedication` (D-42, pessimistic): Sheet saves. Awaits PATCH before
 * closing the Sheet. On success: toast 'Sparat' + invalidate. On error: toast
 * 'Kunde inte spara — försök igen.' + Sheet stays open.
 *
 * `useUpdateThresholdOptimistic` (D-42, optimistic): inline-edit threshold
 * only. Flips the cache immediately on mutate; rolls back on error. No success
 * toast (inline edit is silent per D-42 UI-SPEC §5).
 *
 * `useDeleteMedication` (D-33 / D-37 / CAT-07): DELETE /api/medications/:id.
 * Soft-delete only. On success invalidates both query keys + toast. On error
 * toast + dialog stays open for retry.
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

/**
 * Pessimistic Sheet save (D-42).
 *
 * The Sheet awaits this mutation before closing — no optimistic update.
 * On success: invalidate ['medications'] and ['medication-search'], toast 'Sparat'.
 * On error: toast 'Kunde inte spara — försök igen.'; Sheet stays open.
 */
export function useUpdateMedication() {
  const queryClient = useQueryClient();

  return useMutation<
    MedicationListItem,
    ApiError,
    { careUnitMedicationId: string; payload: MedicationUpdateRequest }
  >({
    mutationFn: ({ careUnitMedicationId, payload }) =>
      fetchJson<MedicationListItem>(`/api/medications/${careUnitMedicationId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
      toast.success('Sparat');
    },
    onError: () => {
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

/**
 * Optimistic inline-edit for threshold (D-42, scoped to threshold edits only).
 *
 * Mixed mutation strategy per D-42: this hook is optimistic (cache flips
 * immediately); the Sheet's useUpdateMedication is pessimistic (awaits PATCH).
 * The two surfaces are intentionally different — see UI-SPEC §5.
 *
 * onMutate: cancel in-flight refetches, snapshot all ['medications'] cache
 *   entries, then optimistically flip the target row's lowStockThreshold and
 *   recompute belowThresholdTotal locally.
 * onError: restore snapshot + toast.error.
 * onSettled: unconditionally invalidate ['medications'] so server-authoritative
 *   belowThresholdTotal replaces the locally-recomputed estimate.
 *
 * No success toast — inline edit is silent per D-42 UI-SPEC §5.
 *
 * Refs: D-41 (two edit surfaces), D-42 (mixed strategy), UI-SPEC §5.
 */
export function useUpdateThresholdOptimistic() {
  const queryClient = useQueryClient();

  return useMutation<
    MedicationListItem,
    ApiError,
    { careUnitMedicationId: string; lowStockThreshold: number },
    { snapshot: [readonly unknown[], unknown][] }
  >({
    mutationFn: ({ careUnitMedicationId, lowStockThreshold }) =>
      fetchJson<MedicationListItem>(`/api/medications/${careUnitMedicationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lowStockThreshold }),
      }),

    onMutate: async ({ careUnitMedicationId, lowStockThreshold }) => {
      // Cancel any in-flight refetches so they don't clobber our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['medications'] });

      // Snapshot all matching cache entries for rollback on error.
      const snapshot = queryClient.getQueriesData<MedicationListResponse>({
        queryKey: ['medications'],
      });

      // Apply optimistic update to all cached pages.
      queryClient.setQueriesData<MedicationListResponse>(
        { queryKey: ['medications'] },
        (old) => {
          if (!old) return old;
          const newRows = old.rows.map((row) =>
            row.careUnitMedicationId === careUnitMedicationId
              ? { ...row, lowStockThreshold }
              : row,
          );
          // Locally recompute belowThresholdTotal with the new threshold applied.
          const belowThresholdTotal = newRows.filter(
            (r) => r.currentStock < r.lowStockThreshold,
          ).length;
          return { ...old, rows: newRows, belowThresholdTotal };
        },
      );

      return { snapshot: snapshot as [readonly unknown[], unknown][] };
    },

    onError: (_err, _vars, ctx) => {
      // Rollback: restore all snapshotted cache entries.
      if (ctx?.snapshot) {
        for (const [key, val] of ctx.snapshot) {
          queryClient.setQueryData(key as Parameters<typeof queryClient.setQueryData>[0], val);
        }
      }
      toast.error('Kunde inte spara — försök igen.');
    },

    onSettled: () => {
      // Always invalidate so server-authoritative belowThresholdTotal replaces
      // the locally-recomputed estimate (regardless of success or error).
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
  });
}

/**
 * Soft-delete a CareUnitMedication (D-33 / D-37 / CAT-07).
 *
 * Calls DELETE /api/medications/:careUnitMedicationId.
 * On success:
 *   - Invalidates ['medications'] so the list re-fetches without the deleted row.
 *   - Invalidates ['medication-search'] so the typeahead surfaces the now-deletable
 *     Medication again (needed for the transparent re-add flow, D-30).
 *   - Toasts `Borttaget från {careUnitName}` (D-37 / UI-SPEC §7).
 *   - Calls the optional `onClose` callback so MedicationSheet can close itself from
 *     within the hook's onSuccess rather than racing the dialog close.
 * On error: toasts `Kunde inte ta bort — försök igen.`; dialog stays open for retry.
 *
 * The `medicationName` and `careUnitName` variables are caller-context (for the toast
 * template literal). The BE only needs the `careUnitMedicationId`.
 */
export function useDeleteMedication() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    {
      careUnitMedicationId: string;
      medicationName: string;
      careUnitName: string;
      onClose?: () => void;
    }
  >({
    mutationFn: ({ careUnitMedicationId }) =>
      fetchJson<void>(`/api/medications/${careUnitMedicationId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, { careUnitName, onClose }) => {
      // Invalidate list so the deleted row disappears.
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      // Invalidate search so the now-deletable Medication surfaces in typeahead (D-30).
      void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
      toast.success(`Borttaget från ${careUnitName}`);
      // Close the parent Sheet via the caller-supplied callback (single-source-of-truth).
      onClose?.();
    },
    onError: () => {
      toast.error('Kunde inte ta bort — försök igen.');
    },
  });
}
