import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { useRestockPreviewQuery } from '@/features/orders/useRestockPreviewQuery';
import { useRestockLowStock } from '@/features/orders/useOrderMutations';

/**
 * "Beställ påfyllning" dialog — preview every under-threshold medication
 * in the caller's vårdenhet, let the user pick a buffer X and uncheck
 * any rows already covered by an in-flight (non-`levererad`) order, then
 * create a draft Order with one line per selected item.
 *
 * Quantity per line is `max(1, threshold − currentStock + buffer)`,
 * mirrored live in the row "Antal" column as the user edits the buffer.
 *
 * On confirm: pessimistic POST → on success navigate to the new draft
 * (matching the "Ny beställning" pattern) and close the dialog.
 */

const DEFAULT_BUFFER = 10;
const MAX_BUFFER = 10000;

export interface RestockLowStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RestockLowStockDialog({ open, onOpenChange }: RestockLowStockDialogProps) {
  const navigate = useNavigate();
  const query = useRestockPreviewQuery(open);
  const mutation = useRestockLowStock();

  const [buffer, setBuffer] = useState<number>(DEFAULT_BUFFER);
  const [bufferText, setBufferText] = useState<string>(String(DEFAULT_BUFFER));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset state on each open so the next opening starts fresh.
  useEffect(() => {
    if (open) {
      setBuffer(DEFAULT_BUFFER);
      setBufferText(String(DEFAULT_BUFFER));
    }
  }, [open]);

  // Default-select every row whenever the preview rowset arrives. Wrap
  // around `rows.map(...).join(',')` so a row appearing/disappearing
  // resets the selection deterministically.
  const rows = query.data?.rows ?? [];
  const rowsKey = rows.map((r) => r.careUnitMedicationId).join(',');
  useEffect(() => {
    if (!rowsKey) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rowsKey.split(',')));
  }, [rowsKey]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBufferChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setBufferText(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_BUFFER) {
      setBuffer(parsed);
    }
  }

  function computeQuantity(currentStock: number, lowStockThreshold: number): number {
    return Math.max(1, lowStockThreshold - currentStock + buffer);
  }

  const bufferValid =
    bufferText.trim() !== '' &&
    Number.isFinite(Number(bufferText)) &&
    Number.isInteger(Number(bufferText)) &&
    Number(bufferText) >= 0 &&
    Number(bufferText) <= MAX_BUFFER;

  const canConfirm =
    bufferValid && selected.size > 0 && !mutation.isPending && !query.isLoading && !query.isError;

  async function handleConfirm() {
    if (!canConfirm) return;
    const response = await mutation.mutateAsync({
      buffer,
      careUnitMedicationIds: Array.from(selected),
    });
    onOpenChange(false);
    navigate(`/bestallningar/${response.id}?from=utkast`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Beställ påfyllning av läkemedel under tröskel</DialogTitle>
          <DialogDescription>
            Välj antal enheter över tröskel och vilka läkemedel som ska ingå.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-end">
          <div>
            <Label htmlFor="restock-buffer" className="text-sm">
              Enheter över tröskel (X)
            </Label>
            <p className="text-xs text-muted-foreground">
              Antal per rad blir <code>max(1, tröskel − lager + X)</code>.
            </p>
          </div>
          <Input
            id="restock-buffer"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_BUFFER}
            value={bufferText}
            onChange={handleBufferChange}
            aria-invalid={!bufferValid}
            className="w-full"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded border border-border">
          {query.isLoading && (
            <div className="p-4 space-y-2" data-testid="restock-dialog-loading">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {query.isError && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertDescription>
                  Kunde inte hämta lagernivåer — stäng och försök igen.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {!query.isLoading && !query.isError && rows.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Inga läkemedel under tröskel.
            </p>
          )}

          {!query.isLoading && !query.isError && rows.length > 0 && (
            <ul role="list" className="divide-y divide-border">
              {(() => {
                // Partition so in-flight (non-`levererad` overlap) rows
                // render first under their own sub-header — easy to overlook
                // when buried in a long list. Within each group the server's
                // urgency order is preserved.
                const inFlightRows = rows.filter((r) => r.inFlightQuantity > 0);
                const otherRows = rows.filter((r) => r.inFlightQuantity === 0);

                function renderRow(row: typeof rows[number]) {
                  const checked = selected.has(row.careUnitMedicationId);
                  const quantity = computeQuantity(row.currentStock, row.lowStockThreshold);
                  const inFlight = row.inFlightQuantity;
                  const inFlightLabel =
                    row.inFlightOrders.length === 1
                      ? `Redan beställd: ${inFlight} st i ${row.inFlightOrders[0]!.orderNumber}`
                      : `Redan beställd: ${inFlight} st i ${row.inFlightOrders.length} öppna beställningar`;
                  return (
                    <li
                      key={row.careUnitMedicationId}
                      role="listitem"
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(row.careUnitMedicationId)}
                        aria-label={`Inkludera ${row.name}`}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Lager {row.currentStock} / tröskel {row.lowStockThreshold} → beställ{' '}
                          <span className="font-semibold text-foreground">{quantity}</span> st
                        </div>
                        {inFlight > 0 && (
                          <div className="mt-1">
                            <Badge
                              variant="outline"
                              className="border-amber-500 text-amber-700 font-normal"
                              title={row.inFlightOrders
                                .map((o) => `${o.orderNumber} (${o.quantity} st)`)
                                .join(', ')}
                            >
                              {inFlightLabel}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <>
                    {inFlightRows.length > 0 && (
                      <li
                        role="presentation"
                        className="bg-amber-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800"
                      >
                        Redan beställda (ej processade)
                      </li>
                    )}
                    {inFlightRows.map(renderRow)}
                    {inFlightRows.length > 0 && otherRows.length > 0 && (
                      <li
                        role="presentation"
                        className="bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Övriga under tröskel
                      </li>
                    )}
                    {otherRows.map(renderRow)}
                  </>
                );
              })()}
            </ul>
          )}
        </div>

        <p
          className={cn(
            'text-xs',
            selected.size === 0 && rows.length > 0
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {rows.length > 0
            ? `${selected.size} av ${rows.length} valda`
            : ' '}
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Skapa beställning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
