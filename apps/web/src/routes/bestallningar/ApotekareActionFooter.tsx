import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Phase 4 D-83 — Shared sticky-action footer for apotekare workflow transitions.
 *
 * Used by Mode C (confirm) in Slice A and Mode D (deliver) in Slice B.
 * Matches ComposeStickyFooter geometry: mobile sticky bottom / desktop inline.
 *
 * Touch-target rule (D-10 / UI-SPEC §Spacing): min-h-[44px] on the button.
 */
interface ApotekareActionFooterProps {
  label: string;
  onClick: () => void;
  isPending: boolean;
  loadingLabel?: string;
}

export function ApotekareActionFooter({
  label,
  onClick,
  isPending,
  loadingLabel = 'Sparar…',
}: ApotekareActionFooterProps) {
  return (
    <div className="mt-4 mx-4 sm:mx-0 md:flex md:justify-end">
      {/* Mobile: fixed sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 md:static md:bottom-auto p-4 md:p-0 bg-background/80 backdrop-blur-sm border-t md:border-none border-border md:bg-transparent md:backdrop-blur-none">
        <Button
          variant="default"
          className="min-h-[44px] w-full md:w-auto"
          onClick={onClick}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              {loadingLabel}
            </>
          ) : (
            label
          )}
        </Button>
      </div>
    </div>
  );
}
