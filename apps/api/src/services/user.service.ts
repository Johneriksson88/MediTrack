import type { MeResponse, UserResponse, UserCreateRequest, UserUpdateRequest } from '@meditrack/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { actionsForRole } from '../auth/permissions.js';
import { hashPassword } from '../auth/password.js';
import {
  ConflictDuplicateMedicationError,
  ForbiddenScopeError,
  NotFoundError,
  UserDeleteBlockedError,
} from '../plugins/errorHandler.js';

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

// ---------------------------------------------------------------------------
// Admin user-management — /api/admin/users (admin-only, user:manage)
// ---------------------------------------------------------------------------

type UserWithCareUnit = {
  id: string;
  email: string;
  name: string;
  role: 'apotekare' | 'sjukskoterska' | 'admin';
  createdAt: Date;
  careUnit: { id: string; name: string };
};

function toUserResponse(row: UserWithCareUnit): UserResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    careUnit: { id: row.careUnit.id, name: row.careUnit.name },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * List all users in the admin's own vårdenhet, newest first.
 *
 * D-16: scoped by careUnitId — admins cannot see users in other vårdenheter
 * (forward-compatible with multi-vårdenhet deployments).
 */
export async function listUsersInCareUnit(
  careUnitId: string,
): Promise<UserResponse[]> {
  const rows = await prisma.user.findMany({
    where: { careUnitId },
    include: { careUnit: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toUserResponse);
}

/**
 * Create a new user inside the admin's vårdenhet.
 *
 * Tenant guard: the BE pins `careUnitId` to the caller's own; payload-supplied
 * value is treated as a confirmation only. A mismatch is 403 forbidden
 * (defense-in-depth — the FE form already disables the field when only one
 * vårdenhet exists).
 *
 * Password is hashed with argon2id (D-05) before insert. The hash never
 * leaves the BE; the response shape omits passwordHash (T-01-07).
 *
 * Conflict: a duplicate `email` (unique constraint) surfaces as a 409
 * envelope `{ code: 'conflict_duplicate_medication' }`. Reusing the same
 * code keeps the FE error-handling switch small for v1; the message
 * customizes to mention the email collision.
 */
export async function createUserInCareUnit(
  careUnitId: string,
  payload: UserCreateRequest,
): Promise<UserResponse> {
  if (payload.careUnitId !== careUnitId) {
    throw new ForbiddenScopeError(
      'Konto kan endast skapas i din egen vårdenhet.',
    );
  }

  const passwordHash = await hashPassword(payload.password);

  try {
    const created = await prisma.user.create({
      data: {
        email: payload.email.trim().toLowerCase(),
        name: payload.name.trim(),
        role: payload.role,
        careUnitId,
        passwordHash,
      },
      include: { careUnit: { select: { id: true, name: true } } },
    });
    return toUserResponse(created);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Unique violation — only `email` is unique on User.
      throw new ConflictDuplicateMedicationError();
    }
    throw err;
  }
}

/**
 * Partial update on a User row scoped to the admin's vårdenhet.
 *
 * D-19 / T-02-13: cross-tenant rows return 404 (never 403) to defeat
 * existence-probing. Same response shape for truly-missing and out-of-scope.
 *
 * Optional `password` re-hashes; omitted leaves the existing hash untouched.
 */
export async function updateUserInCareUnit(
  careUnitId: string,
  userId: string,
  payload: UserUpdateRequest,
): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || existing.careUnitId !== careUnitId) {
    throw new NotFoundError('Användaren hittades inte.');
  }

  const data: Prisma.UserUpdateInput = {};
  if (payload.email !== undefined) data.email = payload.email.trim().toLowerCase();
  if (payload.name !== undefined) data.name = payload.name.trim();
  if (payload.role !== undefined) data.role = payload.role;
  if (payload.password !== undefined) {
    data.passwordHash = await hashPassword(payload.password);
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      include: { careUnit: { select: { id: true, name: true } } },
    });
    return toUserResponse(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictDuplicateMedicationError();
    }
    throw err;
  }
}

/**
 * Hard-delete a User row scoped to the admin's vårdenhet.
 *
 * Self-delete is refused — an admin clicking 'Ta bort' on their own row would
 * lose their own session and lock themselves out of the admin surface.
 *
 * Order FKs (createdBy / submittedBy / confirmedBy / deliveredBy) are
 * `onDelete: Restrict` — if the user has any orders attributed to them, the
 * delete fails and we surface a 422 with a localized message so the admin
 * understands why. Soft-delete on User would be preferable but the schema
 * has no `deletedAt` column on this model; we accept the v1 limitation.
 *
 * Sessions cascade-delete (schema FK), so deleting a user invalidates their
 * cookies on the next request — no extra cleanup needed.
 */
export async function deleteUserInCareUnit(
  careUnitId: string,
  userId: string,
  actingUserId: string,
): Promise<void> {
  if (userId === actingUserId) {
    throw new UserDeleteBlockedError('Du kan inte ta bort ditt eget konto.');
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || existing.careUnitId !== careUnitId) {
    throw new NotFoundError('Användaren hittades inte.');
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      // P2003 = foreign key constraint failed; on this model the only
      // Restrict-FK references are the Order createdBy/submittedBy/
      // confirmedBy/deliveredBy columns. An audit-log readable note for
      // the admin is more useful than a generic 500.
      err.code === 'P2003'
    ) {
      throw new UserDeleteBlockedError(
        'Användaren har historiska beställningar och kan inte tas bort.',
      );
    }
    throw err;
  }
}
