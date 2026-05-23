import { DashboardLowStockCard } from './DashboardLowStockCard';

/**
 * Phase 6 D-118 / NTF-01 — dashboard route.
 *
 * Replaces the Phase 1 `<EmptyStateCard heading="Dashboard"/>` stub
 * with `<DashboardLowStockCard />`. Per UI-SPEC §IA Changes there is
 * no separate `<h1>` here — the CardTitle inside DashboardLowStockCard
 * ("Läkemedel under tröskel") serves as the page's primary heading.
 *
 * No layout chrome changes: AppShell, RoleRoute, and the bottom-tab
 * nav are untouched (D-118 — the change is contained to this one
 * route).
 */
export function DashboardPage() {
  return <DashboardLowStockCard />;
}
