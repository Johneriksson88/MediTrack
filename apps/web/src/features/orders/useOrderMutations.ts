import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  OrderResponse,
  OrderStatus,
} from '@meditrack/shared';
import { ORDER_STATUS_LABELS } from '@meditrack/shared';
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
 * Slice 4 adds:
 *   useSubmitOrder  — pessimistic; POST /api/orders/:id/submit; cache hydration + invalidate drafts list
 *   useDiscardOrder — pessimistic; DELETE /api/orders/:id; invalidate drafts list; navigate on success
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

// ---------------------------------------------------------------------------
// Slice 4 — Submit + Discard mutations (D-57, D-67, D-69, D-70)
// ---------------------------------------------------------------------------

/**
 * Submits a draft order (Utkast → Skickad).
 *
 * PESSIMISTIC (D-52): waits for server response before updating UI.
 * D-57: On success, hydrates ['order', orderId] cache with the full updated Order
 * (including status: 'skickad', submittedAt, submittedByUserId) + invalidates
 * ['orders', { status: 'utkast' }] so the draft disappears from the list.
 *
 * Toast policy (UI-SPEC §Toast Feedback):
 *   - Success: silent — the OrderStatusPill flip + SubmitConfirmationBanner is the feedback.
 *   - 409 order_locked: destructive toast + invalidate ['order', orderId] → Mode B re-render.
 *   - 422 validation_failed: 'Kunde inte spara — försök igen.' (rare — disabled predicate catches this).
 *   - Other error: 'Kunde inte spara — försök igen.'
 */
export function useSubmitOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, ApiError, { orderId: string }>({
    mutationFn: ({ orderId }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/submit`, {
        method: 'POST',
      }),
    onSuccess: (response, vars) => {
      // D-57: cache hydration — response is the full updated skickad Order.
      queryClient.setQueryData(['order', vars.orderId], response);
      // Invalidate drafts list so the just-submitted order disappears (D-57).
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'utkast' }] });
    },
    onError: (err, vars) => {
      // D-55: 409 order_locked carve-out.
      if (err.envelope.error.code === 'order_locked') {
        toast.error('Beställningen kan inte ändras efter att den skickats.');
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      // 422 validation_failed (belt-and-suspenders — the disabled predicate normally catches this).
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

/**
 * Confirms a Skickad order (Skickad → Bekräftad).
 *
 * PESSIMISTIC (D-52): waits for server response before updating UI.
 * D-57: On success, hydrates ['order', orderId] cache with the full updated Order
 * (including status: 'bekraftad', confirmedAt, confirmedBy) + invalidates both
 * ['orders', { status: 'skickad' }] (source tab loses a row) and
 * ['orders', { status: 'bekraftad' }] (destination gains one).
 *
 * Toast policy (UI-SPEC §Toast Feedback):
 *   - Success: toast.success('Bekräftad') (D-83)
 *   - 409 order_transition_invalid: localized toast via ORDER_STATUS_LABELS[details.from] +
 *     invalidate ['order', orderId] so page re-renders with current server state.
 *   - 404 not_found: 'Beställning hittades inte.' toast.
 *   - Other error: 'Kunde inte spara — försök igen.'
 */
export function useConfirmOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, ApiError, { orderId: string }>({
    mutationFn: ({ orderId }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/confirm`, {
        method: 'POST',
      }),
    onSuccess: (response, vars) => {
      // D-57: cache hydration — response is the full updated bekraftad Order.
      queryClient.setQueryData(['order', vars.orderId], response);
      // Invalidate both status lists (source tab loses, destination gains).
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'skickad' }] });
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'bekraftad' }] });
      toast.success('Bekräftad');
    },
    onError: (err, vars) => {
      // 409 order_transition_invalid — the order status has changed since load.
      if (err.envelope.error.code === 'order_transition_invalid') {
        const details = err.envelope.error.details as { from: OrderStatus };
        // ORDER_STATUS_LABELS values are nouns/participles ("Skickad",
        // "Bekräftad", "Levererad"); "Beställningen är redan {label}." reads
        // naturally in Swedish where "har redan {label}" did not.
        toast.error(
          `Beställningen är redan ${ORDER_STATUS_LABELS[details.from].toLowerCase()}.`,
        );
        // Invalidate so the page re-renders with the current server status.
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      // 404 not_found
      if (err.envelope.error.code === 'not_found') {
        toast.error('Beställning hittades inte.');
        return;
      }
      // Other errors
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

/**
 * Delivers a Bekräftad order (Bekräftad → Levererad).
 *
 * PESSIMISTIC (D-52): waits for server response before updating UI.
 * D-57: On success, hydrates ['order', orderId] cache with the full updated Order
 * (including status: 'levererad', deliveredAt, deliveredByUserId, deliveredBy) +
 * invalidates ['orders', { status: 'bekraftad' }] (source tab loses a row) and
 * ['orders', { status: 'levererad' }] (destination gains one).
 * Phase 6 NTF-01 hook: also invalidates ['medications'] so the /lakemedel page
 * refetches on every delivery without Phase 4 needing to know about it.
 * Phase 6 NTF-02 (D-119 / D-120): also invalidates ['dashboard', 'low-stock']
 * — the dashboard banner uses its own dedicated cache key per D-120 so it
 * can refresh independently of /lakemedel's filter state.
 *
 * Toast policy (UI-SPEC §Toast Feedback):
 *   - Success: toast.success('Levererad — lagret uppdaterat') (D-83)
 *   - 409 order_transition_invalid: localized toast via ORDER_STATUS_LABELS[details.from] +
 *     invalidate ['order', orderId] so page re-renders with current server state.
 *   - 422 validation_failed reason=medication_removed: named-medication toast + invalidate.
 *   - 404 not_found: 'Beställning hittades inte.' toast.
 *   - Other error: 'Kunde inte spara — försök igen.'
 */
export function useDeliverOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, ApiError, { orderId: string }>({
    mutationFn: ({ orderId }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/deliver`, {
        method: 'POST',
      }),
    onSuccess: (response, vars) => {
      // D-57: cache hydration — response is the full updated levererad Order.
      queryClient.setQueryData(['order', vars.orderId], response);
      // Invalidate both status lists (source tab loses, destination gains).
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'bekraftad' }] });
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'levererad' }] });
      // Phase 6 NTF-01 hook: broad invalidation so the /lakemedel list refetches.
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      // Phase 6 D-119 / NTF-02: dashboard banner uses its own dedicated cache key (D-120).
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });
      toast.success('Levererad — lagret uppdaterat');
    },
    onError: (err, vars) => {
      // 409 order_transition_invalid — the order status has changed since load.
      if (err.envelope.error.code === 'order_transition_invalid') {
        const details = err.envelope.error.details as { from: OrderStatus };
        // ORDER_STATUS_LABELS values are nouns/participles ("Skickad",
        // "Bekräftad", "Levererad"); "Beställningen är redan {label}." reads
        // naturally in Swedish where "har redan {label}" did not.
        toast.error(
          `Beställningen är redan ${ORDER_STATUS_LABELS[details.from].toLowerCase()}.`,
        );
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      // 422 validation_failed reason=medication_removed
      if (err.envelope.error.code === 'validation_failed') {
        const details = err.envelope.error.details as { reason: string; medicationName?: string };
        if (details.reason === 'medication_removed' && details.medicationName) {
          toast.error(
            `${details.medicationName} har tagits bort — återställ läkemedlet i registret innan leverans.`,
          );
          return;
        }
      }
      // 404 not_found
      if (err.envelope.error.code === 'not_found') {
        toast.error('Beställning hittades inte.');
        return;
      }
      // Other errors
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

/**
 * Soft-deletes a draft order (Kasta utkast, D-67).
 *
 * PESSIMISTIC (D-52): waits for the 204 response before navigating.
 * On success: invalidates ['orders', { status: 'utkast' }] so the list refreshes.
 * Navigation to /bestallningar is performed by the caller (ComposeOrderPage) after
 * awaiting mutateAsync — the hook is page-agnostic.
 *
 * Toast policy (UI-SPEC §Toast Feedback):
 *   - Success: silent — navigation back to /bestallningar is the feedback.
 *   - 409 order_locked: destructive toast + invalidate ['order', orderId] → Mode B re-render.
 *   - Other error: 'Kunde inte spara — försök igen.'
 */
export function useDiscardOrder() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { orderId: string }>({
    mutationFn: ({ orderId }) =>
      fetchJson<void>(`/api/orders/${orderId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, vars) => {
      // Invalidate drafts list so the discarded draft disappears.
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'utkast' }] });
      // Optionally remove the single-order cache entry.
      queryClient.removeQueries({ queryKey: ['order', vars.orderId] });
    },
    onError: (err, vars) => {
      // D-55: 409 order_locked carve-out — order was submitted by another tab/session.
      if (err.envelope.error.code === 'order_locked') {
        toast.error('Beställningen kan inte ändras efter att den skickats.');
        // Invalidate so the page re-renders into Mode B (the order is now skickad).
        void queryClient.invalidateQueries({ queryKey: ['order', vars.orderId] });
        return;
      }
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}
