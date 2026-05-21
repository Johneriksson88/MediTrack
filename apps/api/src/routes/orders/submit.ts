import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { submitOrder } from '../../services/order.service.js';

/**
 * POST /api/orders/:id/submit — submit a draft order (Utkast → Skickad).
 *
 * D-54: Service-layer atomic UPDATE with WHERE status = 'utkast' precondition.
 * D-56: Service validates non-empty lines + positive quantities before the UPDATE.
 *       Returns 422 validation_failed on failure.
 * D-49: Stamps submittedAt + submittedByUserId from req.user!.id.
 * D-57: Returns the full updated Order so the FE cache hydrates atomically.
 */
export async function submitOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/orders/:id/submit',
    {
      preHandler: [requireSession, requirePermission('order:submit')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return submitOrder(req.user!.careUnitId, req.params.id, req.user!.id);
    },
  );
}
