import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AiSuggestionRequest, AiSuggestionResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 6 D-19 / D-109 / D-110 — manual button trigger for AI
 * categorization suggestion.
 *
 * Mirrors `useDeliverOrder` (apps/web/src/features/orders/useOrderMutations.ts
 * lines 343-393): `useMutation<Response, ApiError, Request>` with an
 * `onError` switch on `err.envelope.error.code` per the Phase 1 D-19
 * canonical pattern.
 *
 * Toast routing:
 *   - 504 ai_timeout    → 'AI-förslaget tog för lång tid — försök igen.'
 *   - 503 ai_unavailable → 'AI-tjänsten är inte tillgänglig.'
 *   - other              → 'Kunde inte hämta förslag — försök igen.'
 *
 * NO onSuccess toast — the chip appearance IS the success signal
 * (UI-SPEC §6: "no toast on successful AI suggestion").
 *
 * MedicationSheet wires the chip via local `aiSuggestion` state set by
 * the caller's `mutateAsync().then(setAiSuggestion)`.
 */
export function useSuggestTherapeuticClass() {
  return useMutation<AiSuggestionResponse, ApiError, AiSuggestionRequest>({
    mutationFn: (body) =>
      fetchJson<AiSuggestionResponse>('/api/ai/suggest-therapeutic-class', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
    onError: (err) => {
      if (err.envelope.error.code === 'ai_timeout') {
        toast.error('AI-förslaget tog för lång tid — försök igen.');
        return;
      }
      if (err.envelope.error.code === 'ai_unavailable') {
        toast.error('AI-tjänsten är inte tillgänglig.');
        return;
      }
      toast.error('Kunde inte hämta förslag — försök igen.');
    },
    // onSuccess: silent — chip appearance is the success signal (UI-SPEC §6).
  });
}
