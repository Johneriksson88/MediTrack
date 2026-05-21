import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  medicationSearchQuery,
  medicationSearchResult,
} from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { searchGlobalMedications } from '../../services/medication.service.js';

/**
 * GET /api/medications/search — typeahead over global Medication catalog.
 *
 * D-15 preHandler ordering: requireSession first, requirePermission second.
 * D-16: req.user!.careUnitId is the FIRST arg (needed to exclude already-stocked drugs).
 * D-45: excludes Medications already actively stocked at req.user.careUnitId.
 * T-02-02: careUnitMedications.none filter in service prevents over-disclosure.
 */
export async function searchMedicationsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/medications/search',
    {
      preHandler: [requireSession, requirePermission('medication:read')],
      schema: {
        querystring: medicationSearchQuery,
        response: {
          200: z.object({ results: z.array(medicationSearchResult) }),
        },
      },
    },
    async (req) => {
      const rows = await searchGlobalMedications(req.user!.careUnitId, {
        q: req.query.q,
        limit: req.query.limit,
      });
      return { results: rows };
    },
  );
}
