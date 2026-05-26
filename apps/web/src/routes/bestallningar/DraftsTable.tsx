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
import { formatRelative } from './DraftCard';
import { useTableSort, type SortableValue } from '@/lib/useTableSort';

/**
 * Phase 3 UI-SPEC §2 — Desktop drafts table (≥md).
 *
 * 5 columns per D-72:
 *   Skapad    — formatRelative(createdAt)
 *   Rader     — lineCount
 *   Total     — totalQuantity
 *   Skapad av — createdBy.name
 *   Öppna     — visually empty header; ChevronRight icon in each row
 *
 * NO status pill column per UI-SPEC §IA decision — Phase 3 list is utkast-only.
 *
 * Row interaction:
 *   - Entire <TableRow> is clickable → calls onRowClick(item)
 *   - tabIndex={0} + onKeyDown (Enter/Space) for keyboard accessibility
 *   - aria-label per UI-SPEC §A11y: 'Öppna utkast skapat {relative}'
 *
 * Mirrors MedicationTable.tsx structure exactly. No TooltipProvider needed.
 */

interface DraftsTableProps {
  items: OrderListItem[];
  onRowClick: (item: OrderListItem) => void;
  className?: string;
}

type SortKey = 'orderNumber' | 'createdAt' | 'lineCount' | 'totalQuantity' | 'createdBy';

export function DraftsTable({ items, onRowClick, className }: DraftsTableProps) {
  const sort = useTableSort<SortKey>({ key: 'createdAt', dir: 'desc' });
  const sortedItems = sort.applyTo(items, (row, key): SortableValue => {
    switch (key) {
      case 'orderNumber':
        return row.orderNumber;
      case 'createdAt':
        return row.createdAt;
      case 'lineCount':
        return row.lineCount;
      case 'totalQuantity':
        return row.totalQuantity;
      case 'createdBy':
        return row.createdBy.name;
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
              ariaSort={sort.ariaSort('createdAt')}
              onClick={() => sort.toggle('createdAt')}
            >
              Skapad
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('lineCount')}
              onClick={() => sort.toggle('lineCount')}
              className="w-[80px]"
            >
              Rader
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('totalQuantity')}
              onClick={() => sort.toggle('totalQuantity')}
              className="w-[80px]"
            >
              Total
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('createdBy')}
              onClick={() => sort.toggle('createdBy')}
            >
              Skapad av
            </SortableTableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[48px]">
              Öppna
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((item) => (
            <TableRow
              key={item.id}
              tabIndex={0}
              // Phase 10 D-166 — aria-label references orderNumber so screen
              // readers hear the identifier (verbatim against the new column).
              aria-label={`Öppna utkast ${item.orderNumber}`}
              onClick={() => onRowClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(item);
                }
              }}
              className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {/* Phase 10 D-166 — leftmost Best.nr cell, monospaced identifier. */}
              <TableCell className="px-4 py-3 font-mono text-sm">
                {item.orderNumber}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm font-normal">
                {formatRelative(item.createdAt)}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm">
                {item.lineCount}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm">
                {item.totalQuantity}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                {item.createdBy.name}
              </TableCell>
              <TableCell className="px-4 py-3">
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
