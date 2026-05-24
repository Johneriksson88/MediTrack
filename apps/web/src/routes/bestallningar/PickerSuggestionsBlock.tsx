import type { PickerSuggestion } from '@meditrack/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { LowStockBadge } from '@/components/LowStockBadge';
import { usePickerSuggestionsQuery } from '@/features/orders/usePickerSuggestionsQuery';

/**
 * Phase 8 D-135 / D-137 / ORD-08 — Pre-search suggestions surface.
 *
 * Rendered by MedicationPickerSheet when `debouncedQ === ''` (the hide-on-
 * keystroke gate lives in the parent — this component is always mounted when
 * the search input is empty, and always unmounted on first keystroke, per D-137).
 *
 * Two sticky-header sections: "Mest beställda" (top-5 all-time most-ordered
 * CareUnitMedications) and "Lågt lager" (top-5 below-threshold rows from
 * `listLowStockForUnit`). Service-layer dedupe guarantees no careUnitMedicationId
 * appears in both arrays (D-135). The parent passes `onRowClick` which matches
 * the existing `handleRowClick` behavior — identical to typeahead row clicks.
 *
 * UI-SPEC §3 locked shapes (sticky headers, SuggestionRow layout, token-class
 * colors only — no hex literals per UI-SPEC §Token-Class Hard Rule).
 */

// ---------------------------------------------------------------------------
// SuggestionRow — verbatim copy of MedicationPickerSheet's row markup
// (UI-SPEC §3 SuggestionRow note: "Verbatim copy of MedicationPickerSheet's
// row markup lines 144-158. Same className, same content, same touch target.")
// ---------------------------------------------------------------------------

function SuggestionRow({
  row,
  onClick,
}: {
  row: PickerSuggestion;
  onClick: (id: string) => void;
}) {
  const isLow = row.currentStock < row.lowStockThreshold;
  return (
    <button
      type="button"
      className="w-full text-left px-4 py-3 min-h-[56px] flex items-center justify-between gap-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors border-b border-border last:border-0"
      onClick={() => onClick(row.careUnitMedicationId)}
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
}

// ---------------------------------------------------------------------------
// PickerSuggestionsBlock — the exported pre-search surface
// ---------------------------------------------------------------------------

interface PickerSuggestionsBlockProps {
  orderId: string;
  /** Click handler matching the existing row-click behavior (reuses handleRowClick). */
  onRowClick: (careUnitMedicationId: string) => void;
}

export function PickerSuggestionsBlock({ orderId, onRowClick }: PickerSuggestionsBlockProps) {
  const { data, isLoading, isError } = usePickerSuggestionsQuery(orderId);

  // Loading state: two skeleton groups (section header + 3 row skeletons each)
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <Skeleton className="h-7 w-32 mx-4 my-2" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-7 w-32 mx-4 my-2" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  // Error state: inline Alert (persistent context, not a toast)
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Kunde inte hämta förslag — sök i listan ovan.
        </AlertDescription>
      </Alert>
    );
  }

  // Loaded state
  const { mostOrdered, lowStock } = data ?? { mostOrdered: [], lowStock: [] };

  // Both arrays empty (picker empty surface — UI-SPEC §4)
  if (mostOrdered.length === 0 && lowStock.length === 0) {
    return (
      <div className="p-8 text-sm text-muted-foreground text-center">
        Sök på namn för att lägga till ett läkemedel.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Mest beställda section — only rendered when mostOrdered has rows */}
      {mostOrdered.length > 0 && (
        <>
          <div
            className="sticky top-0 z-10 bg-popover px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border"
            role="presentation"
          >
            Mest beställda
          </div>
          {mostOrdered.map((row) => (
            <SuggestionRow key={row.careUnitMedicationId} row={row} onClick={onRowClick} />
          ))}
        </>
      )}

      {/* Lågt lager section — only rendered when lowStock has rows */}
      {lowStock.length > 0 && (
        <>
          <div
            className="sticky top-0 z-10 bg-popover px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border"
            role="presentation"
          >
            Lågt lager
          </div>
          {lowStock.map((row) => (
            <SuggestionRow key={row.careUnitMedicationId} row={row} onClick={onRowClick} />
          ))}
        </>
      )}
    </div>
  );
}
