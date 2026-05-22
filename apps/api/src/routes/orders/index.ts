import type { FastifyInstance } from 'fastify';
import { createOrderRoute } from './create.js';
import { listOrdersRoute } from './list.js';
import { getOrderRoute } from './get.js';
import { linesRoute } from './lines.js';
import { submitOrderRoute } from './submit.js';
import { confirmOrderRoute } from './confirm.js';
import { deliverOrderRoute } from './deliver.js';
import { deleteOrderRoute } from './delete.js';
import { pickerOptionsRoute } from './pickerOptions.js';

/**
 * Order routes barrel — registers all Phase 3 order sub-routes.
 *
 * Registration order per D-65:
 *   pickerOptions  — must come BEFORE get (:id) to avoid 'picker-options'
 *                    being parsed as an :id param value
 *   create         — POST /api/orders
 *   list           — GET  /api/orders
 *   get            — GET  /api/orders/:id
 *   lines          — POST/PATCH/DELETE /api/orders/:id/lines[/:lineId]
 *   submit         — POST /api/orders/:id/submit
 *   delete         — DELETE /api/orders/:id
 *
 * Slices 3-4 extend this barrel with additional routes (line CRUD, submit,
 * picker options, delete) without modifying this file's structure — they
 * simply add more register() calls.
 */
export async function orderRoutes(app: FastifyInstance) {
  await app.register(pickerOptionsRoute);
  await app.register(createOrderRoute);
  await app.register(listOrdersRoute);
  await app.register(getOrderRoute);
  await app.register(linesRoute);
  await app.register(submitOrderRoute);
  await app.register(confirmOrderRoute);
  await app.register(deliverOrderRoute);
  await app.register(deleteOrderRoute);
}
