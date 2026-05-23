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

/**
 * Phase 6 D-117 / D-118 / D-119 / D-120 / NTF-01 — dashboard low-stock card.
 *
 * Replaces the Phase 1 `<EmptyStateCard heading="Dashboard"/>` stub at
 * `/dashboard`. Enumerates every CareUnitMedication in the user's
 * vårdenhet whose `currentStock < lowStockThreshold`, sorted server-side
 * by urgency ratio (D-117). When the list exceeds ~5 rows, the inner
 * card body scrolls (`max-h-80 overflow-y-auto`).
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
 */
export function DashboardLowStockCard() {
  const { data, isLoading, isError } = useLowStockQuery();

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="p-4">
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
      <div className="flex items-center justify-center flex-1 p-8">
        <Card
          className="max-w-md w-full p-8 text-center shadow-sm"
          role="status"
        >
          <CheckCircle2
            className="h-12 w-12 text-emerald-600 mx-auto mb-4"
            aria-hidden="true"
          />
          <h2 className="text-xl font-semibold mb-2">
            Alla läkemedel är över tröskel.
          </h2>
          <p className="text-sm text-muted-foreground">
            Alla läkemedel i din vårdenhet är över lagertröskeln.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Läkemedel under tröskel</CardTitle>
        <CardDescription>{total} läkemedel</CardDescription>
      </CardHeader>
      <CardContent
        className="max-h-80 overflow-y-auto"
        role="list"
        aria-label="Läkemedel under tröskel"
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
