import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { restockPreviewResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { getRestockPreview } from '../../services/order.service.js';

/**
 * GET /api/orders/restock-preview — preview rows for the
 * "Beställ påfyllning" modal. Returns every under-threshold
 * CareUnitMedication in the caller's vårdenhet plus the aggregated
 * in-flight quantity from non-`levererad` orders.
 *
 * Gated by `order:create` (same as POST /api/orders) — there is no
 * value in showing this preview to a viewer who cannot follow through.
 * D-65 ordering: registered before getOrderRoute in the orders barrel
 * so `restock-preview` is not parsed as an `:id` value.
 */
export async function restockPreviewRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders/restock-preview',
    {
      preHandler: [requireSession, requirePermission('order:create')],
      schema: { response: { 200: restockPreviewResponse } },
    },
    async (req) => getRestockPreview(req.user!.careUnitId),
  );
}
