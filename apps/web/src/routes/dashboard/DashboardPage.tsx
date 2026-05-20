import { LayoutDashboard } from 'lucide-react';

import { EmptyStateCard } from '@/components/EmptyStateCard';

/**
 * UI-SPEC §Empty State / §Route Map — Phase 1 dashboard stub.
 *
 * Plan 02 shipped a temporary dashboard that rendered `Inloggad som …`
 * to prove the walking-skeleton slice end-to-end. Plan 04 replaces that
 * stub with the canonical EmptyStateCard. Phase 6 (low-stock banner) is
 * where the real dashboard content lands.
 */
export function DashboardPage() {
  return <EmptyStateCard icon={LayoutDashboard} heading="Dashboard" />;
}
