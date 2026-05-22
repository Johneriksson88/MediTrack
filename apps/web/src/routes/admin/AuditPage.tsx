import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyStateCard } from '@/components/EmptyStateCard';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAuditEventsQuery } from './useAuditEventsQuery';
import { useAuditFiltersQuery } from './useAuditFiltersQuery';
import { AuditFilterBar, type AuditFilters } from './AuditFilterBar';
import { AuditTable } from './AuditTable';
import { AuditCardList } from './AuditCardList';

/**
 * Phase 5 D-90..D-105 / UI-SPEC §1 — `/admin/audit` page orchestrator.
 *
 * REPLACES the Phase 1 EmptyStateCard stub with the real forensics
 * surface. AUD-02 verbatim: admin browses the audit log in
 * reverse-chronological order, filtered by user/entity/action.
 *
 * URL-as-state (D-103): `?actor=...&entity=...&action=...&requestId=...`.
 * useSearchParams is the source of truth; filter changes call
 * `setSearchParams((prev) => ...)` to preserve other params and trigger
 * a re-query via the filters object identity baked into the query key.
 *
 * Cursor pagination (D-105): TanStack `useInfiniteQuery` with
 * `getNextPageParam` reading the BE's `nextCursor`. "Läs in fler" button
 * fetches the next 50; when `hasNextPage === false`, the end-of-list
 * paragraph replaces the button.
 *
 * Expanded-row state (D-102 / D-104): page owns `expandedIds: Set<string>`
 * and threads through to AuditTable + AuditCardList. The diff panel
 * itself is wired in Task 3.
 *
 * RoleRoute (Phase 1 D-12) already gates the route to `roles={['admin']}`;
 * no in-page role gate is needed.
 */
export function AuditPage() {
  useDocumentTitle('Granskningslogg — MediTrack');
  const [searchParams] = useSearchParams();

  // Read filters from URL — single source of truth.
  const filters: AuditFilters = {
    actor: searchParams.get('actor') ?? '',
    entity: searchParams.get('entity') ?? '',
    action: searchParams.get('action') ?? '',
    requestId: searchParams.get('requestId') ?? '',
  };

  // useInfiniteQuery key is stable iff the filters object is — memoize
  // a plain object with only set values so the BE only sees real filters.
  const queryFilters = useMemo(
    () => ({
      ...(filters.actor && { actorUserId: filters.actor }),
      ...(filters.entity && { entityType: filters.entity }),
      ...(filters.action && { action: filters.action }),
      ...(filters.requestId && { requestId: filters.requestId }),
    }),
    [filters.actor, filters.entity, filters.action, filters.requestId],
  );

  const eventsQuery = useAuditEventsQuery(queryFilters);
  const filtersQuery = useAuditFiltersQuery();

  // Flat-map all loaded pages into a single events array (D-105).
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((p) => p.events) ?? [],
    [eventsQuery.data],
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFiltersChanged() {
    // Collapse all expanded rows on filter change — the rows the admin
    // expanded might not be in the new result set. The FilterBar owns
    // the setSearchParams call; this hook only resets the expand state.
    setExpandedIds(new Set());
  }

  const hasAnyFilter =
    !!filters.actor || !!filters.entity || !!filters.action || !!filters.requestId;
  const isLoading = eventsQuery.isLoading;
  const isFetchingNextPage = eventsQuery.isFetchingNextPage;
  const hasNextPage = eventsQuery.hasNextPage ?? false;
  const eventsEmpty =
    !isLoading && eventsQuery.data !== undefined && events.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      {/* Page heading */}
      <h1 className="text-2xl font-semibold leading-tight">Granskningslogg</h1>

      {/* Filter bar (URL-as-state — FilterBar owns setSearchParams; D-103) */}
      <AuditFilterBar
        filters={filters}
        filterSource={filtersQuery.data}
        filterSourceLoading={filtersQuery.isLoading}
        onFiltersChanged={handleFiltersChanged}
      />

      {/* Loading state — 8 row skeletons on md+, 4 card skeletons on <md */}
      {isLoading && (
        <>
          <div className="hidden md:flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </>
      )}

      {/* Empty state — no filters AND zero events (no events ever in the system) */}
      {eventsEmpty && !hasAnyFilter && (
        <EmptyStateCard
          icon={ShieldCheck}
          heading="Inga händelser ännu"
          body="Händelser visas här när någon ändrar något i systemet."
        />
      )}

      {/* Empty state — filters active AND zero matches */}
      {eventsEmpty && hasAnyFilter && (
        <p className="text-sm text-muted-foreground text-center py-12">
          Inga händelser matchade filtren.
        </p>
      )}

      {/* Data — responsive table/card */}
      {!isLoading && events.length > 0 && (
        <>
          <AuditTable
            events={events}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            className="hidden md:block"
          />
          <AuditCardList
            events={events}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            className="block md:hidden"
          />

          {/* Pagination footer */}
          <div className="mt-6 flex justify-center mb-12">
            {hasNextPage ? (
              <Button
                variant="outline"
                onClick={() => eventsQuery.fetchNextPage()}
                disabled={isFetchingNextPage}
                className="min-h-[44px]"
                type="button"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin mr-2"
                      aria-hidden="true"
                    />
                    Läser in fler händelser...
                  </>
                ) : (
                  'Läs in fler'
                )}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6 mt-4">
                Inga fler händelser att visa.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
