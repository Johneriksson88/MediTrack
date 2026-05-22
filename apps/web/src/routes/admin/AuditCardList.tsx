import type { AuditEventResponse } from '@meditrack/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuditEventCard } from './AuditEventCard';
import { cn } from '@/lib/utils';

/**
 * Phase 5 UI-SPEC §4 / D-102 — Mobile audit card list (<md).
 *
 * Renders one <AuditEventCard> per event. Each card owns its own
 * expand-on-tap affordance via the page's expandedIds set (mirrors
 * AuditTable's pattern so md+ ↔ <md transitions preserve the open state
 * even if a user resizes the viewport).
 *
 * A single TooltipProvider wraps the list — the cards inside use
 * <Tooltip> for the relative-time ISO timestamp.
 */
export interface AuditCardListProps {
  events: AuditEventResponse[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  className?: string;
}

export function AuditCardList({
  events,
  expandedIds,
  onToggleExpand,
  className,
}: AuditCardListProps) {
  // Pre-compute requestId → sibling count (mirrors AuditTable).
  // O(N) per page-set is acceptable for v1's page-size 50 (D-104).
  const siblingCounts = new Map<string, number>();
  for (const ev of events) {
    if (!ev.requestId) continue;
    siblingCounts.set(ev.requestId, (siblingCounts.get(ev.requestId) ?? 0) + 1);
  }

  return (
    <TooltipProvider>
      <div className={cn('grid gap-3', className)}>
        {events.map((event) => {
          const siblingCount = event.requestId
            ? siblingCounts.get(event.requestId) ?? 1
            : 1;
          return (
            <AuditEventCard
              key={event.id}
              event={event}
              isExpanded={expandedIds.has(event.id)}
              onToggle={() => onToggleExpand(event.id)}
              siblingCount={siblingCount}
            />
          );
        })}
      </div>
    </TooltipProvider>
  );
}
