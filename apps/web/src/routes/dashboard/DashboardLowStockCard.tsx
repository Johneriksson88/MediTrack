import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { useLowStockQuery } from '@/features/dashboard/useLowStockQuery';
import { LowStockBadge } from '@/components/LowStockBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Can } from '@/auth/Can';
import { RestockLowStockDialog } from '@/routes/bestallningar/RestockLowStockDialog';

/**
 * Phase 6 D-117 / D-118 / D-119 / D-120 / NTF-01 — dashboard low-stock card.
 *
 * Replaces the Phase 1 `<EmptyStateCard heading="Dashboard"/>` stub at
 * `/dashboard`. Enumerates every CareUnitMedication in the user's
 * vårdenhet whose `currentStock < lowStockThreshold`, sorted server-side
 * by urgency ratio (D-117). When the rendered rows exceed the available
 * card height, the inner card body scrolls (overflow-y-auto on the
 * data-branch CardContent).
 *
 * Four render states (UI-SPEC §1):
 *   - isLoading (initial mount): three Skeleton bars inside CardContent.
 *     Subsequent background refetches do NOT show the skeleton — the
 *     `isLoading` predicate is true only on the first fetch; `isFetching`
 *     fires on every refetch but we intentionally do not surface it
 *     (silent refresh per UI-SPEC §Refresh Indicators).
 *   - isError: a destructive Alert with the Swedish error copy. The
 *     30 s background poll handles retry automatically — no manual
 *     retry button per UI-SPEC §1.
 *   - data.total === 0: celebratory empty state. CheckCircle2 in
 *     emerald-600 + "Alla läkemedel är över tröskel." heading. Wrapped
 *     in a Card with role="status" so screen readers announce the
 *     state when it appears. NOT reusing EmptyStateCard (its icon
 *     defaults to slate-400; we want emerald — see UI-SPEC §1).
 *   - data.total > 0: full row enumeration. Each row: name (truncated
 *     at 180px to keep the layout stable on long Swedish names),
 *     "current / threshold" subtext, and the LowStockBadge reused from
 *     /lakemedel (Phase 2). Container is role="list" + each row is
 *     role="listitem" for screen-reader semantics (UI-SPEC §Accessibility).
 *
 * No refresh spinner. The query hook (useLowStockQuery) refetches on:
 *   - 30 s interval (D-119)
 *   - window focus (D-119)
 *   - sibling invalidation from useDeliverOrder + useMedicationMutations
 *     (D-119 — wired in the next commit).
 *
 * Phase 9 Plan 04 (gap-closure of `dashboard-wide-screen-whitespace`):
 * the data branch's Card now declares `h-full flex flex-col` and the
 * CardContent now declares `flex-1 overflow-y-auto` (dropping the
 * previous fixed-height scroll cap). The Card and CardContent also
 * expose `data-testid` hooks (`dashboard-low-stock-card-data` and
 * `dashboard-low-stock-card-content`) so the component test (Test 6)
 * can encode the wide-screen sizing invariant deterministically. When
 * the sibling DashboardOrdersCard renders taller content, the grid
 * row's `items-stretch` (set on the parent in DashboardPage) gives
 * this Card the matching height — the empty grid-cell space below the
 * previous fixed-height frame is gone.
 *
 * Phase 9 review WR-08 (follow-up to Plan 04): the same `h-full flex
 * flex-col` stretch is now also applied to the loading, error and
 * empty (celebratory) branches. Without this, the steady-state for a
 * nurse on a unit with NO under-threshold meds (orders card has data,
 * low-stock card is empty) reverted to the pre-fix wide-screen
 * asymmetry — the empty Card stayed centered at its intrinsic size
 * and the grid row still had empty space below it. The empty branch
 * is restructured so the celebratory Card itself fills the grid cell
 * via `h-full flex flex-col items-center justify-center` (instead of
 * relying on an outer wrapper with `flex-1`, which was a no-op under
 * the grid parent). Loading, error, and empty data-testid hooks
 * (`dashboard-low-stock-card-loading` / `-error` / `-empty`) are
 * exposed for the corresponding regression tests so this fix cannot
 * silently regress.
 */
export function DashboardLowStockCard() {
  const { data, isLoading, isError } = useLowStockQuery();
  const [restockOpen, setRestockOpen] = useState(false);

  if (isLoading) {
    return (
      <Card
        className="w-full max-w-2xl h-full flex flex-col"
        data-testid="dashboard-low-stock-card-loading"
      >
        <CardContent className="p-4 space-y-2 flex-1">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card
        className="w-full max-w-2xl h-full flex flex-col"
        data-testid="dashboard-low-stock-card-error"
      >
        <CardContent className="p-4 flex-1">
          <Alert variant="destructive">
            <AlertDescription>
              Kunde inte hämta lagernivåer — försök igen om en stund.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // data is defined at this point (no isLoading, no isError).
  // Defensive fallback satisfies the type narrowing.
  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];

  if (total === 0) {
    return (
      <Card
        className="w-full max-w-2xl h-full flex flex-col items-center justify-center text-center p-8 shadow-sm"
        role="status"
        data-testid="dashboard-low-stock-card-empty"
      >
        <CheckCircle2
          className="h-12 w-12 text-emerald-600 mb-4"
          aria-hidden="true"
        />
        <h2 className="text-xl font-semibold mb-2">
          Alla läkemedel är över tröskel.
        </h2>
        <p className="text-sm text-muted-foreground">
          Alla läkemedel i din vårdenhet är över lagertröskeln.
        </p>
      </Card>
    );
  }

  // Phase 10 (post-checkpoint quick fix) — cap the data-branch card at
  // viewport-minus-chrome (top header + bottom tab + page padding ~ 12rem)
  // so the rendered list scrolls INSIDE the card instead of stretching the
  // whole DashboardPage to ~158k px when the seed has thousands of low-stock
  // rows. The existing `flex-1 overflow-y-auto` on CardContent already
  // routes overflow to an internal scroll once the Card's height is bounded.
  // See deferred-items.md D-10-03 for the proper virtualization follow-up.
  return (
    <Card
      className="w-full max-w-2xl h-full max-h-[calc(100vh-12rem)] flex flex-col"
      data-testid="dashboard-low-stock-card-data"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Läkemedel under tröskel</CardTitle>
          <CardDescription>totalt {total} under tröskel</CardDescription>
        </div>
        <Can action="order:create">
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setRestockOpen(true)}
          >
            Beställ påfyllning
          </Button>
        </Can>
      </CardHeader>
      <RestockLowStockDialog open={restockOpen} onOpenChange={setRestockOpen} />
      <CardContent
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label="Läkemedel under tröskel"
        data-testid="dashboard-low-stock-card-content"
      >
        {rows.map((row) => (
          <div
            key={row.careUnitMedicationId}
            role="listitem"
            className="flex items-center justify-between py-2 min-h-[44px]"
          >
            <span className="text-sm font-normal truncate max-w-[180px]">
              {row.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {row.currentStock} / {row.lowStockThreshold}
              </span>
              <LowStockBadge />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
