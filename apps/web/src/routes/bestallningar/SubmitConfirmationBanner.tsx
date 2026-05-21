import { CheckCircle2 } from 'lucide-react';

/**
 * Phase 3 D-68 / D-70 / UI-SPEC §12 — Submit Confirmation Banner (Mode B).
 *
 * Presentational component — no props, no state machinery needed.
 * `role="status"` triggers a non-interrupting screen-reader announcement
 * when the component mounts (i.e., when the page transitions into Mode B
 * after submit). Not dismissible — stays visible while the order is Skickad.
 *
 * Geometry mirrors LowStockBadge.tsx's informational accent variant:
 *   rounded-lg border border-primary/20 bg-primary/10 text-primary
 *
 * The literal copy 'Beställningen är skickad till apotekare.' is locked
 * per D-70 Swedish UI vocabulary.
 */
export function SubmitConfirmationBanner() {
  return (
    <div
      role="status"
      className="mt-4 mx-4 sm:mx-0 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      Beställningen är skickad till apotekare.
    </div>
  );
}
