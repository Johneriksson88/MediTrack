import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phase 6 D-111 / UI-SPEC §3 — Confidence band badge.
 *
 * Renders the discrete `'hog' | 'medel' | 'lag'` confidence band returned
 * by `aiSuggestionResponse.confidence`. The raw LLM float (0..1) is
 * bucketed server-side inside `aiCategorization.service.ts` so the FE
 * never sees the raw number — D-111 keeps the UI honest about LLM
 * self-reported confidence.
 *
 * Structural parallel to RoleBadge.tsx (typed VARIANT_MAP). DO NOT
 * extend shadcn `<Badge>` with new variants per UI-SPEC §3 footer — the
 * className override approach below avoids modifying `badge.tsx` for
 * Phase 6-specific colors.
 *
 * WCAG AA contrast verified in UI-SPEC §Color:
 *   - hog:   green-700 on green-100  ≈ 6.1:1  PASS
 *   - medel: yellow-700 on yellow-100 ≈ 4.8:1 PASS
 *   - lag:   slate-500 on slate-100   ≈ 4.7:1 PASS
 */

const VARIANT_MAP = {
  hog: {
    className: 'bg-green-100 text-green-700',
    icon: TrendingUp,
    label: 'Hög säkerhet',
  },
  medel: {
    className: 'bg-yellow-100 text-yellow-700',
    icon: Minus,
    label: 'Medel säkerhet',
  },
  lag: {
    className: 'bg-slate-100 text-slate-500',
    icon: TrendingDown,
    label: 'Låg säkerhet',
  },
} as const;

export interface ConfidenceBadgeProps {
  confidence: 'hog' | 'medel' | 'lag';
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const { className, icon: Icon, label } = VARIANT_MAP[confidence];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
