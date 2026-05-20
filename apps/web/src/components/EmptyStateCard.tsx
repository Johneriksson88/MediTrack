import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';

/**
 * UI-SPEC §Empty State — reusable stub-page card.
 *
 * Used by every Phase 1 stub page (`/dashboard`, `/lakemedel`,
 * `/bestallningar`, `/admin/audit`). The body text is hardcoded per
 * UI-SPEC §Copy — it never varies across stub pages and is intentionally
 * not a prop so future plans can't drift the copy by accident.
 *
 * Layout uses a centering wrapper so the card sits in the middle of the
 * available main-content area regardless of viewport height.
 */
export interface EmptyStateCardProps {
  icon: LucideIcon;
  heading: string;
}

export function EmptyStateCard({ icon: Icon, heading }: EmptyStateCardProps) {
  return (
    <div className="flex items-center justify-center flex-1 p-8">
      <Card className="max-w-md w-full p-8 text-center shadow-sm">
        <Icon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-[#0F172A] mb-2">{heading}</h2>
        <p className="text-sm text-[#475569]">
          Den här vyn fylls i nästa fas.
        </p>
      </Card>
    </div>
  );
}
