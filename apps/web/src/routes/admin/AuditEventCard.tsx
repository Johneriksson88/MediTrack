import { ChevronDown } from 'lucide-react';
import type { AuditEventResponse } from '@meditrack/shared';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AuditActionChip } from '@/components/AuditActionChip';
import { AuditEntityTypeChip } from '@/components/AuditEntityTypeChip';
import { formatRelative } from '../bestallningar/DraftCard';
import { diffSummary } from './auditDiffSummary';
import { cn } from '@/lib/utils';

/**
 * Phase 5 UI-SPEC §4 — Single audit-event card for the mobile card list (<md).
 *
 * Whole card is a <button> (full-width tap target). Tapping reveals the
 * AuditDiffPanel inline below — Task 3 wires the panel; this Task 2
 * output leaves an empty expanded slot with the chevron-rotation and
 * `<hr>` separator already in place.
 *
 * a11y label mirrors AuditTable: `Visa detaljer för ... ` / `Dölj detaljer för ...`.
 */

export interface AuditEventCardProps {
  event: AuditEventResponse;
  isExpanded: boolean;
  onToggle: () => void;
}

export function AuditEventCard({ event, isExpanded, onToggle }: AuditEventCardProps) {
  const ariaLabel = isExpanded
    ? `Dölj detaljer för ${event.action} på ${event.entityType} ${formatRelative(event.createdAt)}`
    : `Visa detaljer för ${event.action} på ${event.entityType} ${formatRelative(event.createdAt)}`;
  const diffPanelId = `audit-card-diff-${event.id}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls={diffPanelId}
      aria-label={ariaLabel}
      className="w-full text-left bg-card border border-border rounded-lg p-4 shadow-sm
                 cursor-pointer hover:bg-muted/30 focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
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
      <p className="text-xs text-muted-foreground mb-1">
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
      </p>

      {/* Fourth row: diff compact summary */}
      <p className="text-sm text-foreground">{diffSummary(event)}</p>

      {/* Expanded slot — Task 3 wires <AuditDiffPanel> here, separated by <hr> */}
      {isExpanded && (
        <>
          <hr className="my-3 border-border" />
          <div id={diffPanelId} role="region" aria-label="Detaljer för händelse">
            {/* Task 3 — wires <AuditDiffPanel event={event} siblingCount={...} /> */}
          </div>
        </>
      )}
    </button>
  );
}
