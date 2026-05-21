import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { medicationUpdateRequest, medicationListItem } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { updateCareUnitMedication } from '../../services/medication.service.js';

/**
 * PATCH /api/medications/:careUnitMedicationId — partial update.
 *
 * D-15 preHandler ordering: requireSession first, requirePermission second.
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 * D-19 / T-02-13: returns 404 (never 403) on cross-tenant access — the
 *   service's NotFoundError handler collapses existence-probing to a safe 404.
 * D-32 / T-02-12: NPL-sourced med fields (name/atcCode/form/strength) are
 *   SILENTLY STRIPPED by the service before persistence (defense-in-depth).
 * CAT-06: apotekare/admin can edit stock + threshold; user-source meds expose
 *   all six fields; sjukskoterska is blocked (403) here.
 */
export async function updateMedicationRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.patch(
    '/api/medications/:careUnitMedicationId',
    {
      preHandler: [requireSession, requirePermission('medication:update')],
      schema: {
        params: z.object({ careUnitMedicationId: z.string().min(1) }),
        body: medicationUpdateRequest,
        response: { 200: medicationListItem },
      },
    },
    async (req) =>
      updateCareUnitMedication(
        req.user!.careUnitId,
        req.params.careUnitMedicationId,
        req.body,
      ),
  );
}
