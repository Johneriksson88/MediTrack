import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  THERAPEUTIC_CLASSES,
  type BulkAddCandidate,
  type TherapeuticClass,
} from '@meditrack/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMedicationsQuery } from '@/features/medications/useMedicationsQuery';
import { useBulkAddCandidatesQuery } from '@/features/medications/useSortimentMutations';
import { SortimentCurrentTable } from './SortimentCurrentTable';
import { SortimentFilter } from './SortimentFilter';
import { SortimentAddTable } from './SortimentAddTable';
import { SortimentActionBar } from './SortimentActionBar';
import { SortimentBulkAddDialog } from './SortimentBulkAddDialog';
import { SortimentBulkRemoveDialog } from './SortimentBulkRemoveDialog';
import { PaginationFooter } from '@/routes/lakemedel/PaginationFooter';

/**
 * Sortiment — admin + apotekare bulk catalog management.
 *
 * Two tabs:
 *   - "I sortimentet" — active CareUnitMedication rows; selectable for
 *     bulk-remove (confirm dialog wired in a follow-up commit).
 *   - "Lägg till"     — global Medication rows NOT in this unit's sortiment,
 *     same filter set as Läkemedel (q/atc/form/therapeuticClass), selectable
 *     for bulk-add. Confirm dialog lets the admin set a single threshold
 *     default and override per row before commit.
 *
 * URL contract:
 *   ?tab=current|add (default current)
 *   ?page (per-tab, reset on tab switch)
 *   ?q, ?atc, ?form, ?class (only consumed by the "Lägg till" tab)
 *
 * Selection state is local — selections do NOT survive a page-size or tab
 * switch (transient by design).
 */

const DEFAULT_PAGE_SIZE = 25;

type Tab = 'current' | 'add';

export function SortimentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'add' ? 'add' : 'current';
  const page = Number(searchParams.get('page') ?? '1');

  // Filter state — consumed by BOTH tabs (symmetric: filters narrow either
  // the current sortiment or the candidate set, depending on which tab is
  // active). URL-driven so navigation + browser-back works the same as
  // Läkemedel.
  const q = searchParams.get('q') ?? '';
  const atc = searchParams.get('atc') ?? '';
  const form = searchParams.get('form') ?? '';
  const classParam = searchParams.get('class') ?? '';
  const therapeuticClass: TherapeuticClass | '' =
    (THERAPEUTIC_CLASSES as readonly string[]).includes(classParam)
      ? (classParam as TherapeuticClass)
      : '';

  useEffect(() => {
    document.title = 'Sortiment — MediTrack';
    return () => {
      document.title = 'MediTrack';
    };
  }, []);

  // Selection state — separate sets per tab (different id namespaces:
  // careUnitMedicationId for current, medicationId for add).
  const [currentSelected, setCurrentSelected] = useState<Set<string>>(new Set());
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  // Shared filter object — both queries consume the same shape.
  const sharedFilters = {
    q: q || undefined,
    atc: atc || undefined,
    form: form || undefined,
    therapeuticClass: (therapeuticClass || undefined) as TherapeuticClass | undefined,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  // ─── "I sortimentet" data ───
  const currentQuery = useMedicationsQuery(sharedFilters);
  const currentRows = useMemo(() => currentQuery.data?.rows ?? [], [currentQuery.data]);
  const currentTotal = currentQuery.data?.total ?? 0;
  const currentTotalPages = Math.max(1, Math.ceil(currentTotal / DEFAULT_PAGE_SIZE));

  // ─── "Lägg till" data ───
  const addQuery = useBulkAddCandidatesQuery(sharedFilters, tab === 'add');
  const addRows = useMemo(() => addQuery.data?.rows ?? [], [addQuery.data]);
  const addTotal = addQuery.data?.total ?? 0;
  const addTotalPages = Math.max(1, Math.ceil(addTotal / DEFAULT_PAGE_SIZE));

  /**
   * Mutate the URL search params. Per-tab page is preserved across non-page
   * patches; switching tabs resets both `page` and the current selection.
   */
  function updateFilters(patch: {
    q?: string;
    atc?: string;
    form?: string;
    therapeuticClass?: TherapeuticClass | undefined;
    page?: number;
  }) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (patch.q !== undefined) {
        if (patch.q) next.set('q', patch.q);
        else next.delete('q');
      }
      if (patch.atc !== undefined) {
        if (patch.atc) next.set('atc', patch.atc);
        else next.delete('atc');
      }
      if (patch.form !== undefined) {
        if (patch.form) next.set('form', patch.form);
        else next.delete('form');
      }
      if ('therapeuticClass' in patch) {
        if (patch.therapeuticClass) next.set('class', patch.therapeuticClass);
        else next.delete('class');
      }
      if (patch.page !== undefined) {
        if (patch.page > 1) next.set('page', String(patch.page));
        else next.delete('page');
      }
      return next;
    });
  }

  function setTab(nextTab: Tab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (nextTab === 'current') params.delete('tab');
      else params.set('tab', nextTab);
      // Reset page on tab switch (filtered counts differ between tabs);
      // PRESERVE q/atc/form/class so a "find class N → mass-add → toggle to
      // current → mass-remove" workflow doesn't require re-typing filters.
      params.delete('page');
      return params;
    });
    setCurrentSelected(new Set());
    setAddSelected(new Set());
  }

  function setPage(next: number) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      return params;
    });
    // Don't clear selection on page change — admins may want to flip pages
    // while building up a bulk operation across rows from different pages.
  }

  function toggleCurrent(id: string) {
    setCurrentSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAdd(id: string) {
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllCurrentOnPage() {
    const allOnPage =
      currentRows.length > 0 &&
      currentRows.every((r) => currentSelected.has(r.careUnitMedicationId));
    setCurrentSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) for (const r of currentRows) next.delete(r.careUnitMedicationId);
      else for (const r of currentRows) next.add(r.careUnitMedicationId);
      return next;
    });
  }

  function toggleAllAddOnPage() {
    const allOnPage =
      addRows.length > 0 && addRows.every((r) => addSelected.has(r.medicationId));
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) for (const r of addRows) next.delete(r.medicationId);
      else for (const r of addRows) next.add(r.medicationId);
      return next;
    });
  }

  const currentAllSelectedOnPage =
    currentRows.length > 0 &&
    currentRows.every((r) => currentSelected.has(r.careUnitMedicationId));
  const currentSomeSelectedOnPage =
    !currentAllSelectedOnPage &&
    currentRows.some((r) => currentSelected.has(r.careUnitMedicationId));

  const addAllSelectedOnPage =
    addRows.length > 0 && addRows.every((r) => addSelected.has(r.medicationId));
  const addSomeSelectedOnPage =
    !addAllSelectedOnPage && addRows.some((r) => addSelected.has(r.medicationId));

  /**
   * Selected candidates for the bulk-add dialog. We pull from the current
   * page rows; across-page selections that aren't on the current page would
   * disappear from the dialog list — acceptable v1, the action bar count
   * still reflects the full selection size.
   *
   * For across-page selections to render fully, we'd need to either fetch
   * each selected medicationId by id or keep a richer client cache. Out of
   * scope for v1.
   */
  const selectedCandidates: BulkAddCandidate[] = useMemo(
    () => addRows.filter((r) => addSelected.has(r.medicationId)),
    [addRows, addSelected],
  );

  const hasFiltersActive = !!q || !!atc || !!form || !!therapeuticClass;

  function clearFilters() {
    updateFilters({
      q: '',
      atc: '',
      form: '',
      therapeuticClass: undefined,
      page: 1,
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">Sortiment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hantera vilka läkemedel din vårdenhet har i sortimentet.
        </p>
      </div>

      {/* Shared filter row — applies to whichever tab is active. Mass-remove
          by criteria mirrors the mass-add-by-criteria flow on the other tab. */}
      <SortimentFilter
        q={q}
        atc={atc}
        form={form}
        therapeuticClass={therapeuticClass}
        onChange={updateFilters}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="current">I sortimentet</TabsTrigger>
          <TabsTrigger value="add">Lägg till</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="flex flex-col gap-4">
          {currentQuery.isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          )}

          {!currentQuery.isLoading && currentRows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasFiltersActive ? (
                <>
                  Inga läkemedel i sortimentet matchade filtren.{' '}
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    type="button"
                    onClick={clearFilters}
                  >
                    Rensa filter
                  </Button>
                </>
              ) : (
                'Sortimentet är tomt. Växla till “Lägg till” för att lägga till läkemedel.'
              )}
            </p>
          )}

          {!currentQuery.isLoading && currentRows.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {hasFiltersActive
                  ? `${currentTotal} matchande läkemedel i sortimentet.`
                  : `${currentTotal} läkemedel i sortimentet.`}
              </p>
              <SortimentCurrentTable
                items={currentRows}
                selectedIds={currentSelected}
                onToggle={toggleCurrent}
                onToggleAll={toggleAllCurrentOnPage}
                allSelected={currentAllSelectedOnPage}
                someSelected={currentSomeSelectedOnPage}
              />
              <PaginationFooter
                page={page}
                totalPages={currentTotalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="add" className="flex flex-col gap-4">
          {addQuery.isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          )}

          {!addQuery.isLoading && addRows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasFiltersActive
                ? 'Inga läkemedel matchade filtren.'
                : 'Alla läkemedel i NPL-registret är redan med i sortimentet.'}{' '}
              {hasFiltersActive && (
                <Button
                  variant="link"
                  className="h-auto p-0"
                  type="button"
                  onClick={clearFilters}
                >
                  Rensa filter
                </Button>
              )}
            </p>
          )}

          {!addQuery.isLoading && addRows.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {addTotal} matchande läkemedel utanför sortimentet.
              </p>
              <SortimentAddTable
                items={addRows}
                selectedIds={addSelected}
                onToggle={toggleAdd}
                onToggleAll={toggleAllAddOnPage}
                allSelected={addAllSelectedOnPage}
                someSelected={addSomeSelectedOnPage}
              />
              <PaginationFooter
                page={page}
                totalPages={addTotalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      {tab === 'current' && (
        <SortimentActionBar
          selectedCount={currentSelected.size}
          primaryLabel={`Ta bort ${currentSelected.size} läkemedel`}
          primaryVariant="destructive"
          onPrimary={() => setRemoveDialogOpen(true)}
          onClear={() => setCurrentSelected(new Set())}
        />
      )}
      {tab === 'add' && (
        <SortimentActionBar
          selectedCount={addSelected.size}
          primaryLabel={`Lägg till ${addSelected.size} i sortimentet`}
          onPrimary={() => setAddDialogOpen(true)}
          onClear={() => setAddSelected(new Set())}
          primaryDisabled={selectedCandidates.length === 0}
        />
      )}

      <SortimentBulkAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        candidates={selectedCandidates}
        onSuccess={() => setAddSelected(new Set())}
      />
      <SortimentBulkRemoveDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        careUnitMedicationIds={Array.from(currentSelected)}
        onSuccess={() => setCurrentSelected(new Set())}
      />
    </div>
  );
}
