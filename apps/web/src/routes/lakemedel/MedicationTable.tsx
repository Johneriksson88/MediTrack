import type { MedicationListItem } from '@meditrack/shared';
import { AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LowStockBadge } from '@/components/LowStockBadge';

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
 * Lager cell: when currentStock < lowStockThreshold, renders AlertTriangle
 * icon in a Tooltip + <LowStockBadge> + number. Otherwise just the number.
 *
 * Tröskel cell: number display. // TODO Plan 03: <InlineEditThreshold>
 *
 * Accessibility: tabIndex + onKeyDown on rows (UI-SPEC §A11y Table keyboard nav).
 */

interface MedicationTableProps {
  items: MedicationListItem[];
  onRowClick: (item: MedicationListItem) => void;
  className?: string;
}

export function MedicationTable({ items, onRowClick, className }: MedicationTableProps) {
  return (
    <TooltipProvider>
      <div className={`overflow-x-auto ${className ?? ''}`}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[200px]">
                Namn
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">
                ATC-kod
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[140px]">
                Form
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[100px]">
                Styrka
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">
                Lager
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[100px]">
                Tröskel
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[48px]">
                Åtgärd
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
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
                      {isLow && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle
                              className="h-3.5 w-3.5 text-destructive mr-1"
                              aria-hidden="true"
                            />
                          </TooltipTrigger>
                          <TooltipContent>Lågt lager</TooltipContent>
                        </Tooltip>
                      )}
                      {isLow && <LowStockBadge />}
                      <span className="text-sm font-normal">{item.currentStock}</span>
                    </div>
                  </TableCell>
                  <TableCell
                    className="px-4 py-3 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* TODO Plan 03: <InlineEditThreshold
                          value={item.lowStockThreshold}
                          careUnitMedicationId={item.careUnitMedicationId}
                          medicationName={item.name}
                        /> */}
                    {item.lowStockThreshold}
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
    </TooltipProvider>
  );
}
