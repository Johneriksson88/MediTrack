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
 * Slice 3 adds:
 *   useAddOrderLine      — pessimistic (server response before re-render; D-57 cache hydration)
 *   useUpdateOrderLineQuantity — optimistic (250ms debounce, rollback on error; D-52)
 *   useRemoveOrderLine   — pessimistic (D-57 cache hydration)
 *
 * Slice 4 will add:
 *   useSubmitOrder, useDiscardOrder
 *
 * Pattern mirrors useMedicationMutations.ts (pessimistic/optimistic mutations).
 * 409 order_locked carve-out pattern mirrors conflict_duplicate_medication carve-out.
 *
 * D-55: Every 409 order_locked triggers a destructive toast
 *   'Beställningen kan inte ändras efter att den skickats.'
 *   + invalidates ['order', orderId] so the page re-renders into Mode B.
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

// ---------------------------------------------------------------------------
// Slice 3 — line CRUD mutations (D-52, D-57, D-69)
// ---------------------------------------------------------------------------

/**
 * Adds a medication line to the specified draft order.
 *
 * PESSIMISTIC (D-52): re-renders from server response before updating the UI.
 * D-57: On success, hydrates ['order', orderId] cache with the full response
 * (one round-trip, no follow-up GET).
 *
 * Toast policy (UI-SPEC §Toast Feedback):
 *   - Success: silent (line appearing in the list is the feedback)
 *   - 409 order_locked: destructive toast + invalidate ['order', orderId]
 *   - Other error: 'Kunde inte spara — försök igen.'
 */
export function useAddOrderLine() {
  const queryClient = useQueryClient();

  return useMutation<
    OrderResponse,
    ApiError,
    { orderId: string; careUnitMedicationId: string; quantity: number }
  >({
    mutationFn: ({ orderId, careUnitMedicationId, quantity }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/lines`, {
        method: 'POST',
        body: JSON.stringify({ careUnitMedicationId, quantity }),
      }),
    onSuccess: (response, vars) => {
      // D-57: cache hydration — response is the full updated Order.
      queryClient.setQueryData(['order', vars.orderId], response);
    },
    onError: (err, vars) => {
      // D-55: 409 order_locked — destructive toast + refetch so page enters Mode B.
      if (err.envelope.error.code === 'order_locked') {
        toast.error('Beställningen kan inte ändras efter att den skickats.');
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

/**
 * Updates the quantity of an existing order line.
 *
 * OPTIMISTIC (D-52 / D-60): flips the cache immediately on mutate.
 * Rolls back on error (snapshot/restore pattern from useUpdateThresholdOptimistic).
 * Debounce of 250 ms is handled by the calling QuantityStepper component (D-51).
 *
 * onMutate: cancel queries for ['order', orderId], snapshot, optimistically
 *   set lines[*].quantity where id === lineId.
 * onError: rollback snapshot + 409 carve-out + toast.
 * onSettled: invalidate ['order', orderId] so server-authoritative value replaces
 *   the local estimate (mirrors useUpdateThresholdOptimistic's onSettled).
 */
export function useUpdateOrderLineQuantity() {
  const queryClient = useQueryClient();

  return useMutation<
    OrderResponse,
    ApiError,
    { orderId: string; lineId: string; quantity: number },
    { snapshot: [readonly unknown[], unknown][] }
  >({
    mutationFn: ({ orderId, lineId, quantity }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      }),

    onMutate: async ({ orderId, lineId, quantity }) => {
      // Cancel any in-flight refetches so they don't clobber our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['order', orderId] });

      // Snapshot all matching cache entries for rollback on error.
      const snapshot = queryClient.getQueriesData<OrderResponse>({
        queryKey: ['order', orderId],
      });

      // Apply optimistic update: mutate lines[*].quantity in the cached OrderResponse.
      queryClient.setQueriesData<OrderResponse>(
        { queryKey: ['order', orderId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            lines: old.lines.map((l) =>
              l.id === lineId ? { ...l, quantity } : l,
            ),
          };
        },
      );

      return { snapshot: snapshot as [readonly unknown[], unknown][] };
    },

    onError: (err, vars, ctx) => {
      // Rollback: restore all snapshotted cache entries.
      if (ctx?.snapshot) {
        for (const [key, val] of ctx.snapshot) {
          queryClient.setQueryData(key as Parameters<typeof queryClient.setQueryData>[0], val);
        }
      }
      // D-55: 409 order_locked carve-out.
      if (err.envelope.error.code === 'order_locked') {
        toast.error('Beställningen kan inte ändras efter att den skickats.');
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      toast.error('Kunde inte spara — försök igen.');
    },

    onSettled: (_data, _err, vars) => {
      // Always invalidate so server-authoritative value replaces the local estimate.
      void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
    },
  });
}

/**
 * Removes a line from a draft order.
 *
 * PESSIMISTIC (D-52): re-renders from server response.
 * D-57: On success, hydrates ['order', orderId] cache + toasts 'Sparat' (D-70).
 * D-55: 409 order_locked carve-out.
 */
export function useRemoveOrderLine() {
  const queryClient = useQueryClient();

  return useMutation<
    OrderResponse,
    ApiError,
    { orderId: string; lineId: string }
  >({
    mutationFn: ({ orderId, lineId }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/lines/${lineId}`, {
        method: 'DELETE',
      }),
    onSuccess: (response, vars) => {
      // D-57: cache hydration.
      queryClient.setQueryData(['order', vars.orderId], response);
      toast.success('Sparat');
    },
    onError: (err, vars) => {
      // D-55: 409 order_locked carve-out.
      if (err.envelope.error.code === 'order_locked') {
        toast.error('Beställningen kan inte ändras efter att den skickats.');
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}
