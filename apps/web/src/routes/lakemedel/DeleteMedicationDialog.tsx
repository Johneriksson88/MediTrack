import { Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

/**
 * Phase 2 D-37 / UI-SPEC §7 / CAT-07 — Delete confirmation AlertDialog.
 *
 * Renders a shadcn AlertDialog asking the user to confirm soft-deletion of a
 * CareUnitMedication. Key design decisions:
 *
 * 1. Cancel is rendered BEFORE Action so shadcn's default focus management
 *    lands on Cancel (the safer default for a destructive action — UI-SPEC §7).
 *
 * 2. AlertDialogAction does NOT accept a `variant` prop — destructive styling
 *    must be applied via `className`, NOT `variant="destructive"`.
 *
 * 3. `e.preventDefault()` on the Action's onClick prevents the dialog from
 *    auto-closing before the mutation resolves. The caller closes the dialog
 *    manually after `mutateAsync` succeeds (or catches and leaves it open).
 *
 * 4. Cancel is disabled while delete is in-flight (`isDeleting`) to prevent
 *    dialog-close races (T-02-20).
 *
 * Props:
 *   open           — controlled open state
 *   onOpenChange   — setter (used by Cancel + Radix overlay click)
 *   medicationName — interpolated into the AlertDialogTitle
 *   careUnitName   — interpolated into the AlertDialogTitle
 *   onConfirm      — called when the user clicks Ta bort (not auto-dismissed)
 *   isDeleting     — drives the Loader2 spinner + disabled states
 */

export interface DeleteMedicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationName: string;
  careUnitName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteMedicationDialog({
  open,
  onOpenChange,
  medicationName,
  careUnitName,
  onConfirm,
  isDeleting,
}: DeleteMedicationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* D-37 / UI-SPEC §7: locked Swedish copy */}
          <AlertDialogTitle>
            {`Ta bort ${medicationName} från ${careUnitName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Läkemedlet finns kvar i NPL-registret och kan läggas till igen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/*
           * Cancel FIRST so shadcn's default focus management lands here
           * (the safer default for destructive actions — UI-SPEC §7).
           * Disabled while delete is in-flight to prevent dialog-close races (T-02-20).
           */}
          <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>

          {/*
           * AlertDialogAction: destructive styling via className (NOT variant prop).
           * e.preventDefault() stops Radix from auto-dismissing before mutation runs.
           */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className={cn(
              'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              isDeleting && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tar bort…
              </>
            ) : (
              'Ta bort'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
