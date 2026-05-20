import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/client.js';
import { findSessionById, touchSession } from './session.js';
import { SESSION_COOKIE } from './cookie.js';
import { UnauthenticatedError } from '../plugins/errorHandler.js';

/**
 * Pattern C / D-15 / D-19 — Fastify preHandler that gates authenticated routes.
 *
 * Steps (in order — never reorder):
 *   1. Read the signed `meditrack.sid` cookie via `@fastify/cookie`.
 *   2. `unsignCookie` — invalid signature ⇒ 401 (T-01-02 cookie tampering).
 *   3. `findSessionById` — missing row ⇒ 401.
 *   4. Expiry check — `expiresAt <= now` ⇒ 401.
 *   5. `touchSession` — bumps sliding 7d / 30d cap (D-03).
 *   6. Load the User + CareUnit (single query) and decorate `req.user`.
 *
 * The preHandler throws `UnauthenticatedError`, which the error handler
 * translates into the canonical envelope `{ code: 'unauthenticated', ... }`.
 */
export async function requireSession(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) {
    throw new UnauthenticatedError();
  }
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) {
    throw new UnauthenticatedError();
  }

  const sessionId = unsigned.value;
  const session = await findSessionById(sessionId);
  if (!session) {
    throw new UnauthenticatedError();
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new UnauthenticatedError();
  }

  await touchSession(sessionId);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { careUnit: { select: { id: true, name: true } } },
  });
  if (!user) {
    // Session row exists but the user was deleted — treat as unauthenticated.
    throw new UnauthenticatedError();
  }

  req.user = {
    id: user.id,
    role: user.role,
    careUnitId: session.careUnitId,
    name: user.name,
    email: user.email,
    sessionId,
  };
}
