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
 * Phase 4 D-83 / UI-SPEC §4 — Deliver Order confirmation AlertDialog.
 *
 * Mirrors DiscardDraftDialog.tsx exactly (both extend the same Phase 2/3 AlertDialog pattern).
 *
 * Key design decisions (inherited from the discard dialog precedent):
 *
 * 1. Cancel is rendered BEFORE Action so shadcn's default focus management
 *    lands on Cancel — the safer default for an irreversible action (UI-SPEC §3).
 *
 * 2. `e.preventDefault()` on the Action's onClick prevents auto-dismiss before
 *    the mutation resolves. The caller closes the dialog after `mutateAsync` succeeds.
 *
 * 3. Action button disabled while `isDelivering` to prevent double-confirm.
 *    Cancel also disabled while delivering (prevents race where user cancels
 *    after mutation is already in flight).
 *
 * 4. Action uses default styling (not destructive) per UI-SPEC §4: stock additions
 *    are not deletions; the description copy is the warning signal.
 *
 * Copy locked per UI-SPEC §Copywriting Contract:
 *   Title:       'Markera som levererad?'
 *   Description: 'Stocken uppdateras direkt. Detta kan inte ångras.'
 *   Cancel:      'Avbryt'
 *   Action:      'Markera levererad' / 'Levererar…' (with spinner when isDelivering)
 */

export interface DeliverConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDelivering: boolean;
}

export function DeliverConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isDelivering,
}: DeliverConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Markera som levererad?</AlertDialogTitle>
          <AlertDialogDescription>
            Stocken uppdateras direkt. Detta kan inte ångras.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/*
           * Cancel FIRST so shadcn's default focus management lands here
           * (the safer default for irreversible actions — UI-SPEC §3).
           */}
          <AlertDialogCancel disabled={isDelivering}>Avbryt</AlertDialogCancel>

          {/*
           * Default (not destructive) styling: stock additions are not deletions;
           * the description copy above is the warning signal (UI-SPEC §4).
           * e.preventDefault() stops Radix from auto-dismissing before mutation runs.
           */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDelivering}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDelivering ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Levererar…
              </>
            ) : (
              'Markera levererad'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
