import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';

/**
 * Phase 5 Plan 06 — Per-concern AsyncLocalStorage instances.
 *
 * # WHAT THIS DOES
 *
 * Replaces the single shared `RequestContext` store (the original Plan
 * 01/04 design) with THREE independent AsyncLocalStorage instances, each
 * scoped to exactly one concern:
 *
 *   - `actorALS`          — request-scope identity (actorUserId, careUnitId,
 *                           requestId, requestSource, ipAddress). Seeded by
 *                           the Fastify onRequest hook; actor fields populated
 *                           later by setActor() during the requireSession
 *                           preHandler.
 *   - `activeTxStackALS`  — stack of Prisma tx clients. Pushed/popped by the
 *                           $transaction interceptor in auditExtension.ts via
 *                           withActiveTx(). Nested calls give a stack of depth
 *                           ≥ 2; parallel Promise.all calls each get
 *                           independent frames (HIGH #2, 05-REVIEWS.md).
 *   - `actionOverrideALS` — the optional domain-rich action string
 *                           ('order.submit', 'auth.login', etc.), used by
 *                           withActionOverride(). Scoped to the duration of
 *                           the fn() callback (D-94).
 *
 * # WHY THREE INSTANCES, NOT ONE MERGED STORE (HIGH #1, 05-REVIEWS.md)
 *
 * The original RequestContext cramped three concerns with different
 * lifetimes (request / tx / call) onto one mutable object. That design
 * was the root cause of the entire CR-01 / CR-04 bug class:
 *
 *   - CR-01 nested case: inner $transaction's finally cleared activeTx to
 *     undefined; the outer's tail mutation then used the wrong client.
 *   - CR-01 parallel case: both interceptors raced on the same activeTx
 *     slot regardless of save/restore timing.
 *   - CR-04 keep-alive case: als.enterWith bound the store to the async
 *     context at request entry; that store object survived request
 *     boundaries on keep-alive TCP connections.
 *
 * Per-concern ALS gives each concern its own storage. Every value is
 * set via `.run(value, fn)` — Node's stdlib provides implicit
 * save/restore via call-stack frames. Concurrent `.run` calls get
 * independent frames. Subsequent keep-alive requests get fresh
 * `actorALS` frames from their own onRequest hook invocation. The
 * entire class of "shared-mutable-slot" bugs is structurally
 * eliminated.
 *
 * # WHY .run() NOT .enterWith() (CR-04, MEDIUM #11, 05-REVIEWS.md)
 *
 * Node's docs explicitly warn:
 *   "Use of asyncLocalStorage.enterWith() in production code is
 *    generally discouraged."
 *   (https://nodejs.org/api/async_context.html)
 * The documented risk is exactly the keep-alive frame-leakage we hit
 * (CR-04). The fix is `actorALS.run(scope, () => done())` inside the
 * 3-arg Fastify onRequest hook — Node's `.run` contract binds the frame
 * to the callback's lifetime, so subsequent requests on the same TCP
 * connection get their own frame from their own `actorALS.run` call.
 *
 * # activeTxStackALS SHIPS AS DEFAULT (HIGH #2, 05-REVIEWS.md)
 *
 * The original Plan 06 design would ship the stack only if the parallel
 * test failed. 05-REVIEWS.md HIGH #2 recommends shipping it as the
 * default because the correctness argument is the same for nested and
 * parallel scenarios. Cost: O(stack-depth) array allocation per
 * withActiveTx() call — typically 1-2 entries; negligible vs Prisma
 * round-trip latency.
 *
 * # PLUGIN ORDERING
 *
 * Register AFTER cookiesPlugin and BEFORE the routes. The onRequest
 * hook seeds actorALS with { actorUserId: null } for every request;
 * requireSession calls setActor() to fill in the actor fields once the
 * cookie has been verified.
 *
 * # ACTION OVERRIDE (D-94)
 *
 * order.service.ts wraps submit/confirm/deliver mutations with
 * `withActionOverride('order.submit' | 'order.confirm' | ...)`.
 * auth.service.ts uses withActionOverride for auth.login. The override
 * is naturally scoped to the withActionOverride callback via
 * actionOverrideALS.run; no manual save/restore is needed.
 *
 * # SEED-SUPPRESSION CONTRACT (D-92)
 *
 * When actorALS.getStore() is undefined, the Prisma audit middleware
 * SKIPS audit-row creation. Seed scripts run outside any actorALS frame
 * so the audit table starts empty on a fresh `docker compose up`. Tests
 * that want audit behavior must wrap their setup in actorALS.run({...}).
 */

export type RequestSource = 'http' | 'seed' | 'test';

/**
 * The actor identity for a request. Seeded at request entry (actorUserId:
 * null), then updated by setActor() after cookie verification.
 */
export interface ActorContext {
  actorUserId: string | null;
  careUnitId: string | null;
  requestId: string;
  requestSource: RequestSource;
  ipAddress: string | null;
}

/**
 * Request-scope actor: { actorUserId, careUnitId, requestId, requestSource, ipAddress }.
 * Entered via actorALS.run(scope, () => done()) inside the 3-arg onRequest hook.
 * Every request on a keep-alive TCP connection gets its own frame.
 */
export const actorALS = new AsyncLocalStorage<ActorContext>();

/**
 * Mutation-scope tx stack: a readonly array of Prisma tx clients, pushed/popped
 * by withActiveTx() inside patchTransactionForAudit. Nested $transaction calls
 * give a stack of depth ≥ 2; parallel calls each have their own ALS frame so
 * there is no cross-attribution race. getStore()?.at(-1) is the active tx (top).
 */
export const activeTxStackALS = new AsyncLocalStorage<readonly unknown[]>();

/**
 * Call-scope action override: the domain-rich action string set by
 * withActionOverride(). Scoped to the duration of the fn() callback.
 * getStore() is undefined outside a withActionOverride() block.
 */
export const actionOverrideALS = new AsyncLocalStorage<string>();

// ─── Pure readers ────────────────────────────────────────────────────────────

/** Returns the full actor context for the current request, or undefined. */
export function currentActor(): ActorContext | undefined {
  return actorALS.getStore();
}

/** Returns the requestId for the current request, or undefined. */
export function currentRequestId(): string | undefined {
  return actorALS.getStore()?.requestId;
}

/** Returns the current action override, or undefined if not in a withActionOverride() call. */
export function currentActionOverride(): string | undefined {
  return actionOverrideALS.getStore();
}

/**
 * Returns the innermost active Prisma tx client (top of the activeTxStack),
 * or undefined if no $transaction is active in the current async context.
 */
export function currentActiveTx(): unknown | undefined {
  const stack = activeTxStackALS.getStore();
  return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
}

// ─── Mutation helper (narrow exception) ────────────────────────────────────

/**
 * Update the actor + careUnit + ipAddress on the current actorALS store.
 * Called by requireSession.ts after cookie verification has resolved req.user.
 * No-op if no store exists (defensive — guards against setActor being called
 * outside an HTTP request).
 *
 * **Narrow mutation exception:** This is the ONE place in this module that
 * mutates a frame's fields in place after `.run()` has established it.
 *
 * INVARIANT: `setActor` mutates the actor-frame fields (actorUserId,
 * careUnitId, ipAddress) EXACTLY ONCE per request, SYNCHRONOUSLY during
 * the Fastify onRequest -> requireSession (preHandler) phase, BEFORE any
 * async code observes the partial state. Mutation AFTER the actor has been
 * set is forbidden: subsequent code reads the frame via `actorALS.getStore()`
 * and trusts the values to be stable for the remainder of the request.
 *
 * The window between onRequest's empty-actor seed and setActor's update is
 * synchronous; nothing reads the actor in that window. The
 * "shared-mutable-slot fragility eliminated" narrative still holds because
 * this ONE mutation is bounded in time (synchronous, single-call) and bounded
 * in scope (only writes to fields that have NOT been read by any other code in
 * the same async chain).
 */
export function setActor(
  actorUserId: string,
  careUnitId: string,
  ipAddress?: string | null,
): void {
  const store = actorALS.getStore();
  if (!store) return;
  store.actorUserId = actorUserId;
  store.careUnitId = careUnitId;
  if (ipAddress !== undefined) {
    store.ipAddress = ipAddress;
  }
}

// ─── Scoped helpers ──────────────────────────────────────────────────────────

/**
 * Run `fn` inside an actionOverrideALS frame set to `action`.
 * Used by order.service.ts and auth.service.ts to set domain-rich action
 * strings for the audit row (D-94). The override is automatically restored
 * to undefined on fn() return via Node's ALS stack-frame semantics — no
 * manual save/restore is needed.
 *
 * If no actorALS frame is present (test paths that don't wrap in actorALS.run),
 * the function still runs — just without the action-override side effect.
 */
export async function withActionOverride<T>(
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  return actionOverrideALS.run(action, fn);
}

/**
 * Run `fn` with `tx` pushed onto the activeTxStack ALS frame.
 * Called by patchTransactionForAudit in auditExtension.ts; service code
 * does NOT call this directly.
 *
 * The stack grows by one entry per nested $transaction call:
 *   outer call → stack = [outerTx]
 *   inner call → stack = [outerTx, innerTx]
 * The inner's handler reads innerTx (at(-1)); on inner exit the ALS frame
 * restores to [outerTx]; the outer's tail mutations read outerTx.
 *
 * Parallel Promise.all([prisma.$transaction(fnA), prisma.$transaction(fnB)])
 * — each $transaction intercept calls withActiveTx independently;
 * each .run() callback gets its own ALS frame snapshot. No cross-attribution.
 *
 * Array allocation cost: O(stack depth) per call — typically 1-2 entries.
 * Negligible vs the Prisma round-trip latency the audit-row INSERTs pay.
 */
export async function withActiveTx<T>(
  tx: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const previousStack = activeTxStackALS.getStore() ?? [];
  const nextStack: readonly unknown[] = [...previousStack, tx];
  return activeTxStackALS.run(nextStack, fn);
}

// ─── Fastify plugin ──────────────────────────────────────────────────────────

/**
 * The Fastify plugin. Registers a 3-arg onRequest hook that:
 *   1. Generates a requestId (uuid v4 from node:crypto).
 *   2. Sets the X-Request-Id reply header so clients can correlate.
 *   3. Calls `actorALS.run(scope, () => done())` — binding the actor frame
 *      to the rest of the request pipeline via the `done()` continuation.
 *      Every hook that runs after this (preHandler, handler, onSend,
 *      onResponse) reads the same actorALS frame.
 *
 * Why the 3-arg `(req, reply, done)` signature and NOT `async (req, reply)`:
 * The 3-arg form gives us the `done()` callback, which we call INSIDE the
 * actorALS.run frame — this is how we keep the frame alive across all
 * subsequent hooks. An `async` hook body would need to call actorALS.enterWith
 * to achieve the same effect, but Node docs explicitly discourage enterWith.
 * With 3-arg + done() inside .run(), the frame lifetime is naturally bounded
 * by the request pipeline continuation. Subsequent requests on a keep-alive
 * TCP connection each get their own actorALS frame from their own invocation.
 * (CR-04 + 05-REVIEWS.md HIGH #1)
 *
 * The activeTxStackALS and actionOverrideALS are NOT entered at the request
 * level — they're entered ad-hoc by withActiveTx (inside patchTransactionForAudit)
 * and withActionOverride (inside service methods). Their default state
 * (getStore() returns undefined) is correct for a bare request that doesn't
 * run a tx or an override.
 */
export const requestContextPlugin = fp(async (app) => {
  app.addHook('onRequest', (req, reply, done) => {
    const requestId = randomUUID();
    reply.header('X-Request-Id', requestId);
    // ipAddress: prefer Fastify's parsed req.ip (respects trustProxy);
    // fall back to the raw socket address. Stored as null when neither
    // is available (unlikely in practice but defensive).
    const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;
    actorALS.run(
      {
        actorUserId: null,
        careUnitId: null,
        requestId,
        requestSource: 'http',
        ipAddress,
      },
      () => done(),
    );
  });
});
