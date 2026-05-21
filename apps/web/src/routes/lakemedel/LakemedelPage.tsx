import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pill } from 'lucide-react';
import type { MedicationListItem } from '@meditrack/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Can } from '@/auth/Can';
import { useMedicationsQuery } from '@/features/medications/useMedicationsQuery';
import { LowStockBanner } from './LowStockBanner';
import { MedicationTable } from './MedicationTable';
import { MedicationCardList } from './MedicationCardList';
import { MedicationSheet } from './MedicationSheet';
import { AddMedicationButton } from './AddMedicationButton';
import { PaginationFooter } from './PaginationFooter';

/**
 * Phase 2 D-20 / D-22 / UI-SPEC §1 — Medication catalog page.
 *
 * Replaces the Phase 1 stub. Owns:
 * - URL-synced filter state via useSearchParams (D-39, D-44).
 * - One useMedicationsQuery(filters) invocation — server-side pagination (D-44).
 * - Sheet state (create mode for Slice 1; edit/view in Plan 03).
 * - Responsive layout: MedicationTable at ≥md, MedicationCardList at <md.
 *
 * URL is the filter source of truth — useSearchParams drives all filter reads.
 * Sheet open state does NOT change the URL (D-34).
 *
 * Loading: 8 skeleton rows (table) / 4 skeleton cards (mobile) per UI-SPEC §1.
 * Empty state (zero rows in DB): card with "Inga läkemedel ännu" copy.
 * Empty state (filters active, zero results): inline message below filters.
 */

type SheetState = { mode: 'create' } | { mode: 'edit' | 'view'; item: MedicationListItem } | null;

const DEFAULT_PAGE_SIZE = 25;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function LakemedelPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const belowThreshold = searchParams.get('belowThreshold') === 'true';
  const page = Number(searchParams.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(q);
  const debouncedQ = useDebounce(searchInput, 200);

  // Sync debounced search to URL
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (debouncedQ !== current) {
      const next = new URLSearchParams(searchParams);
      if (debouncedQ) {
        next.set('q', debouncedQ);
      } else {
        next.delete('q');
      }
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    }
  }, [debouncedQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = {
    q: q || undefined,
    belowThreshold: belowThreshold || undefined,
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

  function applyPage(newPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next, { replace: true });
  }

  function toggleBelowThreshold() {
    const next = new URLSearchParams(searchParams);
    if (belowThreshold) {
      next.delete('belowThreshold');
    } else {
      next.set('belowThreshold', 'true');
    }
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchInput('');
    setSearchParams(new URLSearchParams({ page: '1' }), { replace: true });
  }

  function handleRowClick(item: MedicationListItem) {
    // Plan 03 will pass mode='edit' or mode='view' based on useCan('medication:update').
    // For Slice 1, open Sheet in edit mode (placeholder message rendered by Sheet).
    setSheet({ mode: 'edit', item });
  }

  const hasActiveFilters = !!q || belowThreshold;

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

      {/* Filter row — search input + below-threshold chip for Slice 1 */}
      <div className="flex flex-wrap items-center gap-2 py-1">
        <Input
          placeholder="Sök på namn…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full sm:w-[240px]"
          aria-label="Sök på läkemedelsnamn"
        />
        <Button
          variant="outline"
          aria-pressed={belowThreshold}
          className={
            belowThreshold
              ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
              : ''
          }
          onClick={toggleBelowThreshold}
          type="button"
        >
          Visa endast under tröskel
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} type="button">
            Rensa filter
          </Button>
        )}
      </div>

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

      {/* Empty state: zero rows in DB (total === 0, no active filters) */}
      {!isLoading && total === 0 && !hasActiveFilters && (
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

      {/* Empty state: filters active but no results */}
      {!isLoading && rows.length === 0 && hasActiveFilters && (
        <div className="text-sm text-muted-foreground text-center py-8">
          Inga läkemedel matchade filtren.{' '}
          <button
            className="underline hover:no-underline"
            onClick={clearFilters}
            type="button"
          >
            Rensa filter
          </button>
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
