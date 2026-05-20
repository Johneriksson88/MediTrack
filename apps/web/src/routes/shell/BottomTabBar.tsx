import { NavLink } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { cn } from '@/lib/utils';
import { visibleNav } from './nav';

/**
 * UI-SPEC §Bottom Tab Bar — fixed mobile nav (<md).
 *
 * Height 56px (h-14) + iOS safe-area inset (`pb-[env(safe-area-inset-bottom)]`).
 * Items distribute equally with `flex-1`; each tab is a 44×44 touch target
 * minimum (UI-SPEC §Spacing Scale).
 *
 * Active state: text-[#2563EB] (icon + label). Inactive: text-[#64748B].
 * NavLink sets `aria-current="page"` for the active route.
 *
 * Admin tab is hidden for non-admin users (UI-SPEC §Nav). The whole nav
 * wrapper uses `aria-label="Primary"` per UI-SPEC §Accessibility Floor.
 */
export function BottomTabBar() {
  const { user } = useAuth();
  const items = visibleNav(user?.role);

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-[#F1F5F9] border-t border-[#E2E8F0] flex pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center justify-center min-h-[44px] gap-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-inset',
              isActive ? 'text-[#2563EB]' : 'text-[#64748B]',
            )
          }
        >
          <item.icon className="h-6 w-6" aria-hidden="true" />
          <span className="text-xs font-semibold">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
