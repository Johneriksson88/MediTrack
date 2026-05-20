import { ClipboardList } from 'lucide-react';

import { EmptyStateCard } from '@/components/EmptyStateCard';

/**
 * UI-SPEC §Empty State / §Route Map — Beställningar stub.
 *
 * Phase 3 (draft orders) and Phase 4 (confirm/deliver/stock) replace
 * this with the real orders surface. Verbatim Swedish heading per
 * UI-SPEC §Copy.
 */
export function BestallningarPage() {
  return <EmptyStateCard icon={ClipboardList} heading="Beställningar" />;
}
