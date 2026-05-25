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
import { formatRelative } from './DraftCard';

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

export function DraftsTable({ items, onRowClick, className }: DraftsTableProps) {
  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {/* Phase 10 D-166 — leftmost Best.nr column promotes orderNumber to
                identity-level visual prominence; existing columns shift right. */}
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">
              Best.nr
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Skapad
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[80px]">
              Rader
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[80px]">
              Total
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Skapad av
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[48px]">
              Öppna
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
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
