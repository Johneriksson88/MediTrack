import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import {
  THERAPEUTIC_CLASSES,
  THERAPEUTIC_CLASS_LABELS,
  type TherapeuticClass,
} from '@meditrack/shared';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

/**
 * Phase 6 Plan 02 — Shared combobox for the 14-option TherapeuticClass enum.
 *
 * Decision (Warning 7 in 06-02-PLAN.md): the same combobox is consumed in two
 * places — LakemedelFilter (URL-as-state filter) AND Plan 03's MedicationSheet
 * (react-hook-form Slutgiltig klass field). Extracting the shell HERE keeps
 * the 14-item options array, the Popover+Command recipe, the clear-button
 * affordance, and the aria-label in ONE file; the two consumers wrap with
 * their own state-shape glue.
 *
 * Recipe matches LakemedelFilter.tsx's ATC combobox (Phase 2 D-43) verbatim
 * with one difference: this component owns its `open` state internally; the
 * consumer only owns `value`/`onChange`. The ATC combobox needed local typed
 * text because ATC allows free input; therapeutic class is a closed 14-option
 * enum so no free-text path is needed.
 *
 * D-116: Triggered LEFT of the ATC combobox in the LakemedelFilter strip.
 * D-117: Single-select (matches the 14-entry enum perfectly — multi-select
 * would invite "antibiotics AND nervsystem" queries that don't map to any
 * real clinical workflow).
 */

export interface TherapeuticClassComboboxProps {
  /** Current value. `undefined` means "no class selected". */
  value: TherapeuticClass | undefined;
  /** Called when the user picks a class or clears the field. */
  onChange: (next: TherapeuticClass | undefined) => void;
  /** Trigger placeholder when `value` is undefined. Default: 'Alla klasser'. */
  placeholder?: string;
  /** CommandInput placeholder. Default: 'Sök klass…'. */
  searchPlaceholder?: string;
  /** aria-label on the trigger button. Default: 'Filtrera på terapeutisk klass'. */
  ariaLabel?: string;
  /**
   * Consumer-controlled trigger width / sizing. LakemedelFilter uses
   * `min-w-[160px] flex-shrink-0`; Plan 03's MedicationSheet uses `w-full`.
   */
  triggerClassName?: string;
  /**
   * When true (default) and `value` is set, an X button appears on the right
   * of the trigger that clears the value. The Sheet's "Slutgiltig klass"
   * field may want to disable this when the form is in view-only mode.
   */
  clearable?: boolean;
}

export function TherapeuticClassCombobox({
  value,
  onChange,
  placeholder = 'Alla klasser',
  searchPlaceholder = 'Sök klass…',
  ariaLabel = 'Filtrera på terapeutisk klass',
  triggerClassName,
  clearable = true,
}: TherapeuticClassComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn('justify-between', triggerClassName)}
          type="button"
        >
          <span className="truncate">
            {value ? THERAPEUTIC_CLASS_LABELS[value] : placeholder}
          </span>
          {value && clearable ? (
            // Clear affordance — rendered as a span (not nested Button — nesting
            // <button> in <button> is invalid HTML). stopPropagation prevents
            // the popover from opening when the user is trying to clear.
            <span
              role="button"
              tabIndex={0}
              aria-label="Rensa terapeutisk klass"
              className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(undefined);
                }
              }}
            >
              <X className="h-4 w-4" />
            </span>
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[220px] p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Inga träffar</CommandEmpty>
            <CommandGroup>
              {THERAPEUTIC_CLASSES.map((code) => {
                const label = THERAPEUTIC_CLASS_LABELS[code];
                // CommandItem.value is the searchable string; we put both the
                // code letter and the Swedish label in there so the cmdk
                // matcher accepts either "N" or "nerv" → Nervsystemet.
                return (
                  <CommandItem
                    key={code}
                    value={`${code} ${label}`}
                    onSelect={() => {
                      onChange(code);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === code ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="text-xs font-semibold tabular-nums mr-2">
                      {code}
                    </span>
                    <span>{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
