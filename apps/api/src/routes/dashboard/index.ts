import type { FastifyInstance } from 'fastify';
import { lowStockRoute } from './lowStock.js';

/**
 * Phase 6 dashboard routes barrel.
 *
 * Currently one endpoint:
 *   `GET /api/dashboard/low-stock` — banner enumeration (D-120)
 *
 * Pattern: mirrors `apps/api/src/routes/audit/index.ts` — single
 * barrel that the app.ts composition awaits. New dashboard endpoints
 * (future v2 surfaces) register here alongside lowStockRoute.
 */
export async function dashboardRoutes(app: FastifyInstance) {
  await app.register(lowStockRoute);
}
