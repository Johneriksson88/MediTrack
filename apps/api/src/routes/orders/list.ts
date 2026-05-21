import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { orderListQuery, orderListResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listOrdersForUnit } from '../../services/order.service.js';

/**
 * GET /api/orders — list Orders for the caller's vårdenhet, filtered by status.
 *
 * D-15 preHandler ordering: requireSession first (decorates req.user),
 * requirePermission second (reads req.user.role). NEVER reorder.
 *
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 *
 * D-53: Defaults to status=utkast (the drafts list). Page 3 ships the
 * lightest possible "My drafts" list; Phase 4 ORD-07 expands to a full
 * status-filtered history view.
 *
 * T-03-01: careUnitId scoping is enforced in the service — the where-clause
 * always includes careUnitId from the session.
 *
 * Returns { rows: OrderListItem[], total: number }. Each row includes
 * lineCount, totalQuantity, and createdBy.name (D-72 columns).
 */
export async function listOrdersRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders',
    {
      preHandler: [requireSession, requirePermission('order:read')],
      schema: {
        querystring: orderListQuery,
        response: { 200: orderListResponse },
      },
    },
    async (req) => {
      return listOrdersForUnit(req.user!.careUnitId, req.query);
    },
  );
}
