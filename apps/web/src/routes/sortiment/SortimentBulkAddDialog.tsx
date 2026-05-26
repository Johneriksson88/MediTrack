import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { BulkAddCandidate } from '@meditrack/shared';
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
import { useBulkAddMedications } from '@/features/medications/useSortimentMutations';

export interface SortimentBulkAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Selected candidate rows — the dialog displays one editable threshold
   * row per item. Length must be ≥ 1; the caller hides the dialog when
   * nothing is selected.
   */
  candidates: BulkAddCandidate[];
  /** Fired after a successful add so the caller can clear its selection. */
  onSuccess: () => void;
}

const DEFAULT_THRESHOLD = 5;
const MAX_THRESHOLD = 100000;

/**
 * Confirm dialog for bulk-add. The admin sets a single "Standardtröskel"
 * value applied to every selected row; individual rows are editable via
 * the per-row input so common per-row exceptions don't force the admin
 * back to the list.
 *
 * Stock is always 0 on add (the design assumes a fresh count after
 * sortiment changes). Restore preserves stock server-side regardless of
 * what we send here — the per-row inputs only control threshold.
 */
export function SortimentBulkAddDialog({
  open,
  onOpenChange,
  candidates,
  onSuccess,
}: SortimentBulkAddDialogProps) {
  const mutation = useBulkAddMedications();

  const [defaultThresholdText, setDefaultThresholdText] = useState<string>(
    String(DEFAULT_THRESHOLD),
  );
  /**
   * Per-row threshold overrides. Stored as raw text so partial input
   * ("" while typing) doesn't reset to a stale number. Missing key →
   * row inherits the default. Invalid string → row inherits the default
   * at submit time (defensive — same fallback used for blank inputs).
   */
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // Reset state on every open so a re-opened dialog starts clean.
  useEffect(() => {
    if (open) {
      setDefaultThresholdText(String(DEFAULT_THRESHOLD));
      setOverrides({});
    }
  }, [open]);

  const parsedDefault = Number(defaultThresholdText);
  const defaultValid =
    defaultThresholdText.trim() !== '' &&
    Number.isFinite(parsedDefault) &&
    Number.isInteger(parsedDefault) &&
    parsedDefault > 0 &&
    parsedDefault <= MAX_THRESHOLD;

  /**
   * Coerce a raw override input to the final threshold integer applied at
   * submit. Empty / non-numeric / non-positive falls back to the default
   * (same fallback as the BE's defensive defaultLowStockThreshold).
   */
  function resolveThreshold(medicationId: string): number {
    const raw = overrides[medicationId];
    if (raw === undefined) return parsedDefault;
    const trimmed = raw.trim();
    if (trimmed === '') return parsedDefault;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > MAX_THRESHOLD) {
      return parsedDefault;
    }
    return n;
  }

  const items = useMemo(
    () =>
      candidates.map((c) => ({
        medicationId: c.medicationId,
        lowStockThreshold: resolveThreshold(c.medicationId),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, overrides, parsedDefault],
  );

  const canConfirm = defaultValid && candidates.length > 0 && !mutation.isPending;

  async function handleConfirm() {
    if (!canConfirm) return;
    await mutation.mutateAsync({ items });
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lägg till i sortimentet</DialogTitle>
          <DialogDescription>
            {candidates.length} läkemedel valda. Sätt en gemensam tröskel — du
            kan justera enskilda rader nedan innan du lägger till.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-end">
          <div>
            <Label htmlFor="bulk-add-default-threshold" className="text-sm">
              Standardtröskel
            </Label>
            <p className="text-xs text-muted-foreground">
              Tillämpas på alla rader om inget annat anges. Lager börjar på 0.
            </p>
          </div>
          <Input
            id="bulk-add-default-threshold"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_THRESHOLD}
            value={defaultThresholdText}
            onChange={(e) => setDefaultThresholdText(e.target.value)}
            aria-invalid={!defaultValid}
            className="w-full"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded border border-border">
          <ul role="list" className="divide-y divide-border">
            {candidates.map((c) => {
              const override = overrides[c.medicationId];
              const effective = resolveThreshold(c.medicationId);
              return (
                <li
                  key={c.medicationId}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {c.atcCode} · {c.form}
                      {c.strength ? ` · ${c.strength}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_THRESHOLD}
                      placeholder={String(parsedDefault || DEFAULT_THRESHOLD)}
                      value={override ?? ''}
                      onChange={(e) =>
                        setOverrides((prev) => ({
                          ...prev,
                          [c.medicationId]: e.target.value,
                        }))
                      }
                      aria-label={`Tröskel för ${c.name}`}
                      className="w-24 text-right"
                    />
                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                      Tillämpas: {effective}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

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
            Lägg till {candidates.length} läkemedel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
