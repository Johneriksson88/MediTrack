import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { deliverOrder } from '../../services/order.service.js';

/**
 * POST /api/orders/:id/deliver — deliver a Bekräftad order (Bekräftad → Levererad).
 *
 * D-78: Delivery is replenishment — line quantities added to CareUnitMedication.currentStock.
 * D-79: CUM batch lock with sorted-id ordering inside the service transaction (STK-02).
 *       Two concurrent deliver calls on the same order serialize on the Order-row FOR UPDATE;
 *       the second receives 409 order_transition_invalid (OPS-03/D-88).
 * D-81: Soft-deleted CUM at deliver time returns 422 validation_failed reason='medication_removed'.
 * D-84: Stamps deliveredAt + deliveredByUserId.
 * D-74: Returns 409 order_transition_invalid when order is not 'bekraftad'.
 * D-73: 404 (not 403) on cross-careUnit — hides order existence from other careUnits.
 *
 * preHandler order: [requireSession, requirePermission] — NEVER reorder.
 * requireSession decorates req.user; requirePermission reads req.user.role.
 */
export async function deliverOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/orders/:id/deliver',
    {
      preHandler: [requireSession, requirePermission('order:deliver')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return deliverOrder(req.user!.careUnitId, req.params.id, req.user!.id);
    },
  );
}
