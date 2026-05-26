import { useEffect, useRef, useState } from 'react';
import {
  TOP_MEDICATION_FORMS,
  OVRIGA_FILTER_VALUE,
  type TherapeuticClass,
} from '@meditrack/shared';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TherapeuticClassCombobox } from '@/components/TherapeuticClassCombobox';
import { AtcCodeCombobox } from '@/components/AtcCodeCombobox';

/**
 * Filter row for the Sortiment "Lägg till" tab. Same four controls as
 * LakemedelFilter (search, therapeutic class, ATC, form) minus the
 * below-threshold chip (irrelevant here — these meds are not in sortiment).
 *
 * Same 200ms debounce on search, same emit-on-change semantics — the
 * page owns URL state and is the only place that decides what to write.
 */

export interface SortimentAddFilterProps {
  q: string;
  atc: string;
  form: string;
  therapeuticClass: TherapeuticClass | '';
  onChange: (patch: {
    q?: string;
    atc?: string;
    form?: string;
    therapeuticClass?: TherapeuticClass | undefined;
    page?: number;
  }) => void;
}

export function SortimentAddFilter({
  q,
  atc,
  form,
  therapeuticClass,
  onChange,
}: SortimentAddFilterProps) {
  const [localQ, setLocalQ] = useState(q);
  const isFirstRender = useRef(true);

  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (localQ === q) return;
    const t = setTimeout(() => onChange({ q: localQ, page: 1 }), 200);
    return () => clearTimeout(t);
  }, [localQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const formSelectValue = form === '' ? '__ALL__' : form;

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <Input
        placeholder="Sök på namn…"
        value={localQ}
        onChange={(e) => setLocalQ(e.target.value)}
        className="w-full sm:w-[240px]"
        aria-label="Sök läkemedel på namn"
      />
      <TherapeuticClassCombobox
        value={therapeuticClass || undefined}
        onChange={(next) => onChange({ therapeuticClass: next, page: 1 })}
        placeholder="Alla klasser"
        searchPlaceholder="Sök klass…"
        ariaLabel="Filtrera på terapeutisk klass"
        triggerClassName="min-w-[160px] flex-shrink-0"
        clearable
      />
      <AtcCodeCombobox
        value={atc}
        onChange={(next) => onChange({ atc: next, page: 1 })}
        placeholder="ATC-kod ▾"
        searchPlaceholder="Sök ATC-kod…"
        ariaLabel="Filtrera på ATC-kod"
        triggerClassName="min-w-[140px] flex-shrink-0"
        clearable
      />
      <Select
        value={formSelectValue}
        onValueChange={(v) => onChange({ form: v === '__ALL__' ? '' : v, page: 1 })}
      >
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
    </div>
  );
}
