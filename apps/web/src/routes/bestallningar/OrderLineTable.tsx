import { Trash2 } from 'lucide-react';
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
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { LowStockBadge } from '@/components/LowStockBadge';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Can } from '@/auth/Can';
import { useRemoveOrderLine } from '@/features/orders/useOrderMutations';
import type { OrderLineResponse } from '@meditrack/shared';

/**
 * Phase 3 D-47 / D-57 / D-60 / UI-SPEC §5 — Order line table (≥md).
 *
 * 6 columns: Namn / ATC-kod / Form / Lager (+ LowStockBadge) / Antal (QuantityStepper) / Åtgärd (trash)
 *
 * Mirrors MedicationTable.tsx structure (table shell + header + body pattern).
 * Lager cell reuses MedicationTable.tsx:105-121's AlertTriangle + LowStockBadge pattern.
 *
 * isLocked prop (Mode B read-only):
 *   - QuantityStepper rendered with isLocked={true} (shows static span, preserves layout)
 *   - Trash button column hidden (Åtgärd cell still rendered to keep grid stable)
 *
 * Empty state: single colSpan=6 row with D-70 copy.
 */

interface OrderLineTableProps {
  items: OrderLineResponse[];
  orderId: string;
  isLocked: boolean;
  className?: string;
}

export function OrderLineTable({ items, orderId, isLocked, className }: OrderLineTableProps) {
  const removeLineMutation = useRemoveOrderLine();

  // WR-06: TooltipProvider is hoisted to ComposeOrderPage (the route wrapper)
  // so this component and ComposeStickyFooter share a single provider instead
  // of stacking two tooltip portals + scroll-lock observers per render.
  return (
    <>
      <div className={`overflow-x-auto ${className ?? ''}`}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[160px]">
                Namn
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                ATC-kod
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Form
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lager
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Antal
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-12">
                Åtgärd
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-sm text-muted-foreground text-center py-8"
                >
                  Lägg till läkemedel för att börja.
                </TableCell>
              </TableRow>
            ) : (
              items.map((line) => {
                const isLow = line.currentStock < line.lowStockThreshold;
                return (
                  <TableRow key={line.id} className="hover:bg-muted/30">
                    <TableCell className="px-4 py-3 text-sm font-medium">{line.name}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{line.atcCode}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{line.form}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {isLow && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="sr-only">Lågt lager</span>
                            </TooltipTrigger>
                            <TooltipContent>Lågt lager</TooltipContent>
                          </Tooltip>
                        )}
                        {isLow && <LowStockBadge />}
                        <span className="text-sm font-normal">{line.currentStock}</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <QuantityStepper
                        value={line.quantity}
                        orderId={orderId}
                        lineId={line.id}
                        isLocked={isLocked}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {!isLocked && (
                        <Can action="order:update">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-destructive hover:bg-destructive/10"
                            aria-label="Ta bort rad"
                            disabled={removeLineMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLineMutation.mutate({ orderId, lineId: line.id });
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </Can>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
