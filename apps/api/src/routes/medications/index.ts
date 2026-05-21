import type { FastifyInstance } from 'fastify';
import { listMedicationsRoute } from './list.js';
import { searchMedicationsRoute } from './search.js';
import { createMedicationRoute } from './create.js';
import { updateMedicationRoute } from './update.js';
import { deleteMedicationRoute } from './delete.js';

/**
 * Medication routes barrel — registers all Phase 2 medication sub-routes.
 *
 * Registration order: list → search → create → update → delete.
 *
 * Pattern: mirrors apps/api/src/app.ts route registration block.
 */
export async function medicationRoutes(app: FastifyInstance) {
  await app.register(listMedicationsRoute);
  await app.register(searchMedicationsRoute);
  await app.register(createMedicationRoute);
  await app.register(updateMedicationRoute);
  await app.register(deleteMedicationRoute);
}
