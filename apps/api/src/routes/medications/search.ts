import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  medicationSearchQuery,
  medicationSearchResponse,
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
 * D-139 (Phase 8 CAT-10): response now carries `globalCatalogMatchCount` —
 *   the pre-D-45-exclusion NPL match count. The service returns the envelope
 *   directly; this route is a pass-through.
 * T-02-02: careUnitMedications.none filter in service prevents over-disclosure.
 * T-08-04: globalCatalogMatchCount is non-sensitive (NPL is a public registry);
 *   scoped by requirePermission('medication:read') — all three roles can read.
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
          200: medicationSearchResponse,
        },
      },
    },
    async (req) => {
      return await searchGlobalMedications(req.user!.careUnitId, {
        q: req.query.q,
        limit: req.query.limit,
      });
    },
  );
}
