import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useMedicationsQuery } from '@/features/medications/useMedicationsQuery';
import { SortimentCurrentTable } from './SortimentCurrentTable';
import { SortimentActionBar } from './SortimentActionBar';
import { PaginationFooter } from '@/routes/lakemedel/PaginationFooter';

/**
 * Sortiment — admin + apotekare bulk catalog management.
 *
 * Two tabs:
 *   - "I sortimentet" — current CareUnitMedication rows (selectable for
 *     bulk-remove). Reuses useMedicationsQuery so the row shape and the
 *     pagination/filter wiring match Läkemedel.
 *   - "Lägg till"     — global Medication rows NOT in the unit's sortiment.
 *     Filled in by a follow-up commit; this commit ships the shell only.
 *
 * URL contract: `?tab=current|add` (default `current`); `?page` is reused
 * from the Läkemedel page (DEFAULT_PAGE_SIZE = 25). Selection is local
 * component state — not URL-deep-linked (selections are transient).
 */

const DEFAULT_PAGE_SIZE = 25;

type Tab = 'current' | 'add';

export function SortimentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'add' ? 'add' : 'current';
  const page = Number(searchParams.get('page') ?? '1');

  useEffect(() => {
    document.title = 'Sortiment — MediTrack';
    return () => {
      document.title = 'MediTrack';
    };
  }, []);

  const { data, isLoading } = useMedicationsQuery({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  const [selected, setSelected] = useState<Set<string>>(new Set());

  function setTab(next: Tab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'current') params.delete('tab');
      else params.set('tab', next);
      params.delete('page');
      return params;
    });
    setSelected(new Set());
  }

  function setPage(next: number) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      return params;
    });
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.careUnitMedicationId));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) {
        for (const r of rows) next.delete(r.careUnitMedicationId);
      } else {
        for (const r of rows) next.add(r.careUnitMedicationId);
      }
      return next;
    });
  }

  const allSelectedOnPage =
    rows.length > 0 && rows.every((r) => selected.has(r.careUnitMedicationId));
  const someSelectedOnPage =
    !allSelectedOnPage && rows.some((r) => selected.has(r.careUnitMedicationId));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">Sortiment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hantera vilka läkemedel din vårdenhet har i sortimentet.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="current">I sortimentet</TabsTrigger>
          <TabsTrigger value="add">Lägg till</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="flex flex-col gap-4">
          {isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sortimentet är tomt. Växla till “Lägg till” för att lägga till läkemedel.
            </p>
          )}

          {!isLoading && rows.length > 0 && (
            <>
              <SortimentCurrentTable
                items={rows}
                selectedIds={selected}
                onToggle={toggleRow}
                onToggleAll={toggleAllOnPage}
                allSelected={allSelectedOnPage}
                someSelected={someSelectedOnPage}
              />
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="add">
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sök i NPL-registret och välj vilka läkemedel som ska läggas till.
            <br />
            (Implementeras i nästa commit.)
          </p>
        </TabsContent>
      </Tabs>

      {tab === 'current' && (
        <SortimentActionBar
          selectedCount={selected.size}
          primaryLabel="Ta bort markerade"
          primaryVariant="destructive"
          onPrimary={() => {
            // Wired in commit 4 — bulk-remove confirm dialog.
          }}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
