import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Can } from '@/auth/Can';
import { useDraftsQuery, useOrdersByStatusQuery } from '@/features/orders/useOrderQueries';
import { useCreateDraftOrder } from '@/features/orders/useOrderMutations';
import { useLowStockQuery } from '@/features/dashboard/useLowStockQuery';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { DraftsTable } from './DraftsTable';
import { DraftsCardList } from './DraftsCardList';
import { OrdersTable } from './OrdersTable';
import { OrdersCardList } from './OrdersCardList';
import { RestockLowStockDialog } from './RestockLowStockDialog';

/**
 * Phase 4 ORD-07 / D-82 — Beställningar history with status-tab filter.
 *
 * Extends Phase 3 drafts-only listing to a per-vårdenhet order history with
 * five URL-deep-linkable status tabs (Utkast | Skickade | Bekräftade | Levererade | Alla).
 *
 * URL state: ?status=utkast (default when param absent) drives tab value.
 * onValueChange calls setSearchParams({ status: newValue }) — URL updates without reload.
 *
 * Query branching:
 *   - Utkast tab → useDraftsQuery() (Phase 3 back-compat; cache key ['orders', {status:'utkast'}])
 *   - All other tabs → useOrdersByStatusQuery(status) (Phase 4; status sent verbatim to API)
 *     'alla' is sent as the string 'alla'; BE pre-parser expands to all four statuses.
 *
 * Both hooks are called unconditionally (React Hook rules). The active status
 * determines which result is displayed.
 *
 * Tab strip aesthetic: underlined tabs per UI-SPEC §Components 1 (bg-transparent,
 * border-b, active tab border-b-2 border-primary).
 *
 * Loading state (tab switch): skeleton rows + cards; tab strip stays interactive.
 *
 * Empty states per UI-SPEC §Empty States:
 *   Utkast    → existing EmptyStateCard with 'Ny beställning' CTA (Phase 3 unchanged)
 *   Skickade  → inline paragraph: 'Inga skickade beställningar.'
 *   Bekräftade→ inline paragraph: 'Inga bekräftade beställningar.'
 *   Levererade→ inline paragraph: 'Inga levererade beställningar ännu.'
 *   Alla      → inline paragraph (no CTA for history tabs)
 */

type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';
type NonUtkastTab = 'skickad' | 'bekraftad' | 'levererad' | 'alla';

const VALID_STATUSES: StatusTab[] = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'];

function isValidStatus(s: string): s is StatusTab {
  return VALID_STATUSES.includes(s as StatusTab);
}

function isNonUtkast(s: StatusTab): s is NonUtkastTab {
  return s !== 'utkast';
}

export function BestallningarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawStatus = searchParams.get('status') ?? 'utkast';
  const status: StatusTab = isValidStatus(rawStatus) ? rawStatus : 'utkast';

  // Both queries called unconditionally (React Hook rules).
  const draftsQuery = useDraftsQuery();
  const ordersQuery = useOrdersByStatusQuery(isNonUtkast(status) ? status : 'utkast');

  // Select the active query result.
  const activeQuery = status === 'utkast' ? draftsQuery : ordersQuery;

  const createMutation = useCreateDraftOrder();
  const lowStockQuery = useLowStockQuery();
  const [restockOpen, setRestockOpen] = useState(false);
  const noLowStock = lowStockQuery.data?.total === 0;

  useDocumentTitle('Beställningar — MediTrack');

  const rows = activeQuery.data?.rows ?? [];
  const isLoading = activeQuery.isLoading;
  const rowsEmpty = !isLoading && activeQuery.data !== undefined && rows.length === 0;

  async function handleNyBestallning() {
    const response = await createMutation.mutateAsync();
    // Phase 9 D-150 #3 + <discretion> — a new draft always lives in Utkast,
    // so ?from=utkast is correct regardless of which tab the user is on.
    navigate(`/bestallningar/${response.id}?from=utkast`);
  }

  const isCreating = createMutation.isPending;

  function handleTabChange(value: string) {
    // Preserve other query params (deep-link filters, debug flags, Phase 7+
    // pagination) — only update the status key. setSearchParams({ status })
    // would replace the entire query string.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('status', value);
      return next;
    });
  }

  function getEmptyStateText(): string | null {
    switch (status) {
      case 'skickad':
        return 'Inga skickade beställningar.';
      case 'bekraftad':
        return 'Inga bekräftade beställningar.';
      case 'levererad':
        return 'Inga levererade beställningar ännu.';
      default:
        return null;
    }
  }

  const nonUtkastEmptyText = getEmptyStateText();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      {/* Page heading row */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight">Beställningar</h1>
        <Can action="order:create">
          <div className="flex items-center gap-2">
            {noLowStock ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/*
                     * span wrapper because a disabled button does not fire
                     * pointer events that Radix Tooltip listens to.
                     */}
                    <span tabIndex={0} aria-disabled="true">
                      <Button
                        variant="outline"
                        disabled
                        className="shrink-0 pointer-events-none"
                      >
                        Beställ påfyllning
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Inga läkemedel under tröskel.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                variant="outline"
                onClick={() => setRestockOpen(true)}
                disabled={lowStockQuery.isLoading}
                className="shrink-0"
              >
                Beställ påfyllning
              </Button>
            )}
            <Button
              onClick={handleNyBestallning}
              disabled={isCreating}
              className="shrink-0"
            >
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Ny beställning
            </Button>
          </div>
        </Can>
      </div>

      <RestockLowStockDialog open={restockOpen} onOpenChange={setRestockOpen} />

      {/* Status-tab filter (ORD-07 D-82) */}
      <Tabs value={status} onValueChange={handleTabChange}>
        {/* Tab strip — underlined aesthetic per UI-SPEC §Components 1 */}
        <TabsList
          aria-label="Beställningsstatus"
          className="bg-transparent border-b border-border rounded-none p-0 overflow-x-auto flex-nowrap w-full justify-start h-auto"
        >
          {(
            [
              { value: 'utkast', label: 'Utkast' },
              { value: 'skickad', label: 'Skickade' },
              { value: 'bekraftad', label: 'Bekräftade' },
              { value: 'levererad', label: 'Levererade' },
              { value: 'alla', label: 'Alla' },
            ] as const
          ).map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary
                         data-[state=active]:text-foreground font-semibold text-xs text-muted-foreground
                         pb-2 flex-shrink-0 whitespace-nowrap px-4 py-2 bg-transparent
                         hover:text-foreground transition-colors focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab content — shared layout for all 5 tabs */}
        {(
          ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'] as const
        ).map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4">
            {/* Loading state */}
            {isLoading && status === tabValue && (
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

            {/* Empty state — Utkast */}
            {rowsEmpty && status === tabValue && tabValue === 'utkast' && (
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

            {/* Empty state — Alla (no CTA — history is passive) */}
            {rowsEmpty && status === tabValue && tabValue === 'alla' && (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Inga beställningar ännu.
              </p>
            )}

            {/* Empty state — non-Utkast status tabs (informational text only) */}
            {rowsEmpty && status === tabValue && tabValue !== 'utkast' && tabValue !== 'alla' && nonUtkastEmptyText && (
              <p className="text-sm text-muted-foreground py-12 text-center">
                {nonUtkastEmptyText}
              </p>
            )}

            {/* Data: Utkast tab → Phase 3 DraftsTable / DraftsCardList */}
            {!isLoading && rows.length > 0 && status === tabValue && tabValue === 'utkast' && (
              <>
                <DraftsTable
                  items={rows}
                  onRowClick={(row) => navigate(`/bestallningar/${row.id}?from=utkast`)}
                  className="hidden md:block"
                />
                <DraftsCardList
                  items={rows}
                  onCardClick={(row) => navigate(`/bestallningar/${row.id}?from=utkast`)}
                  className="block md:hidden"
                />
              </>
            )}

            {/* Data: non-Utkast tabs → new OrdersTable / OrdersCardList */}
            {!isLoading && rows.length > 0 && status === tabValue && tabValue !== 'utkast' && (
              <>
                <OrdersTable
                  rows={rows}
                  tab={tabValue}
                  className="hidden md:block"
                />
                <OrdersCardList
                  rows={rows}
                  tab={tabValue}
                  className="block md:hidden"
                />
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
