import { ChevronDown } from 'lucide-react';
import type { AuditEventResponse } from '@meditrack/shared';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AuditActionChip } from '@/components/AuditActionChip';
import { AuditEntityTypeChip } from '@/components/AuditEntityTypeChip';
import { AuditDiffPanel } from './AuditDiffPanel';
import { formatRelative } from '../bestallningar/DraftCard';
import { diffSummary } from './auditDiffSummary';
import { cn } from '@/lib/utils';

/**
 * Phase 5 UI-SPEC §4 — Single audit-event card for the mobile card list (<md).
 *
 * Card geometry: the summary header (chip row, actor, time, diff summary)
 * is the click target — implemented as a <button> nested inside the card
 * frame. The expanded diff panel sits OUTSIDE the button so its internal
 * interactive elements (<Link> requestId chip, <Button> Kopiera filterlänk)
 * are valid HTML (no nested interactive content).
 *
 * a11y label mirrors AuditTable: `Visa detaljer för ... ` / `Dölj detaljer för ...`.
 */

export interface AuditEventCardProps {
  event: AuditEventResponse;
  isExpanded: boolean;
  onToggle: () => void;
  /**
   * Sibling count for the requestId-group chip in the expanded panel.
   * Computed at AuditCardList level by scanning the loaded events.
   * Defaults to 1 so the chip is suppressed for single-event requests.
   */
  siblingCount?: number;
}

export function AuditEventCard({
  event,
  isExpanded,
  onToggle,
  siblingCount = 1,
}: AuditEventCardProps) {
  const ariaLabel = isExpanded
    ? `Dölj detaljer för ${event.action} på ${event.entityType} ${formatRelative(event.createdAt)}`
    : `Visa detaljer för ${event.action} på ${event.entityType} ${formatRelative(event.createdAt)}`;
  const diffPanelId = `audit-card-diff-${event.id}`;

  return (
    <div
      className="bg-card border border-border rounded-lg shadow-sm overflow-hidden"
    >
      {/* Summary header — the click-to-expand button */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={diffPanelId}
        aria-label={ariaLabel}
        className="w-full text-left p-4 cursor-pointer hover:bg-muted/30
                   focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-primary focus-visible:ring-inset"
      >
        {/* Top row: action chip + entity-type chip + chevron */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <AuditActionChip action={event.action} />
            <AuditEntityTypeChip type={event.entityType} />
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform',
              isExpanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </div>

        {/* Second row: actor name (or italic Okänd) */}
        <p className="text-sm font-semibold text-foreground mb-1">
          {event.actor ? (
            event.actor.name
          ) : (
            <span className="text-muted-foreground italic font-normal">Okänd</span>
          )}
        </p>

        {/* Third row: relative time with tooltip */}
        <div className="text-xs text-muted-foreground mb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                {formatRelative(event.createdAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <span className="text-xs font-mono">{event.createdAt}</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Fourth row: diff compact summary */}
        <p className="text-sm text-foreground">{diffSummary(event)}</p>
      </button>

      {/* Expanded panel — OUTSIDE the <button> so interactive children stay valid HTML.
          Separated visually via <hr>. */}
      {isExpanded && (
        <div id={diffPanelId} className="px-4 pb-4">
          <hr className="my-3 border-border" />
          <AuditDiffPanel event={event} siblingCount={siblingCount} />
        </div>
      )}
    </div>
  );
}
