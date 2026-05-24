import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { atcCodesResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { listGlobalAtcCodes } from '../../services/medication.service.js';

/**
 * GET /api/medications/atc-codes — global distinct ATC code list.
 *
 * Phase 8 D-132: Returns the DISTINCT full ATC code list from the global
 * Medication catalog, sorted ascending. ~3,000 unique 7-char codes for the
 * seeded NPL data. Powers the AtcCodeCombobox (D-134) in LakemedelFilter
 * and the MedicationSheet user-create form.
 *
 * T-08-01 disposition: mitigate via requireSession. The global ATC list is
 * already implicitly disclosed through the existing /api/medications/search
 * typeahead; this endpoint introduces no new sensitive disclosure. All three
 * roles (sjukskoterska / apotekare / admin) legitimately read this list for
 * catalog browsing — no requirePermission gate is needed.
 *
 * Registration note: this route is registered BEFORE any `:id` routes in the
 * medications barrel (apps/api/src/routes/medications/index.ts) so the literal
 * path segment "atc-codes" is not parsed as an :id param (D-65 precedent).
 */
export async function atcCodesRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/medications/atc-codes',
    {
      preHandler: [requireSession],
      schema: { response: { 200: atcCodesResponse } },
    },
    async () => {
      const codes = await listGlobalAtcCodes();
      return { codes };
    },
  );
}
