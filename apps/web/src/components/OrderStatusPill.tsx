import type { OrderStatus } from '@meditrack/shared';
import { ORDER_STATUS_LABELS } from '@meditrack/shared';
import { cn } from '@/lib/utils';

/**
 * Phase 3 D-68 / UI-SPEC §11 / UI-SPEC §Color — Order status chip primitive.
 *
 * Renders all four ORDER_STATUS_LABELS with the locked color map so Phase 4
 * can add bekraftad/levererad transitions without modifying this component.
 *
 * Color map (UI-SPEC §Color):
 *   utkast    → slate-100/700  (neutral draft)
 *   skickad   → blue-100/800   (submitted, in-flight)
 *   bekraftad → amber-100/800  (confirmed by pharmacist)  — Phase 4 ready
 *   levererad → emerald-100/800 (delivered + stock updated) — Phase 4 ready
 *
 * No icon — text + color is the accessible label (WCAG AA contrast verified).
 *
 * Mirrors RoleBadge.tsx geometry (px-3 py-1 rounded-full text-xs font-semibold)
 * but with a different value set and semantics — do NOT reuse RoleBadge.
 */

const STATUS_CLASS: Record<OrderStatus, string> = {
  utkast: 'bg-slate-100 text-slate-700',
  skickad: 'bg-blue-100 text-blue-800',
  bekraftad: 'bg-amber-100 text-amber-800',
  levererad: 'bg-emerald-100 text-emerald-800',
};

export interface OrderStatusPillProps {
  status: OrderStatus;
}

export function OrderStatusPill({ status }: OrderStatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        STATUS_CLASS[status],
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
