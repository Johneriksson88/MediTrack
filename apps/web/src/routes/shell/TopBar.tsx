import { Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

import { UserPillPopover } from './UserPillPopover';

/**
 * UI-SPEC §Top Bar — h-14 secondary surface (#F1F5F9) with bottom border.
 *
 * Layout:
 *   - Left: clickable logo (Stethoscope icon + "MediTrack" text) linking
 *     to /dashboard. text-sm/font-semibold per UI-SPEC §Typography (the
 *     UI-SPEC was revised to text-sm to honor the 4-size rule).
 *   - Right (desktop md+): <UserPillPopover/> — the user pill is the
 *     desktop logout entry point (UI-SPEC §User Pill).
 *   - Right (mobile <md): empty — user info + logout live on the Konto
 *     tab (UI-SPEC §App Shell Mobile).
 *
 * The login route renders without the shell, so this component is only
 * mounted from authenticated routes via <AppShell/>.
 */
export function TopBar() {
  return (
    <header className="h-14 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between px-4 md:px-6">
      <Link
        to="/dashboard"
        className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
      >
        <Stethoscope className="h-5 w-5 text-[#2563EB]" aria-hidden="true" />
        <span>MediTrack</span>
      </Link>

      <div className="hidden md:block">
        <UserPillPopover />
      </div>
    </header>
  );
}
