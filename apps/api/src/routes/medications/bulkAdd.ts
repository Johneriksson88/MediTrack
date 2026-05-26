import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { bulkAddMedicationsRequest, bulkAddMedicationsResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { bulkAddMedications } from '../../services/medication.service.js';

/**
 * POST /api/medications/bulk — add a batch of medications to the caller's
 * sortiment. Each item carries its own threshold (FE applies a single
 * default and lets the admin override per-row before commit).
 *
 * Idempotent: active duplicates are silently skipped. Soft-deleted rows
 * are restored with currentStock PRESERVED (bulk-path divergence from the
 * single create-from-NPL path which overwrites stock — see service docs).
 *
 * Gated by `medication:bulk_manage` (apotekare + admin). Returns 200 with
 * { added, restored, skipped } counts.
 */
export async function bulkAddRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/medications/bulk',
    {
      preHandler: [requireSession, requirePermission('medication:bulk_manage')],
      schema: {
        body: bulkAddMedicationsRequest,
        response: { 200: bulkAddMedicationsResponse },
      },
    },
    async (req) => bulkAddMedications(req.user!.careUnitId, req.body),
  );
}
