import type { MedicationListItem } from '@meditrack/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LowStockBadge } from '@/components/LowStockBadge';
import { SortimentRowCheckbox } from './SortimentRowCheckbox';

/**
 * Sortiment "I sortimentet" tab — read-only listing of active
 * CareUnitMedication rows with a leading selection checkbox column.
 *
 * Reuses the column shape of `MedicationTable` minus the inline-edit
 * threshold widget (admins managing sortiment shouldn't be one click from
 * mass stock edits) and the empty Åtgärd column (no per-row action — the
 * bulk action bar at the page level is the only mutation surface here).
 *
 * Row clicking toggles selection; checkbox clicks are stopPropagation'd
 * by SortimentRowCheckbox to keep the affordance redundant rather than
 * conflicting.
 */

interface SortimentCurrentTableProps {
  items: MedicationListItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  className?: string;
}

export function SortimentCurrentTable({
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
  className,
}: SortimentCurrentTableProps) {
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
            <TableHead className="min-w-[200px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Namn
            </TableHead>
            <TableHead className="w-[120px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ATC-kod
            </TableHead>
            <TableHead className="w-[140px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Form
            </TableHead>
            <TableHead className="w-[100px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Styrka
            </TableHead>
            <TableHead className="w-[120px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lager
            </TableHead>
            <TableHead className="w-[100px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tröskel
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isLow = item.currentStock < item.lowStockThreshold;
            const checked = selectedIds.has(item.careUnitMedicationId);
            return (
              <TableRow
                key={item.careUnitMedicationId}
                tabIndex={0}
                aria-label={`Markera ${item.name}`}
                aria-selected={checked}
                onClick={() => onToggle(item.careUnitMedicationId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(item.careUnitMedicationId);
                  }
                }}
                className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary data-[state=selected]:bg-primary/5"
                data-state={checked ? 'selected' : undefined}
              >
                <TableCell className="px-2">
                  <SortimentRowCheckbox
                    checked={checked}
                    onChange={() => onToggle(item.careUnitMedicationId)}
                    ariaLabel={`Markera ${item.name}`}
                  />
                </TableCell>
                <TableCell className="px-4 py-3 text-sm font-normal">{item.name}</TableCell>
                <TableCell className="px-4 py-3 text-sm font-mono">{item.atcCode}</TableCell>
                <TableCell className="px-4 py-3 text-sm">{item.form}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {item.strength ?? '—'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {isLow && <LowStockBadge />}
                    <span className="text-sm font-normal">{item.currentStock}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">{item.lowStockThreshold}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
