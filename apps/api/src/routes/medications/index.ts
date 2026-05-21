import type { FastifyInstance } from 'fastify';
import { listMedicationsRoute } from './list.js';
import { searchMedicationsRoute } from './search.js';
import { createMedicationRoute } from './create.js';

/**
 * Medication routes barrel — registers all Phase 2 Slice 1 sub-routes.
 *
 * One app.ts line change (`await app.register(medicationRoutes)`) is all
 * that is needed to wire everything. Update/delete routes ship in Plans 03
 * and 04; this barrel will be extended then.
 *
 * Pattern: mirrors apps/api/src/app.ts route registration block (lines 50–54).
 */
export async function medicationRoutes(app: FastifyInstance) {
  await app.register(listMedicationsRoute);
  await app.register(searchMedicationsRoute);
  await app.register(createMedicationRoute);
  // Plan 03: update route (PATCH /api/medications/:id)
  // Plan 04: delete route (DELETE /api/medications/:id)
}
