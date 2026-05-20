import {
  ClipboardList,
  LayoutDashboard,
  Pill,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';

/**
 * UI-SPEC §Information Architecture & Navigation — single source of truth
 * for Phase 1 nav destinations.
 *
 * Both `<Sidebar/>` (md+) and `<BottomTabBar/>` (<md) consume this array,
 * so adding a new top-level route is a single-file change. The five
 * Phase 1 entries are listed in display order; the admin entry is gated
 * by `adminOnly: true` and is filtered out for non-admin roles at render
 * time.
 *
 * Phase 2+ will extend this array as more top-level routes land
 * (e.g. medication detail, audit list). The `adminOnly` flag pattern
 * generalizes to other role-based gates if/when finer-grained nav
 * gating is needed; alternatively swap to a `Can`-based filter once the
 * `<Can action="…">` permission model has a more relevant action key.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly: boolean;
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/lakemedel', label: 'Läkemedel', icon: Pill, adminOnly: false },
  { to: '/bestallningar', label: 'Beställningar', icon: ClipboardList, adminOnly: false },
  { to: '/konto', label: 'Konto', icon: User, adminOnly: false },
  { to: '/admin/audit', label: 'Admin', icon: ShieldCheck, adminOnly: true },
];

/**
 * Returns the NAV items visible to a user of the given role.
 * Admin-only items are filtered out unless `role === 'admin'`.
 * Accepts `null` to handle the loading state (no items visible yet).
 */
export function visibleNav(role: string | null | undefined): NavItem[] {
  return NAV.filter((item) => !item.adminOnly || role === 'admin');
}
