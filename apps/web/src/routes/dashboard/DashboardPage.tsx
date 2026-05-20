import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, Role } from '@meditrack/shared';

/**
 * Plan 02 — minimal dashboard stub. Plan 04 replaces this with the full
 * shell + Empty State Card per UI-SPEC §Empty State; we deliberately keep
 * it bare here so the Walking Skeleton end-to-end test (Task 6) has the
 * smallest possible authenticated surface to verify.
 *
 * Reads from the TanStack Query cache the AuthGate's `useQuery(['me'])`
 * has just populated. Plan 03 ships a real `useAuth()` hook; for now the
 * cache read is a 4-line stand-in.
 */

const ROLE_LABELS: Record<Role, string> = {
  apotekare: 'Apotekare',
  sjukskoterska: 'Sjuksköterska',
  admin: 'Admin',
};

export function DashboardPage() {
  const queryClient = useQueryClient();
  const me = queryClient.getQueryData<MeResponse>(['me']);

  // AuthGate guarantees `me` is set before this renders; defensive empty
  // state so a stale router render doesn't crash.
  if (!me) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-background">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Inloggad som{' '}
        <span className="font-semibold text-foreground">{me.name}</span> (
        {ROLE_LABELS[me.role]}) — {me.careUnit.name}
      </p>
    </main>
  );
}
