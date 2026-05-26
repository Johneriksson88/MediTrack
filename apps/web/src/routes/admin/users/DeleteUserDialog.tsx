import { Loader2 } from 'lucide-react';
import type { UserResponse } from '@meditrack/shared';
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
import { useDeleteUser } from '@/features/admin/useUsers';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserResponse | null;
}

export function DeleteUserDialog({ open, onOpenChange, user }: DeleteUserDialogProps) {
  const deleteUser = useDeleteUser();
  const isDeleting = deleteUser.isPending;

  async function handleConfirm() {
    if (!user) return;
    try {
      await deleteUser.mutateAsync({ id: user.id, name: user.name });
      onOpenChange(false);
    } catch {
      // Hook owns the toast; dialog stays open for retry.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {user ? `Ta bort ${user.name}?` : 'Ta bort konto?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Kontot tas bort permanent. Användarens historik (beställningar,
            granskningslogg) bevaras men inloggning är inte längre möjlig.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
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
