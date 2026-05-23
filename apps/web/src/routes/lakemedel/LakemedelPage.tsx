import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pill } from 'lucide-react';
import {
  THERAPEUTIC_CLASSES,
  type MedicationListItem,
  type TherapeuticClass,
} from '@meditrack/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Can } from '@/auth/Can';
import { useCan } from '@/auth/useCan';
import { useMedicationsQuery } from '@/features/medications/useMedicationsQuery';
import { LakemedelFilter } from './LakemedelFilter';
import { LowStockBanner } from './LowStockBanner';
import { MedicationTable } from './MedicationTable';
import { MedicationCardList } from './MedicationCardList';
import { MedicationSheet } from './MedicationSheet';
import { AddMedicationButton } from './AddMedicationButton';
import { PaginationFooter } from './PaginationFooter';

/**
 * Phase 2 D-20 / D-39 / UI-SPEC §1 — Medication catalog page.
 *
 * Replaces the Phase 1 stub (Slice 1). Slice 2 additions:
 * - Full LakemedelFilter with search, ATC combobox, form select, chip (CAT-02..04).
 * - `atc` and `form` URL params added to filter state.
 * - Filters-active empty state: "Inga läkemedel matchade filtren." + "Rensa filter".
 * - atcSuggestions: top-5-char ATC prefixes from the current page rows.
 *
 * URL is the filter source of truth — useSearchParams drives all reads.
 * The page merges filter patches onto URL via updateFilters(), never via useEffect.
 * Sheet open state does NOT change the URL (D-34).
 */

type SheetState = { mode: 'create' } | { mode: 'edit' | 'view'; item: MedicationListItem } | null;

const DEFAULT_PAGE_SIZE = 25;

export function LakemedelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canUpdate = useCan('medication:update');

  // All filter values read directly from URL — no local state for filter values.
  const q = searchParams.get('q') ?? '';
  const atc = searchParams.get('atc') ?? '';
  const form = searchParams.get('form') ?? '';
  const belowThreshold = searchParams.get('belowThreshold') === 'true';
  // Phase 6 AI-03 / D-116 — URL param name is `class` (single letter, matches
  // the Postgres enum value and keeps the URL short per D-116). Narrow the
  // raw string to TherapeuticClass via membership check; an out-of-list
  // value (e.g. `?class=X`) is treated as "no class selected".
  const classParam = searchParams.get('class') ?? '';
  const therapeuticClass: TherapeuticClass | '' =
    (THERAPEUTIC_CLASSES as readonly string[]).includes(classParam)
      ? (classParam as TherapeuticClass)
      : '';
  const page = Number(searchParams.get('page') ?? '1');

  /**
   * Merges a filter patch into the current URL search params.
   * Clean-URL policy: omit defaults so shared URLs stay readable.
   * LakemedelFilter always passes `page: 1` in every onChange — this reset
   * ensures users don't land on an empty page after a filter change.
   */
  function updateFilters(patch: {
    q?: string;
    atc?: string;
    form?: string;
    belowThreshold?: boolean;
    therapeuticClass?: TherapeuticClass | undefined;
    page?: number;
    pageSize?: number;
  }) {
    setSearchParams((prev) => {
      // Phase 6 D-116 — `therapeuticClass` patch semantics:
      //   - patch.therapeuticClass undefined AND the patch object HAS a
      //     `therapeuticClass` key (i.e. the consumer explicitly cleared)
      //     → clear the URL param.
      //   - patch.therapeuticClass undefined AND the patch object has NO key
      //     → preserve the existing URL param (carry-over from other filter
      //     changes).
      //   - patch.therapeuticClass set → write `?class=<letter>`.
      // We model this by checking `'therapeuticClass' in patch` to
      // distinguish "explicitly cleared" from "not touched".
      const prevClass = prev.get('class') ?? '';
      let nextClass: string;
      if ('therapeuticClass' in patch) {
        nextClass = patch.therapeuticClass ?? '';
      } else {
        nextClass = prevClass;
      }

      const merged = {
        q: patch.q !== undefined ? patch.q : (prev.get('q') ?? ''),
        atc: patch.atc !== undefined ? patch.atc : (prev.get('atc') ?? ''),
        form: patch.form !== undefined ? patch.form : (prev.get('form') ?? ''),
        belowThreshold:
          patch.belowThreshold !== undefined
            ? patch.belowThreshold
            : prev.get('belowThreshold') === 'true',
        therapeuticClass: nextClass,
        page:
          patch.page !== undefined
            ? patch.page
            : Number(prev.get('page') ?? '1'),
        pageSize:
          patch.pageSize !== undefined
            ? patch.pageSize
            : Number(prev.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)),
      };

      const next = new URLSearchParams();
      if (merged.q) next.set('q', merged.q);
      if (merged.atc) next.set('atc', merged.atc);
      if (merged.form) next.set('form', merged.form);
      if (merged.belowThreshold) next.set('belowThreshold', 'true');
      // Phase 6 D-116 — URL param name is the short `class` (single-letter
      // value); the in-FE prop name stays `therapeuticClass` for clarity.
      if (merged.therapeuticClass) next.set('class', merged.therapeuticClass);
      if (merged.page > 1) next.set('page', String(merged.page));
      if (merged.pageSize !== DEFAULT_PAGE_SIZE)
        next.set('pageSize', String(merged.pageSize));
      return next;
    });
  }

  const filters = {
    q: q || undefined,
    atc: atc || undefined,
    form: form || undefined,
    belowThreshold: belowThreshold || undefined,
    // Phase 6 AI-03 — empty string means "not filtered"; we map to undefined
    // so the request URL omits the param (matches the FE clean-URL policy
    // used by the other four filters above).
    therapeuticClass: therapeuticClass || undefined,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  const { data, isLoading } = useMedicationsQuery(filters);

  const [sheet, setSheet] = useState<SheetState>(null);

  // Set document title
  useEffect(() => {
    document.title = 'Läkemedel — MediTrack';
    return () => {
      document.title = 'MediTrack';
    };
  }, []);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const belowThresholdTotal = data?.belowThresholdTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  /**
   * Derive ATC suggestion list from the current page rows (D-39 / UI-SPEC §8b).
   * Top distinct 5-char ATC prefixes from visible rows — small, fast, no extra API.
   * The combobox itself filters this list by what the user types.
   */
  const atcSuggestions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.atcCode.slice(0, 5)))).sort(),
    [rows],
  );

  function applyPage(newPage: number) {
    updateFilters({ page: newPage });
  }

  /**
   * hasActiveFilters: any of the five filter values is set (including the
   * new Phase 6 Terapeutisk klass — D-116). Used to distinguish "no rows
   * match filters" from "vårdenhet has no medications".
   */
  const hasActiveFilters =
    !!q || !!atc || !!form || belowThreshold || !!therapeuticClass;

  /**
   * rowsEmpty: the loaded response has zero rows.
   * Guard on !isLoading so this doesn't fire during the initial skeleton phase.
   */
  const rowsEmpty = !isLoading && data !== undefined && rows.length === 0;

  /**
   * Open the Sheet in 'edit' mode for apotekare/admin, 'view' mode for sjukskoterska.
   * Per D-36: mode is driven by useCan('medication:update') — not by role name,
   * so future role changes propagate here automatically.
   */
  function handleRowClick(item: MedicationListItem) {
    setSheet({ mode: canUpdate ? 'edit' : 'view', item });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      {/* Page heading row */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight">Läkemedel</h1>
        <AddMedicationButton onCreate={() => setSheet({ mode: 'create' })} />
      </div>

      {/* Low-stock count banner (D-22: always present from first interactive build) */}
      {!isLoading && (
        <LowStockBanner belowThresholdTotal={belowThresholdTotal} />
      )}

      {/* Filter row — search + Terapeutisk klass (D-116) + ATC + form select +
          threshold chip. Phase 6 inserts the TherapeuticClassCombobox left
          of ATC. */}
      <LakemedelFilter
        q={q}
        atc={atc}
        form={form}
        belowThreshold={belowThreshold}
        therapeuticClass={therapeuticClass}
        atcSuggestions={atcSuggestions}
        onChange={updateFilters}
      />

      {/* Loading state */}
      {isLoading && (
        <>
          {/* Table skeletons (≥md) */}
          <div className="hidden md:flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
          {/* Card skeletons (<md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </>
      )}

      {/* Empty state: filters active, zero results — inline message (UI-SPEC §1) */}
      {rowsEmpty && hasActiveFilters && (
        <div className="text-sm text-muted-foreground text-center py-8">
          Inga läkemedel matchade filtren.{' '}
          <Button
            variant="link"
            className="p-0 h-auto"
            onClick={() => setSearchParams(new URLSearchParams())}
            type="button"
          >
            Rensa filter
          </Button>
        </div>
      )}

      {/* Empty state: zero rows in DB (total === 0, no active filters) */}
      {rowsEmpty && !hasActiveFilters && (
        <div className="flex items-center justify-center flex-1 p-8">
          <div className="max-w-md w-full p-8 text-center bg-card border border-border rounded-lg shadow-sm">
            <Pill className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Inga läkemedel ännu
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Lägg till från NPL-registret eller skapa nytt.
            </p>
            <Can action="medication:create">
              <Button onClick={() => setSheet({ mode: 'create' })}>
                Lägg till läkemedel
              </Button>
            </Can>
          </div>
        </div>
      )}

      {/* Data: table (≥md) and card list (<md) */}
      {!isLoading && rows.length > 0 && (
        <>
          <MedicationTable
            items={rows}
            onRowClick={handleRowClick}
            className="hidden md:block"
          />
          <MedicationCardList
            items={rows}
            onCardClick={handleRowClick}
            className="block md:hidden"
          />
          <PaginationFooter
            page={page}
            totalPages={totalPages}
            onPageChange={applyPage}
          />
        </>
      )}

      {/* Sheet overlay — URL does not change when open (D-34) */}
      <MedicationSheet
        mode={sheet?.mode ?? 'create'}
        open={sheet !== null}
        onOpenChange={(o) => {
          if (!o) setSheet(null);
        }}
        careUnitMedication={
          sheet?.mode === 'edit' || sheet?.mode === 'view' ? sheet.item : undefined
        }
      />
    </div>
  );
}
