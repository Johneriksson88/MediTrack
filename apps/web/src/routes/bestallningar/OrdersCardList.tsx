import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { OrderListItem } from '@meditrack/shared';
import { OrderStatusPill } from '@/components/OrderStatusPill';
import { formatRelative } from './DraftCard';

/**
 * Phase 4 ORD-07 — Mobile card list (<md) for non-Utkast status tabs.
 *
 * Per UI-SPEC §Components 1 Mobile Card Variants. Card anatomy per tab:
 *
 *   skickad/bekraftad/levererad:
 *     top:    {formatRelative(relevantAt)}            + ChevronRight
 *     middle: {label} av {name}
 *     bottom: {N} rader · totalt {sum}
 *
 *   alla:
 *     top:    {formatRelative(createdAt)} + OrderStatusPill + ChevronRight
 *     middle: Skapad av {createdBy.name}
 *     bottom: {N} rader  (no "totalt {sum}" per UI-SPEC §Components 1 Alla card)
 *
 * Each card is a <button> with aria-label + onClick → navigate.
 * Styling: bg-card border border-border rounded-lg p-4 shadow-sm (Phase 3 DraftCard geometry).
 */

type NonUtkastTab = 'skickad' | 'bekraftad' | 'levererad' | 'alla';

interface OrdersCardListProps {
  rows: OrderListItem[];
  tab: NonUtkastTab;
  className?: string;
}

function getActorLabel(tab: NonUtkastTab): string {
  switch (tab) {
    case 'skickad':
      return 'Skickad av';
    case 'bekraftad':
      return 'Bekräftad av';
    case 'levererad':
      return 'Levererad av';
    case 'alla':
      return 'Skapad av';
  }
}

function getActorName(row: OrderListItem, tab: NonUtkastTab): string {
  switch (tab) {
    case 'skickad':
      return row.submittedBy?.name ?? '—';
    case 'bekraftad':
      return row.confirmedBy?.name ?? '—';
    case 'levererad':
      return row.deliveredBy?.name ?? '—';
    case 'alla':
      return row.createdBy.name;
  }
}

function getRelevantAt(row: OrderListItem, tab: NonUtkastTab): string {
  switch (tab) {
    case 'skickad':
      return row.submittedAt ?? row.createdAt;
    case 'bekraftad':
      return row.confirmedAt ?? row.createdAt;
    case 'levererad':
      return row.deliveredAt ?? row.createdAt;
    case 'alla':
      return row.createdAt;
  }
}

export function OrdersCardList({ rows, tab, className }: OrdersCardListProps) {
  const navigate = useNavigate();
  const actorLabel = getActorLabel(tab);

  return (
    <div className={`grid gap-3 ${className ?? ''}`}>
      {rows.map((row) => {
        const relevantAt = getRelevantAt(row, tab);
        const actorName = getActorName(row, tab);

        return (
          <button
            key={row.id}
            type="button"
            // Phase 10 D-166 — aria-label references orderNumber; screen
            // readers hear the identifier verbatim against the new heading.
            aria-label={`Öppna beställning ${row.orderNumber}`}
            // Phase 9 D-150 #2 — the active tab value flows verbatim into ?from=.
            onClick={() => navigate(`/bestallningar/${row.id}?from=${tab}`)}
            className="w-full text-left bg-card border border-border rounded-lg p-4 shadow-sm
                       cursor-pointer hover:bg-muted/30 focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
          >
            {/* Top row: orderNumber heading + (alla: StatusPill) + chevron.
                Phase 10 D-166 — heading slot promotes orderNumber; the
                relative timestamp demotes to the secondary actor line below. */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground font-mono">
                {row.orderNumber}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {tab === 'alla' && (
                  <OrderStatusPill status={row.status} />
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>

            {/* Middle row: actor + relative time. Phase 10 D-166 — formatRelative
                demoted from the heading; consolidated alongside the actor so the
                temporal cue is not lost. */}
            <p className="text-xs text-muted-foreground mb-1">
              {actorLabel} {actorName} · {formatRelative(relevantAt)}
            </p>

            {/* Bottom row: line count (+ total quantity for non-alla tabs) */}
            <p className="text-sm text-foreground">
              {row.lineCount} {row.lineCount === 1 ? 'rad' : 'rader'}
              {tab !== 'alla' && ` · totalt ${row.totalQuantity}`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
