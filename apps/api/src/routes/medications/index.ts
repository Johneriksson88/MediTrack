import type { FastifyInstance } from 'fastify';
import { listMedicationsRoute } from './list.js';
import { searchMedicationsRoute } from './search.js';
import { atcCodesRoute } from './atcCodes.js';
import { bulkAddCandidatesRoute } from './bulkAddCandidates.js';
import { bulkAddRoute } from './bulkAdd.js';
import { bulkRemoveRoute } from './bulkRemove.js';
import { createMedicationRoute } from './create.js';
import { updateMedicationRoute } from './update.js';
import { deleteMedicationRoute } from './delete.js';

/**
 * Medication routes barrel — registers all Phase 2–8 + Sortiment sub-routes.
 *
 * Registration order: list → search → atcCodes → bulk-add-candidates → bulk →
 * bulk-remove-preview → create → update → delete.
 *
 * D-65 / Phase 8 D-132 ordering: literal-path sub-routes are registered
 * BEFORE any `:careUnitMedicationId` routes so the static segments aren't
 * parsed as an id param. The new Sortiment routes follow the same rule —
 * `/api/medications/bulk`, `/api/medications/bulk-add-candidates`, and
 * `/api/medications/bulk-remove-preview` all sit above create/update/delete
 * which use `:careUnitMedicationId`.
 */
export async function medicationRoutes(app: FastifyInstance) {
  await app.register(listMedicationsRoute);
  await app.register(searchMedicationsRoute);
  await app.register(atcCodesRoute);
  await app.register(bulkAddCandidatesRoute);
  await app.register(bulkAddRoute);
  await app.register(bulkRemoveRoute);
  await app.register(createMedicationRoute);
  await app.register(updateMedicationRoute);
  await app.register(deleteMedicationRoute);
}
