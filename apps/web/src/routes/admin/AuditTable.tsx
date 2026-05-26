import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AuditEventResponse } from '@meditrack/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AuditActionChip } from '@/components/AuditActionChip';
import { AuditEntityTypeChip } from '@/components/AuditEntityTypeChip';
import { AuditDiffPanel } from './AuditDiffPanel';
import { formatRelative } from '../bestallningar/DraftCard';
import { diffSummary } from './auditDiffSummary';
import { cn } from '@/lib/utils';
import { useTableSort, type SortableValue } from '@/lib/useTableSort';

/**
 * Phase 5 UI-SPEC §3 / D-102 / D-104 — Desktop audit table (≥md).
 *
 * Six columns (Tid / Användare / Entitet / Åtgärd / Diff / chevron) with
 * the column widths locked per UI-SPEC §3.
 *
 * Row interaction: entire <TableRow> is click-to-toggle expansion. When
 * expanded, a second <TableRow colSpan={6}> renders below as the host for
 * the AuditDiffPanel — the panel itself is wired in Task 3, this Task 2
 * output leaves the host cell empty (with the expanded class + chevron-
 * rotation so the affordance is observably wired end-to-end).
 *
 * Keyboard a11y: tabIndex={0} + Enter/Space onKeyDown — mirrors Phase 4
 * OrdersTable's row affordance, but toggles expand instead of navigating.
 */

export interface AuditTableProps {
  events: AuditEventResponse[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  className?: string;
}

type SortKey = 'createdAt' | 'actor' | 'entityType' | 'action';

function auditAccessor(event: AuditEventResponse, key: SortKey): SortableValue {
  switch (key) {
    case 'createdAt':
      return event.createdAt;
    case 'actor':
      return event.actor?.name ?? null;
    case 'entityType':
      return event.entityType;
    case 'action':
      return event.action;
  }
}

export function AuditTable({
  events,
  expandedIds,
  onToggleExpand,
  className,
}: AuditTableProps) {
  // Default to Tid desc — matches the BE's reverse-chronological order so the
  // initial render shape is unchanged. Toggling Tid first cycles to asc.
  const sort = useTableSort<SortKey>({ key: 'createdAt', dir: 'desc' });
  const sortedEvents = sort.applyTo(events, auditAccessor);

  // Pre-compute requestId → sibling count for the loaded events.
  // O(N) scan per page-set; acceptable for v1's page-size 50 (D-104).
  const siblingCounts = new Map<string, number>();
  for (const ev of events) {
    if (!ev.requestId) continue;
    siblingCounts.set(ev.requestId, (siblingCounts.get(ev.requestId) ?? 0) + 1);
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <TooltipProvider>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <SortableTableHead
                ariaSort={sort.ariaSort('createdAt')}
                onClick={() => sort.toggle('createdAt')}
                className="w-[160px]"
              >
                Tid
              </SortableTableHead>
              <SortableTableHead
                ariaSort={sort.ariaSort('actor')}
                onClick={() => sort.toggle('actor')}
                className="min-w-[200px]"
              >
                Användare
              </SortableTableHead>
              <SortableTableHead
                ariaSort={sort.ariaSort('entityType')}
                onClick={() => sort.toggle('entityType')}
                className="w-[200px]"
              >
                Entitet
              </SortableTableHead>
              <SortableTableHead
                ariaSort={sort.ariaSort('action')}
                onClick={() => sort.toggle('action')}
                className="w-[180px]"
              >
                Åtgärd
              </SortableTableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[280px]">
                Diff
              </TableHead>
              <TableHead className="w-[40px]">
                <span className="sr-only">Expandera</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.map((event) => {
              const isExpanded = expandedIds.has(event.id);
              const diffPanelId = `audit-diff-${event.id}`;
              const siblingCount = event.requestId
                ? siblingCounts.get(event.requestId) ?? 1
                : 1;
              const ariaLabel = isExpanded
                ? `Dölj detaljer för ${event.action} på ${event.entityType} ${formatRelative(event.createdAt)}`
                : `Visa detaljer för ${event.action} på ${event.entityType} ${formatRelative(event.createdAt)}`;

              return (
                <Fragment key={event.id}>
                  <TableRow
                    tabIndex={0}
                    role="button"
                    aria-expanded={isExpanded}
                    aria-controls={diffPanelId}
                    aria-label={ariaLabel}
                    onClick={() => onToggleExpand(event.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleExpand(event.id);
                      }
                    }}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none
                               focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <TableCell className="px-4 py-3 text-sm">
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
                    </TableCell>

                    <TableCell className="px-4 py-3 text-sm">
                      {event.actor ? (
                        <span>{event.actor.name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Okänd</span>
                      )}
                    </TableCell>

                    <TableCell className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center gap-2">
                        <AuditEntityTypeChip type={event.entityType} />
                        <span className="text-xs text-muted-foreground font-mono">
                          {event.entityId.slice(0, 8)}
                        </span>
                      </span>
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <AuditActionChip action={event.action} />
                    </TableCell>

                    <TableCell className="px-4 py-3 text-sm text-foreground">
                      {diffSummary(event)}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={6}
                        className="bg-muted/30 px-4 py-4 border-b border-border"
                      >
                        <div id={diffPanelId}>
                          <AuditDiffPanel
                            event={event}
                            siblingCount={siblingCount}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
}
