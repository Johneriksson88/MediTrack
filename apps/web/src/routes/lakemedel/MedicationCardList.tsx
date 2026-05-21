import type { MedicationListItem } from '@meditrack/shared';
import { MedicationCard } from './MedicationCard';

/**
 * Phase 2 UI-SPEC §3 — Mobile card list (<md).
 *
 * Rendered at <md via `block md:hidden` on LakemedelPage. Each medication
 * gets one <MedicationCard>. Passes onCardClick upward for Sheet orchestration.
 */

interface MedicationCardListProps {
  items: MedicationListItem[];
  onCardClick: (item: MedicationListItem) => void;
  className?: string;
}

export function MedicationCardList({ items, onCardClick, className }: MedicationCardListProps) {
  return (
    <div className={`grid gap-3 ${className ?? ''}`}>
      {items.map((item) => (
        <MedicationCard
          key={item.careUnitMedicationId}
          item={item}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
