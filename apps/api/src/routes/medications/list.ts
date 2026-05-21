import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { medicationListQuery, medicationListResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listMedicationsForUnit } from '../../services/medication.service.js';

/**
 * GET /api/medications — paginated medication list for the caller's vårdenhet.
 *
 * D-15 preHandler ordering: requireSession first (decorates req.user),
 * requirePermission second (reads req.user.role). NEVER reorder.
 *
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 *
 * D-44: supports q, atc, form, belowThreshold, page, pageSize query params.
 * Returns { rows, total, belowThresholdTotal, page, pageSize }.
 *
 * T-02-01: all Prisma queries in the service layer filter by careUnitId.
 */
export async function listMedicationsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/medications',
    {
      preHandler: [requireSession, requirePermission('medication:read')],
      schema: {
        querystring: medicationListQuery,
        response: { 200: medicationListResponse },
      },
    },
    async (req) => {
      return listMedicationsForUnit(req.user!.careUnitId, req.query);
    },
  );
}
