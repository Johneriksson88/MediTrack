import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
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
import { useAtcCodesQuery } from '@/features/medications/useAtcCodesQuery';

/**
 * Phase 8 D-132 / D-133 / D-134 — Shared combobox for the global ATC-code list.
 *
 * D-134: Canonical Popover+Command typeahead reused in TWO places:
 *   1. LakemedelFilter — URL-as-state ATC filter control.
 *   2. MedicationSheet user-create form — react-hook-form Controller field.
 *   Single file; both surfaces use identical UI behavior. Mirrors the
 *   TherapeuticClassCombobox.tsx (Phase 6 D-116) shell structure VERBATIM
 *   with ONE functional difference: ATC accepts a free-text fallback row
 *   for codes not in the served list (so a brand-new-to-the-catalog code
 *   can be entered for a user-created medication).
 *
 * D-132: Data source is useAtcCodesQuery() → GET /api/medications/atc-codes.
 *   ~3,000 codes from the global NPL catalog, sorted ascending.
 *
 * D-133: staleTime: Infinity — codes are essentially static; explicit cache
 *   invalidation on useCreateMedication.onSuccess covers the rare case where
 *   a brand-new code is added via the user-create form.
 *
 * Free-text fallback (ONE difference from TherapeuticClassCombobox):
 *   If the user types a value not present in the loaded codes list, an extra
 *   CommandItem renders with "(fri sökning)" suffix. Selecting it calls
 *   onChange(typedValue.toUpperCase()). This mirrors the existing inline
 *   implementation in LakemedelFilter.tsx lines 210-222 (Phase 2 pattern).
 *
 * Accessibility:
 *   - Trigger: role="combobox", aria-expanded={open}, aria-label={ariaLabel}.
 *   - Clear affordance: role="button", tabIndex={0}, aria-label="Rensa ATC-kod".
 *     Rendered as <span> inside the trigger button — NOT a nested <button>
 *     (nesting <button> in <button> is invalid HTML). stopPropagation prevents
 *     popover from opening when clearing.
 *   - CommandList rows: cmdk handles keyboard arrow nav + Enter selection.
 *   - Esc closes (Radix native behavior).
 */

export interface AtcCodeComboboxProps {
  /** Current value. Empty string '' = unset (matches LakemedelFilter URL-state convention). */
  value: string;
  /** Called when the user picks a code, types a free-text fallback, or clears the field. */
  onChange: (next: string) => void;
  /** Trigger placeholder when value is empty. Default: 'ATC-kod ▾'. */
  placeholder?: string;
  /** CommandInput placeholder. Default: 'Sök ATC-kod…'. */
  searchPlaceholder?: string;
  /** aria-label on the trigger button. Default: 'Välj ATC-kod'. */
  ariaLabel?: string;
  /** Consumer-controlled trigger sizing. */
  triggerClassName?: string;
  /** Show X clear affordance when value is set. Default: true. */
  clearable?: boolean;
  /** Disable the trigger (e.g. while a parent mutation is pending). Default: false. */
  disabled?: boolean;
}

export function AtcCodeCombobox({
  value,
  onChange,
  placeholder = 'ATC-kod ▾',
  searchPlaceholder = 'Sök ATC-kod…',
  ariaLabel = 'Välj ATC-kod',
  triggerClassName,
  clearable = true,
  disabled = false,
}: AtcCodeComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false);
  // Internal query state drives the free-text fallback row visibility.
  // cmdk's built-in matcher does the live list filtering; we only need
  // `query` to detect when the typed value is NOT in the loaded codes list.
  const [query, setQuery] = useState('');

  const codesQuery = useAtcCodesQuery();
  const codes = codesQuery.data?.codes ?? [];

  // The free-text fallback row is visible when:
  //   (a) user has typed something (query.trim() is non-empty), AND
  //   (b) the uppercased query is not already present in the served codes list.
  const trimmedQuery = query.trim();
  const upperQuery = trimmedQuery.toUpperCase();
  const showFreeText = trimmedQuery.length > 0 && !codes.includes(upperQuery);

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
          disabled={disabled}
        >
          <span className="truncate">{value || placeholder}</span>
          {value && clearable ? (
            // Clear affordance — span (NOT nested button — invalid HTML).
            // stopPropagation prevents the popover from opening when clearing.
            <span
              role="button"
              tabIndex={0}
              aria-label="Rensa ATC-kod"
              className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
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
        className="w-[--radix-popover-trigger-width] min-w-[240px] p-0"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {codesQuery.isLoading && (
              // Loading state: rare in practice due to staleTime: Infinity,
              // but required for the very first combobox open before cache
              // is populated (UI-SPEC §Components §1 States table).
              <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Laddar ATC-koder…
              </div>
            )}
            {!codesQuery.isLoading && (
              <>
                <CommandEmpty>Inga träffar</CommandEmpty>
                <CommandGroup>
                  {codes.map((code) => (
                    <CommandItem
                      key={code}
                      value={code}
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
                      <span className="text-xs font-semibold tabular-nums">{code}</span>
                    </CommandItem>
                  ))}
                  {/* Free-text fallback row — renders only when the typed value
                      is not already in the served codes list. The ONE functional
                      difference from TherapeuticClassCombobox. Mirrors the
                      existing implementation in LakemedelFilter.tsx lines 210-222. */}
                  {showFreeText && (
                    <CommandItem
                      key={`__free__${query}`}
                      value={`__free__${query}`}
                      onSelect={() => {
                        onChange(upperQuery);
                        setOpen(false);
                      }}
                    >
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      <span className="text-xs font-semibold tabular-nums">
                        {upperQuery}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">(fri sökning)</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
