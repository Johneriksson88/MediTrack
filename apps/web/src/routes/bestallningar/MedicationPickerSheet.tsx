import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LowStockBadge } from '@/components/LowStockBadge';
import { usePickerOptionsQuery } from '@/features/orders/useOrderQueries';
import { useAddOrderLine } from '@/features/orders/useOrderMutations';
import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * Phase 3 D-58 / D-59 / D-61 / UI-SPEC §9 — MedicationPickerSheet.
 *
 * Pick-only variant of Phase 2's MedicationSheet. Right-slide ≥md / bottom-sheet <md.
 * Autofocuses search input on open. Debounces typeahead at 150 ms (D-44 precedent).
 * Scoped to active CareUnitMedications of the caller's vårdenhet (D-59).
 *
 * Row layout (UI-SPEC §9 + D-61):
 *   Row 1: {name} (text-sm font-semibold)
 *   Row 2: {atcCode} · {form} · Lager: {currentStock} + <LowStockBadge> if low
 *   min-h-[56px] touch target per UI-SPEC §A11y
 *
 * On row click:
 *   1. Call onOpenChange(false) (optimistic Sheet close — instant feedback)
 *   2. Call useAddOrderLine.mutate({ orderId, careUnitMedicationId, quantity: 1 })
 *   3. On error: the mutation calls onOpenChange(true) via the re-open callback
 *      because the hook's onError fires toast + invalidates; the Sheet parent
 *      (ComposeOrderPage) owns the open state, so the error re-open is
 *      communicated via onError → the parent's setPickerOpen(true) call.
 *      NOTE: this component calls onOpenChange(false) first; the hook cannot
 *      re-open it. ComposeOrderPage should observe mutation error state to
 *      conditionally re-open — left as a "fail silently" UX for Phase 3
 *      (the error toast is the feedback). This comment documents the limitation.
 *
 * No "Skapa nytt" button (D-58 / D-70 — pick-only; create lives in Phase 2 flow).
 *
 * useIsDesktop from apps/web/src/lib/useIsDesktop.ts (extracted from MedicationSheet).
 */

// ---- Debounce hook (inline to avoid an extra shared file) ----

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ---- Component ----

interface MedicationPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
}

export function MedicationPickerSheet({
  open,
  onOpenChange,
  orderId,
}: MedicationPickerSheetProps) {
  const isDesktop = useIsDesktop();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 150);

  const pickerQuery = usePickerOptionsQuery(debouncedQ, debouncedQ.length > 0);
  const addLineMutation = useAddOrderLine();

  const results = pickerQuery.data?.results ?? [];

  // Reset search query when Sheet closes.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setQ('');
    onOpenChange(nextOpen);
  }

  function handleRowClick(careUnitMedicationId: string) {
    // Optimistic Sheet close — instant feedback per UI-SPEC §9.
    onOpenChange(false);
    setQ('');
    // Fire add-line mutation with default quantity 1 (D-58).
    addLineMutation.mutate({ orderId, careUnitMedicationId, quantity: 1 });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={
          isDesktop
            ? 'w-[480px] sm:max-w-xl overflow-y-auto flex flex-col'
            : 'max-h-[90dvh] rounded-t-2xl overflow-y-auto flex flex-col'
        }
      >
        <SheetHeader>
          <SheetTitle>Lägg till läkemedel</SheetTitle>
        </SheetHeader>

        {/* Search input */}
        <div className="px-4 pt-4">
          <Input
            placeholder="Sök läkemedel…"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Results list — scrollable inside the Sheet body */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading state */}
          {pickerQuery.isLoading && debouncedQ.length > 0 && (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Söker…
            </div>
          )}

          {/* Empty result */}
          {!pickerQuery.isLoading && debouncedQ.length > 0 && results.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              Inget läkemedel matchade.
            </div>
          )}

          {/* Results */}
          {results.map((row) => {
            const isLow = row.currentStock < row.lowStockThreshold;
            return (
              <button
                key={row.careUnitMedicationId}
                type="button"
                className="w-full text-left px-4 py-3 min-h-[56px] flex items-center justify-between gap-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors"
                onClick={() => handleRowClick(row.careUnitMedicationId)}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-semibold truncate">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.atcCode} · {row.form} · Lager: {row.currentStock}
                  </span>
                </div>
                {isLow && <LowStockBadge />}
              </button>
            );
          })}
        </div>

        {/* Footer with close button */}
        <SheetFooter className="border-t border-border p-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
