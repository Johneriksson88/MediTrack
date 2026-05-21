import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { softDeleteCareUnitMedication } from '../../services/medication.service.js';

/**
 * DELETE /api/medications/:careUnitMedicationId — soft-delete.
 *
 * CAT-07: Soft-deletes the CareUnitMedication row (SET deletedAt = now()).
 *   The global Medication row is NEVER deleted (D-33 — strictly stricter
 *   than CAT-07 "soft-delete if historical refs" — always soft-delete).
 *
 * D-15 preHandler ordering: requireSession first, requirePermission second.
 * D-16: req.user!.careUnitId is the FIRST arg to the service call.
 * D-19 / T-02-17: returns 404 (never 403) on cross-tenant access — the
 *   service's NotFoundError handler collapses existence-probing to a safe 404.
 *   Same response shape for truly-missing rows, already-soft-deleted rows,
 *   and cross-tenant rows — attacker cannot probe existence.
 * T-02-18: requirePermission('medication:delete') returns 403 for
 *   sjukskoterska before the service is invoked. Defense in depth.
 *
 * Returns: 204 No Content on success.
 *   404 { error: { code: 'not_found', ... } } when:
 *     - row doesn't exist
 *     - row already soft-deleted (idempotency)
 *     - row belongs to another vårdenhet (T-02-17 existence-probing protection)
 *   403 when caller lacks 'medication:delete' permission (T-02-18).
 */
export async function deleteMedicationRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.delete(
    '/api/medications/:careUnitMedicationId',
    {
      preHandler: [requireSession, requirePermission('medication:delete')],
      schema: {
        params: z.object({ careUnitMedicationId: z.string().min(1) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await softDeleteCareUnitMedication(
        req.user!.careUnitId,
        req.params.careUnitMedicationId,
      );
      reply.status(204);
      return null;
    },
  );
}
