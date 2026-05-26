import type { BulkAddCandidate } from '@meditrack/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { SortimentRowCheckbox } from './SortimentRowCheckbox';
import { useTableSort } from '@/lib/useTableSort';

interface SortimentAddTableProps {
  items: BulkAddCandidate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  className?: string;
}

/**
 * "Lägg till" tab table — global Medication rows NOT yet in this unit's
 * sortiment. Selection uses Medication.id (not careUnitMedicationId — these
 * rows don't have one yet). Row click toggles selection.
 *
 * No Lager / Tröskel columns: those are owned by the confirm dialog where
 * the admin sets a single threshold default and (per design decision) can
 * override per row before commit.
 */
type SortKey = 'name' | 'atcCode' | 'form' | 'strength';

export function SortimentAddTable({
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
  className,
}: SortimentAddTableProps) {
  const sort = useTableSort<SortKey>({ key: 'name', dir: 'asc' });
  const sortedItems = sort.applyTo(items, (row, key) => row[key]);

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-[48px] px-2">
              <label
                className="inline-flex h-full w-full cursor-pointer items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && someSelected;
                  }}
                  onChange={onToggleAll}
                  aria-label={allSelected ? 'Avmarkera alla' : 'Markera alla'}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
              </label>
            </TableHead>
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((item) => {
            const checked = selectedIds.has(item.medicationId);
            return (
              <TableRow
                key={item.medicationId}
                tabIndex={0}
                aria-label={`Markera ${item.name}`}
                aria-selected={checked}
                onClick={() => onToggle(item.medicationId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(item.medicationId);
                  }
                }}
                className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary data-[state=selected]:bg-primary/5"
                data-state={checked ? 'selected' : undefined}
              >
                <TableCell className="px-2">
                  <SortimentRowCheckbox
                    checked={checked}
                    onChange={() => onToggle(item.medicationId)}
                    ariaLabel={`Markera ${item.name}`}
                  />
                </TableCell>
                <TableCell className="px-4 py-3 text-sm font-normal">{item.name}</TableCell>
                <TableCell className="px-4 py-3 text-sm font-mono">{item.atcCode}</TableCell>
                <TableCell className="px-4 py-3 text-sm">{item.form}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {item.strength ?? '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
