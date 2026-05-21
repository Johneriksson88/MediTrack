import type { OrderListItem } from '@meditrack/shared';
import { DraftCard } from './DraftCard';

/**
 * Phase 3 UI-SPEC §3 — Mobile card list (<md).
 *
 * Rendered at <md via `block md:hidden` on BestallningarPage.
 * Each draft gets one <DraftCard>. Passes onCardClick upward for navigation.
 *
 * Mirrors MedicationCardList.tsx exactly.
 */

interface DraftsCardListProps {
  items: OrderListItem[];
  onCardClick: (item: OrderListItem) => void;
  className?: string;
}

export function DraftsCardList({ items, onCardClick, className }: DraftsCardListProps) {
  return (
    <div className={`grid gap-3 ${className ?? ''}`}>
      {items.map((item) => (
        <DraftCard
          key={item.id}
          item={item}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
