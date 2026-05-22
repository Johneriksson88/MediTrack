import { AUDIT_ACTION_LABELS, type AuditAction } from '@meditrack/shared';
import { cn } from '@/lib/utils';

/**
 * Phase 5 UI-SPEC §6 — Action chip primitive (parallel to OrderStatusPill).
 *
 * Mirrors `<OrderStatusPill>`'s shape and discipline:
 *   - inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold
 *   - No icon — text + locked color is the signal (WCAG 1.4.1 — text always present)
 *
 * Color map locked per UI-SPEC §Action Chip Color Map. Categories grouped by
 * semantic meaning (creation / lifecycle / removal / auth) so the palette
 * tells a story when the admin scrolls.
 *
 * Defensive fallback: `action` is OPEN on the API boundary (D-104 footer —
 * `z.string()`). A future Phase 6 action not yet in AUDIT_ACTIONS would
 * arrive as an unknown string; we render it as neutral slate rather than
 * crashing on the missing map entry. The label-map exhaustiveness still
 * holds for the known set.
 */
const ACTION_CLASS: Record<AuditAction, string> = {
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-slate-100 text-slate-700',
  delete: 'bg-destructive/10 text-destructive',
  'order.submit': 'bg-blue-100 text-blue-800',
  'order.confirm': 'bg-amber-100 text-amber-800',
  'order.deliver': 'bg-emerald-100 text-emerald-800',
  'order.softDelete': 'bg-destructive/10 text-destructive',
  'stock.increment': 'bg-emerald-100 text-emerald-800',
  'auth.login': 'bg-slate-100 text-slate-700',
  'auth.logout': 'bg-slate-100 text-slate-700',
  'auth.login_failed': 'bg-destructive/10 text-destructive',
};

const UNKNOWN_ACTION_CLASS = 'bg-slate-100 text-slate-700';

export interface AuditActionChipProps {
  action: string;
}

export function AuditActionChip({ action }: AuditActionChipProps) {
  const classes = (ACTION_CLASS as Record<string, string>)[action] ?? UNKNOWN_ACTION_CLASS;
  const label = (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        classes,
      )}
    >
      {label}
    </span>
  );
}
