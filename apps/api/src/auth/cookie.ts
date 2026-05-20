import type { CookieSerializeOptions } from '@fastify/cookie';

/**
 * Pattern I / D-01 — session cookie strategy.
 *
 * Name: `meditrack.sid` (namespaced so we don't collide with another app
 * if the dev runs behind a shared origin proxy in the future).
 *
 * Flags:
 *   - httpOnly  → JS cannot read the cookie (XSS-safe).
 *   - secure    → only over HTTPS; disabled in dev because the Vite proxy
 *                 talks HTTP locally (D-02). Compose sets NODE_ENV per-env.
 *   - sameSite  → 'lax' blocks third-party form-POST CSRF for state-
 *                 changing methods (T-01-11), keeps top-level navigation
 *                 logins working.
 *   - signed    → HMAC via `COOKIE_SECRET`; tampered cookies fail
 *                 `unsignCookie` and the requireSession preHandler
 *                 returns 401 (T-01-02).
 *   - maxAge    → 7 days (D-03 sliding window initial value).
 */
export const SESSION_COOKIE = 'meditrack.sid';

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export function sessionCookieOptions(
  nodeEnv: 'development' | 'production' | 'test',
): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS_SECONDS,
    signed: true,
  };
}

/** Options for clearing the cookie on logout — same path / signed-ness, maxAge 0. */
export function clearedSessionCookieOptions(
  nodeEnv: 'development' | 'production' | 'test',
): CookieSerializeOptions {
  return {
    ...sessionCookieOptions(nodeEnv),
    maxAge: 0,
  };
}
