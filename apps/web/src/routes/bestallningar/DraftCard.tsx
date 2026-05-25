import { ChevronRight } from 'lucide-react';
import type { OrderListItem } from '@meditrack/shared';

/**
 * Phase 3 UI-SPEC §3 — Single draft card for the mobile card list (<md).
 *
 * Three stacked rows:
 *   top:    {formatRelative(createdAt)}   + right-edge ChevronRight
 *   middle: Skapad av {createdBy.name}    (text-xs text-muted-foreground)
 *   bottom: {lineCount} rader · totalt {totalQuantity} (text-sm)
 *
 * Entire card is clickable — role="button" + tabIndex + aria-label + onKeyDown
 * for keyboard accessibility (UI-SPEC §A11y).
 *
 * NO nested interactive elements (unlike OrderLineCard which Slice 3 ships).
 */

/**
 * Thin Swedish-aware relative-time formatter.
 * Returns strings like '2 minuter sedan', '1 timme sedan', 'igår', or a
 * localised date string for older dates.
 *
 * date-fns is not in the dependency tree (T-03-SC: no new packages in Slice 2).
 * This helper is colocated here to avoid a shared-utils detour; Slice 7+ can
 * migrate to date-fns if it's added to the project then.
 */
export function formatRelative(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just nu';
  if (diffMin === 1) return '1 minut sedan';
  if (diffMin < 60) return `${diffMin} minuter sedan`;
  if (diffHour === 1) return '1 timme sedan';
  if (diffHour < 24) return `${diffHour} timmar sedan`;
  if (diffDay === 1) return 'igår';
  if (diffDay < 7) return `${diffDay} dagar sedan`;

  // Fall back to localised date string for older dates.
  return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface DraftCardProps {
  item: OrderListItem;
  onCardClick: (item: OrderListItem) => void;
}

export function DraftCard({ item, onCardClick }: DraftCardProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick(item);
    }
  }

  // Phase 10 D-166 — aria-label references orderNumber; screen readers
  // hear the identifier verbatim against the new heading slot.
  const ariaLabel = `Öppna utkast ${item.orderNumber}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => onCardClick(item)}
      onKeyDown={handleKeyDown}
      className="bg-card border border-border rounded-lg p-4 shadow-sm cursor-pointer
                 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-primary focus-visible:ring-offset-1"
    >
      {/* Top row: orderNumber heading + chevron. Phase 10 D-166 — heading slot
          promotes orderNumber; formatRelative demotes to the secondary line. */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-foreground font-mono">
          {item.orderNumber}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      </div>

      {/* Middle row: created by + relative time. Phase 10 D-166 — formatRelative
          demoted from the heading; consolidated alongside the actor. */}
      <p className="text-xs text-muted-foreground mb-1">
        Skapad av {item.createdBy.name} · {formatRelative(item.createdAt)}
      </p>

      {/* Bottom row: line count + total quantity */}
      <p className="text-sm text-foreground">
        {item.lineCount} {item.lineCount === 1 ? 'rad' : 'rader'} · totalt {item.totalQuantity}
      </p>
    </div>
  );
}
