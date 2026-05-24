import type { FastifyInstance } from 'fastify';
import { listMedicationsRoute } from './list.js';
import { searchMedicationsRoute } from './search.js';
import { atcCodesRoute } from './atcCodes.js';
import { createMedicationRoute } from './create.js';
import { updateMedicationRoute } from './update.js';
import { deleteMedicationRoute } from './delete.js';

/**
 * Medication routes barrel — registers all Phase 2–8 medication sub-routes.
 *
 * Registration order: list → search → atcCodes → create → update → delete.
 *
 * Phase 8 D-132 / D-65: atcCodesRoute is registered AFTER search but BEFORE
 * any :id routes so the literal path "atc-codes" is not mistakenly parsed as
 * a :careUnitMedicationId param (same ordering precedent as pickerOptions.ts
 * in the orders barrel — D-65).
 *
 * Pattern: mirrors apps/api/src/app.ts route registration block.
 */
export async function medicationRoutes(app: FastifyInstance) {
  await app.register(listMedicationsRoute);
  await app.register(searchMedicationsRoute);
  await app.register(atcCodesRoute);
  await app.register(createMedicationRoute);
  await app.register(updateMedicationRoute);
  await app.register(deleteMedicationRoute);
}
