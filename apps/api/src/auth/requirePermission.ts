import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ActionKey } from '@meditrack/shared';
import { PERMISSIONS } from './permissions.js';
import { UnauthenticatedError } from '../plugins/errorHandler.js';

/**
 * Pattern C / D-15 / D-19 — Fastify preHandler factory that gates routes
 * by action key. Must run AFTER `requireSession` (which decorates
 * `req.user`); the canonical chain is:
 *
 *   { preHandler: [requireSession, requirePermission('admin:ping')] }
 *
 * Order matters and is enforced by convention — `requirePermission`
 * defends against misconfiguration by throwing `UnauthenticatedError`
 * when `req.user` is somehow absent (T-03-06).
 *
 * Behavior:
 *   - `!req.user`                                → 401 unauthenticated
 *   - `req.user.role` in `PERMISSIONS[action]`   → continue
 *   - otherwise                                  → 403 forbidden envelope
 *
 * 403 is sent directly via `reply.code(403).send(envelope)` and the
 * handler returns — we don't `throw` a custom error class for the
 * permission case because the message is already user-facing Swedish
 * and there's no extra context to capture.
 */
export function requirePermission(action: ActionKey) {
  return async function requirePermissionHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!req.user) {
      // Defense-in-depth (T-03-06): a misconfigured chain shouldn't grant
      // access. The error handler maps this to a 401 envelope.
      throw new UnauthenticatedError();
    }

    const allowed = PERMISSIONS[action];
    if (!allowed.includes(req.user.role)) {
      reply.code(403).send({
        error: {
          code: 'forbidden',
          message: 'Du saknar behörighet att utföra denna åtgärd.',
        },
      });
      return;
    }
    // Permission granted — fall through to the handler.
  };
}
