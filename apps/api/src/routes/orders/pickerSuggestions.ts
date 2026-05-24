import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { pickerSuggestionsResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listPickerSuggestions } from '../../services/order.service.js';

/**
 * GET /api/orders/picker-suggestions — pre-search suggestions for
 * MedicationPickerSheet (Phase 8 D-135 + D-138, ORD-08).
 *
 * D-138: Separate endpoint (not an extension of picker-options) with its own
 *   cache key ['order-picker-suggestions', orderId]. Response shape:
 *   { mostOrdered: PickerSuggestion[], lowStock: PickerSuggestion[] }
 *   is fundamentally different from picker-options { results: PickerOption[] }.
 *
 * T-08-02: preHandler [requireSession, requirePermission('order:create')] —
 *   all three roles (apotekare, sjukskoterska, admin) hold this permission per
 *   permissions.ts line 33. Service-layer scope assertion (order.careUnitId check)
 *   + parameterized WHERE binding form the defense-in-depth stack.
 *
 * D-65 ordering rule: this route MUST be registered BEFORE getOrderRoute (which
 *   matches :id) in the orders barrel to prevent Fastify from parsing
 *   'picker-suggestions' as an :id param value.
 */
export async function pickerSuggestionsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/orders/picker-suggestions',
    {
      preHandler: [requireSession, requirePermission('order:create')],
      schema: {
        querystring: z.object({ orderId: z.string().min(1) }),
        response: {
          200: pickerSuggestionsResponse,
        },
      },
    },
    async (req) => {
      return await listPickerSuggestions(req.user!.careUnitId, req.query.orderId);
    },
  );
}
