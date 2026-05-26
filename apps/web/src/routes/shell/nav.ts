import {
  ClipboardList,
  LayoutDashboard,
  Library,
  Pill,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@meditrack/shared';

/**
 * UI-SPEC §Information Architecture & Navigation — single source of truth
 * for nav destinations.
 *
 * Both `<Sidebar/>` (md+) and `<BottomTabBar/>` (<md) consume this array,
 * so adding a new top-level route is a single-file change. Entries with a
 * `roles` list are filtered out for users whose role is not in the list;
 * entries without one are visible to every authenticated role.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * Roles allowed to see this nav entry. `undefined` means visible to all
   * authenticated roles (the historical default — items without a role list
   * are open). Mirrors the BE role gate so the sidebar and the route-level
   * `RoleRoute` never disagree.
   */
  roles?: readonly Role[];
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/lakemedel', label: 'Läkemedel', icon: Pill },
  { to: '/bestallningar', label: 'Beställningar', icon: ClipboardList },
  { to: '/sortiment', label: 'Sortiment', icon: Library, roles: ['apotekare', 'admin'] },
  { to: '/konto', label: 'Konto', icon: User },
  { to: '/admin/users', label: 'Användare', icon: Users, roles: ['admin'] },
  { to: '/admin/audit', label: 'Granskning', icon: ShieldCheck, roles: ['admin'] },
];

/**
 * Returns the NAV items visible to a user of the given role.
 * Items with no `roles` list are open to every authenticated role.
 * Accepts `null` to handle the loading state (no items visible yet).
 */
export function visibleNav(role: string | null | undefined): NavItem[] {
  return NAV.filter((item) => !item.roles || (role !== null && role !== undefined && item.roles.includes(role as Role)));
}
