import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginRequest, loginResponse } from '@meditrack/shared';
import { env } from '../env.js';
import {
  SESSION_COOKIE,
  clearedSessionCookieOptions,
  sessionCookieOptions,
} from '../auth/cookie.js';
import { findSessionById } from '../auth/session.js';
import { login, logout } from '../services/auth.service.js';
import { setActor } from '../plugins/requestContext.js';

/**
 * Pattern B + F — `/api/auth/*` routes. Body & response schemas come
 * straight from `@meditrack/shared` (single source of truth, D-08);
 * `fastify-type-provider-zod` validates inbound bodies and shapes outbound
 * responses against them.
 *
 * Routes:
 *   - POST   /api/auth/login    AUTH-01 — sets signed `meditrack.sid` cookie
 *   - DELETE /api/auth/session  AUTH-03 — idempotent logout (no-cookie ⇒ 204)
 *
 * Logout is intentionally idempotent (no `requireSession` preHandler): if
 * the client already lost / cleared its cookie, the server still confirms
 * a 204 with `Set-Cookie: meditrack.sid=; Max-Age=0` so the FE has nothing
 * to retry on AUTH-03's happy path.
 *
 * Phase 5 CR-04 — the handler resolves session.userId via findSessionById
 * BEFORE destroySession runs, so the $extends middleware reads the correct
 * actorUserId from the ALS store when it writes the auth.logout audit row
 * (D-92). The lookup is best-effort: a stale or unsigned cookie still
 * receives 204 idempotent logout but writes no audit row (no Session row
 * → no $extends interception).
 */
export async function authRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/auth/login',
    {
      schema: {
        body: loginRequest,
        response: { 200: loginResponse },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;
      const { response, sessionId } = await login(email, password);

      reply.setCookie(
        SESSION_COOKIE,
        sessionId,
        sessionCookieOptions(env.NODE_ENV),
      );
      return response;
    },
  );

  app.delete('/api/auth/session', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        // CR-04 fix: resolve the session BEFORE destroying it so we can
        // set the ALS actor. The $extends middleware reads actorUserId
        // from the ALS store at the moment destroySession fires — if we
        // call setActor BEFORE logout(), the auth.logout audit row
        // carries the correct actor (D-92). This is a best-effort lookup:
        // if the session is missing (stale cookie / already expired),
        // skip setActor — logout() still runs (destroySession is a
        // deleteMany no-op on a missing row), and no audit row is written
        // (no Session row → no $extends interception). Idempotency (D-01)
        // is fully preserved.
        const session = await findSessionById(unsigned.value);
        if (session !== null) {
          setActor(session.userId, session.careUnitId, req.ip ?? null);
        }
        await logout(unsigned.value);
      }
    }
    reply.clearCookie(
      SESSION_COOKIE,
      clearedSessionCookieOptions(env.NODE_ENV),
    );
    reply.status(204);
    return null;
  });
}
