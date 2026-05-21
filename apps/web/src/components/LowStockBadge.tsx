import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phase 2 D-38 / STK-04 / UI-SPEC §4 — Low-stock indicator pill.
 *
 * Renders a destructive shadcn Badge equivalent with an AlertTriangle icon
 * and the label 'Lågt lager'. No props — callers decide whether to render
 * based on `currentStock < lowStockThreshold`.
 *
 * Structural parallel to RoleBadge.tsx (DO NOT reuse or extend RoleBadge).
 * The two badges share visual lineage but have different semantics; coupling
 * them would require a refactor when Phase 3 adds status chips (Utkast/Skickad/…).
 *
 * Renders identically on table rows (≥md) and mobile cards (<md) per D-38.
 *
 * Accessibility: AlertTriangle is aria-hidden; 'Lågt lager' text is the
 * accessible label (no additional aria-label needed).
 */
export function LowStockBadge() {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        'bg-destructive text-destructive-foreground',
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      Lågt lager
    </span>
  );
}
