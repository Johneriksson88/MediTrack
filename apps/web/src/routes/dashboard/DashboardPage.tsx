import { DashboardLowStockCard } from './DashboardLowStockCard';
import { DashboardOrdersCard } from './DashboardOrdersCard';

/**
 * Phase 6 D-118 / Phase 9 D-145 / D-146 — dashboard route.
 *
 * Composes the two dashboard cards into a responsive 2-column grid.
 *
 *   - <md  : single column, stacked. DashboardLowStockCard on top.
 *   - md+  : two columns side-by-side. DashboardLowStockCard left,
 *            DashboardOrdersCard right.
 *
 * Phase 6 D-118 originally specified the body as a single component
 * composition with no page-level heading element and no AppShell chrome
 * change — the CardTitles inside the cards serve as the page's primary
 * headings. Phase 9 widens this to a sibling grid of two components;
 * same principle holds (no chrome change beyond the route body, no
 * page-level heading is added here, AppShell + RoleRoute + bottom-tab
 * nav untouched).
 *
 * Grid container (D-145):
 *   - grid grid-cols-1 md:grid-cols-2 — single column mobile, two
 *     columns at md+ (768px) breakpoint.
 *   - gap-4 — consistent with the rest of the app's card spacing.
 *   - max-w-5xl mx-auto — caps the outer width on desktop so cards
 *     stay readable rather than stretching across the full viewport.
 *   - p-4 md:p-6 lg:p-8 — mobile-first padding pattern used elsewhere
 *     in the app (BestallningarPage, ComposeOrderPage).
 *
 * Card order (D-146): low-stock first (left/top), orders second
 * (right/bottom). Preserves the established placement so reviewers who
 * saw earlier Phase 6/7 screenshots aren't disoriented. Low-stock is
 * the originating Core Value loop trigger (nurse sees low stock →
 * composes order); Beställningar is the downstream consequence side.
 *
 * Phase 9 Plan 04 (gap closure of `dashboard-wide-screen-whitespace`):
 * the grid container gains `items-stretch` so both sibling cards share
 * the row's resolved height — the shorter card's frame extends to fill
 * the available grid cell instead of leaving empty space below it. The
 * paired card-side amendments (`h-full flex flex-col` on each Card +
 * `flex-1` on each data-branch CardContent) carry the stretch through
 * to the visible card frame. We did NOT widen the container at a
 * breakpoint tier above md (no wider-canvas amendment) despite the
 * wide-canvas symptom because CONTEXT.md `<discretion>` line 141 reads
 * as a ban on breakpoint-tier amendments above `md` on the grid
 * container — the card-side stretch is the dominant lever closing the
 * symptom regardless of container width.
 */
export function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
      <DashboardLowStockCard />
      <DashboardOrdersCard />
    </div>
  );
}
