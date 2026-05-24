import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LowStockBadge } from '@/components/LowStockBadge';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Can } from '@/auth/Can';
import { useRemoveOrderLine } from '@/features/orders/useOrderMutations';
import type { OrderLineResponse } from '@meditrack/shared';

/**
 * Phase 3 D-52 / UI-SPEC §7 — Single order-line card for the mobile card list (<md).
 *
 * Card layout:
 *   Row 1: {name} (truncated) + [trash button 44×44]
 *   Row 2: ATC: {atcCode} · Form: {form}
 *   Row 3: Styrka: {strength}  (omitted when strength is null)
 *   Row 4: Lager: {currentStock} + <LowStockBadge> if low
 *   <hr />
 *   Row 5: <QuantityStepper>
 *
 * Card is NOT a clickable element — role="button" / tabIndex / onClick are
 * intentionally absent (UI-SPEC §7 explicitly states "Card is NOT clickable").
 * The only interactives are the trash button and the QuantityStepper.
 *
 * isLocked prop (Mode B read-only):
 *   - Trash button hidden (Can gate still wraps it, but isLocked check comes first)
 *   - QuantityStepper rendered with isLocked={true} (shows static span)
 */

interface OrderLineCardProps {
  line: OrderLineResponse;
  orderId: string;
  isLocked: boolean;
}

export function OrderLineCard({ line, orderId, isLocked }: OrderLineCardProps) {
  const removeMutation = useRemoveOrderLine();
  const isLow = line.currentStock < line.lowStockThreshold;

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      {/* Row 1: name + trash button */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-foreground truncate max-w-[calc(100%-3rem)]">
          {line.name}
        </span>
        {!isLocked && (
          <Can action="order:update">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-destructive hover:bg-destructive/10 shrink-0 -mt-0.5"
              aria-label="Ta bort rad"
              disabled={removeMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                removeMutation.mutate({ orderId, lineId: line.id });
              }}
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </Can>
        )}
      </div>

      {/* Row 2: ATC + form */}
      <p className="text-xs text-muted-foreground mb-0.5">
        ATC: {line.atcCode} · Form: {line.form}
      </p>

      {/* Row 3: Styrka (omitted when null — matches MedicationCard pattern) */}
      {line.strength && (
        <p className="text-xs text-muted-foreground mb-0.5">
          Styrka: {line.strength}
        </p>
      )}

      {/* Row 4: Lager + optional LowStockBadge */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Lager:</span>
        <span>{line.currentStock}</span>
        {isLow && <LowStockBadge />}
      </div>

      <hr className="my-3 border-border" />

      {/* Row 4: QuantityStepper */}
      <div onClick={(e) => e.stopPropagation()}>
        <QuantityStepper
          value={line.quantity}
          orderId={orderId}
          lineId={line.id}
          isLocked={isLocked}
        />
      </div>
    </div>
  );
}
