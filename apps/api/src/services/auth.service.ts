import type { Session } from '@prisma/client';
import type { LoginResponse } from '@meditrack/shared';
import { prisma } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.js';
import { InvalidCredentialsError } from '../plugins/errorHandler.js';
import { setActor, withActionOverride, actorALS } from '../plugins/requestContext.js';

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
    // created. WR-07 fix — entityType: 'auth_attempt' (distinct from
    // 'session', which implies a persisted Session row). entityId is the
    // attempted email — a forensically useful identifier (admin filter
    // `?entityType=auth_attempt&entityId=alice@example.com` surfaces every
    // failed attempt for that email, regardless of whether the email maps
    // to a real User). actorUserId stays null because we don't know who tried.
    const actor = actorALS.getStore();

    // INVARIANT (verifyCredentials, unknown-email branch): this audit row is written
    // OUTSIDE any prisma.$transaction wrapping the surrounding verifyCredentials
    // call (none today). If a future refactor wraps verifyCredentials in a tx (e.g.
    // for an "account lockout after N failures" feature), this audit row would commit
    // even if the surrounding tx rolls back — silently breaking the D-91 same-tx
    // contract. See 05-REVIEWS.md MEDIUM #7 + integration test (Test 16) in
    // audit.integration.test.ts. To preserve the invariant, either keep this write
    // outside any tx, OR explicitly use a separate transaction boundary.
    await prisma.auditEvent.create({
      data: {
        actorUserId: null,
        careUnitId: null,
        entityType: 'auth_attempt',
        entityId: email,
        action: 'auth.login_failed',
        // before / after are Json? — omitting before defaults to DB null.
        after: { email },
        requestId: actor?.requestId ?? null,
        ipAddress: actor?.ipAddress ?? null,
      },
    });

    throw new InvalidCredentialsError();
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    // Phase 5 D-96 + CR-03 — explicit auth.login_failed write. Both failed-login
    // branches (unknown-email above and known-user-wrong-password here) share
    // ONE taxonomy: entityType='auth_attempt', entityId=email. This makes the
    // admin filter `?entityType=auth_attempt&entityId=alice@example.com`
    // surface every failed attempt against that email regardless of whether
    // the email maps to a real User — the credential-stuffing signal admins
    // actually care about. actorUserId stays set when we know the user
    // (this branch) and null when we don't (unknown-email branch above), so
    // the two cases remain distinguishable via the actorUserId column.
    const actor = actorALS.getStore();

    // INVARIANT (verifyCredentials, known-user-wrong-password branch): this audit row
    // is written OUTSIDE any prisma.$transaction wrapping the surrounding verifyCredentials
    // call (none today). If a future refactor wraps verifyCredentials in a tx (e.g.
    // for an "account lockout after N failures" feature), this audit row would commit
    // even if the surrounding tx rolls back — silently breaking the D-91 same-tx
    // contract. See 05-REVIEWS.md MEDIUM #7 + integration test (Test 16) in
    // audit.integration.test.ts. To preserve the invariant, either keep this write
    // outside any tx, OR explicitly use a separate transaction boundary.
    await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        careUnitId: user.careUnitId,
        entityType: 'auth_attempt',
        entityId: email, // D-97 + T-05-03 — NEVER a Session id (no session exists).
        action: 'auth.login_failed',
        // before omitted (defaults to DB null).
        after: { email },
        requestId: actor?.requestId ?? null,
        ipAddress: actor?.ipAddress ?? null,
      },
    });

    throw new InvalidCredentialsError();
  }

  // Phase 5 D-92 + Plan 06 — populate the ALS actor frame with the
  // authenticated user BEFORE createSession. The Session create that
  // follows goes through the $extends middleware and writes an auth.login
  // audit row with the actor + careUnit attributed correctly.
  //
  // Plan 06: setActor mutates the actorALS frame (the one allowed in-frame
  // mutation — see requestContext.ts setActor JSDoc). withActionOverride
  // wraps createSession in an actionOverrideALS.run('auth.login', fn)
  // frame — the override is automatically cleared on return. No manual
  // store.actionOverride = undefined needed.
  setActor(user.id, user.careUnitId);
  const session = await withActionOverride('auth.login', () =>
    createSession(user.id, user.careUnitId),
  );

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
  // Plan 06: withActionOverride uses actionOverrideALS.run — no manual
  // store mutation or finally-block save/restore needed.
  await withActionOverride('auth.logout', () => destroySession(sessionId));
}
