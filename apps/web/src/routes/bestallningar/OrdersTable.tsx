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
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { OrderStatusPill } from '@/components/OrderStatusPill';
import { formatRelative } from './DraftCard';
import { useTableSort, type SortableValue } from '@/lib/useTableSort';

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

type SortKey = 'orderNumber' | 'time' | 'status' | 'lineCount' | 'totalQuantity' | 'actor';

export function OrdersTable({ rows, tab, className }: OrdersTableProps) {
  const navigate = useNavigate();
  const timeHeader = getTimeHeader(tab);
  const actorHeader = getActorHeader(tab);

  // Default sort = the tab-relevant timestamp, descending (newest first) —
  // mirrors the API's reverse-chronological order. See file-level comment
  // on the BE-driven default order.
  const sort = useTableSort<SortKey>({ key: 'time', dir: 'desc' });
  const sortedRows = sort.applyTo(rows, (row, key): SortableValue => {
    switch (key) {
      case 'orderNumber':
        return row.orderNumber;
      case 'time':
        return getRelevantAt(row, tab);
      case 'status':
        return row.status;
      case 'lineCount':
        return row.lineCount;
      case 'totalQuantity':
        return row.totalQuantity;
      case 'actor':
        return getActorName(row, tab);
    }
  });

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {/* Phase 10 D-166 — leftmost Best.nr column promotes orderNumber to
                identity-level visual prominence; existing columns shift right. */}
            <SortableTableHead
              ariaSort={sort.ariaSort('orderNumber')}
              onClick={() => sort.toggle('orderNumber')}
              className="w-[120px]"
            >
              Best.nr
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('time')}
              onClick={() => sort.toggle('time')}
            >
              {timeHeader}
            </SortableTableHead>
            {tab === 'alla' && (
              <SortableTableHead
                ariaSort={sort.ariaSort('status')}
                onClick={() => sort.toggle('status')}
              >
                Status
              </SortableTableHead>
            )}
            <SortableTableHead
              ariaSort={sort.ariaSort('lineCount')}
              onClick={() => sort.toggle('lineCount')}
              className="w-[80px]"
            >
              Rader
            </SortableTableHead>
            {tab !== 'alla' && (
              <SortableTableHead
                ariaSort={sort.ariaSort('totalQuantity')}
                onClick={() => sort.toggle('totalQuantity')}
                className="w-[80px]"
              >
                Total
              </SortableTableHead>
            )}
            <SortableTableHead
              ariaSort={sort.ariaSort('actor')}
              onClick={() => sort.toggle('actor')}
            >
              {actorHeader}
            </SortableTableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[48px]">
              Öppna
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => {
            const relevantAt = getRelevantAt(row, tab);
            const actorName = getActorName(row, tab);
            return (
              <TableRow
                key={row.id}
                tabIndex={0}
                // Phase 10 D-166 — aria-label references orderNumber so screen
                // readers hear the identifier (verbatim against the new column).
                aria-label={`Öppna beställning ${row.orderNumber}`}
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
                {/* Phase 10 D-166 — leftmost Best.nr cell, monospaced identifier. */}
                <TableCell className="px-4 py-3 font-mono text-sm">
                  {row.orderNumber}
                </TableCell>
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
