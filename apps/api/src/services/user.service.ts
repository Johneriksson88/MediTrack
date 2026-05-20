import type { MeResponse } from '@meditrack/shared';
import { prisma } from '../db/client.js';
import { actionsForRole } from '../auth/permissions.js';

/**
 * Pattern D / D-16 / D-18 — `careUnitId` is the FIRST argument (the
 * documented service-layer rule). The session has a `careUnitId` snapshot
 * (D-16) that the auth preHandler decorates onto `req.user`; we pass it
 * here and use it in every Prisma `where` so a future code change can't
 * accidentally leak across tenants.
 *
 * `permissions` is computed at request time by intersecting the user's
 * role with the centralized PERMISSIONS map (Plan 03 / D-18). The FE
 * `useAuth().can(action)` (Pattern L) reads off this field — no second
 * round-trip required.
 */
export async function getMeForSession(
  careUnitId: string,
  sessionId: string,
): Promise<MeResponse> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: {
          careUnit: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!session || session.careUnitId !== careUnitId) {
    // Belt-and-suspenders: the preHandler already validated the session, so
    // hitting this branch means something raced (session deleted) or a
    // careUnitId mismatch — surface as a 401-equivalent error.
    throw new Error('Session no longer valid');
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    careUnit: {
      id: session.user.careUnit.id,
      name: session.user.careUnit.name,
    },
    permissions: actionsForRole(session.user.role),
  };
}
