import { ShieldCheck } from 'lucide-react';

import { EmptyStateCard } from '@/components/EmptyStateCard';

/**
 * UI-SPEC §Empty State / §Route Map — Admin audit stub (admin-only route).
 *
 * Reachable only via `<RoleRoute roles={['admin']}/>` (D-12). Phase 5
 * replaces this with the real append-only audit log browse view.
 */
export function AuditPage() {
  return <EmptyStateCard icon={ShieldCheck} heading="Admin" />;
}
