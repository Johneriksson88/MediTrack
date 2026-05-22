import { useNavigate } from 'react-router-dom';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Can } from '@/auth/Can';
import { useDraftsQuery } from '@/features/orders/useOrderQueries';
import { useCreateDraftOrder } from '@/features/orders/useOrderMutations';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { DraftsTable } from './DraftsTable';
import { DraftsCardList } from './DraftsCardList';

/**
 * Phase 3 D-50 / D-53 / D-70 / D-72 / UI-SPEC §1 — Beställningar drafts list.
 *
 * Replaces the Phase 1 stub (BestallningarPage was <EmptyStateCard>).
 *
 * State: loading → empty (rowsEmpty) → filled (rows.length > 0).
 *
 * Loading: 5 skeleton rows (≥md) + 3 skeleton cards (<md) per UI-SPEC §1.
 * Empty:   inline card with ClipboardList icon, heading 'Inga utkast ännu',
 *          body 'Skapa en ny beställning för att komma igång.', CTA 'Ny beställning'
 *          gated by <Can action="order:create"> (D-70).
 * Filled:  <DraftsTable> (≥md, hidden md:block) + <DraftsCardList> (<md, block md:hidden).
 *
 * "Ny beställning" button:
 *   - Enters disabled + Loader2 spinner state during mutation.
 *   - On success: navigate to /bestallningar/<new-id> (D-50).
 *   - On error: toast fired by useCreateDraftOrder's onError; button re-enables.
 *
 * Document title: 'Beställningar — MediTrack' (restored to 'MediTrack' on unmount).
 */
export function BestallningarPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useDraftsQuery();
  const createMutation = useCreateDraftOrder();

  // Set document title — WR-09: use save/restore hook so SPA navigation
  // restores the previous route's title (e.g., 'Läkemedel — MediTrack')
  // instead of hard-coding 'MediTrack' on unmount.
  useDocumentTitle('Beställningar — MediTrack');

  const rows = data?.rows ?? [];
  const rowsEmpty = !isLoading && data !== undefined && rows.length === 0;

  async function handleNyBestallning() {
    const response = await createMutation.mutateAsync();
    navigate(`/bestallningar/${response.id}`);
  }

  function handleRowClick(row: (typeof rows)[number]) {
    navigate(`/bestallningar/${row.id}`);
  }

  const isCreating = createMutation.isPending;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      {/* Page heading row */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight">Beställningar</h1>
        <Can action="order:create">
          <Button
            onClick={handleNyBestallning}
            disabled={isCreating}
            className="shrink-0"
          >
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Ny beställning
          </Button>
        </Can>
      </div>

      {/* Loading state */}
      {isLoading && (
        <>
          {/* Table skeletons (≥md) */}
          <div className="hidden md:flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
          {/* Card skeletons (<md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </>
      )}

      {/* Empty state — no drafts in DB yet (D-70) */}
      {rowsEmpty && (
        <div className="flex items-center justify-center flex-1 p-8">
          <div className="max-w-md w-full p-8 text-center bg-card border border-border rounded-lg shadow-sm">
            <ClipboardList className="h-12 w-12 text-slate-400 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Inga utkast ännu
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Skapa en ny beställning för att komma igång.
            </p>
            <Can action="order:create">
              <Button
                onClick={handleNyBestallning}
                disabled={isCreating}
              >
                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Ny beställning
              </Button>
            </Can>
          </div>
        </div>
      )}

      {/* Data: table (≥md) and card list (<md) */}
      {!isLoading && rows.length > 0 && (
        <>
          <DraftsTable
            items={rows}
            onRowClick={handleRowClick}
            className="hidden md:block"
          />
          <DraftsCardList
            items={rows}
            onCardClick={handleRowClick}
            className="block md:hidden"
          />
        </>
      )}
    </div>
  );
}
