import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { auditFiltersResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listAuditFilters } from '../../services/audit.service.js';

/**
 * GET /api/audit/filters — admin-only filter combobox source.
 *
 * Returns the distinct actors, entity types, and actions present in the
 * audit_events table. Powers the three combobox dropdowns on
 * /admin/audit (D-103). The BE memoizes the result for 60 s and the FE
 * uses staleTime: 60_000 — both layers cooperate on T-05-10 mitigation.
 *
 * preHandler order LOCKED: [requireSession, requirePermission('audit:read')] (D-15).
 */
export async function auditFiltersRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/audit/filters',
    {
      preHandler: [requireSession, requirePermission('audit:read')],
      schema: { response: { 200: auditFiltersResponse } },
    },
    async () => listAuditFilters(),
  );
}
