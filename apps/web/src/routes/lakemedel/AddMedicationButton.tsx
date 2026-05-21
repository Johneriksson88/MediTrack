import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Can } from '@/auth/Can';

/**
 * Phase 2 D-35 — Add medication trigger: desktop button + mobile FAB.
 *
 * Desktop: <Button> in the page heading row (hidden on <md because the FAB
 *   handles mobile — both are rendered but CSS controls visibility).
 * Mobile FAB: fixed bottom-right above the 56px bottom tab bar +
 *   env(safe-area-inset-bottom), z-50, circular 56x56.
 *
 * Both are gated by <Can action="medication:create"> so sjuksköterska
 * never sees them — the FE gate mirrors the BE requirePermission (D-43).
 */

interface AddMedicationButtonProps {
  onCreate: () => void;
}

export function AddMedicationButton({ onCreate }: AddMedicationButtonProps) {
  return (
    <>
      {/* Desktop button — hidden on mobile */}
      <Can action="medication:create">
        <Button
          onClick={onCreate}
          type="button"
          className="hidden md:inline-flex"
        >
          Lägg till läkemedel
        </Button>
      </Can>

      {/* Mobile FAB — above the 56px bottom tab bar + safe-area-inset-bottom */}
      <Can action="medication:create">
        <button
          type="button"
          onClick={onCreate}
          className="fixed right-4 bottom-[calc(56px+env(safe-area-inset-bottom)+16px)]
                     z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground
                     shadow-lg md:hidden flex items-center justify-center
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                     focus-visible:ring-offset-2"
          aria-label="Lägg till läkemedel"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      </Can>
    </>
  );
}
