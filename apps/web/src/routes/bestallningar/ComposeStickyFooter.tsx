import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Can } from '@/auth/Can';
import type { OrderLineResponse } from '@meditrack/shared';

/**
 * Phase 3 D-56 / D-67 / D-71 / UI-SPEC §8 — Sticky compose-view footer (Mode A only).
 *
 * Mobile (<md): fixed bottom-0, z-40, pb-[calc(1rem+56px+env(safe-area-inset-bottom))]
 *   to clear the 56px bottom tab bar + iOS home indicator.
 *   Button row: [Kasta]  [Lägg till läkemedel]  [Skicka beställning]
 *
 * Desktop (≥md): sticky bottom-0 inside scroll container (not fixed to viewport).
 *   [Kasta] left · summary middle · [Lägg till läkemedel] [Skicka beställning] right
 *
 * Submit disabled predicate (D-56): lines.length === 0 || any line.quantity <= 0
 * Tooltip on disabled: 'Lägg till minst en rad för att skicka.'
 *
 * Submit + Kasta onClick handlers are TODO Slice 4 — buttons render as inert
 * placeholders here so Slice 3 can ship a complete Mode A layout.
 * onAddClick is called by both the mobile footer trigger and the desktop button.
 */

interface ComposeStickyFooterProps {
  lines: OrderLineResponse[];
  onAddClick: () => void;
  onKastaClick: () => void;
  onSubmitClick: () => void;
  isSubmitting?: boolean;
}

export function ComposeStickyFooter({
  lines,
  onAddClick,
  onKastaClick,
  onSubmitClick,
  isSubmitting = false,
}: ComposeStickyFooterProps) {
  const lineCount = lines.length;
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const isSubmitDisabled =
    lineCount === 0 || lines.some((l) => l.quantity <= 0) || isSubmitting;

  const summaryText = `${lineCount} rader · totalt ${totalQuantity}`;

  const submitButton = (
    <Button
      variant="default"
      disabled={isSubmitDisabled}
      className="flex-1 md:flex-none min-w-[160px]"
      onClick={onSubmitClick}
      // TODO Slice 4: wire useSubmitOrder
    >
      {isSubmitting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
          Skickar…
        </>
      ) : (
        'Skicka beställning'
      )}
    </Button>
  );

  return (
    <TooltipProvider>
      {/* ── Mobile footer (<md) ── */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-[0_-1px_3px_rgba(0,0,0,0.05)] p-4 pb-[calc(1rem+56px+env(safe-area-inset-bottom))] md:hidden"
        aria-label="Beställningsåtgärder"
      >
        {/* Summary line */}
        <p className="text-sm text-muted-foreground mb-2">{summaryText}</p>

        {/* Button row */}
        <div className="flex items-center gap-2">
          <Can action="order:delete">
            <Button
              variant="destructive"
              onClick={onKastaClick}
              // TODO Slice 4: wire useDiscardOrder + DiscardDraftDialog
            >
              Kasta
            </Button>
          </Can>

          <Can action="order:update">
            <Button variant="outline" onClick={onAddClick} className="flex-1">
              Lägg till läkemedel
            </Button>
          </Can>

          <Can action="order:submit">
            {isSubmitDisabled && !isSubmitting ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1">
                    {submitButton}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Lägg till minst en rad för att skicka.</TooltipContent>
              </Tooltip>
            ) : (
              <span className="flex-1">{submitButton}</span>
            )}
          </Can>
        </div>
      </footer>

      {/* ── Desktop footer (≥md) ── */}
      <footer
        className="hidden md:flex items-center justify-between gap-4 sticky bottom-0 bg-background border-t border-border p-4"
        aria-label="Beställningsåtgärder"
      >
        {/* Left: Kasta */}
        <Can action="order:delete">
          <Button
            variant="destructive"
            onClick={onKastaClick}
            // TODO Slice 4: wire useDiscardOrder + DiscardDraftDialog
          >
            Kasta
          </Button>
        </Can>

        {/* Middle: summary */}
        <span className="text-sm text-muted-foreground flex-1">{summaryText}</span>

        {/* Right: Lägg till + Skicka */}
        <div className="flex items-center gap-2">
          <Can action="order:update">
            <Button variant="outline" onClick={onAddClick}>
              Lägg till läkemedel
            </Button>
          </Can>

          <Can action="order:submit">
            {isSubmitDisabled && !isSubmitting ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{submitButton}</span>
                </TooltipTrigger>
                <TooltipContent>Lägg till minst en rad för att skicka.</TooltipContent>
              </Tooltip>
            ) : (
              submitButton
            )}
          </Can>
        </div>
      </footer>
    </TooltipProvider>
  );
}
