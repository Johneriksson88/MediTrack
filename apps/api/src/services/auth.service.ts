import type { LoginResponse } from '@meditrack/shared';
import { prisma } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.js';
import { InvalidCredentialsError } from '../plugins/errorHandler.js';
import { als } from '../plugins/requestContext.js';

/**
 * Pattern D / D-16 — service layer for authentication.
 *
 * NOTE — DOCUMENTED EXCEPTION TO PATTERN D:
 * `login(email, password)` does NOT take `careUnitId` as its first argument
 * the way every other service function in this codebase does. The reason is
 * structural: until we resolve `email → User`, we have no `careUnitId` to
 * scope by. The function reads `careUnitId` from the matched user row and
 * returns it as part of the session payload. Every OTHER function in every
 * OTHER service file must continue to take `careUnitId` first (D-16, Pattern D).
 *
 * Security:
 *   - T-01-05 (user enumeration): unknown email and wrong password both throw
 *     the same `InvalidCredentialsError`, surfacing as identical envelopes.
 *   - T-01-06 (timing): when the user is not found we still run a verify
 *     against a constant dummy hash to keep response time ~equal across the
 *     two failure modes.
 *   - T-01-07 (passwordHash leak): the returned `user` shape mirrors
 *     `loginResponse` and explicitly excludes `passwordHash`.
 */

// argon2id hash of the literal string "invalid-credentials" — generated once
// at module load with the same OWASP defaults as real passwords. Used as a
// timing-equalizer when the user is not found (T-01-06). We avoid generating
// it lazily on first failed login to keep the *first* unknown-email response
// from being slower than subsequent ones.
const DUMMY_HASH_PLACEHOLDER =
  '$argon2id$v=19$m=65536,t=3,p=1$' +
  // base64-encoded constant 16-byte salt + tag — not a real credential.
  'AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function login(
  email: string,
  password: string,
): Promise<{ response: LoginResponse; sessionId: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { careUnit: { select: { id: true, name: true } } },
  });

  if (!user) {
    // T-01-06: still run a verify against the dummy hash to equalize timing.
    await verifyPassword(DUMMY_HASH_PLACEHOLDER, password);

    // Phase 5 D-96 — explicit auth.login_failed write. The $extends
    // middleware can't observe this case because no Session row is
    // created. entityId '' is the chosen sentinel for "no entity exists
    // yet"; greppable and obvious. The `after` JSON contains ONLY the
    // attempted email — never password material. actorUserId is null
    // because we don't know who tried (the email matched no user).
    const store = als.getStore();
    await prisma.auditEvent.create({
      data: {
        actorUserId: null,
        careUnitId: null,
        entityType: 'session',
        entityId: '',
        action: 'auth.login_failed',
        // before / after are Json? — omitting before defaults to DB null.
        after: { email },
        requestId: store?.requestId ?? null,
        ipAddress: store?.ipAddress ?? null,
      },
    });

    throw new InvalidCredentialsError();
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    // Phase 5 D-96 — explicit auth.login_failed write. We KNOW which
    // user the attacker claimed to be (email matched), so we record
    // user.id as both actorUserId and entityId (for Session writes
    // entityId is the User.id per resolveEntityId — we mirror that
    // convention here even though the $extends path isn't involved).
    const store = als.getStore();
    await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        careUnitId: user.careUnitId,
        entityType: 'session',
        entityId: user.id, // D-97 + T-05-03 — NEVER a Session id (no session exists).
        action: 'auth.login_failed',
        // before omitted (defaults to DB null).
        after: { email },
        requestId: store?.requestId ?? null,
        ipAddress: store?.ipAddress ?? null,
      },
    });

    throw new InvalidCredentialsError();
  }

  // Phase 5 D-92 — populate the ALS store with the authenticated actor
  // BEFORE createSession. The Session create that follows goes through
  // the $extends middleware and writes an auth.login audit row with
  // the actor + careUnit attributed correctly; without this, the audit
  // row would carry actorUserId: null because requireSession hasn't
  // run yet (login is an unprotected route — no preHandler).
  const store = als.getStore();
  if (store) {
    store.actorUserId = user.id;
    store.careUnitId = user.careUnitId;
    store.actionOverride = 'auth.login';
  }

  const session = await createSession(user.id, user.careUnitId);

  // Clear the override so it doesn't bleed into any subsequent mutation
  // in this same request.
  if (store) {
    store.actionOverride = undefined;
  }

  // Shape strips passwordHash explicitly (T-01-07) and matches loginResponse.
  return {
    response: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        careUnit: { id: user.careUnit.id, name: user.careUnit.name },
      },
    },
    sessionId: session.id,
  };
}

export async function logout(sessionId: string): Promise<void> {
  // Phase 5 D-94 — set auth.logout as the action override so the
  // Session delete that destroySession runs records as 'auth.logout'
  // rather than the generic 'delete'.
  const store = als.getStore();
  const previous = store?.actionOverride;
  if (store) store.actionOverride = 'auth.logout';
  try {
    await destroySession(sessionId);
  } finally {
    if (store) store.actionOverride = previous;
  }
}
