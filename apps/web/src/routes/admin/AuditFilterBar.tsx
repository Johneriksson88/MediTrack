import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, Check, Link2, Loader2 } from 'lucide-react';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_TYPE_LABELS,
  type AuditFiltersResponse,
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
import { AuditActionChip } from '@/components/AuditActionChip';

/**
 * Phase 5 UI-SPEC §2 / D-103 — three-combobox filter bar with URL-as-state.
 *
 * Three Popover+Command comboboxes (Användare / Entitetstyp / Åtgärd), a
 * ghost `Rensa filter` button (ml-auto when any filter is active), and a
 * dismissible active-requestId chip (rendered below the combobox row when
 * `?requestId=` is set via a RequestIdGroupChip click).
 *
 * Mobile (<md): wraps in `flex flex-nowrap overflow-x-auto` strip per
 * UI-SPEC §2 Mobile layout — Phase 4 D-82 status-tab precedent verbatim.
 *
 * URL is the source of truth. onChange emits a patch object the parent
 * page merges via `setSearchParams((prev) => ...)`. Width tokens locked:
 * `w-[200px]` triggers, `w-[280px]` popovers for Användare/Åtgärd,
 * `w-[240px]` for Entitetstyp.
 */

export interface AuditFilters {
  actor: string;
  entity: string;
  action: string;
  requestId: string;
}

export interface AuditFilterBarProps {
  filters: AuditFilters;
  filterSource: AuditFiltersResponse | undefined;
  filterSourceLoading: boolean;
  /**
   * Page-level hook fired AFTER setSearchParams runs — used to collapse
   * the expanded-rows set so a stale row that's no longer in the new
   * result set doesn't render an orphan diff panel.
   */
  onFiltersChanged?: () => void;
}

export function AuditFilterBar({
  filters,
  filterSource,
  filterSourceLoading,
  onFiltersChanged,
}: AuditFilterBarProps) {
  // URL is the source of truth — D-103 / D-39 / D-42 carry-forward. The
  // FilterBar both reads (via props from the page) AND writes (directly
  // via setSearchParams) the URL state, mirroring Phase 2's
  // LakemedelFilter pattern.
  const [, setSearchParams] = useSearchParams();
  const [actorOpen, setActorOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);

  function applyPatch(patch: Partial<AuditFilters>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
    onFiltersChanged?.();
  }

  function clearAll() {
    setSearchParams(new URLSearchParams());
    onFiltersChanged?.();
  }

  // Convenience wrapper kept for parity with the original signature used
  // by the combobox handlers below.
  const onChange = applyPatch;
  const onClearAll = clearAll;

  const hasAnyFilter =
    !!filters.actor || !!filters.entity || !!filters.action || !!filters.requestId;

  // Resolve display labels for set values
  const selectedActorUser =
    filters.actor && filterSource
      ? filterSource.users.find((u) => u.id === filters.actor)
      : undefined;
  const actorLabel = selectedActorUser?.name ?? 'Användare';

  const entityLabel = filters.entity
    ? (AUDIT_ENTITY_TYPE_LABELS as Record<string, string>)[filters.entity] ?? filters.entity
    : 'Entitetstyp';

  const actionLabel = filters.action
    ? (AUDIT_ACTION_LABELS as Record<string, string>)[filters.action] ?? filters.action
    : 'Åtgärd';

  function handleActorSelect(userId: string) {
    // Toggle: selecting the already-set value clears it
    onChange({ actor: filters.actor === userId ? '' : userId });
    setActorOpen(false);
  }

  function handleEntitySelect(value: string) {
    onChange({ entity: filters.entity === value ? '' : value });
    setEntityOpen(false);
  }

  function handleActionSelect(value: string) {
    onChange({ action: filters.action === value ? '' : value });
    setActionOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Combobox row — desktop: flex-wrap horizontal; mobile: overflow-x-auto strip */}
      <div
        className="flex flex-nowrap md:flex-wrap items-center gap-2 overflow-x-auto
                   md:overflow-visible py-3 md:py-5 border-b border-border
                   px-4 -mx-4 md:px-0 md:mx-0"
      >
        {/* A. Användare combobox */}
        <Popover open={actorOpen} onOpenChange={setActorOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-[200px] justify-between flex-shrink-0 whitespace-nowrap"
              aria-label="Filtrera på användare"
              aria-busy={filterSourceLoading || undefined}
              type="button"
            >
              <span className="truncate max-w-[160px]">{actorLabel}</span>
              {filters.actor ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Rensa användarfilter"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange({ actor: '' });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      onChange({ actor: '' });
                    }
                  }}
                  className="ml-2 flex-shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : (
                <span className="ml-2 flex-shrink-0">▾</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Sök användare…" />
              <CommandList className="max-h-[280px]">
                {filterSourceLoading ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    <Loader2 className="animate-spin h-3 w-3 inline mr-2" aria-hidden="true" />
                    Laddar...
                  </div>
                ) : (filterSource?.users.length ?? 0) === 0 ? (
                  <CommandEmpty>Inga användare ännu.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filterSource!.users.map((user) => (
                      <CommandItem
                        key={user.id}
                        value={`${user.name} ${user.email}`}
                        onSelect={() => handleActorSelect(user.id)}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="text-sm">{user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                          <Check
                            className={
                              filters.actor === user.id
                                ? 'h-4 w-4 opacity-100'
                                : 'h-4 w-4 opacity-0'
                            }
                            aria-hidden="true"
                          />
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* B. Entitetstyp combobox */}
        <Popover open={entityOpen} onOpenChange={setEntityOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-[200px] justify-between flex-shrink-0 whitespace-nowrap"
              aria-label="Filtrera på entitetstyp"
              aria-busy={filterSourceLoading || undefined}
              type="button"
            >
              <span className="truncate max-w-[160px]">{entityLabel}</span>
              {filters.entity ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Rensa entitetstypsfilter"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange({ entity: '' });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      onChange({ entity: '' });
                    }
                  }}
                  className="ml-2 flex-shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : (
                <span className="ml-2 flex-shrink-0">▾</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Sök typ…" />
              <CommandList className="max-h-[240px]">
                {filterSourceLoading ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    <Loader2 className="animate-spin h-3 w-3 inline mr-2" aria-hidden="true" />
                    Laddar...
                  </div>
                ) : (filterSource?.entityTypes.length ?? 0) === 0 ? (
                  <CommandEmpty>Inga entitetstyper ännu.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filterSource!.entityTypes.map((rawValue) => {
                      const swedishLabel =
                        (AUDIT_ENTITY_TYPE_LABELS as Record<string, string>)[rawValue] ?? rawValue;
                      return (
                        <CommandItem
                          key={rawValue}
                          value={`${swedishLabel} ${rawValue}`}
                          onSelect={() => handleEntitySelect(rawValue)}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-sm">{swedishLabel}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {rawValue}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* C. Åtgärd combobox */}
        <Popover open={actionOpen} onOpenChange={setActionOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-[200px] justify-between flex-shrink-0 whitespace-nowrap"
              aria-label="Filtrera på åtgärd"
              aria-busy={filterSourceLoading || undefined}
              type="button"
            >
              <span className="truncate max-w-[160px]">{actionLabel}</span>
              {filters.action ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Rensa åtgärdsfilter"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange({ action: '' });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      onChange({ action: '' });
                    }
                  }}
                  className="ml-2 flex-shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : (
                <span className="ml-2 flex-shrink-0">▾</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Sök åtgärd…" />
              <CommandList className="max-h-[320px]">
                {filterSourceLoading ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    <Loader2 className="animate-spin h-3 w-3 inline mr-2" aria-hidden="true" />
                    Laddar...
                  </div>
                ) : (filterSource?.actions.length ?? 0) === 0 ? (
                  <CommandEmpty>Inga åtgärder ännu.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filterSource!.actions.map((rawValue) => (
                      <CommandItem
                        key={rawValue}
                        value={rawValue}
                        onSelect={() => handleActionSelect(rawValue)}
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <AuditActionChip action={rawValue} />
                          <span className="text-xs text-muted-foreground">
                            {rawValue}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* D. Rensa filter — visible only when at least one filter is active */}
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="md:ml-auto flex-shrink-0"
            type="button"
          >
            Rensa filter
          </Button>
        )}
      </div>

      {/* Active-requestId chip — visible only when ?requestId= is set */}
      {filters.requestId && (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground
                       px-3 py-1 text-xs font-semibold border border-border"
          >
            <Link2 className="h-3 w-3" aria-hidden="true" />
            Del av begäran {filters.requestId.slice(-8)}
            <button
              type="button"
              onClick={() => onChange({ requestId: '' })}
              aria-label="Ta bort begäransfilter"
              className="ml-1 hover:text-destructive focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
