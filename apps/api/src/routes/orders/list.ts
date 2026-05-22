import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { orderListQuery, orderListResponse } from '@meditrack/shared';
import { ORDER_STATUSES } from '@meditrack/shared';
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
 * Phase 4 ORD-07 — Status pre-parser (runs BEFORE Zod validation):
 *
 *   ?status=alla              → expanded to ORDER_STATUSES array (['utkast','skickad','bekraftad','levererad'])
 *   ?status=skickad,bekraftad → split into ['skickad', 'bekraftad'] (each token trimmed)
 *   ?status=skickad           → passed through unchanged (single value; Zod union handles it)
 *   (no param)                → Zod default of 'utkast' applies
 *
 * Invalid tokens (e.g. 'foo') are passed to Zod unchanged and rejected with
 * HTTP 400 by Fastify's validation pipeline (T-04-18 mitigation).
 *
 * T-03-01: careUnitId scoping is enforced in the service — the where-clause
 * always includes careUnitId from the session.
 *
 * Returns { rows: OrderListItem[], total: number }. Each row includes
 * lineCount, totalQuantity, and createdBy.name (D-72 columns) plus the
 * Phase 4 actor trio fields (submittedBy, confirmedBy, deliveredBy).
 */
export async function listOrdersRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders',
    {
      preValidation: async (req) => {
        // Phase 4 ORD-07 — Status pre-parser.
        // Intercept req.query.status BEFORE Zod validation so that:
        //   'alla' → ORDER_STATUSES array (Zod's union accepts string[])
        //   'a,b,c' → ['a', 'b', 'c'] (each token trimmed; Zod validates each)
        //   single valid value → pass through unchanged
        //   absent → Zod applies default 'utkast'
        const rawQuery = req.query as Record<string, unknown>;
        const rawStatus = rawQuery['status'];

        if (typeof rawStatus === 'string') {
          if (rawStatus === 'alla') {
            // Expand 'alla' to the full status array — Zod union accepts string[].
            rawQuery['status'] = [...ORDER_STATUSES];
          } else if (rawStatus.includes(',')) {
            // Split comma-list, trim whitespace from each token.
            rawQuery['status'] = rawStatus.split(',').map((s) => s.trim());
          }
          // Single valid token (e.g. 'skickad') → pass through; Zod validates.
        }
      },
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
