import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { dashboardOrdersResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { listDashboardOrdersForUser } from '../../services/dashboard.service.js';

/**
 * Phase 9 D-141 / D-142 / D-16 — GET /api/dashboard/orders.
 *
 * Dashboard "Beställningar" card read. Returns one of two role-discriminated
 * shapes (D-142):
 *
 *   - `sjukskoterska` → `{ role, egnaUtkast: { count, rows }, recentHistory }`
 *     (own utkast + vårdenhet-wide non-utkast history, D-143)
 *   - `apotekare | admin` → `{ role, skickad: { count, rows }, bekraftad: { count, rows } }`
 *     (waiting-on-me sections)
 *
 * D-15 / D-120 preHandler: `requireSession` ONLY — no `requirePermission`
 * gate. All three roles see the dashboard (mirrors the Phase 6
 * `/api/dashboard/low-stock` precedent). The role-aware branching lives
 * in the service.
 *
 * D-16: careUnit-scoped via `req.user!.careUnitId` (decorated by
 * `requireSession`). Cross-vårdenhet isolation is structurally enforced
 * by the service's careUnitId-first signature.
 *
 * D-141: dedicated endpoint with own cache key `['dashboard', 'orders']`
 * on the FE; decoupled from `/bestallningar`'s `['orders', filters]` cache.
 *
 * No request body, no query params — the response shape is fixed by
 * `dashboardOrdersResponse` (Zod discriminated union on `role`). A
 * service bug returning the wrong subview for the wrong role fails
 * serialization at this layer (T-09-05 mitigation).
 */
export async function ordersRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/dashboard/orders',
    {
      preHandler: [requireSession],
      schema: { response: { 200: dashboardOrdersResponse } },
    },
    async (req) =>
      listDashboardOrdersForUser(
        req.user!.careUnitId,
        req.user!.id,
        req.user!.role,
      ),
  );
}
