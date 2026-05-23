import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { lowStockListResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { listLowStockForUnit } from '../../services/dashboard.service.js';

/**
 * GET /api/dashboard/low-stock — dashboard low-stock banner read.
 *
 * Returns every CareUnitMedication in the caller's vårdenhet whose
 * `currentStock < lowStockThreshold`, sorted by urgency (D-117). Powers
 * the dashboard banner that replaces the Phase 1 EmptyStateCard stub
 * (D-118).
 *
 * D-15 preHandler: `requireSession` ONLY — no `requirePermission` gate.
 * All three roles (sjukskoterska / apotekare / admin) see the dashboard
 * banner (D-120). The endpoint is careUnit-scoped: `req.user.careUnitId`
 * is the first (and only) argument to the service, so a user in
 * vårdenhet A cannot see vårdenhet B's rows (T-06-01).
 *
 * No request body, no query params — the response shape is fixed by
 * `lowStockListResponse` (D-120: { rows, total }).
 */
export async function lowStockRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/dashboard/low-stock',
    {
      preHandler: [requireSession],
      schema: { response: { 200: lowStockListResponse } },
    },
    async (req) => listLowStockForUnit(req.user!.careUnitId),
  );
}
