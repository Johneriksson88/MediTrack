import type { FastifyInstance } from 'fastify';
import { listAuditEventsRoute } from './list.js';
import { auditFiltersRoute } from './filters.js';

/**
 * Phase 5 audit routes barrel — registers the admin-only read endpoints
 * surfaced by /admin/audit.
 *
 * Two routes, no `:id` collisions, registration order is free.
 *
 * `GET /api/audit/events`   — cursor-paginated event list (D-105)
 * `GET /api/audit/filters`  — combobox source (60s memo, D-103)
 */
export async function auditRoutes(app: FastifyInstance) {
  await app.register(listAuditEventsRoute);
  await app.register(auditFiltersRoute);
}
