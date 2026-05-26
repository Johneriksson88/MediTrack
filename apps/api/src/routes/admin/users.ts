import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  userListResponse,
  userResponse,
  userCreateRequest,
  userUpdateRequest,
} from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import {
  listUsersInCareUnit,
  createUserInCareUnit,
  updateUserInCareUnit,
  deleteUserInCareUnit,
} from '../../services/user.service.js';

/**
 * /api/admin/users — admin-only user CRUD scoped to the caller's vårdenhet.
 *
 * D-15 preHandler ordering: requireSession first, requirePermission second.
 * D-16: req.user!.careUnitId is the FIRST arg to every service call.
 *
 * Routes:
 *   GET    /api/admin/users        — list users in this vårdenhet
 *   POST   /api/admin/users        — create a new user (201)
 *   PATCH  /api/admin/users/:id    — partial update (email, name, role, password)
 *   DELETE /api/admin/users/:id    — hard-delete (204); blocked on self and on
 *                                    FK refs from Order; both return 409
 *                                    `user_delete_blocked`.
 *
 * Audit: User create/update/delete writes flow through the Prisma $extends
 * middleware (Phase 5 D-91), so every change here automatically lands in
 * audit_events with action=create|update|delete and entityType=user — the
 * admin can audit themselves on /admin/audit immediately. passwordHash is
 * excluded from the allowlist (auditAllowlist.ts) so it never appears in
 * before/after snapshots.
 */
export async function adminUsersRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/admin/users',
    {
      preHandler: [requireSession, requirePermission('user:manage')],
      schema: { response: { 200: userListResponse } },
    },
    async (req) => {
      const users = await listUsersInCareUnit(req.user!.careUnitId);
      return { users };
    },
  );

  r.post(
    '/api/admin/users',
    {
      preHandler: [requireSession, requirePermission('user:manage')],
      schema: {
        body: userCreateRequest,
        response: { 201: userResponse },
      },
    },
    async (req, reply) => {
      const created = await createUserInCareUnit(req.user!.careUnitId, req.body);
      reply.status(201);
      return created;
    },
  );

  r.patch(
    '/api/admin/users/:id',
    {
      preHandler: [requireSession, requirePermission('user:manage')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: userUpdateRequest,
        response: { 200: userResponse },
      },
    },
    async (req) =>
      updateUserInCareUnit(req.user!.careUnitId, req.params.id, req.body),
  );

  r.delete(
    '/api/admin/users/:id',
    {
      preHandler: [requireSession, requirePermission('user:manage')],
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteUserInCareUnit(
        req.user!.careUnitId,
        req.params.id,
        req.user!.id,
      );
      reply.status(204);
      return null;
    },
  );
}
