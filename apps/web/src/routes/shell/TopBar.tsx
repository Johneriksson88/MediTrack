import { LogOut, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLogout } from '@/features/auth/useLogout';
import { UserPill } from './UserPill';

/**
 * UI-SPEC §Top Bar — h-14 secondary surface (#F1F5F9) with bottom border.
 *
 * Post-Phase-11 layout (D-170 / D-171 / D-174):
 *   - Left: clickable logo (Stethoscope icon + "MediTrack" text) linking
 *     to /dashboard. text-sm/font-semibold per UI-SPEC §Typography.
 *   - Right (desktop md+): static <UserPill/> identity display (D-171,
 *     non-interactive div — no popover, no click handler) + icon+label
 *     "Logga ut" button (D-174 desktop variant, hidden md:flex cluster).
 *   - Right (mobile <md): icon-only 44×44 "Logga ut" button (D-174 mobile
 *     variant, md:hidden, aria-label="Logga ut").
 *
 * Both per-breakpoint logout buttons share the same useLogout() hook —
 * single source of truth for DELETE /api/auth/session + cache eviction +
 * navigate('/login') (D-170). Konto-page destructive button retained (D-172).
 *
 * The login route renders without the shell, so this component is only
 * mounted from authenticated routes via <AppShell/>.
 */
export function TopBar() {
  const logout = useLogout();
  return (
    <header className="h-14 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between px-4 md:px-6">
      <Link
        to="/dashboard"
        className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
      >
        <Stethoscope className="h-5 w-5 text-[#2563EB]" aria-hidden="true" />
        <span>MediTrack</span>
      </Link>

      {/* Desktop right cluster: identity + logout — hidden < md */}
      <div className="hidden md:flex md:items-center md:gap-3">
        <UserPill />
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#DC2626] px-3 py-2 min-h-[44px] rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
        </button>
      </div>

      {/* Mobile right cluster: icon-only logout — visible only at < md */}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        aria-label="Logga ut"
        className="md:hidden inline-flex items-center justify-center h-11 w-11 text-[#DC2626] rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
      </button>
    </header>
  );
}
