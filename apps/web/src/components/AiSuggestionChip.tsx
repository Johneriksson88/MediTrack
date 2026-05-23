import { THERAPEUTIC_CLASS_LABELS, type TherapeuticClass } from '@meditrack/shared';
import { ConfidenceBadge } from './ConfidenceBadge';
import { cn } from '@/lib/utils';

/**
 * Phase 6 D-110 / UI-SPEC §2 — Read-only AI suggestion chip.
 *
 * Renders the AI suggestion as `Förslag: <Swedish label>` + a
 * ConfidenceBadge. The chip is rendered above the editable `Slutgiltig
 * klass` combobox so accept-vs-override is visually explicit (D-110:
 * "override is visible"). The chip remains visible after the user picks
 * a different enum bucket — the user can see what they accepted/rejected.
 *
 * The "Använd förslag" button is rendered OUTSIDE this component (in
 * MedicationSheet) per UI-SPEC §2 — keeps the chip a pure read-only
 * display primitive.
 *
 * Layout: secondary surface tone (`bg-slate-50`) distinguishes the chip
 * visually from the user-editable Slutgiltig klass combobox below it.
 */
export interface AiSuggestionChipProps {
  therapeuticClass: TherapeuticClass;
  confidence: 'hog' | 'medel' | 'lag';
}

export function AiSuggestionChip({
  therapeuticClass,
  confidence,
}: AiSuggestionChipProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-slate-50 border border-border rounded-md px-3 py-2',
      )}
    >
      <span className="text-xs text-muted-foreground font-semibold">Förslag:</span>
      <span className="text-sm text-foreground">
        {THERAPEUTIC_CLASS_LABELS[therapeuticClass]}
      </span>
      <ConfidenceBadge confidence={confidence} />
    </div>
  );
}
