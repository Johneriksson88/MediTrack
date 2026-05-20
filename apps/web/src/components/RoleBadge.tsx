import type { Role } from '@meditrack/shared';
import { cn } from '@/lib/utils';

/**
 * UI-SPEC §Role Badge — reusable role-color chip.
 *
 * Maps the three Phase-1 roles to their locked color + Swedish label per
 * UI-SPEC §Role Badge Colors. The contrast pairs are WCAG AA verified
 * (see UI-SPEC §Color "Contrast check").
 *
 * Forward-compatibility: the same primitive shape will render status chips
 * in Phase 3+ (`Utkast` / `Skickad` / `Bekräftad` / `Levererad`) with
 * different `colorClass` + `label`. Keep prop-driven; a future plan can
 * genericize this into a `<Chip>` if a second role-style consumer lands.
 */
const ROLE_LABEL: Record<Role, string> = {
  apotekare: 'Apotekare',
  sjukskoterska: 'Sjuksköterska',
  admin: 'Admin',
};

const ROLE_CLASS: Record<Role, string> = {
  apotekare: 'bg-blue-100 text-blue-800',
  sjukskoterska: 'bg-teal-100 text-teal-700',
  admin: 'bg-amber-100 text-amber-800',
};

export interface RoleBadgeProps {
  role: Role;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
        ROLE_CLASS[role],
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
