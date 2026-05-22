import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { orderResponse, confirmOrderRequest } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { confirmOrder } from '../../services/order.service.js';

/**
 * POST /api/orders/:id/confirm — confirm a Skickad order (Skickad → Bekräftad).
 *
 * D-74: Returns 409 order_transition_invalid when the order is not in 'skickad'
 *       status (enables the FE to produce a localized toast from details.from).
 * D-75: Narrow single-action endpoint — no body required; all context comes from
 *       req.user (careUnitId, actor id). Restricted to apotekare+admin (D-15).
 * D-84: Stamps confirmedAt + confirmedByUserId inside the service transaction.
 * D-73: 404 (not 403) on cross-careUnit — hides order existence from other careUnits.
 *
 * preHandler order: [requireSession, requirePermission] — NEVER reorder.
 * requireSession decorates req.user; requirePermission reads req.user.role.
 */
export async function confirmOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/orders/:id/confirm',
    {
      preHandler: [requireSession, requirePermission('order:confirm')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: confirmOrderRequest,
        response: { 200: orderResponse },
      },
    },
    async (req) => {
      return confirmOrder(req.user!.careUnitId, req.params.id, req.user!.id);
    },
  );
}
