import { useAuth } from '@/auth/useAuth';
import { RoleBadge } from '@/components/RoleBadge';

/**
 * UI-SPEC §User Pill / §Top Bar — static identity display (desktop md+).
 *
 * Post-Phase-11 (D-171): This component is no longer a popover trigger.
 * The popover wrapper (`<Popover>/<PopoverTrigger>/<PopoverContent>`) has
 * been removed. Logout now lives in TopBar.tsx directly (D-170/D-174);
 * this component is identity display only — non-interactive.
 *
 * Pill structure: {name} · <RoleBadge/> · {careUnit.name} inside a plain
 * `<div>` with no click handler, no role="button", no focus style.
 *
 * If `useAuth()` returns no user (shouldn't happen post-AuthGate), render
 * nothing — defense in depth.
 */
export function UserPill() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center">
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
    </div>
  );
}
