import { Prisma } from '@prisma/client';
import { als } from '../plugins/requestContext.js';
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
 * The extension intercepts `prisma.$transaction(async (tx) => ...)` at
 * the client level, pushes the tx client into the ALS store under
 * `activeTx` before running the user's callback, then clears it after.
 * Every per-model handler resolves the active client from the ALS store:
 * `store.activeTx ?? client`. Inside a user-opened `$transaction`, all
 * findUnique / findMany pre-loads AND the auditEvent.create INSERT use
 * the stored `activeTx` — so they ARE inside the same transaction. If
 * the user's callback throws, the tx rolls back including any audit rows
 * written by the extension. For bare calls (outside explicit tx), Prisma
 * auto-wraps the operation in an implicit tx, and the extension falls
 * back to `client` (the root pool) for the audit writes — the behavior
 * identical to D-91's original design intent for non-tx paths.
 *
 * VERIFIED in test by forced rollback inside prisma.$transaction leaving
 * zero audit_events rows (Plan 04 Task 2).
 *
 * # SKIP RULE (D-92)
 *
 * On every intercepted op we read `als.getStore()`. If undefined, we
 * SKIP audit-row creation entirely — just call query(args) and return
 * the result. This is what makes the seed script noiseless. Tests
 * that WANT audit behavior must wrap their setup in an explicit
 * `als.run({ actorUserId: TEST_USER.id, ... }, () => { ... })`.
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
        const store = als.getStore();
        if (!store) return query(args);

        // Resolve the active client: tx from ALS store when inside a
        // prisma.$transaction, otherwise the captured root client.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = store.activeTx ?? client;
        const result = await query(args);
        const row = result as Record<string, unknown>;
        await writeAuditRow(activeClient, store, model, {
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
        const store = als.getStore();
        if (!store) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = store.activeTx ?? client;
        const where = args.where as Record<string, unknown> | undefined;
        let beforeRow: Record<string, unknown> | null = null;
        if (where) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelClient = (activeClient as any)[propName];
          beforeRow = await modelClient.findUnique({ where });
        }

        const result = await query(args);
        const row = result as Record<string, unknown>;
        await writeAuditRow(activeClient, store, model, {
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
        const store = als.getStore();
        if (!store) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = store.activeTx ?? client;
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
          await writeAuditRow(activeClient, store, model, {
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
        const store = als.getStore();
        if (!store) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = store.activeTx ?? client;
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
        await writeAuditRow(activeClient, store, model, {
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
        const store = als.getStore();
        if (!store) return query(args);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeClient: any = store.activeTx ?? client;
        const where = (args.where as Record<string, unknown> | undefined) ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelClient = (activeClient as any)[propName];
        const beforeRows: Array<Record<string, unknown>> = await modelClient.findMany({ where });

        const result = await query(args);

        for (const beforeRow of beforeRows) {
          await writeAuditRow(activeClient, store, model, {
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
 * prisma.$transaction callback — stored in the ALS store under activeTx)
 * or the captured root `client` from `Prisma.defineExtension`. Routing
 * auditEvent.create through the tx client is what makes D-91 hold.
 */
async function writeAuditRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeClient: any,
  store: NonNullable<ReturnType<typeof als.getStore>>,
  model: AuditedModel,
  payload: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    row: Record<string, unknown>;
    defaultAction: 'create' | 'update' | 'delete';
  },
): Promise<void> {
  const action = store.actionOverride ?? payload.defaultAction;
  const entityId = resolveEntityId(model, payload.row);
  const filteredBefore = payload.before ? filterAllowlist(model, payload.before) : null;
  const filteredAfter = payload.after ? filterAllowlist(model, payload.after) : null;
  // careUnitId denormalization: prefer the row's own careUnitId, fall
  // back to the actor's careUnitId from the ALS store.
  const rowCareUnitId =
    (payload.row.careUnitId as string | undefined) ?? store.careUnitId ?? null;

  const data: Record<string, unknown> = {
    actorUserId: store.actorUserId,
    careUnitId: rowCareUnitId,
    entityType: mapPrismaModelToEntityType(model),
    entityId,
    action,
    requestId: store.requestId,
    ipAddress: store.ipAddress ?? null,
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
 * to push the tx client into the ALS store for audit-write coordination.
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

      const store = als.getStore();
      if (!store) {
        // No ALS store (seed scripts, migration runner): delegate directly.
        return original$transaction(fnOrOps, options);
      }

      // Wrap the interactive transaction to capture the tx client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return original$transaction(async (tx: any) => {
        // Store the tx in the ALS context so per-model handlers can
        // retrieve it for pre-load reads and audit INSERTs (D-91).
        store.activeTx = tx;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (fnOrOps as (tx: any) => Promise<unknown>)(tx);
        } finally {
          // Clear the tx reference when the callback completes (success
          // or throw) so it never leaks into subsequent bare calls.
          store.activeTx = undefined;
        }
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
