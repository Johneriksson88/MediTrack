import type { FastifyInstance } from 'fastify';
import { lowStockRoute } from './lowStock.js';
import { ordersRoute } from './orders.js';

/**
 * Dashboard routes barrel.
 *
 * Endpoints:
 *   `GET /api/dashboard/low-stock` — banner enumeration (Phase 6 D-120)
 *   `GET /api/dashboard/orders`    — role-discriminated orders card (Phase 9 D-141)
 *
 * Registration order mirrors the dashboard layout (D-146): low-stock
 * left/top, orders right/bottom. Both routes are gated by `requireSession`
 * only — all three roles see the dashboard.
 *
 * Pattern: mirrors `apps/api/src/routes/audit/index.ts` — single barrel
 * that the app.ts composition awaits. New dashboard endpoints register
 * here alongside the existing two.
 */
export async function dashboardRoutes(app: FastifyInstance) {
  await app.register(lowStockRoute);
  await app.register(ordersRoute);
}
