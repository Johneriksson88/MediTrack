/**
 * Phase 2 Slice 2 — Filter row component: search input + ATC combobox + Form
 * select + below-threshold chip.
 *
 * D-39: all filter state is URL-deep-linkable (belowThreshold, atc, form, q).
 * D-44: the four filter values combine AND-wise on the same server query.
 * CAT-02: name search with 200 ms debounce.
 * CAT-03: ATC-kod prefix combobox.
 * CAT-04: Form dropdown with TOP_MEDICATION_FORMS + 'Övriga' catch-all.
 *
 * This component is CONTROLLED — it receives URL-derived props from
 * LakemedelPage and emits URL-patch events via `onChange`. No URL parsing
 * happens here; that responsibility stays with the page.
 *
 * UI-SPEC §8: four controls in `flex flex-wrap items-center gap-2 py-3`.
 * Threat T-02-10: 200 ms debounce caps client→API request rate.
 */

import { useEffect, useRef, useState } from 'react';
import {
  TOP_MEDICATION_FORMS,
  OVRIGA_FILTER_VALUE,
  type TherapeuticClass,
} from '@meditrack/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TherapeuticClassCombobox } from '@/components/TherapeuticClassCombobox';
import { AtcCodeCombobox } from '@/components/AtcCodeCombobox';

export interface LakemedelFilterProps {
  /** Current search query (empty string = unset). */
  q: string;
  /** Current ATC-kod prefix filter (empty string = unset). */
  atc: string;
  /** Current Form filter (empty string = unset, 'Övriga' = catch-all). */
  form: string;
  /** When true, only medications with currentStock < lowStockThreshold are shown. */
  belowThreshold: boolean;
  /**
   * Phase 6 AI-03 / D-116 — current therapeuticClass filter. Empty string
   * means "unset" (so the page can drive the prop from a URL param that
   * defaults to '' without needing a wrapper conversion).
   */
  therapeuticClass: TherapeuticClass | '';
  /**
   * Single patch emitter — every control calls this with the minimal changed
   * fields plus `page: 1` to reset pagination on any filter change.
   *
   * `therapeuticClass: undefined` clears the filter; any TherapeuticClass
   * value sets it. The page maps undefined ↔ URL param absence.
   */
  onChange: (patch: {
    q?: string;
    atc?: string;
    form?: string;
    belowThreshold?: boolean;
    therapeuticClass?: TherapeuticClass | undefined;
    page?: number;
  }) => void;
}

export function LakemedelFilter({
  q,
  atc,
  form,
  belowThreshold,
  therapeuticClass,
  onChange,
}: LakemedelFilterProps): JSX.Element {
  // --- A. Search input with 200 ms debounce ---
  // Local state mirrors `q` prop for immediate responsiveness.
  // Only fires onChange after the debounce delay (and only when changed).
  const [localQ, setLocalQ] = useState(q);
  const isFirstRender = useRef(true);

  // Sync external q changes (browser back/forward) back to local state.
  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  // Debounced onChange: fires 200 ms after the last keystroke.
  // Guard: skip the initial render so mounting doesn't trigger a spurious call.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Only emit when locally typed value differs from the URL-reflected prop.
    if (localQ === q) return;
    const t = setTimeout(() => {
      onChange({ q: localQ, page: 1 });
    }, 200);
    return () => clearTimeout(t);
  }, [localQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- C. Form select value ---
  // shadcn Select forbids value="" — use '__ALL__' sentinel for the "all forms" state.
  const formSelectValue = form === '' ? '__ALL__' : form;

  function handleFormChange(value: string) {
    onChange({ form: value === '__ALL__' ? '' : value, page: 1 });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {/* A. Search input — 200 ms debounce, UI-SPEC §8a */}
      <Input
        placeholder="Sök på namn…"
        value={localQ}
        onChange={(e) => setLocalQ(e.target.value)}
        className="w-full sm:w-[240px]"
        aria-label="Sök läkemedel på namn"
      />

      {/* Phase 6 D-116 — Terapeutisk klass combobox positioned LEFT of the
          ATC filter (leftmost combobox among the four-filter strip). The
          shared TherapeuticClassCombobox owns the 14-option Popover+Command
          shell; this file only owns the URL-state glue. */}
      <TherapeuticClassCombobox
        value={therapeuticClass || undefined}
        onChange={(next) => onChange({ therapeuticClass: next, page: 1 })}
        placeholder="Alla klasser"
        searchPlaceholder="Sök klass…"
        ariaLabel="Filtrera på terapeutisk klass"
        triggerClassName="min-w-[160px] flex-shrink-0"
        clearable
      />

      {/* B. ATC-kod combobox — Phase 8 D-134: shared AtcCodeCombobox replaces
          the hand-rolled Popover+Command block. The global ATC list (all distinct
          codes from the NPL catalog, ~3,000 entries) is sourced from
          useAtcCodesQuery() inside the component. The onChange contract is
          preserved: pick → onChange({ atc: code, page: 1 });
          clear → onChange({ atc: '', page: 1 }). UI-SPEC §Components §7. */}
      <AtcCodeCombobox
        value={atc}
        onChange={(next) => onChange({ atc: next, page: 1 })}
        placeholder="ATC-kod ▾"
        searchPlaceholder="Sök ATC-kod…"
        ariaLabel="Filtrera på ATC-kod"
        triggerClassName="min-w-[140px] flex-shrink-0"
        clearable
      />

      {/* C. Form select — shadcn Select, UI-SPEC §8c */}
      <Select value={formSelectValue} onValueChange={handleFormChange}>
        <SelectTrigger className="w-[180px]" aria-label="Filtrera på form">
          <SelectValue placeholder="Form" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__ALL__">Alla former</SelectItem>
          {TOP_MEDICATION_FORMS.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
          <SelectItem value={OVRIGA_FILTER_VALUE}>Övriga</SelectItem>
        </SelectContent>
      </Select>

      {/* D. Below-threshold chip — destructive tint when active, UI-SPEC §8d + D-39 */}
      <Button
        variant={belowThreshold ? 'secondary' : 'outline'}
        className={
          belowThreshold
            ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
            : ''
        }
        aria-pressed={belowThreshold}
        onClick={() => onChange({ belowThreshold: !belowThreshold, page: 1 })}
        type="button"
      >
        Visa endast under tröskel
      </Button>
    </div>
  );
}
