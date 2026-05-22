import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';

/**
 * UI-SPEC §Empty State — reusable stub-page card.
 *
 * Used by every Phase 1 stub page (`/dashboard`, `/lakemedel`,
 * `/bestallningar`, `/admin/audit`) AND by Phase 5's AuditPage "no
 * events ever" empty state.
 *
 * The body text defaults to the Phase 1 stub copy
 * (`Den här vyn fylls i nästa fas.`) so existing callers stay unchanged.
 * Phase 5 D-104 / UI-SPEC §1 passes a bespoke `body` for the real
 * `Inga händelser ännu` empty state (`Händelser visas här när någon
 * ändrar något i systemet.`).
 *
 * Layout uses a centering wrapper so the card sits in the middle of the
 * available main-content area regardless of viewport height.
 */
export interface EmptyStateCardProps {
  icon: LucideIcon;
  heading: string;
  /**
   * Phase 5 widening — optional body text. Defaults to the Phase 1
   * stub copy. Pass an explicit string for real empty-state surfaces.
   */
  body?: string;
}

export function EmptyStateCard({
  icon: Icon,
  heading,
  body = 'Den här vyn fylls i nästa fas.',
}: EmptyStateCardProps) {
  return (
    <div className="flex items-center justify-center flex-1 p-8">
      <Card className="max-w-md w-full p-8 text-center shadow-sm">
        <Icon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-[#0F172A] mb-2">{heading}</h2>
        <p className="text-sm text-[#475569]">{body}</p>
      </Card>
    </div>
  );
}
