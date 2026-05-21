import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * Phase 2 UI-SPEC §9 — Low-stock count banner.
 *
 * Renders a dismissible alert bar when belowThresholdTotal > 0.
 * Dismiss is stored in sessionStorage so it resets on browser close
 * but persists during the current tab session (UX compromise: don't
 * nag the user on every interaction within the same session).
 *
 * role="alert" for screen readers (D-22, STK-04).
 */

const DISMISSED_KEY = 'lakemedel-banner-dismissed';

interface LowStockBannerProps {
  belowThresholdTotal: number;
}

export function LowStockBanner({ belowThresholdTotal }: LowStockBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(
    () => sessionStorage.getItem(DISMISSED_KEY) === 'true'
  );

  if (belowThresholdTotal <= 0 || dismissed) return null;

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <span>
        <strong>{belowThresholdTotal}</strong> läkemedel under tröskel
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-4 rounded p-0.5 hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        aria-label="Stäng varning"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
