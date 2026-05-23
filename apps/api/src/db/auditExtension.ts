import { Prisma } from '@prisma/client';
import {
  actorALS,
  currentActiveTx,
  currentActionOverride,
  withActiveTx,
} from '../plugins/requestContext.js';
import {
  AUDITED_MODELS,
  AUDIT_ALLOWLIST,
  type AuditedModel,
  filterAllowlist,
  mapPrismaModelToEntityType,
  resolveEntityId,
} from './auditAllowlist.js';

/**
 * Phase 5 D-90 / D-91 / D-92 / D-93 / D-94 / D-95 / D-97 — Prisma
 * `$extends` query middleware that writes audit_events rows for every
 * mutation against the audited model set, INSIDE the same transaction
 * as the wrapping mutation.
 *
 * # WHY $EXTENDS, NOT SERVICE WRAPPERS OR FASTIFY HOOKS (D-90)
 *
 * Service-layer wrappers (each service imports withAudit(fn, …)) were
 * rejected because they require editing every existing service file,
 * violating Phase 4 D-83's promise of "retrofit without touching Phase
 * 4 code." Fastify onResponse was rejected because it can't get a
 * clean `before` snapshot for compound mutations (deliver touches
 * Order + N CUMs from a single route). The $extends model-method
 * interception gives free 1+N coverage for the deliver fan-out.
 *
 * # SAME-TX GUARANTEE (D-91)
 *
 * Plan 06 (05-REVIEWS.md HIGH #1 + HIGH #2) replaced the original
 * single-slot `store.activeTx = tx; finally { store.activeTx = undefined }`
 * pattern with `activeTxStackALS` + `withActiveTx(tx, fn)`:
 *
 *   WHY activeTxStack VIA WITHACTIVETX:
 *   - Nested $transaction calls give a stack [outerTx, innerTx]; the
 *     inner handler reads innerTx (top); on inner exit the ALS frame
 *     restores to [outerTx]; the outer's tail mutations read outerTx.
 *     Implicit save/restore via stack frames — no asymmetric-clear bug
 *     (CR-01 nested case from 05-REVIEW.md).
 *   - Parallel Promise.all([prisma.$transaction(fnA), prisma.$transaction(fnB)])
 *     — each call's withActiveTx() starts its own activeTxStackALS.run()
 *     frame; the two frames are independent. No cross-attribution race
 *     (CR-01 parallel case from 05-REVIEW.md).
 *   - The asymmetric `= undefined` clear is gone — ALS stack-frame
 *     restoration handles pop automatically when .run() returns.
 *
 * Every per-model handler resolves the active client via currentActiveTx()
 * (top of the activeTxStack) falling back to the root client for bare calls.
 * D-91: if the user callback throws, the tx rolls back including any audit
 * rows the extension wrote against that tx client.
 *
 * VERIFIED in test by forced rollback inside prisma.$transaction leaving
 * zero audit_events rows (Plans 04 + 06 Tasks 2 + 12).
 *
 * # SKIP RULE (D-92)
 *
 * On every intercepted op we read `actorALS.getStore()`. If undefined,
 * we SKIP audit-row creation entirely — just call query(args) and return
 * the result. This is what makes the seed script noiseless. Tests
 * that WANT audit behavior must wrap their setup in an explicit
 * `actorALS.run({ actorUserId: TEST_USER.id, ... }, () => { ... })`.
 *
 * # ENTITYID LEAK PREVENTION (D-97 + T-05-03)
 *
 * For every audit-row write we compute `entityId` via
 * `resolveEntityId(model, row)` — for Session rows that returns
 * `row.userId` (the actor User.id), NEVER `row.id` (which IS the raw
 * signed session token). This is the second of TWO leak paths closed
 * in lockstep — the first is the `AUDIT_ALLOWLIST` which excludes
 * `Session.id` and `User.passwordHash` from the `after` JSON.
 *
 * # OPS INTERCEPTED (D-93)
 *
 * create, update, updateMany, delete, deleteMany. NOT intercepted:
 * upsert, createMany, findMany, findUnique, findFirst, count,
 * aggregate, $queryRaw, $executeRaw. The unaudited surface is
 * documented in the README per D-93.
 */

// Prisma's $extends dynamic-query API is strictly typed: the per-model
// handler maps don't accept arbitrary string keys via TypeScript even
// when the runtime accepts them. We construct the handler maps with
// loose types here and cast at the return point — Prisma still
// enforces the runtime contract.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseQueryHandlers = any;

/**
 * The lowercase Prisma client property name for a given PascalCase
 * model. e.g. 'Medication' → 'medication', 'CareUnitMedication' →
 * 'careUnitMedication'. Prisma keeps this convention strictly.
 */
function clientPropName(model: AuditedModel): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Build the Prisma extension factory. `buildAuditExtension()` is
 * imported once by `db/client.ts` and chained via `.$extends(...)` on
 * the PrismaClient constructor call.
 */
export function buildAuditExtension() {
  return Prisma.defineExtension((client) => {
    const modelHandlers: Record<string, LooseQueryHandlers> = {};

    for (const model of AUDITED_MODELS) {
      const propName = clientPropName(model);
      const handlers: LooseQueryHandlers = {};

      // ---- create ----
      handlers.create = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const actor = actorALS.getStore();
        if (!actor) return query(args);

        // Resolve the active client: top of activeTxStack when inside a
        // prisma.$transaction (set by withActiveTx in patchTransactionForAudit),
        // otherwise the captured root client. currentActiveTx() reads the
        // top of the activeTxStackALS frame — undefined for bare calls (D-91).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = currentActiveTx() ?? client;
        const overrideAction = currentActionOverride();
        const result = await query(args);
        const row = result as Record<string, unknown>;
        await writeAuditRow(activeClient, actor, overrideAction, model, {
          before: null,
          after: row,
          row,
          defaultAction: 'create',
        });
        return result;
      };

      // ---- update ----
      handlers.update = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const actor = actorALS.getStore();
        if (!actor) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = currentActiveTx() ?? client;
        const overrideAction = currentActionOverride();
        const where = args.where as Record<string, unknown> | undefined;
        let beforeRow: Record<string, unknown> | null = null;
        if (where) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelClient = (activeClient as any)[propName];
          beforeRow = await modelClient.findUnique({ where });
        }

        const result = await query(args);
        const row = result as Record<string, unknown>;
        await writeAuditRow(activeClient, actor, overrideAction, model, {
          before: beforeRow,
          after: row,
          row,
          defaultAction: 'update',
        });
        return result;
      };

      // ---- updateMany ----
      handlers.updateMany = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const actor = actorALS.getStore();
        if (!actor) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = currentActiveTx() ?? client;
        const overrideAction = currentActionOverride();
        const where = (args.where as Record<string, unknown> | undefined) ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelClient = (activeClient as any)[propName];
        const beforeRows: Array<Record<string, unknown>> = await modelClient.findMany({ where });

        const result = await query(args);

        for (const beforeRow of beforeRows) {
          const id = beforeRow.id as string | undefined;
          if (!id) continue;
          const afterRow: Record<string, unknown> | null = await modelClient.findUnique({
            where: { id },
          });
          await writeAuditRow(activeClient, actor, overrideAction, model, {
            before: beforeRow,
            after: afterRow,
            row: afterRow ?? beforeRow,
            defaultAction: 'update',
          });
        }
        return result;
      };

      // ---- delete ----
      handlers.delete = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const actor = actorALS.getStore();
        if (!actor) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = currentActiveTx() ?? client;
        const overrideAction = currentActionOverride();
        const where = args.where as Record<string, unknown> | undefined;
        let beforeRow: Record<string, unknown> | null = null;
        if (where) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelClient = (activeClient as any)[propName];
          beforeRow = await modelClient.findUnique({ where });
        }

        const result = await query(args);
        // For delete, Prisma's result IS the deleted row.
        const row = (result as Record<string, unknown>) ?? beforeRow ?? {};
        await writeAuditRow(activeClient, actor, overrideAction, model, {
          before: beforeRow ?? (result as Record<string, unknown>),
          after: null,
          row,
          defaultAction: 'delete',
        });
        return result;
      };

      // ---- deleteMany ----
      handlers.deleteMany = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const actor = actorALS.getStore();
        if (!actor) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = currentActiveTx() ?? client;
        const overrideAction = currentActionOverride();
        const where = (args.where as Record<string, unknown> | undefined) ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelClient = (activeClient as any)[propName];
        const beforeRows: Array<Record<string, unknown>> = await modelClient.findMany({ where });

        const result = await query(args);

        for (const beforeRow of beforeRows) {
          await writeAuditRow(activeClient, actor, overrideAction, model, {
            before: beforeRow,
            after: null,
            row: beforeRow,
            defaultAction: 'delete',
          });
        }
        return result;
      };

      // Prisma `$extends({ query })` keys models by their lowercase
      // client prop name (e.g. `session`, `careUnitMedication`), NOT
      // by PascalCase. Without this mapping the handlers register
      // successfully but the runtime never matches the actual ops.
      modelHandlers[propName] = handlers;
    }

    return client.$extends({
      name: 'meditrack-audit',
      query: modelHandlers as LooseQueryHandlers,
    });
  });
}

/**
 * Internal helper — writes ONE audit row for an intercepted mutation.
 * Filters before/after through the per-model allowlist (D-97 layer 1)
 * and computes entityId via resolveEntityId (D-97 layer 2 / T-05-03).
 *
 * `activeClient` is either the tx client (when called from inside a
 * prisma.$transaction callback — resolved from the activeTxStackALS frame
 * via currentActiveTx()) or the captured root `client` from
 * `Prisma.defineExtension`. Routing auditEvent.create through the tx
 * client is what makes D-91 hold.
 *
 * `actor` is the ActorContext from actorALS.getStore() — never null here
 * because handlers skip (return early) when actorALS.getStore() is falsy.
 *
 * `overrideAction` is the optional domain-rich action from
 * actionOverrideALS.getStore() (currentActionOverride()). undefined means
 * "use the defaultAction from Prisma method name".
 */
async function writeAuditRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeClient: any,
  actor: NonNullable<ReturnType<typeof actorALS.getStore>>,
  overrideAction: string | undefined,
  model: AuditedModel,
  payload: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    row: Record<string, unknown>;
    defaultAction: 'create' | 'update' | 'delete';
  },
): Promise<void> {
  const action = overrideAction ?? payload.defaultAction;
  const entityId = resolveEntityId(model, payload.row);
  const filteredBefore = payload.before ? filterAllowlist(model, payload.before) : null;
  const filteredAfter = payload.after ? filterAllowlist(model, payload.after) : null;
  // careUnitId denormalization: prefer the row's own careUnitId, fall
  // back to the actor's careUnitId from the actorALS store.
  const rowCareUnitId =
    (payload.row.careUnitId as string | undefined) ?? actor.careUnitId ?? null;

  const data: Record<string, unknown> = {
    actorUserId: actor.actorUserId,
    careUnitId: rowCareUnitId,
    entityType: mapPrismaModelToEntityType(model),
    entityId,
    action,
    requestId: actor.requestId,
    ipAddress: actor.ipAddress ?? null,
  };
  // Only set before/after when non-null — leaving them undefined makes
  // Prisma default to DB NULL, avoiding the NullableJsonNullValueInput
  // type-system dance for explicit nulls.
  if (filteredBefore) data.before = filteredBefore;
  if (filteredAfter) data.after = filteredAfter;

  await activeClient.auditEvent.create({ data });
}

/**
 * D-91 — patch the extended Prisma client's `$transaction` at runtime
 * to push the tx client onto the activeTxStack ALS frame for audit-write
 * coordination.
 *
 * WHY RUNTIME PATCH INSTEAD OF `client` EXTENSION
 * ================================================
 * Prisma's `$extends({ client })` replaces `$transaction`'s TypeScript
 * overload signatures with the extension's generic `Promise<R>`, losing
 * the original `(tx: PrismaTransactionalClient) => R` callback shape.
 * This makes `tx` implicitly `any` in strict mode and breaks `updated`
 * assignments in `order.service.ts`, `medication.service.ts`, etc. —
 * exactly the Phase 4 service files D-83 prohibits editing.
 *
 * The runtime patch uses `Object.defineProperty` to replace `$transaction`
 * on the extended client instance AFTER TypeScript has resolved all types.
 * TypeScript does NOT re-check the property through `defineProperty`, so
 * the original overload signatures remain in scope for callers. The patch
 * is type-invisible and behavior-preserving.
 *
 * Called once from `db/client.ts` on the singleton extended client.
 *
 * WHY activeTxStack VIA WITHACTIVETX (05-REVIEWS.md HIGH #1 + HIGH #2)
 * ======================================================================
 * The original design stored the tx in `store.activeTx` (a single mutable
 * slot) and cleared it in a finally block. That asymmetric clear broke
 * nested + parallel scenarios (CR-01 in 05-REVIEW.md):
 *   - Nested: inner finally cleared activeTx to undefined; the outer's
 *     tail mutation read the wrong client.
 *   - Parallel Promise.all: both interceptors raced on the same slot.
 *
 * This plan replaces the single-slot pattern with `activeTxStackALS` +
 * `withActiveTx(tx, fn)`:
 *   - Nested calls: outer withActiveTx creates frame [outerTx]; inner
 *     creates frame [outerTx, innerTx]; inner's handler reads innerTx
 *     (at(-1)); on inner exit ALS restores frame to [outerTx]; outer's
 *     tail mutations read outerTx. Implicit save/restore via Node stdlib.
 *   - Parallel Promise.all: each call's withActiveTx starts its own
 *     activeTxStackALS.run() frame; the frames are independent (no shared
 *     mutable state). No cross-attribution race.
 *   - The asymmetric `= undefined` clear is gone — ALS handles pop.
 *
 * References: CR-01, HIGH #1, HIGH #2 (05-REVIEWS.md).
 */
export function patchTransactionForAudit<
  // WR-04 — narrowed from `{ $transaction: unknown }`: that earlier bound
  // accepted any object where $transaction was any type — including null,
  // undefined, or a non-function value — which would crash the .bind()
  // call below at runtime with no compile-time signal. Requiring a
  // callable shape moves the check to compile time so mocks and partial
  // Prisma stubs fail the type-check, not the runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends { $transaction: (...args: any[]) => Promise<any> },
>(extendedClient: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original$transaction = (extendedClient as any).$transaction.bind(extendedClient);

  Object.defineProperty(extendedClient, '$transaction', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: async function (fnOrOps: unknown, options?: unknown): Promise<unknown> {
      // If it's not the interactive-tx form (callback), delegate directly.
      if (typeof fnOrOps !== 'function') {
        return original$transaction(fnOrOps, options);
      }

      const actor = actorALS.getStore();
      if (!actor) {
        // No actorALS frame (seed scripts, migration runner): delegate directly.
        return original$transaction(fnOrOps, options);
      }

      // Wrap the interactive transaction to push the tx onto the activeTxStack.
      // withActiveTx(tx, fn) calls activeTxStackALS.run([...prev, tx], fn);
      // per-model handlers read currentActiveTx() (top of stack) to route
      // their findUnique pre-loads and auditEvent.create INSERTs through the
      // correct transactional context (D-91).
      //
      // On fn() return (success or throw), ALS automatically restores the
      // previous frame — no manual `activeTx = undefined` needed (no asymmetric
      // clear bug). Nested calls get a stack of depth ≥ 2; parallel calls each
      // have their own frame from the start. (CR-01, HIGH #1, HIGH #2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return original$transaction(async (tx: any) => {
        return withActiveTx(tx, () => (fnOrOps as (tx: any) => Promise<unknown>)(tx));
      }, options);
    },
    writable: true,
    configurable: true,
  });

  return extendedClient;
}

// Silence unused-import warnings for AUDIT_ALLOWLIST when this file is
// imported in environments that don't tree-shake — the symbol is part
// of the public surface that the extension closes over via the
// `filterAllowlist` helper, but TS doesn't recognize the indirect use.
void AUDIT_ALLOWLIST;
