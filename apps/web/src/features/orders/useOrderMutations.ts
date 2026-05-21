import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  OrderResponse,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 3 D-52 / D-57 / D-69 / UI-SPEC §Toast Feedback — Order mutation hooks.
 *
 * Slice 2 ships:
 *   useCreateDraftOrder — POST empty draft + navigate (pessimistic)
 *
 * Slices 3-4 will add:
 *   // TODO Slice 3: useAddOrderLine (pessimistic — server response before re-render)
 *   // TODO Slice 3: useUpdateOrderLineQuantity (optimistic — 250ms debounce, rollback on error)
 *   // TODO Slice 3: useRemoveOrderLine (pessimistic)
 *   // TODO Slice 4: useSubmitOrder (pessimistic — invalidates ['orders', { status: 'utkast' }])
 *   // TODO Slice 4: useDiscardOrder (pessimistic — soft-delete + navigate back to list)
 *
 * Pattern mirrors useMedicationMutations.ts (pessimistic mutations).
 * 409 order_locked carve-out pattern mirrors conflict_duplicate_medication carve-out.
 */

/**
 * Creates an empty Utkast Order for the current user's careUnit.
 *
 * D-50: POST-empty-on-compose-open pattern. The caller navigates to
 * /bestallningar/${response.id} on success.
 *
 * onSuccess: invalidates ['orders', { status: 'utkast' }] so the drafts
 * list refreshes to show the new empty draft when the user navigates back.
 *
 * onError: toasts 'Kunde inte spara — försök igen.' (D-70 copy).
 *
 * Returns the full OrderResponse so the caller can extract the id for navigation.
 */
export function useCreateDraftOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, ApiError, void>({
    mutationFn: () =>
      fetchJson<OrderResponse>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'utkast' }] });
    },
    onError: () => {
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}
