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

/**
 * Phase 3 D-67 / D-70 / UI-SPEC §10 — Discard Draft confirmation AlertDialog.
 *
 * Mirrors DeleteMedicationDialog.tsx's AlertDialog structure exactly.
 *
 * Key design decisions (inherited from the medication-delete analog):
 *
 * 1. Cancel is rendered BEFORE Action so shadcn's default focus management
 *    lands on Cancel — the safer default for a destructive action (UI-SPEC §10).
 *
 * 2. AlertDialogAction styling is inline `className` (NOT `variant="destructive"`)
 *    because AlertDialogAction is a styled <Button> whose variant prop is not
 *    directly "destructive". Apply destructive styles via `className`.
 *
 * 3. `e.preventDefault()` on the Action's onClick prevents auto-dismiss before
 *    the mutation resolves. The caller closes the dialog after `mutateAsync` succeeds.
 *
 * 4. Action button disabled while `isDeleting` to prevent double-confirm.
 *
 * Copy locked per D-70:
 *   Title:       'Kasta detta utkast?'
 *   Description: 'Utkastet tas bort permanent.'
 *   Cancel:      'Avbryt'
 *   Action:      'Kasta' / 'Kastar…' (with spinner when isDeleting)
 */

export interface DiscardDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DiscardDraftDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DiscardDraftDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kasta detta utkast?</AlertDialogTitle>
          <AlertDialogDescription>Utkastet tas bort permanent.</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/*
           * Cancel FIRST so shadcn's default focus management lands here
           * (the safer default for destructive actions — UI-SPEC §10).
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
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Kastar…
              </>
            ) : (
              'Kasta'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
