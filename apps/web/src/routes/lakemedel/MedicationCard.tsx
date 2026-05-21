import type { MedicationListItem } from '@meditrack/shared';
import { LowStockBadge } from '@/components/LowStockBadge';
import { InlineEditThreshold } from '@/components/InlineEditThreshold';

/**
 * Phase 2 UI-SPEC §3 — Single medication card for the mobile card list (<md).
 *
 * Entire card is clickable, opening the Sheet (edit/view per role, Plan 03).
 * <LowStockBadge> appears top-right when currentStock < lowStockThreshold.
 * role="button" + tabIndex + aria-label for keyboard accessibility (UI-SPEC §A11y).
 */

interface MedicationCardProps {
  item: MedicationListItem;
  onCardClick: (item: MedicationListItem) => void;
}

export function MedicationCard({ item, onCardClick }: MedicationCardProps) {
  const isLow = item.currentStock < item.lowStockThreshold;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick(item);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Öppna ${item.name}`}
      onClick={() => onCardClick(item)}
      onKeyDown={handleKeyDown}
      className="bg-card border border-border rounded-lg p-4 shadow-sm cursor-pointer
                 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-primary focus-visible:ring-offset-1"
    >
      {/* Top row: name + optional low-stock badge */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-foreground">{item.name}</span>
        {isLow && <LowStockBadge />}
      </div>

      {/* Secondary info */}
      <p className="text-sm text-muted-foreground">
        ATC: {item.atcCode} · Form: {item.form}
      </p>
      <p className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
        Lager: {item.currentStock} · Tröskel:{' '}
        <span onClick={(e) => e.stopPropagation()}>
          <InlineEditThreshold
            careUnitMedicationId={item.careUnitMedicationId}
            medicationName={item.name}
            value={item.lowStockThreshold}
          />
        </span>
      </p>
      {item.strength && (
        <p className="text-sm text-muted-foreground">
          Styrka: {item.strength}
        </p>
      )}
    </div>
  );
}
