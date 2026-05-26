import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  bulkRemoveMedicationsRequest,
  bulkRemoveMedicationsResponse,
  bulkRemovePreviewRequest,
  bulkRemovePreviewResponse,
} from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import {
  bulkRemoveMedications,
  previewBulkRemoveImpact,
} from '../../services/medication.service.js';

/**
 * DELETE /api/medications/bulk — soft-delete a batch of CareUnitMedication
 * rows. Idempotent: missing / cross-tenant / already-deleted IDs are silently
 * skipped (existence-probing collapsed per D-19 / T-02-17).
 *
 * POST /api/medications/bulk-remove-preview — pre-flight aggregates for the
 * confirm dialog: in-flight order count + stock-affected count/units.
 *
 * Both gated by `medication:bulk_manage` (apotekare + admin).
 */
export async function bulkRemoveRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.delete(
    '/api/medications/bulk',
    {
      preHandler: [requireSession, requirePermission('medication:bulk_manage')],
      schema: {
        body: bulkRemoveMedicationsRequest,
        response: { 200: bulkRemoveMedicationsResponse },
      },
    },
    async (req) => bulkRemoveMedications(req.user!.careUnitId, req.body),
  );

  r.post(
    '/api/medications/bulk-remove-preview',
    {
      preHandler: [requireSession, requirePermission('medication:bulk_manage')],
      schema: {
        body: bulkRemovePreviewRequest,
        response: { 200: bulkRemovePreviewResponse },
      },
    },
    async (req) => previewBulkRemoveImpact(req.user!.careUnitId, req.body),
  );
}
