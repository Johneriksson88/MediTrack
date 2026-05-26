import { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useBulkRemoveMedications,
  useBulkRemovePreview,
} from '@/features/medications/useSortimentMutations';

export interface SortimentBulkRemoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** CareUnitMedication ids to soft-delete. Caller hides the dialog if empty. */
  careUnitMedicationIds: string[];
  /** Fired after a successful remove so the caller can clear its selection. */
  onSuccess: () => void;
}

/**
 * Confirm dialog for bulk-remove. Fires the preview endpoint on open to
 * surface the two warnings the admin needs to see before committing:
 *
 *   - in-flight order count: non-levererad orders that reference any of
 *     the selected rows via a line. Removing the row does NOT cancel the
 *     order — soft-delete preserves the FK — but new orders/lines for the
 *     same med will be blocked.
 *   - withStock count + units: rows where currentStock > 0. The stock is
 *     PRESERVED on a future bulk re-add (BE bulk-restore semantics — see
 *     bulkAddMedications service docs); we surface the count so the admin
 *     knows the inventory is paused, not lost.
 *
 * AlertDialog (vs Dialog) is the deliberate primitive choice: this action
 * is destructive and the AlertDialog primitive ships with the right ARIA
 * role + escape-to-cancel defaults.
 */
export function SortimentBulkRemoveDialog({
  open,
  onOpenChange,
  careUnitMedicationIds,
  onSuccess,
}: SortimentBulkRemoveDialogProps) {
  const preview = useBulkRemovePreview();
  const mutation = useBulkRemoveMedications();

  // Refire the preview every time the dialog opens with a non-empty selection.
  // We don't useQuery here because the selection body changes per open and
  // we want the request to fire on demand, not on cache invalidation.
  useEffect(() => {
    if (open && careUnitMedicationIds.length > 0) {
      preview.mutate({ careUnitMedicationIds });
    }
    if (!open) {
      preview.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, careUnitMedicationIds.join(',')]);

  async function handleConfirm() {
    if (mutation.isPending) return;
    await mutation.mutateAsync({ careUnitMedicationIds });
    onOpenChange(false);
    onSuccess();
  }

  const previewData = preview.data;
  const previewLoading = preview.isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Ta bort {careUnitMedicationIds.length} läkemedel från sortimentet?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Läkemedlen döljs i din vårdenhets register. Inget tas bort permanent —
            du kan lägga tillbaka dem från “Lägg till”-fliken senare.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {previewLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Räknar pågående beställningar…
          </div>
        )}

        {previewData && previewData.inFlightOrderCount > 0 && (
          <Alert variant="default" className="border-amber-500/40 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
            <AlertDescription className="text-amber-900">
              {previewData.inFlightOrderCount === 1
                ? '1 pågående beställning innehåller något av dessa läkemedel.'
                : `${previewData.inFlightOrderCount} pågående beställningar innehåller något av dessa läkemedel.`}{' '}
              De pågående beställningarna påverkas inte, men nya beställningar
              kan inte läggas för dessa läkemedel innan de läggs tillbaka.
            </AlertDescription>
          </Alert>
        )}

        {previewData && previewData.withStockCount > 0 && (
          <Alert variant="default" className="border-amber-500/40 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
            <AlertDescription className="text-amber-900">
              {previewData.withStockCount === 1
                ? `1 läkemedel har lagersaldo (${previewData.withStockUnits} enheter).`
                : `${previewData.withStockCount} läkemedel har lagersaldo (${previewData.withStockUnits} enheter totalt).`}{' '}
              Lagersaldot bevaras och återställs om läkemedlet läggs till igen.
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Ta bort {careUnitMedicationIds.length} läkemedel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
