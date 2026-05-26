import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { restockLowStockRequest, orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { createRestockOrder } from '../../services/order.service.js';

/**
 * POST /api/orders/restock-low-stock — creates a draft Order containing
 * one line per still-low-stock CareUnitMedication the caller selected
 * in the preview modal. Per-line quantity is
 * `max(1, threshold − currentStock + buffer)`.
 *
 * Body: `{ buffer, careUnitMedicationIds }`. Validated by Zod with
 * `.strict()` (T-03-02 mass-assignment mitigation) — careUnitId and
 * createdByUserId come from `req.user`, not the body.
 *
 * Gated by `order:create`. D-65 ordering: registered before getOrderRoute.
 *
 * Returns 201 with the full OrderResponse so the FE can hydrate cache and
 * navigate without a second GET.
 */
export async function restockCreateRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/orders/restock-low-stock',
    {
      preHandler: [requireSession, requirePermission('order:create')],
      schema: {
        body: restockLowStockRequest,
        response: { 201: orderResponse },
      },
    },
    async (req, reply) => {
      const row = await createRestockOrder(
        req.user!.careUnitId,
        req.user!.id,
        req.body,
      );
      reply.status(201);
      return row;
    },
  );
}
