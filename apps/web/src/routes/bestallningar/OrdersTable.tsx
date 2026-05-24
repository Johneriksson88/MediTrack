import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { OrderListItem } from '@meditrack/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderStatusPill } from '@/components/OrderStatusPill';
import { formatRelative } from './DraftCard';

/**
 * Phase 4 ORD-07 — Desktop orders table (≥md) for non-Utkast status tabs.
 *
 * Column set varies per `tab` prop per UI-SPEC §Components 1 Column Spec:
 *
 *   skickad:   Skickad (submittedAt)    / Rader / Total / Skickad av   / Öppna
 *   bekraftad: Bekräftad (confirmedAt)  / Rader / Total / Bekräftad av / Öppna
 *   levererad: Levererad (deliveredAt)  / Rader / Total / Levererad av / Öppna
 *   alla:      Skapad (createdAt) / Status pill / Rader / Skapad av    / Öppna
 *
 * Row interaction: entire TableRow is cursor-pointer → navigate('/bestallningar/:id').
 * aria-label: 'Öppna beställning från {formatRelative(relevantAt)}' (UI-SPEC §A11y).
 *
 * Header style: text-xs font-semibold text-muted-foreground uppercase tracking-wide
 * + bg-muted/50 (matches Phase 2/3 tables).
 */

type NonUtkastTab = 'skickad' | 'bekraftad' | 'levererad' | 'alla';

interface OrdersTableProps {
  rows: OrderListItem[];
  tab: NonUtkastTab;
  className?: string;
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

function getTimeHeader(tab: NonUtkastTab): string {
  switch (tab) {
    case 'skickad':
      return 'Skickad';
    case 'bekraftad':
      return 'Bekräftad';
    case 'levererad':
      return 'Levererad';
    case 'alla':
      return 'Skapad';
  }
}

function getActorHeader(tab: NonUtkastTab): string {
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

export function OrdersTable({ rows, tab, className }: OrdersTableProps) {
  const navigate = useNavigate();
  const timeHeader = getTimeHeader(tab);
  const actorHeader = getActorHeader(tab);

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {timeHeader}
            </TableHead>
            {tab === 'alla' && (
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Status
              </TableHead>
            )}
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[80px]">
              Rader
            </TableHead>
            {tab !== 'alla' && (
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[80px]">
                Total
              </TableHead>
            )}
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {actorHeader}
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[48px]">
              Öppna
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const relevantAt = getRelevantAt(row, tab);
            const actorName = getActorName(row, tab);
            return (
              <TableRow
                key={row.id}
                tabIndex={0}
                aria-label={`Öppna beställning från ${formatRelative(relevantAt)}`}
                onClick={() => navigate(`/bestallningar/${row.id}?from=${tab}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    // Phase 9 D-150 #2 — the active tab value flows verbatim into ?from=.
                    navigate(`/bestallningar/${row.id}?from=${tab}`);
                  }
                }}
                className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none
                           focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <TableCell className="px-4 py-3 text-sm font-normal">
                  {formatRelative(relevantAt)}
                </TableCell>
                {tab === 'alla' && (
                  <TableCell className="px-4 py-3">
                    <OrderStatusPill status={row.status} />
                  </TableCell>
                )}
                <TableCell className="px-4 py-3 text-sm">
                  {row.lineCount}
                </TableCell>
                {tab !== 'alla' && (
                  <TableCell className="px-4 py-3 text-sm">
                    {row.totalQuantity}
                  </TableCell>
                )}
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {actorName}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
