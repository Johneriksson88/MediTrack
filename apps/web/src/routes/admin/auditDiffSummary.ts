import { AUDIT_ENTITY_TYPE_LABELS } from '@meditrack/shared';
import type { AuditEventResponse } from '@meditrack/shared';

/**
 * Phase 5 UI-SPEC §3 Diff Compact Format — single-line summary string.
 *
 * Rendered in the Diff column on md+ and as the fourth row in mobile
 * cards. The full Fält/Före/Efter triplet table only appears in the
 * expanded panel (AuditDiffPanel).
 *
 * Patterns (locked):
 *   - Single-key UPDATE: `status: skickad → bekraftad`
 *   - Multi-key UPDATE:  `status: bekraftad → levererad +2 fält`
 *   - CREATE:            `Skapad: läkemedel · Paracetamol` (entityType label · name? if present)
 *   - DELETE:            `Borttagen: läkemedel · Aspirin`
 *
 * Long values truncate at 40 chars with `…` suffix.
 *
 * For UPDATE pickerKey heuristic: prefer `status` > `currentStock` >
 * first key alphabetically. The diff cell shows the most-likely-relevant
 * change first; the full diff is in the expanded panel.
 */

const MAX_VAL_LEN = 40;

function truncate(s: string): string {
  return s.length > MAX_VAL_LEN ? `${s.slice(0, MAX_VAL_LEN - 1)}…` : s;
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return truncate(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // object/array — short JSON representation
  try {
    return truncate(JSON.stringify(v));
  } catch {
    return '[…]';
  }
}

function entityLabel(entityType: string): string {
  return (AUDIT_ENTITY_TYPE_LABELS as Record<string, string>)[entityType] ?? entityType;
}

/**
 * Compute the list of changed keys for an UPDATE event (deep-equal via
 * JSON.stringify, which is acceptable because the allowlisted columns
 * keep the JSONs small and key-stable).
 */
export function computeChangedKeys(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!before || !after) return [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

function pickPrimaryKey(changedKeys: string[]): string {
  if (changedKeys.includes('status')) return 'status';
  if (changedKeys.includes('currentStock')) return 'currentStock';
  return [...changedKeys].sort()[0]!;
}

export function diffSummary(event: AuditEventResponse): string {
  const before = (event.before ?? null) as Record<string, unknown> | null;
  const after = (event.after ?? null) as Record<string, unknown> | null;

  // CREATE — only `after`
  if (!before && after) {
    const name = typeof after['name'] === 'string' ? ` · ${after['name']}` : '';
    return `Skapad: ${entityLabel(event.entityType)}${name}`;
  }

  // DELETE — only `before`
  if (before && !after) {
    const name = typeof before['name'] === 'string' ? ` · ${before['name']}` : '';
    return `Borttagen: ${entityLabel(event.entityType)}${name}`;
  }

  // UPDATE — both present
  if (before && after) {
    const changed = computeChangedKeys(before, after);
    if (changed.length === 0) return '(ingen ändring)';
    const primary = pickPrimaryKey(changed);
    const head = `${primary}: ${renderVal(before[primary])} → ${renderVal(after[primary])}`;
    if (changed.length === 1) return head;
    return `${head} +${changed.length - 1} fält`;
  }

  // Both null — shouldn't happen in practice; render a neutral marker
  return '(ingen data)';
}
