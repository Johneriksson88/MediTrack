import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createOrderRequest, orderResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { createDraftOrder } from '../../services/order.service.js';

/**
 * POST /api/orders — create an empty Utkast Order for the caller's vårdenhet.
 *
 * D-15 preHandler ordering: requireSession first (decorates req.user),
 * requirePermission second (reads req.user.role). NEVER reorder.
 *
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 *
 * D-50: Body is an empty object — all draft attributes come from req.user.
 * T-03-02: createOrderRequest = z.object({}).strict() rejects stray fields
 * that could attempt mass-assignment of careUnitId/status/createdByUserId.
 *
 * T-03-04: requirePermission('order:create') enforces RBAC before the handler.
 * T-03-AUTH: requireSession returns 401 if no valid session cookie is present.
 *
 * Returns 201 with the full OrderResponse (id, status='utkast', lines=[],
 * careUnitId from session, createdBy.name from session user).
 */
export async function createOrderRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/orders',
    {
      preHandler: [requireSession, requirePermission('order:create')],
      schema: {
        body: createOrderRequest,
        response: { 201: orderResponse },
      },
    },
    async (req, reply) => {
      const row = await createDraftOrder(req.user!.careUnitId, req.user!.id);
      reply.status(201);
      return row;
    },
  );
}
