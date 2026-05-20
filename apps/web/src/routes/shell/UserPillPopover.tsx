import { useAuth } from '@/auth/useAuth';
import { RoleBadge } from '@/components/RoleBadge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLogout } from '@/features/auth/useLogout';

/**
 * UI-SPEC §User Pill / §Top Bar — desktop logout entry point.
 *
 * Pill structure: {name} · <RoleBadge/> · {careUnit.name}. Clicking the
 * pill opens a 48×N popover whose only content is a "Logga ut" text
 * button (NOT a destructive Button — UI-SPEC §User Pill is explicit). The
 * destructive color is text-only `text-[#DC2626]`.
 *
 * Radix Popover handles Escape + click-outside-to-close natively
 * (UI-SPEC §Accessibility Floor).
 *
 * If `useAuth()` returns no user (shouldn't happen post-AuthGate), render
 * nothing — defense in depth.
 */
export function UserPillPopover() {
  const { user } = useAuth();
  const logout = useLogout();

  if (!user) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 cursor-pointer hover:bg-[#E2E8F0]/60"
        >
          <span className="text-sm font-semibold text-[#0F172A]">
            {user.name}
          </span>
          <span className="text-[#64748B] mx-2" aria-hidden="true">
            ·
          </span>
          <RoleBadge role={user.role} />
          <span className="text-[#64748B] mx-2" aria-hidden="true">
            ·
          </span>
          <span className="text-sm text-[#64748B]">{user.careUnit.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-48 shadow-md p-2"
      >
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="w-full text-left text-sm text-[#DC2626] font-semibold px-2 py-1 rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
        </button>
      </PopoverContent>
    </Popover>
  );
}
