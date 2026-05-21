import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { addOrderLineRequest, updateOrderLineRequest, orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import {
  addLineToOrder,
  updateOrderLine,
  removeOrderLine,
} from '../../services/order.service.js';

/**
 * Order line mutation routes — POST/PATCH/DELETE (D-65).
 *
 * All three handlers are gated by requirePermission('order:update').
 * All three return the full updated Order (200 OrderResponse) so the FE
 * cache hydrates atomically in a single round-trip (D-57 precedent).
 *
 * D-54: Service-layer atomic UPDATE with status precondition. The service
 * calls assertOrderEditable() which throws OrderLockedError (409) when
 * the order is not in 'utkast' status.
 */
export async function linesRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // POST /api/orders/:id/lines — add a line to a draft order
  r.post(
    '/api/orders/:id/lines',
    {
      preHandler: [requireSession, requirePermission('order:update')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: addOrderLineRequest,
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return addLineToOrder(req.user!.careUnitId, req.params.id, req.body);
    },
  );

  // PATCH /api/orders/:id/lines/:lineId — update quantity on a line
  r.patch(
    '/api/orders/:id/lines/:lineId',
    {
      preHandler: [requireSession, requirePermission('order:update')],
      schema: {
        params: z.object({
          id: z.string().min(1),
          lineId: z.string().min(1),
        }),
        body: updateOrderLineRequest,
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return updateOrderLine(
        req.user!.careUnitId,
        req.params.id,
        req.params.lineId,
        req.body.quantity,
      );
    },
  );

  // DELETE /api/orders/:id/lines/:lineId — remove a line from a draft order
  r.delete(
    '/api/orders/:id/lines/:lineId',
    {
      preHandler: [requireSession, requirePermission('order:update')],
      schema: {
        params: z.object({
          id: z.string().min(1),
          lineId: z.string().min(1),
        }),
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return removeOrderLine(
        req.user!.careUnitId,
        req.params.id,
        req.params.lineId,
      );
    },
  );
}
