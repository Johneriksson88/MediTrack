import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';

/**
 * Phase 5 D-92 / D-94 — AsyncLocalStorage request-context plugin.
 *
 * # WHAT THIS DOES
 *
 * Wraps every Fastify HTTP request in an ALS scope carrying
 * { actorUserId, careUnitId, requestId, requestSource, actionOverride }.
 * The Prisma `$extends` middleware in db/auditExtension.ts reads from
 * this store on every intercepted mutation; when the store is undefined
 * (seed scripts, cron jobs that haven't opted in, tests without
 * explicit wrapping) the middleware SKIPS audit-row creation entirely
 * — that's the seed-suppression contract per D-92.
 *
 * # WHY ALS, NOT EXPLICIT-ARG
 *
 * Explicit-arg passing was rejected because every service signature
 * would widen with the actor arg, plus every call site updates. ALS
 * lets the audit hook observe actor/careUnit/requestId from the
 * outermost HTTP scope without any service-layer code knowing the
 * audit log exists. D-83's promise of "Phase 5 retrofits without
 * touching Phase 4 code" depends on this.
 *
 * # PLUGIN ORDERING
 *
 * Register AFTER cookiesPlugin and BEFORE the routes. The onRequest
 * hook seeds the store with `actorUserId: null` for every request;
 * requireSession populates the actor field after cookie verification
 * via setActor() below. This is the single-onRequest variant from
 * D-PATTERNS.md — keeps the ALS scope alive for the whole request
 * lifecycle including the response phase (where serializers + logger
 * middleware can also read requestId).
 *
 * # ACTION OVERRIDE
 *
 * D-94: the audit hook defaults `action` to the Prisma method name
 * (create/update/delete). order.service.ts wraps submit/confirm/
 * deliver mutations with `withActionOverride()` to set a richer
 * action ('order.submit' / 'order.confirm' / 'order.deliver' /
 * 'stock.increment'). All sibling events of one deliver call share
 * the request's requestId — the admin UI groups by it.
 */

export type RequestSource = 'http' | 'seed' | 'test';

export interface RequestContext {
  actorUserId: string | null;
  careUnitId: string | null;
  requestId: string;
  requestSource: RequestSource;
  ipAddress: string | null;
  /**
   * D-94 — when set, the Prisma extension uses this string as the
   * audit row's `action` instead of the default Prisma method name.
   * Cleared automatically by withActionOverride() so it never bleeds
   * into the next mutation.
   */
  actionOverride?: string;
}

/**
 * Module-scope singleton. The Prisma extension imports this and calls
 * `als.getStore()` on every intercepted mutation; when the result is
 * undefined, the extension skips the audit-row write (D-92).
 */
export const als = new AsyncLocalStorage<RequestContext>();

/**
 * Update the actor + careUnit + ipAddress on the current ALS store.
 * Called by requireSession.ts after cookie verification has resolved
 * `req.user`. No-op if no store exists (defensive — guards against
 * setActor being called outside an HTTP request).
 */
export function setActor(
  actorUserId: string,
  careUnitId: string,
  ipAddress?: string | null,
): void {
  const store = als.getStore();
  if (!store) return;
  store.actorUserId = actorUserId;
  store.careUnitId = careUnitId;
  if (ipAddress !== undefined) {
    store.ipAddress = ipAddress;
  }
}

/**
 * Run `fn` with the current ALS store's `actionOverride` set to
 * `action`. Used by order.service.ts to rename the audit action for
 * the deliver / confirm / submit / stock.increment mutations
 * (D-94). The override is restored to its previous value (typically
 * undefined) on the function's return, so it never leaks into the
 * next mutation in the same request.
 *
 * If no ALS store is present, the function still runs — just without
 * the action-override side effect. This makes the helper safe in
 * test paths that don't wrap their setup in an explicit als.run().
 */
export async function withActionOverride<T>(
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  const store = als.getStore();
  if (!store) {
    return fn();
  }
  const previous = store.actionOverride;
  store.actionOverride = action;
  try {
    return await fn();
  } finally {
    store.actionOverride = previous;
  }
}

/**
 * The Fastify plugin. Registers an onRequest hook that:
 *   1. Generates a requestId (uuid v4 from node:crypto).
 *   2. Sets the X-Request-Id reply header so clients can correlate.
 *   3. Calls `als.enterWith()` (NOT als.run() — the onRequest hook
 *      doesn't have a "wrap-the-rest-of-the-pipeline" callback;
 *      enterWith is the documented Node.js API for binding an ALS
 *      store to the surrounding async context).
 *
 * The store starts with `actorUserId: null` — requireSession
 * populates it on protected routes; for unprotected routes (login,
 * healthz), the actor stays null and the audit log naturally
 * records the auth.login_failed event with actorUserId: null when
 * appropriate (D-96).
 */
export const requestContextPlugin = fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const requestId = randomUUID();
    reply.header('X-Request-Id', requestId);
    // ipAddress: prefer Fastify's parsed req.ip (respects trustProxy);
    // fall back to the raw socket address. Stored as null when neither
    // is available (unlikely in practice but defensive).
    const ipAddress =
      req.ip ?? req.socket?.remoteAddress ?? null;
    als.enterWith({
      actorUserId: null,
      careUnitId: null,
      requestId,
      requestSource: 'http',
      ipAddress,
    });
  });
});
