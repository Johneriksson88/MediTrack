import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { auditEventListQuery, auditEventListResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listAuditEvents } from '../../services/audit.service.js';

/**
 * GET /api/audit/events — admin-only cursor-paginated audit log read.
 *
 * Phase 5 D-15 preHandler ordering: requireSession first (decorates
 * req.user + seeds ALS actor), requirePermission second. NEVER reorder.
 *
 * D-16 EXCEPTION: handler does NOT pass req.user!.careUnitId — admin
 * reads cross-tenant per AUD-02. See audit.service.ts header for the
 * documented carve-out.
 *
 * D-105: query string `?actor=...&entity=...&action=...&requestId=...&cursor=...&limit=50`.
 *
 * T-05-04: requirePermission('audit:read') is set to ['admin'] in
 * apps/api/src/auth/permissions.ts — sjuksköterska and apotekare
 * receive 403 with the canonical forbidden envelope.
 */
export async function listAuditEventsRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/audit/events',
    {
      preHandler: [requireSession, requirePermission('audit:read')],
      schema: {
        querystring: auditEventListQuery,
        response: { 200: auditEventListResponse },
      },
    },
    async (req) => {
      return listAuditEvents(req.query);
    },
  );
}
