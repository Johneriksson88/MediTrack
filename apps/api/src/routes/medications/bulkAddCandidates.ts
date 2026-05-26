import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { bulkAddCandidatesQuery, bulkAddCandidatesResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listBulkAddCandidates } from '../../services/medication.service.js';

/**
 * GET /api/medications/bulk-add-candidates — paginated global Medication
 * rows NOT currently in the caller's sortiment (active rows excluded).
 *
 * Powers the Sortiment "Lägg till" tab. Same exclusion semantics as
 * /api/medications/search (D-45) but supports proper pagination and the
 * full filter set (q/atc/form/therapeuticClass) so the FE can resolve
 * "add all in class X" → concrete medicationId list.
 *
 * Gated by `medication:bulk_manage` (apotekare + admin). Registered before
 * any `:careUnitMedicationId` routes so the literal path segment is not
 * parsed as a param (D-65 ordering precedent).
 */
export async function bulkAddCandidatesRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/medications/bulk-add-candidates',
    {
      preHandler: [requireSession, requirePermission('medication:bulk_manage')],
      schema: {
        querystring: bulkAddCandidatesQuery,
        response: { 200: bulkAddCandidatesResponse },
      },
    },
    async (req) => listBulkAddCandidates(req.user!.careUnitId, req.query),
  );
}
