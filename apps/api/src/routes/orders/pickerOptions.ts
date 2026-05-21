import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { pickerOptionsQuery, pickerOption } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { searchPickerOptions } from '../../services/order.service.js';

/**
 * GET /api/orders/picker-options — typeahead for MedicationPickerSheet (D-58, D-59).
 *
 * Scope: per-vårdenhet CareUnitMedications (deletedAt: null only). D-59.
 * Reuses the pg_trgm + GIN index Phase 2 added on lower(Medication.name).
 *
 * Returns up to 20 picker rows: { careUnitMedicationId, name, atcCode, form,
 * strength, currentStock, lowStockThreshold }. The FE renders LowStockBadge
 * when currentStock < lowStockThreshold (D-61).
 *
 * NOTE: This route MUST be registered BEFORE /api/orders/:id to prevent
 * Fastify from treating 'picker-options' as an :id param.
 */
export async function pickerOptionsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders/picker-options',
    {
      preHandler: [requireSession, requirePermission('order:create')],
      schema: {
        querystring: pickerOptionsQuery,
        response: {
          200: z.object({ results: z.array(pickerOption) }),
        },
      },
    },
    async (req) => {
      const rows = await searchPickerOptions(req.user!.careUnitId, {
        q: req.query.q,
        limit: req.query.limit,
      });
      return { results: rows };
    },
  );
}
