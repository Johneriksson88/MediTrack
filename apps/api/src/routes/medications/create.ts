import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { medicationCreateRequest, medicationListItem } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { createCareUnitMedication } from '../../services/medication.service.js';

/**
 * POST /api/medications — add a medication to the caller's vårdenhet.
 *
 * D-15 preHandler ordering: requireSession first, requirePermission second.
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 * T-02-03: requirePermission('medication:create') enforces apotekare/admin.
 * T-02-04: Zod discriminatedUnion validates source='npl'|'user'; rejects others.
 *
 * Returns 201 with the created MedicationListItem. Returns 409 on active
 * duplicate (ConflictDuplicateMedicationError → envelope). D-30 transparent
 * restore is handled in the service — callers see 201 on re-add of a
 * soft-deleted medication.
 */
export async function createMedicationRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/medications',
    {
      preHandler: [requireSession, requirePermission('medication:create')],
      schema: {
        body: medicationCreateRequest,
        response: { 201: medicationListItem },
      },
    },
    async (req, reply) => {
      const row = await createCareUnitMedication(req.user!.careUnitId, req.body);
      reply.status(201);
      return row;
    },
  );
}
