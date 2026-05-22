import { AUDIT_ENTITY_TYPE_LABELS, type AuditEntityType } from '@meditrack/shared';
import { cn } from '@/lib/utils';

/**
 * Phase 5 UI-SPEC §7 — Entity-type chip primitive.
 *
 * Uniform neutral slate palette — entity type is metadata, not state.
 * Matches Phase 2 NplBadge aesthetic so it doesn't compete with action
 * chips for attention.
 *
 * Shape: `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold`.
 * `rounded-md` (NOT `rounded-full`) so it reads as a category tag, not a status pill.
 *
 * Defensive fallback: `type` is OPEN on the API boundary (D-104 footer —
 * `z.string()`). Unknown entity types render the raw value with the same
 * neutral palette, never crashing on a missing map entry.
 */
const UNIFORM_CLASS = 'bg-slate-100 text-slate-600';

export interface AuditEntityTypeChipProps {
  type: string;
}

export function AuditEntityTypeChip({ type }: AuditEntityTypeChipProps) {
  const label = (AUDIT_ENTITY_TYPE_LABELS as Record<string, string>)[type] ?? type;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        UNIFORM_CLASS,
      )}
    >
      {label}
    </span>
  );
}

// Re-export the type for callers that want to narrow at the call site.
export type { AuditEntityType };
