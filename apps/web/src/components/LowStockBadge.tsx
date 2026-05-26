import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phase 2 D-38 / STK-04 / UI-SPEC §4 — Low-stock indicator pill.
 *
 * Renders a destructive shadcn Badge equivalent with an AlertTriangle icon
 * only. No props — callers decide whether to render based on
 * `currentStock < lowStockThreshold`.
 *
 * Structural parallel to RoleBadge.tsx (DO NOT reuse or extend RoleBadge).
 * The two badges share visual lineage but have different semantics; coupling
 * them would require a refactor when Phase 3 adds status chips (Utkast/Skickad/…).
 *
 * Renders identically on table rows (≥md) and mobile cards (<md) per D-38.
 *
 * Accessibility: 'Lågt lager' is exposed via aria-label on the badge since
 * the icon-only rendering has no visible text.
 */
export function LowStockBadge() {
  return (
    <span
      role="img"
      aria-label="Lågt lager"
      className={cn(
        'inline-flex items-center justify-center rounded-full p-1',
        'bg-destructive text-destructive-foreground',
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}
