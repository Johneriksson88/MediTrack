import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireSession } from '../auth/requireSession.js';
import { requirePermission } from '../auth/requirePermission.js';

/**
 * AUTH-05 / D-18 / Phase 1 success #2 — admin-only stub.
 *
 * GET /api/admin/ping is the canonical demo that the BE security boundary
 * works end-to-end:
 *   - no cookie               -> 401 unauthenticated (via requireSession)
 *   - non-admin session       -> 403 forbidden       (via requirePermission)
 *   - admin session           -> 200 + { pong, at }
 *
 * The preHandler chain ORDER MATTERS (Pattern C, D-15): session check
 * first, permission check second. Never reorder — the permission check
 * assumes `req.user` is already set.
 */

const adminPingResponse = z.object({
  pong: z.literal(true),
  at: z.string(),
});

export async function adminPingRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/admin/ping',
    {
      preHandler: [requireSession, requirePermission('admin:ping')],
      schema: { response: { 200: adminPingResponse } },
    },
    async () => ({
      pong: true as const,
      at: new Date().toISOString(),
    }),
  );
}
