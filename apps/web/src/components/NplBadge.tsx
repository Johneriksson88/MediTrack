import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Phase 2 D-32 / UI-SPEC §"Från NPL Badge Color Contract" — NPL source badge.
 *
 * Renders a slate-toned badge indicating that a medication's name/form/
 * strength fields are locked because they come from the Läkemedelsverket
 * NPL registry (D-32).
 *
 * Props: children defaults to 'Från NPL' but the full lock-note variant
 * in the edit Sheet passes: 'Från NPL · namn / form / styrka är låsta'.
 * Pattern: structurally mirrors RoleBadge.tsx.
 *
 * Color: bg-slate-100 / text-slate-600 per UI-SPEC (4.6:1 contrast on white).
 */
export interface NplBadgeProps {
  children?: ReactNode;
}

export function NplBadge({ children = 'Från NPL' }: NplBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        'bg-slate-100 text-slate-600',
      )}
    >
      {children}
    </span>
  );
}
