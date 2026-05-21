import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { softDeleteOrder } from '../../services/order.service.js';

/**
 * DELETE /api/orders/:id — soft-delete a draft order (Kasta utkast, D-67).
 *
 * D-33: Always soft-delete — sets deletedAt = now(). The order is excluded
 * from all list queries but the row is preserved for future audit purposes.
 *
 * D-67: Only Utkast orders can be discarded. Service throws OrderLockedError
 * (409) if status !== 'utkast'.
 *
 * D-73 / D-19: Returns 404 (not 403) for cross-careUnit access.
 */
export async function deleteOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.delete(
    '/api/orders/:id',
    {
      preHandler: [requireSession, requirePermission('order:delete')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await softDeleteOrder(req.user!.careUnitId, req.params.id);
      reply.status(204);
      return null;
    },
  );
}
