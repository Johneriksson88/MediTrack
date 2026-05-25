import { CheckCircle2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { DashboardOrderRow } from '@meditrack/shared';
import { useDashboardOrdersQuery } from '@/features/dashboard/useDashboardOrdersQuery';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative } from '@/routes/bestallningar/DraftCard';

/**
 * Phase 9 D-141 / D-142 / D-145 / D-146 / D-147 / D-148 — Dashboard
 * "Beställningar" card.
 *
 * Sibling of DashboardLowStockCard on the /dashboard route. Discriminates
 * on the server-returned `data.role` (D-142) and renders one of two
 * subviews:
 *
 *   - sjukskoterska (nurse):
 *       Section 1: "Egna utkast" (count + top-5 own utkast rows)
 *       Section 2: "Senaste beställningar" (top-5 vårdenhet-wide
 *         non-utkast rows; D-143)
 *
 *   - apotekare / admin:
 *       Section 1: "Väntar på bekräftelse" (count + top-5 skickad rows)
 *       Section 2: "Väntar på leverans" (count + top-5 bekraftad rows)
 *
 * Four render states (UI-SPEC §1, mirrors DashboardLowStockCard):
 *   - isLoading: TWO stacked sections each with a header skeleton + 3
 *     row skeletons (denser than the low-stock card because there are
 *     two sections — per CONTEXT.md `<specifics>` line 140).
 *   - isError: a destructive Alert with the Swedish error copy. The 30 s
 *     background poll (D-148) handles retry automatically.
 *   - data + role-relevant totals === 0: celebratory empty state. Card
 *     with role="status" + CheckCircle2 in text-emerald-600 (D-147 — the
 *     shared empty-state primitive defaults to slate-400 on the icon
 *     which is the wrong color for this affirmative branch).
 *   - data + content: two stacked sections. Each section's CardHeader
 *     CardTitle is a <Link> to `/bestallningar?status=<tab>` (D-150 #4
 *     forward-compat for the section-header click affordance). Each row
 *     is a <Link> to `/bestallningar/:id?from=<row.status>` so the
 *     Slice A back-link helper resolves correctly on back-nav from the
 *     detail page (D-149 / D-156).
 *
 * Row layout (mobile-first, 44px touch target — same as the low-stock card):
 *   - Top line: formatRelative(row.createdAt) + ChevronRight on the right.
 *   - Middle line: "Skapad av {row.createdBy.name}" (text-xs muted).
 *   - Bottom line: "{lineCount} rad{eror} · totalt {totalQuantity}".
 *
 * No refresh spinner — the query hook (useDashboardOrdersQuery) refetches on:
 *   - 30 s interval (D-148)
 *   - window focus (D-148)
 *   - sibling invalidation from the 5 order mutations in
 *     useOrderMutations.ts (D-148 — wired alongside the existing
 *     ['dashboard', 'low-stock'] invalidations).
 *
 * Phase 9 Plan 04 (gap-closure of `dashboard-wide-screen-whitespace`):
 * the two data-branch Cards now declare `h-full flex flex-col` and
 * their CardContents now declare `flex-1` so the orders card stretches
 * to the same grid-row height as the sibling low-stock card under the
 * parent's new `items-stretch` rule. Both data branches also expose
 * `data-testid` hooks (`dashboard-orders-card-data` on the Card and
 * `dashboard-orders-card-content` on the CardContent — same values
 * across nurse and pharmacist/admin branches because only one branch
 * renders per session) so Test 10 can encode the wide-screen sizing
 * invariant deterministically. Loading, error, and empty branches are
 * unchanged — they have their own centered visual shape.
 */
export function DashboardOrdersCard() {
  const { data, isLoading, isError } = useDashboardOrdersQuery();

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
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
              Kunde inte hämta beställningar — försök igen om en stund.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    // Defensive: !isLoading && !isError but no data — render nothing
    // visible. Should not happen in practice (TanStack guarantees one
    // of the three).
    return null;
  }

  // --- Empty-state branches (D-147) ---------------------------------------
  if (data.role === 'sjukskoterska') {
    if (data.egnaUtkast.count === 0 && data.recentHistory.length === 0) {
      return (
        <EmptyState
          heading="Inga aktiva beställningar."
          sub="Skapa en ny beställning när ni behöver fylla på."
        />
      );
    }
    return (
      <Card
        className="w-full max-w-2xl h-full flex flex-col"
        data-testid="dashboard-orders-card-data"
      >
        <CardContent
          className="p-4 space-y-4 flex-1"
          data-testid="dashboard-orders-card-content"
        >
          <Section
            title="Egna utkast"
            count={data.egnaUtkast.count}
            statusHref="/bestallningar?status=utkast"
            rows={data.egnaUtkast.rows}
          />
          <Section
            title="Senaste beställningar"
            statusHref="/bestallningar?status=alla"
            rows={data.recentHistory}
          />
        </CardContent>
      </Card>
    );
  }

  // apotekare | admin
  if (data.skickad.count === 0 && data.bekraftad.count === 0) {
    return (
      <EmptyState
        heading="Inga beställningar väntar på åtgärd."
        sub="Allt hängt klart — inget att bekräfta eller leverera just nu."
      />
    );
  }
  return (
    <Card
      className="w-full max-w-2xl h-full flex flex-col"
      data-testid="dashboard-orders-card-data"
    >
      <CardContent
        className="p-4 space-y-4 flex-1"
        data-testid="dashboard-orders-card-content"
      >
        <Section
          title="Väntar på bekräftelse"
          count={data.skickad.count}
          statusHref="/bestallningar?status=skickad"
          rows={data.skickad.rows}
        />
        <Section
          title="Väntar på leverans"
          count={data.bekraftad.count}
          statusHref="/bestallningar?status=bekraftad"
          rows={data.bekraftad.rows}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  /** Swedish section heading, also used as the aria-label on the row list. */
  title: string;
  /** Total matching rows on the server (may exceed rows.length). Optional
   *  for nurse's Senaste beställningar which has no count by D-144. */
  count?: number;
  /** Destination of the clickable section header. */
  statusHref: string;
  /** Top-5 preview rows. */
  rows: DashboardOrderRow[];
}

function Section({ title, count, statusHref, rows }: SectionProps) {
  return (
    <div className="space-y-2">
      <CardHeader className="p-0">
        <Link
          to={statusHref}
          className="hover:underline focus-visible:underline outline-none"
        >
          <CardTitle className="text-base">{title}</CardTitle>
        </Link>
        {count !== undefined && (
          <CardDescription>totalt {count}</CardDescription>
        )}
      </CardHeader>
      {rows.length === 0 ? (
        // WR-03 (Phase 9 review) — a <p> cannot legally carry role="list":
        // phrasing content cannot host listitem children, and a list with
        // zero listitems plus a free-floating text node is invalid per
        // ARIA 1.2. Drop the bogus role entirely; the empty-state copy is
        // just a paragraph.
        <p className="text-xs text-muted-foreground px-2 py-2">
          Inga rader.
        </p>
      ) : (
        // WR-02 (Phase 9 review) — use a real <ul>/<li> structure so the
        // <Link> (which renders an <a>) keeps its implicit `link` role for
        // assistive tech. Previously the <Link> itself carried
        // role="listitem" which ARIA-overrode the anchor's link role; SR
        // users heard "list item" without the actionable affordance hint.
        // Now: <ul role="list"> > <li> > <Link>. Both list and link
        // semantics survive.
        <ul role="list" aria-label={title} className="list-none p-0 m-0">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/bestallningar/${row.id}?from=${row.status}`}
                className="flex items-center justify-between py-2 min-h-[44px]
                           px-2 hover:bg-muted/50 transition-colors rounded-sm
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-primary focus-visible:ring-offset-1"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  {/* Phase 10 D-168 — primary line promotes orderNumber to the
                      row's identity slot; font-mono renders it as a code-style
                      string. The actor + relative timestamp consolidate into
                      the second muted line below. */}
                  <span className="text-sm font-semibold text-foreground font-mono">
                    {row.orderNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Skapad av {row.createdBy.name} ·{' '}
                    {formatRelative(row.createdAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.lineCount} {row.lineCount === 1 ? 'rad' : 'rader'} ·
                    {' '}totalt {row.totalQuantity}
                  </span>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground flex-shrink-0"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface EmptyStateProps {
  heading: string;
  sub: string;
}

function EmptyState({ heading, sub }: EmptyStateProps) {
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
        <h2 className="text-xl font-semibold mb-2">{heading}</h2>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </Card>
    </div>
  );
}
