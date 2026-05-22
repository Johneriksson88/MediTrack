import { CheckCircle2 } from 'lucide-react';
import type { OrderResponse } from '@meditrack/shared';

/**
 * Phase 3 D-68 / D-70 / UI-SPEC §12 — Submit Confirmation Banner (Mode B).
 *
 * WR-08 fix — the banner now requires (a) order.status === 'skickad' AND
 * (b) the page is observing the in-session submit transition (justSubmitted).
 * `role="status"` triggers a non-interrupting screen-reader announcement
 * only on the mount transition; many ATs do NOT announce role="status"
 * content that's already present in the DOM on initial page load. By
 * gating on justSubmitted, deep-link refreshes don't render the banner
 * at all (avoiding silent a11y failures), and in-session submits get
 * the announcement they were designed for.
 *
 * Phase 4 will introduce parallel banners for bekraftad and levererad;
 * branching on status here (rather than blindly rendering for !utkast)
 * keeps each transition's copy distinct.
 *
 * The literal copy 'Beställningen är skickad till apotekare.' is locked
 * per D-70 Swedish UI vocabulary.
 */
interface SubmitConfirmationBannerProps {
  /** The current order status — banner copy branches on this. */
  status: OrderResponse['status'];
  /**
   * Whether the page just observed a successful submit in this session.
   * When false, the banner does NOT render — even if status === 'skickad'.
   * The submit transition observer (ComposeOrderPage) is the only place
   * that knows the difference between "page loaded with skickad order"
   * (no banner — D-68 deep-link case) and "user just clicked Skicka and
   * the cache hydrated" (banner + a11y announcement).
   */
  justSubmitted: boolean;
}

export function SubmitConfirmationBanner({
  status,
  justSubmitted,
}: SubmitConfirmationBannerProps) {
  // WR-08: only render on the in-session submit transition (skickad).
  // Phase 4 will widen this to handle bekraftad / levererad with their own copy.
  if (!justSubmitted || status !== 'skickad') return null;

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
