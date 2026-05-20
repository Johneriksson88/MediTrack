import { useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import { Can } from '@/auth/Can';
import { RoleBadge } from '@/components/RoleBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/useLogout';
import { ApiError, fetchJson } from '@/lib/api';

/**
 * UI-SPEC §Konto / §User Pill / §403 `<Can>` Gate Pattern.
 *
 * Phase-1 account page — mobile users land here from the bottom tab bar
 * and use it as their logout entry point (desktop has the user-pill
 * popover). Page content:
 *
 *   - User info (name + RoleBadge + careUnit.name)
 *   - Logga ut button (destructive, full-width) wired to useLogout()
 *   - Admin gate:
 *       admin -> `<Can action="admin:ping">` reveals an "Admin ping"
 *                Button that POSTs to /api/admin/ping (Phase 1 success #2);
 *                response shown inline.
 *       non-admin -> muted note "Denna åtgärd kräver adminrättigheter."
 *                    verbatim per UI-SPEC §Copy.
 *
 * The 403 fallback `Alert` is rendered if the admin endpoint ever returns
 * forbidden to a user whose UI thinks they're admin — defense in depth.
 */

interface AdminPingResponse {
  pong: true;
  at: string;
}

export function KontoPage() {
  const { user } = useAuth();
  const logout = useLogout();
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  if (!user) {
    // Defensive — AuthGate guarantees `user` is set before we render.
    return null;
  }

  async function onAdminPing() {
    setPingError(null);
    setPingResult(null);
    setPinging(true);
    try {
      const res = await fetchJson<AdminPingResponse>('/api/admin/ping');
      setPingResult(`Pong @ ${res.at}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // UI-SPEC §403 / `<Can>` Gate Pattern — verbatim Swedish.
        setPingError('Du saknar behörighet att utföra denna åtgärd.');
      } else if (err instanceof ApiError) {
        setPingError(err.envelope.error.message);
      } else {
        setPingError('Ett oväntat fel inträffade.');
      }
    } finally {
      setPinging(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="text-xl font-semibold text-[#0F172A] mb-6">Konto</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm font-semibold text-[#0F172A]">{user.name}</p>
        <RoleBadge role={user.role} />
      </div>
      <p className="mt-1 text-xs text-[#64748B]">{user.careUnit.name}</p>

      <Button
        type="button"
        variant="destructive"
        className="mt-6 w-full"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
      </Button>

      {/* Admin gate (UI-SPEC §403 / `<Can>` Gate Pattern). */}
      <div className="mt-8">
        <Can action="admin:ping">
          <Button
            type="button"
            variant="outline"
            onClick={onAdminPing}
            disabled={pinging}
            className="w-full"
          >
            {pinging ? 'Pingar…' : 'Admin ping'}
          </Button>
          {pingResult && (
            <p className="mt-2 text-xs text-[#475569]" aria-live="polite">
              {pingResult}
            </p>
          )}
          {pingError && (
            <Alert variant="destructive" role="alert" className="mt-2">
              <AlertDescription>{pingError}</AlertDescription>
            </Alert>
          )}
        </Can>

        {user.role !== 'admin' && (
          <p className="text-xs text-[#64748B]">
            Denna åtgärd kräver adminrättigheter.
          </p>
        )}
      </div>
    </section>
  );
}
