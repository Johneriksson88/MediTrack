import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { getOrderForUnit } from '../../services/order.service.js';

/**
 * GET /api/orders/:id — full Order with embedded lines (D-47).
 *
 * D-47: Lines include denormalized medication fields (name, atcCode, form,
 * strength, currentStock, lowStockThreshold) joined at read time.
 *
 * D-73 / D-19: Returns 404 (not 403) when order belongs to another careUnit.
 */
export async function getOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders/:id',
    {
      preHandler: [requireSession, requirePermission('order:read')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return getOrderForUnit(req.user!.careUnitId, req.params.id);
    },
  );
}
