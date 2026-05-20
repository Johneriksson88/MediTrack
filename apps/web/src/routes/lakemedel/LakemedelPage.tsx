import { Pill } from 'lucide-react';

import { EmptyStateCard } from '@/components/EmptyStateCard';

/**
 * UI-SPEC §Empty State / §Route Map — Läkemedel stub.
 *
 * Phase 2 replaces this with the medication registry (list / search /
 * filter / CRUD per PROJECT.md). The verbatim Swedish heading `Läkemedel`
 * is locked from UI-SPEC §Copy.
 */
export function LakemedelPage() {
  return <EmptyStateCard icon={Pill} heading="Läkemedel" />;
}
