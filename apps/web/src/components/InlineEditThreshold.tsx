import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { useCan } from '@/auth/useCan';
import { useUpdateThresholdOptimistic } from '@/features/medications/useMedicationMutations';

/**
 * Phase 2 D-41 / D-42 / UI-SPEC §5 — Inline-edit threshold widget.
 *
 * D-41: Threshold is editable via TWO surfaces: the Sheet (via useUpdateMedication,
 *   pessimistic) and this inline widget (via useUpdateThresholdOptimistic, optimistic).
 *
 * D-42 mixed mutation strategy: this component is OPTIMISTIC — clicking the
 *   number and pressing Enter flips the displayed value immediately (before the
 *   PATCH resolves). On error: cache snapshot is restored + toast error fires.
 *   The Sheet uses a separate pessimistic hook. The two surfaces are intentionally
 *   different, scoped per surface as documented in PATTERNS.md.
 *
 * UI-SPEC §5 interaction states:
 *   - Idle: underline-dotted number, click/Enter/Space to enter edit mode.
 *   - Editing: number input, autofocused, full-select on focus.
 *   - Pending: input disabled to prevent double-submit.
 *   - Error: destructive border on input (alongside the sonner toast).
 *
 * RBAC: renders a non-interactive bare number for sjukskoterska
 *   (useCan('medication:update') is false); shows the interactive widget for
 *   apotekare/admin (D-17 defense-in-depth, UI-SPEC §5).
 *
 * stopPropagation: every event handler calls e.stopPropagation() to prevent
 *   the parent <TableRow> / <MedicationCard> click handler from also firing
 *   and opening the Sheet when the threshold cell is clicked.
 */

interface InlineEditThresholdProps {
  careUnitMedicationId: string;
  medicationName: string;
  value: number;
}

export function InlineEditThreshold({
  careUnitMedicationId,
  medicationName,
  value,
}: InlineEditThresholdProps) {
  const canUpdate = useCan('medication:update');
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const mutation = useUpdateThresholdOptimistic();
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync localValue when the parent receives a new server-authoritative value
  // (e.g., after a successful PATCH + invalidation refetch).
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Autofocus and select on edit mode transition.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Non-interactive fallback for sjukskoterska (no click affordance).
  if (!canUpdate) {
    return <span className="text-sm">{value}</span>;
  }

  function startEditing(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    setEditing(true);
  }

  async function commit() {
    // No-op if value unchanged.
    if (localValue === value) {
      setEditing(false);
      return;
    }
    // Silently revert if invalid (non-finite or below min=1).
    if (!isFinite(localValue) || localValue < 1) {
      setLocalValue(value);
      setEditing(false);
      return;
    }
    try {
      await mutation.mutateAsync({ careUnitMedicationId, lowStockThreshold: localValue });
      setEditing(false);
    } catch {
      // Stay in editing state so the user can retry or Esc-cancel.
      // The hook's onError already fired the toast and rolled back the cache.
    }
  }

  function cancel(e?: React.KeyboardEvent) {
    e?.stopPropagation();
    setLocalValue(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={1}
        aria-label="Tröskel"
        value={localValue}
        disabled={mutation.isPending}
        className={
          mutation.isError
            ? 'w-20 h-7 text-sm border-destructive focus-visible:ring-destructive'
            : 'w-20 h-7 text-sm'
        }
        onChange={(e) => {
          e.stopPropagation();
          setLocalValue(Number(e.target.value));
        }}
        onFocus={(e) => {
          e.stopPropagation();
          e.target.select();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            cancel(e);
          }
        }}
        onBlur={(e) => {
          e.stopPropagation();
          void commit();
        }}
      />
    );
  }

  // Idle: interactive underline-dotted span.
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Redigera tröskel för ${medicationName}`}
      className="cursor-pointer select-none underline decoration-dotted underline-offset-2 text-sm"
      onClick={(e) => startEditing(e)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing(e);
        }
      }}
    >
      {value}
    </span>
  );
}
