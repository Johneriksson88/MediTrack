import { NavLink } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { cn } from '@/lib/utils';
import { visibleNav } from './nav';

/**
 * UI-SPEC §Sidebar — persistent left rail at md+.
 *
 * Widths:
 *   - md (768–1023): w-16 (64px) — icon only. `aria-label` required on
 *     each NavLink (UI-SPEC §Accessibility Floor).
 *   - lg+ (≥1024): w-60 (240px) — icon + label row, left-accent border on
 *     the active item (UI-SPEC §Sidebar).
 *
 * Active styling uses NavLink's render-prop className. `aria-current="page"`
 * is set by NavLink automatically for the active link; we don't override.
 *
 * Active border (4px) compensates by reducing left padding 4px (pl-[8px])
 * so the icon stays grid-aligned across active/inactive states.
 */
export function Sidebar() {
  const { user } = useAuth();
  const items = visibleNav(user?.role);

  return (
    <aside className="hidden md:flex md:w-16 lg:w-60 bg-[#F1F5F9] border-r border-[#E2E8F0] flex-col py-4 shrink-0">
      <nav className="flex flex-col" aria-label="Primary" data-test="primary-nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                'flex items-center min-h-[44px] gap-3 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2',
                'justify-center lg:justify-start',
                'px-3 lg:px-4',
                isActive
                  ? 'bg-[#DBEAFE] text-[#2563EB] border-l-4 border-[#2563EB] pl-[8px] lg:pl-[12px]'
                  : 'text-[#0F172A] hover:bg-[#E2E8F0]',
              )
            }
          >
            <item.icon
              className={cn(
                'h-5 w-5 shrink-0',
                // Icon color: blue on active (inherited via text-current),
                // muted slate on rest state (matches UI-SPEC §Sidebar inactive icon color).
              )}
              aria-hidden="true"
            />
            <span className="hidden lg:inline text-sm font-semibold">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
