import type { MedicationListItem } from '@meditrack/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { LowStockBadge } from '@/components/LowStockBadge';
import { InlineEditThreshold } from '@/components/InlineEditThreshold';
import { useTableSort } from '@/lib/useTableSort';

/**
 * Phase 2 UI-SPEC §2 — Desktop table (≥md).
 *
 * 7 columns: Namn, ATC-kod, Form, Styrka, Lager, Tröskel, Åtgärd.
 * Rendered at md+ via `hidden md:block` on LakemedelPage.
 *
 * Row interaction:
 * - Entire <TableRow> is clickable → opens Sheet (edit/view per role, Plan 03).
 *   For Slice 1, onRowClick is provided but edit mode is a placeholder.
 * - Åtgärd column is visually empty (row click is the affordance).
 *
 * Lager cell: when currentStock < lowStockThreshold, renders <LowStockBadge>
 * (icon-only, aria-labelled) + number. Otherwise just the number.
 *
 * Tröskel cell: <InlineEditThreshold> with click-to-edit + optimistic update.
 *
 * Accessibility: tabIndex + onKeyDown on rows (UI-SPEC §A11y Table keyboard nav).
 *
 * Sorting: client-side per current page. The list query is paginated, so
 * sorting only reorders the visible rows — `Lager`/`Tröskel` will not pull
 * smaller-stock rows in from other pages. See useTableSort for the trade-off.
 */

type SortKey = 'name' | 'atcCode' | 'form' | 'strength' | 'currentStock' | 'lowStockThreshold';

interface MedicationTableProps {
  items: MedicationListItem[];
  onRowClick: (item: MedicationListItem) => void;
  className?: string;
}

export function MedicationTable({ items, onRowClick, className }: MedicationTableProps) {
  const sort = useTableSort<SortKey>({ key: 'name', dir: 'asc' });
  const sortedItems = sort.applyTo(items, (row, key) => row[key]);

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <SortableTableHead
              ariaSort={sort.ariaSort('name')}
              onClick={() => sort.toggle('name')}
              className="min-w-[200px]"
            >
              Namn
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('atcCode')}
              onClick={() => sort.toggle('atcCode')}
              className="w-[120px]"
            >
              ATC-kod
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('form')}
              onClick={() => sort.toggle('form')}
              className="w-[140px]"
            >
              Form
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('strength')}
              onClick={() => sort.toggle('strength')}
              className="w-[100px]"
            >
              Styrka
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('currentStock')}
              onClick={() => sort.toggle('currentStock')}
              className="w-[120px]"
            >
              Lager
            </SortableTableHead>
            <SortableTableHead
              ariaSort={sort.ariaSort('lowStockThreshold')}
              onClick={() => sort.toggle('lowStockThreshold')}
              className="w-[100px]"
            >
              Tröskel
            </SortableTableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[48px]">
              Åtgärd
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((item) => {
            const isLow = item.currentStock < item.lowStockThreshold;
            return (
              <TableRow
                key={item.careUnitMedicationId}
                tabIndex={0}
                aria-label={`Öppna ${item.name}`}
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
                <TableCell className="px-4 py-3 text-sm font-normal">
                  {item.name}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm font-mono">
                  {item.atcCode}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  {item.form}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {item.strength ?? '—'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {isLow && <LowStockBadge />}
                    <span className="text-sm font-normal">{item.currentStock}</span>
                  </div>
                </TableCell>
                <TableCell
                  className="px-4 py-3 text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <InlineEditThreshold
                    careUnitMedicationId={item.careUnitMedicationId}
                    medicationName={item.name}
                    value={item.lowStockThreshold}
                  />
                </TableCell>
                <TableCell className="px-4 py-3">
                  {/* Visually empty — entire row is the click affordance */}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
