import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { meResponse } from '@meditrack/shared';
import { requireSession } from '../auth/requireSession.js';
import { getMeForSession } from '../services/user.service.js';

/**
 * Pattern B + C + D — `GET /api/me`.
 *
 * `requireSession` runs first (D-15 ordering rule); the route handler then
 * calls `userService.getMeForSession(careUnitId, sessionId)` — note that
 * `careUnitId` is the FIRST argument per the locked Pattern D rule (D-16).
 *
 * Returns the canonical `meResponse` shape (D-18); `permissions: []` in
 * Plan 02 (Plan 03 widens).
 */
export async function meRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/me',
    {
      preHandler: [requireSession],
      schema: { response: { 200: meResponse } },
    },
    async (req) => {
      // `req.user` is guaranteed by the preHandler.
      const { careUnitId, sessionId } = req.user!;
      return getMeForSession(careUnitId, sessionId);
    },
  );
}
